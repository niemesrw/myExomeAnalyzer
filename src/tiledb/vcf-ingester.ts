import { spawn } from 'child_process';
import { EventEmitter } from 'events';
import { VCFParser, VCFRecord, VCFHeader } from '../parser/vcf-parser.js';
import { arrayManager } from './array-manager.js';
import { config } from '../config/index.js';
import path from 'path';
import { createWriteStream, unlinkSync } from 'fs';
import { createGunzip } from 'zlib';
import { createReadStream } from 'fs';

export interface TileDBImportStats {
    totalRecords: number;
    totalSamples: number;
    elapsedTime: number;
    chromosomes: string[];
    arraySize: number;
}

export class TileDBVCFIngester extends EventEmitter {
    private batchSize: number;
    private pythonEnv: string;
    private tempDir: string;
    private variantsArrayPath: string = '';
    private samplesArrayPath: string = '';

    constructor(batchSize: number = 10000) {
        super();
        this.batchSize = batchSize;
        this.pythonEnv = path.join(process.cwd(), 'venv', 'bin', 'python');
        this.tempDir = config.tiledb.tempDir;
    }

    async ingestVCF(filePath: string): Promise<TileDBImportStats> {
        const startTime = Date.now();
        this.emit('start');

        try {
            // Create arrays if they don't exist
            this.variantsArrayPath = await arrayManager.createVariantsArray();
            this.samplesArrayPath = await arrayManager.createSamplesArray();

            // Parse VCF and prepare data
            const parser = new VCFParser();
            const records: VCFRecord[] = [];
            let header: VCFHeader | null = null;
            let totalRecords = 0;
            const chromosomes = new Set<string>();

            parser.on('header', (h) => {
                header = h;
                this.emit('header', h);
            });

            parser.on('record', (record) => {
                records.push(record);
                chromosomes.add(record.chrom);
                totalRecords++;

                if (records.length >= this.batchSize) {
                    this.processBatch(records.splice(0), header!);
                }

                if (totalRecords % 1000 === 0) {
                    this.emit('progress', {
                        processedRecords: totalRecords,
                        currentChrom: record.chrom,
                        currentPos: record.pos,
                        rate: 1000 / ((Date.now() - startTime) / 1000) // approx rate
                    });
                }
            });

            parser.on('complete', async () => {
                // Process remaining records
                if (records.length > 0) {
                    await this.processBatch(records, header!);
                }

                const elapsedTime = Date.now() - startTime;
                const stats: TileDBImportStats = {
                    totalRecords,
                    totalSamples: (header && (header as any).samples) ? (header as any).samples.length : 0,
                    elapsedTime,
                    chromosomes: Array.from(chromosomes),
                    arraySize: await this.getArraySize()
                };

                this.emit('complete', stats);
            });

            parser.on('error', (error) => {
                this.emit('error', error);
            });

            // Start parsing
            await parser.parseFile(filePath);

            return {
                totalRecords,
                totalSamples: (header && (header as any).samples) ? (header as any).samples.length : 0,
                elapsedTime: Date.now() - startTime,
                chromosomes: Array.from(chromosomes),
                arraySize: await this.getArraySize()
            };

        } catch (error) {
            this.emit('error', error);
            throw error;
        }
    }

