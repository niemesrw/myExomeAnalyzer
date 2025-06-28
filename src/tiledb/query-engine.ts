import { spawn } from 'child_process';
import { config } from '../config/index.js';
import path from 'path';

export interface VariantQuery {
    chrom?: string;
    start?: number;
    end?: number;
    ref?: string;
    alt?: string;
    minQual?: number;
    samples?: string[];
    limit?: number;
}

export interface VariantResult {
    chrom: string;
    pos: number;
    ref: string;
    alt: string[];
    qual?: number;
    filter: string[];
    info: Record<string, any>;
    samples: Record<string, Record<string, any>>;
}

export interface ArrayStats {
    totalVariants: number;
    chromosomes: string[];
    positionRange: [number, number];
    sampleCount: number;
    arraySize: string;
}

export class TileDBQueryEngine {
    private workspace: string;
    private pythonEnv: string;

    constructor() {
        this.workspace = config.tiledb.workspace;
        this.pythonEnv = path.join(process.cwd(), 'venv', 'bin', 'python');
    }

    async queryVariants(query: VariantQuery): Promise<VariantResult[]> {
        const pythonScript = `
import tiledb
import numpy as np
import json
import sys

def query_variants(array_path, query_params):
    """Query variants from TileDB array"""
    
    try:
        query = json.loads(query_params)
        
        with tiledb.open(array_path) as A:
            # Build query conditions
            conditions = []
            
            # Chromosome mapping - handle both "chr1" and "1" formats
            chrom_map = {
                **{str(i): i for i in range(1, 23)},
                **{f'chr{i}': i for i in range(1, 23)},
                'X': 23, 'Y': 24, 'MT': 25, 'M': 25,
                'chrX': 23, 'chrY': 24, 'chrMT': 25, 'chrM': 25
            }
            reverse_chrom_map = {v: k for k, v in chrom_map.items()}
            
            # Build query slice
            chrom_val = None
            if 'chrom' in query and query['chrom']:
                chrom_val = chrom_map.get(query['chrom'], 1)
            
            start_pos = query.get('start', 1)
            end_pos = query.get('end', 300_000_000)
            
            # Query the array
            if chrom_val is not None:
                # Query specific chromosome
                result = A[chrom_val:chrom_val+1, start_pos:end_pos]
            else:
                # Query all chromosomes (limited for performance)
                result = A[1:26, start_pos:end_pos]
            
            # Process results
            variants = []
            limit = query.get('limit', 100)
            
            # Extract data from result
            if result['chrom'].size > 0:
                for i in range(min(len(result['chrom']), limit)):
                    chrom_str = reverse_chrom_map.get(result['chrom'][i], str(result['chrom'][i]))
                    
                    variant = {
                        'chrom': chrom_str,
                        'pos': int(result['pos'][i]),
                        'ref': result['ref'][i],
                        'alt': result['alt'][i].split(',') if result['alt'][i] else [],
                        'qual': float(result['qual'][i]) if result['qual'][i] > 0 else None,
                        'filter': result['filter'][i].split(',') if result['filter'][i] else [],
                        'info': json.loads(result['info'][i]) if result['info'][i] else {},
                        'samples': json.loads(result['samples'][i]) if result['samples'][i] else {}
                    }
                    
                    # Apply additional filters
                    if 'minQual' in query and query['minQual'] is not None:
                        if variant['qual'] is None or variant['qual'] < query['minQual']:
                            continue
                    
                    if 'ref' in query and query['ref']:
                        if variant['ref'] != query['ref']:
                            continue
                    
                    if 'alt' in query and query['alt']:
                        if query['alt'] not in variant['alt']:
                            continue
                    
                    # Apply sample filtering
                    if 'samples' in query and query['samples']:
                        sample_found = False
                        for sample_id in query['samples']:
                            if sample_id in variant['samples']:
                                sample_found = True
                                break
                        if not sample_found:
                            continue
                        
                        # Filter variant samples to only include requested samples
                        filtered_samples = {}
                        for sample_id in query['samples']:
                            if sample_id in variant['samples']:
                                filtered_samples[sample_id] = variant['samples'][sample_id]
                        variant['samples'] = filtered_samples
                    
                    variants.append(variant)
            
            print(json.dumps(variants))
            
    except Exception as e:
        print(f"Error querying variants: {e}", file=sys.stderr)
        print("[]")  # Return empty array on error

if __name__ == "__main__":
    array_path = sys.argv[1]
    query_params = sys.argv[2]
    query_variants(array_path, query_params)
`;

        try {
            const arrayPath = path.join(this.workspace, 'variants');
            const queryJson = JSON.stringify(query);
            const result = await this.runPythonScript(pythonScript, [arrayPath, queryJson]);
            return JSON.parse(result.stdout);
        } catch (error) {
            console.error(`Error querying variants: ${error}`);
            return [];
        }
    }

    async getArrayStats(): Promise<ArrayStats> {
        const pythonScript = `
import tiledb
import numpy as np
import json
import sys
import os

def get_array_stats(array_path):
    """Get statistics about the TileDB array"""
    
    try:
        if not os.path.exists(array_path):
            stats = {
                'totalVariants': 0,
                'chromosomes': [],
                'positionRange': [0, 0],
                'sampleCount': 0,
                'arraySize': '0 B'
            }
            print(json.dumps(stats))
            return
        
        with tiledb.open(array_path) as A:
            # Get non-empty domain
            non_empty = A.nonempty_domain()
            
            if non_empty:
                chrom_range = non_empty[0]
                pos_range = non_empty[1]
                
                # Map chromosome numbers back to strings
                reverse_chrom_map = {
                    **{i: str(i) for i in range(1, 23)},
                    23: 'X', 24: 'Y', 25: 'MT'
                }
                
                chromosomes = []
                for i in range(int(chrom_range[0]), int(chrom_range[1]) + 1):
                    if i in reverse_chrom_map:
                        chromosomes.append(reverse_chrom_map[i])
                
                # Count actual variants and unique samples by sampling
                total_variants = 0
                unique_samples = set()
                try:
                    # Sample multiple chromosomes and position ranges to get better sample coverage
                    total_sampled = 0
                    for test_chrom in [1, 13, 17, 22]:  # Key chromosomes
                        if test_chrom >= int(chrom_range[0]) and test_chrom <= int(chrom_range[1]):
                            # Sample from multiple position ranges to catch all samples
                            for start_pos in [1, 1000000, 20000000, 50000000]:
                                end_pos = min(start_pos + 1000, int(pos_range[1]))
                                if start_pos < int(pos_range[1]):
                                    chrom_result = A[test_chrom:test_chrom+1, start_pos:end_pos]
                                    if 'chrom' in chrom_result and chrom_result['chrom'].size > 0:
                                        total_sampled += chrom_result['chrom'].size
                                        # Collect sample names from this chromosome
                                        if 'samples' in chrom_result:
                                            for i in range(len(chrom_result['samples'])):
                                                try:
                                                    samples_data = json.loads(chrom_result['samples'][i])
                                                    unique_samples.update(samples_data.keys())
                                                except:
                                                    continue
                    
                    if total_sampled > 0:
                        # Estimate total variants based on sampling
                        range_size = min(16000, int(pos_range[1]) - int(pos_range[0]))  # 4 chroms * 4 positions * 1000
                        total_range = int(pos_range[1]) - int(pos_range[0])
                        if range_size > 0:
                            total_variants = int((total_sampled / range_size) * total_range)
                        else:
                            total_variants = total_sampled
                    else:
                        total_variants = 0  # No variants found
                except Exception as count_error:
                    total_variants = 0  # Error counting, assume empty
                
                # Get array size on disk
                array_size = sum(
                    os.path.getsize(os.path.join(dirpath, filename))
                    for dirpath, dirnames, filenames in os.walk(array_path)
                    for filename in filenames
                )
                
                # Format size
                if array_size < 1024:
                    size_str = f"{array_size} B"
                elif array_size < 1024 * 1024:
                    size_str = f"{array_size / 1024:.1f} KB"
                elif array_size < 1024 * 1024 * 1024:
                    size_str = f"{array_size / (1024 * 1024):.1f} MB"
                else:
                    size_str = f"{array_size / (1024 * 1024 * 1024):.1f} GB"
                
                stats = {
                    'totalVariants': total_variants,
                    'chromosomes': chromosomes,
                    'positionRange': [int(pos_range[0]), int(pos_range[1])],
                    'sampleCount': len(unique_samples),
                    'arraySize': size_str
                }
            else:
                stats = {
                    'totalVariants': 0,
                    'chromosomes': [],
                    'positionRange': [0, 0],
                    'sampleCount': 0,
                    'arraySize': '0 B'
                }
            
            print(json.dumps(stats))
            
    except Exception as e:
        print(f"Error getting array stats: {e}", file=sys.stderr)
        # Return stats with the disk size at least
        try:
            array_size = sum(
                os.path.getsize(os.path.join(dirpath, filename))
                for dirpath, dirnames, filenames in os.walk(array_path)
                for filename in filenames
            )
            size_str = f"{array_size / (1024 * 1024 * 1024):.1f} GB"
        except:
            size_str = "Unknown"
            
        stats = {
            'totalVariants': 0,  # Error occurred, unknown count
            'chromosomes': ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20', '21', '22', 'X', 'Y', 'MT'],
            'positionRange': [1, 248946422],
            'sampleCount': 0,  # Error occurred, unknown count
            'arraySize': size_str
        }
        print(json.dumps(stats))

if __name__ == "__main__":
    array_path = sys.argv[1]
    get_array_stats(array_path)
`;

        try {
            const arrayPath = path.join(this.workspace, 'variants');
            const result = await this.runPythonScript(pythonScript, [arrayPath]);
            return JSON.parse(result.stdout);
        } catch (error) {
            console.error(`Error getting array stats: ${error}`);
            return {
                totalVariants: 0,
                chromosomes: [],
                positionRange: [0, 0],
                sampleCount: 0,
                arraySize: '0 B'
            };
        }
    }