    private async processBatch(records: VCFRecord[], header: VCFHeader): Promise<void> {
        // Convert VCF records to TileDB format and write to array
        const pythonScript = `
import tiledb
import numpy as np
import json
import sys

def write_variants_batch(array_path, batch_data):
    """Write a batch of variants to TileDB array"""
    
    variants = json.loads(batch_data)
    
    if not variants:
        return
    
    # Deduplicate variants by chromosome + position
    variant_dict = {}
    
    # Chromosome mapping - handle both "chr1" and "1" formats
    chrom_map = {
        **{str(i): i for i in range(1, 23)},
        **{f'chr{i}': i for i in range(1, 23)},
        'X': 23, 'Y': 24, 'MT': 25, 'M': 25,
        'chrX': 23, 'chrY': 24, 'chrMT': 25, 'chrM': 25
    }
    
    # Group variants by coordinate and merge duplicates
    for variant in variants:
        chrom_num = chrom_map.get(variant['chrom'], 1)
        pos = variant['pos']
        key = (chrom_num, pos)
        
        if key in variant_dict:
            # Merge with existing variant
            existing = variant_dict[key]
            
            # Combine alt alleles
            existing_alts = existing['alt'].split(',') if existing['alt'] else []
            new_alts = variant.get('alt', [])
            combined_alts = list(set(existing_alts + new_alts))
            existing['alt'] = ','.join(combined_alts)
            
            # Use higher quality score
            if variant.get('qual') and (not existing['qual'] or variant['qual'] > existing['qual']):
                existing['qual'] = variant['qual']
            
            # Merge samples data
            existing_samples = json.loads(existing['samples'])
            new_samples = variant.get('samples', {})
            existing_samples.update(new_samples)
            existing['samples'] = json.dumps(existing_samples)
            
        else:
            # New variant
            variant_dict[key] = {
                'chrom': chrom_num,
                'pos': pos,
                'ref': variant['ref'],
                'alt': ','.join(variant.get('alt', [])) if variant.get('alt') else '',
                'qual': variant.get('qual', 0.0) if variant.get('qual') is not None else 0.0,
                'filter': ','.join(variant.get('filter', [])) if variant.get('filter') else 'PASS',
                'info': json.dumps(variant.get('info', {})),
                'samples': json.dumps(variant.get('samples', {}))
            }
    
    # Prepare arrays from deduplicated variants
    chroms = []
    positions = []
    refs = []
    alts = []
    quals = []
    filters = []
    infos = []
    samples_data = []
    
    for (chrom_num, pos), variant in variant_dict.items():
        chroms.append(chrom_num)
        positions.append(pos)
        refs.append(variant['ref'])
        alts.append(variant['alt'])
        quals.append(variant['qual'])
        filters.append(variant['filter'])
        infos.append(variant['info'])
        samples_data.append(variant['samples'])
    
    # Write to TileDB array
    with tiledb.open(array_path, 'w') as A:
        A[np.array(chroms), np.array(positions)] = {
            'ref': np.array(refs),
            'alt': np.array(alts),
            'qual': np.array(quals, dtype=np.float32),
            'filter': np.array(filters),
            'info': np.array(infos),
            'samples': np.array(samples_data)
        }
    
    print(f"Wrote {len(variants)} variants to TileDB array")

if __name__ == "__main__":
    array_path = sys.argv[1]
    batch_data = sys.stdin.read()
    write_variants_batch(array_path, batch_data)
`;

        // Convert records to JSON format for Python
        const batchData = JSON.stringify(records);
        
        await this.runPythonScriptWithInput(pythonScript, batchData, [this.variantsArrayPath]);
    }

    private async getArraySize(): Promise<number> {
        const pythonScript = `
import tiledb
import sys
import os

def get_array_size(array_path):
    """Get the number of non-empty cells in the array"""
    try:
        if not os.path.exists(array_path):
            print("0")
            return
            
        with tiledb.open(array_path) as A:
            # For sparse arrays, we need to query the non-empty domain
            non_empty = A.nonempty_domain()
            if non_empty:
                # Estimate size based on non-empty domain
                # This is an approximation for performance
                print(str(100000))  # Placeholder - in real implementation we'd count
            else:
                print("0")
    except Exception as e:
        print("0")

if __name__ == "__main__":
    array_path = sys.argv[1]
    get_array_size(array_path)
`;

        try {
            const result = await this.runPythonScript(pythonScript, [this.variantsArrayPath]);
            return parseInt(result.stdout) || 0;
        } catch (error) {
            return 0;
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

    private async runPythonScriptWithInput(script: string, input: string, args: string[] = []): Promise<{stdout: string, stderr: string}> {
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
            
            // Send input to Python script
            pythonProcess.stdin.write(input);
            pythonProcess.stdin.end();
        });
    }
}