    async getSampleStats(sampleIds: string[]): Promise<ArrayStats> {
        const pythonScript = `
import tiledb
import numpy as np
import json
import sys
import os

def get_sample_stats(array_path, sample_ids):
    """Get statistics for specific samples"""
    
    try:
        sample_list = json.loads(sample_ids)
        
        if not os.path.exists(array_path):
            print(json.dumps({
                'totalVariants': 0,
                'chromosomes': [],
                'positionRange': [0, 0],
                'sampleCount': 0,
                'arraySize': '0 B'
            }))
            return
            
        with tiledb.open(array_path) as A:
            # Get array bounds
            non_empty = A.nonempty_domain()
            
            if non_empty and len(non_empty) >= 2:
                chrom_range = non_empty[0]
                pos_range = non_empty[1]
                
                # Reverse chromosome mapping
                reverse_chrom_map = {
                    **{i: str(i) for i in range(1, 23)},
                    23: 'X', 24: 'Y', 25: 'MT'
                }
                
                chromosomes = []
                for i in range(int(chrom_range[0]), int(chrom_range[1]) + 1):
                    if i in reverse_chrom_map:
                        chromosomes.append(reverse_chrom_map[i])
                
                # Count variants that have data for any of the requested samples
                total_variants = 0
                sample_variant_count = 0
                
                # Sample across multiple chromosomes to estimate sample-specific count
                try:
                    total_sample_count = 0
                    total_sample_variants = 0
                    
                    # Sample from several chromosomes to get a good estimate
                    test_chroms = [1, 13, 17, 22]  # Key chromosomes where GIAB data likely exists
                    for test_chrom in test_chroms:
                        if test_chrom >= int(chrom_range[0]) and test_chrom <= int(chrom_range[1]):
                            # Sample a reasonable range from each chromosome
                            sample_size = min(10000, int(pos_range[1]) - int(pos_range[0]))
                            sample_result = A[test_chrom:test_chrom+1, 
                                           int(pos_range[0]):int(pos_range[0])+sample_size]
                            
                            if 'samples' in sample_result and sample_result['samples'].size > 0:
                                chrom_sample_variants = 0
                                for i in range(len(sample_result['samples'])):
                                    try:
                                        samples_data = json.loads(sample_result['samples'][i])
                                        # Check if any requested sample is present
                                        for sample_id in sample_list:
                                            if sample_id in samples_data:
                                                chrom_sample_variants += 1
                                                break
                                    except:
                                        continue
                                
                                total_sample_count += sample_result['samples'].size
                                total_sample_variants += chrom_sample_variants
                    
                    # Estimate total based on sampling across multiple chromosomes
                    if total_sample_count > 0:
                        sample_ratio = total_sample_variants / total_sample_count
                        # Apply ratio to total estimated variants in the array
                        estimated_total_variants = int(pos_range[1] - pos_range[0]) / 1000  # Rough estimate
                        total_variants = int(sample_ratio * estimated_total_variants)
                    else:
                        total_variants = 0
                    
                except Exception as count_error:
                    total_variants = 0
                
                # Get array size on disk
                array_size = sum(
                    os.path.getsize(os.path.join(dirpath, filename))
                    for dirpath, dirnames, filenames in os.walk(array_path)
                    for filename in filenames
                )
                
                # Format size
                if array_size < 1024:
                    size_str = f"{array_size} B"
                elif array_size < 1024 * 1024:
                    size_str = f"{array_size / 1024:.1f} KB"
                elif array_size < 1024 * 1024 * 1024:
                    size_str = f"{array_size / (1024 * 1024):.1f} MB"
                else:
                    size_str = f"{array_size / (1024 * 1024 * 1024):.1f} GB"
                
                stats = {
                    'totalVariants': total_variants,
                    'chromosomes': chromosomes,
                    'positionRange': [int(pos_range[0]), int(pos_range[1])],
                    'sampleCount': len(sample_list),
                    'arraySize': size_str
                }
            else:
                stats = {
                    'totalVariants': 0,
                    'chromosomes': [],
                    'positionRange': [0, 0],
                    'sampleCount': len(sample_list),
                    'arraySize': '0 B'
                }
            
            print(json.dumps(stats))
            
    except Exception as e:
        print(f"Error getting sample stats: {e}", file=sys.stderr)
        stats = {
            'totalVariants': 0,
            'chromosomes': [],
            'positionRange': [0, 0],
            'sampleCount': len(json.loads(sample_ids)) if sample_ids else 0,
            'arraySize': "Unknown"
        }
        print(json.dumps(stats))

if __name__ == "__main__":
    array_path = sys.argv[1]
    sample_ids = sys.argv[2]
    get_sample_stats(array_path, sample_ids)
`;

        try {
            const arrayPath = path.join(this.workspace, 'variants');
            const sampleIdsJson = JSON.stringify(sampleIds);
            const result = await this.runPythonScript(pythonScript, [arrayPath, sampleIdsJson]);
            return JSON.parse(result.stdout);
        } catch (error) {
            console.error(`Error getting sample stats: ${error}`);
            return {
                totalVariants: 0,
                chromosomes: [],
                positionRange: [0, 0],
                sampleCount: sampleIds.length,
                arraySize: '0 B'
            };
        }
    }

    async calculateAlleleFrequency(chrom: string, pos: number, ref: string, alt: string): Promise<number> {
        const pythonScript = `
import tiledb
import numpy as np
import json
import sys

def calculate_allele_frequency(array_path, chrom, pos, ref, alt):
    """Calculate allele frequency for a specific variant"""
    
    try:
        # Chromosome mapping
        chrom_map = {
            **{str(i): i for i in range(1, 23)},
            'X': 23, 'Y': 24, 'MT': 25, 'M': 25
        }
        
        chrom_num = chrom_map.get(chrom, 1)
        
        with tiledb.open(array_path) as A:
            # Query specific variant
            result = A[chrom_num:chrom_num+1, pos:pos+1]
            
            if result['chrom'].size > 0:
                # Find matching variant
                for i in range(len(result['chrom'])):
                    if (result['chrom'][i] == chrom_num and 
                        result['pos'][i] == pos and 
                        result['ref'][i] == ref and 
                        alt in result['alt'][i].split(',')):
                        
                        # Parse genotype data
                        samples_data = json.loads(result['samples'][i])
                        
                        total_alleles = 0
                        alt_alleles = 0
                        
                        for sample_name, genotypes in samples_data.items():
                            gt = genotypes.get('GT', './.')
                            if gt != './.':
                                alleles = gt.replace('|', '/').split('/')
                                for allele in alleles:
                                    if allele != '.':
                                        total_alleles += 1
                                        if allele != '0':  # Non-reference
                                            alt_alleles += 1
                        
                        if total_alleles > 0:
                            frequency = alt_alleles / total_alleles
                            print(f"{frequency}")
                            return
                        
            print("0.0")  # Variant not found or no genotype data
            
    except Exception as e:
        print(f"Error calculating allele frequency: {e}", file=sys.stderr)
        print("0.0")

if __name__ == "__main__":
    array_path = sys.argv[1]
    chrom = sys.argv[2]
    pos = int(sys.argv[3])
    ref = sys.argv[4]
    alt = sys.argv[5]
    calculate_allele_frequency(array_path, chrom, pos, ref, alt)
`;

        try {
            const arrayPath = path.join(this.workspace, 'variants');
            const result = await this.runPythonScript(pythonScript, [
                arrayPath, chrom, pos.toString(), ref, alt
            ]);
            return parseFloat(result.stdout);
        } catch (error) {
            console.error(`Error calculating allele frequency: ${error}`);
            return 0.0;
        }
    }

    private async runPythonScript(script: string, args: string[] = []): Promise<{stdout: string, stderr: string}> {
        return new Promise((resolve, reject) => {
            const pythonProcess = spawn(this.pythonEnv, ['-c', script, ...args]);
            
            let stdout = '';
            let stderr = '';
            
            pythonProcess.stdout.on('data', (data) => {
                stdout += data.toString();
            });
            
            pythonProcess.stderr.on('data', (data) => {
                stderr += data.toString();
            });
            
            pythonProcess.on('close', (code) => {
                if (code === 0) {
                    resolve({ stdout: stdout.trim(), stderr: stderr.trim() });
                } else {
                    reject(new Error(`Python script failed with code ${code}: ${stderr}`));
                }
            });
            
            pythonProcess.on('error', (error) => {
                reject(error);
            });
        });
    }
}

export const queryEngine = new TileDBQueryEngine();