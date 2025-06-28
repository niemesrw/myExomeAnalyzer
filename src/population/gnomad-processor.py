#!/usr/bin/env python3
"""
gnomAD Population Frequency Processor

This script processes gnomAD VCF files and creates optimized TileDB arrays
for fast population frequency lookups during variant analysis.
"""

import os
import sys
import gzip
import json
import time
import argparse
from typing import Dict, List, Tuple, Optional
from dataclasses import dataclass
from pathlib import Path

import tiledb
import numpy as np

@dataclass
class PopulationFrequency:
    chrom: str
    pos: int
    ref: str
    alt: str
    af_global: float
    af_afr: float
    af_amr: float
    af_asj: float
    af_eas: float
    af_fin: float
    af_nfe: float
    af_oth: float
    ac_global: int
    an_global: int
    nhomalt_global: int
    faf95_global: float
    is_common: bool

class GnomadProcessor:
    """Process gnomAD VCF files and create TileDB population frequency arrays"""
    
    def __init__(self, workspace_path: str):
        self.workspace_path = workspace_path
        self.gnomad_dir = os.path.join(workspace_path, 'gnomad_data')
        self.arrays_dir = os.path.join(workspace_path, 'population_arrays')
        
        # Ensure output directory exists
        os.makedirs(self.arrays_dir, exist_ok=True)
        
        # Population frequency TileDB array path
        self.pop_freq_array = os.path.join(self.arrays_dir, 'population_frequencies')
        
        # Statistics for processing
        self.stats = {
            'total_variants': 0,
            'common_variants': 0,
            'rare_variants': 0,
            'processing_time': 0,
            'chromosomes_processed': []
        }
    
    def create_population_frequency_schema(self) -> tiledb.ArraySchema:
        """Create TileDB schema optimized for population frequency lookups"""
        
        # Dimensions: chromosome, position, and allele index for multi-allelic sites
        dims = [
            tiledb.Dim(name="chrom", domain=(1, 25), tile=1, dtype=np.int8),  # 1-22, X=23, Y=24, MT=25
            tiledb.Dim(name="pos", domain=(1, 300_000_000), tile=100_000, dtype=np.uint32),
            tiledb.Dim(name="allele_idx", domain=(0, 1000), tile=10, dtype=np.uint16)  # Support up to 1000 alt alleles per position
        ]
        
        # Attributes: population frequency data
        attrs = [
            tiledb.Attr(name="ref", dtype='U300'),  # Reference allele (increased for large indels)
            tiledb.Attr(name="alt", dtype='U300'),  # Alternate allele (increased for large indels)
            tiledb.Attr(name="af_global", dtype=np.float32),
            tiledb.Attr(name="af_afr", dtype=np.float32),     # African/African American
            tiledb.Attr(name="af_amr", dtype=np.float32),     # Latino/Admixed American
            tiledb.Attr(name="af_asj", dtype=np.float32),     # Ashkenazi Jewish
            tiledb.Attr(name="af_eas", dtype=np.float32),     # East Asian
            tiledb.Attr(name="af_fin", dtype=np.float32),     # Finnish
            tiledb.Attr(name="af_nfe", dtype=np.float32),     # Non-Finnish European
            tiledb.Attr(name="af_oth", dtype=np.float32),     # Other
            tiledb.Attr(name="ac_global", dtype=np.uint32),   # Allele count
            tiledb.Attr(name="an_global", dtype=np.uint32),   # Allele number
            tiledb.Attr(name="nhomalt_global", dtype=np.uint32),  # Homozygous alternate count
            tiledb.Attr(name="faf95_global", dtype=np.float32),   # Filtering allele frequency 95%
            tiledb.Attr(name="is_common", dtype=bool),        # True if AF > 1%
        ]
        
        # Create sparse array schema (most genomic positions don't have variants)
        domain = tiledb.Domain(*dims)
        schema = tiledb.ArraySchema(domain=domain, sparse=True, attrs=attrs)
        
        return schema
    
    def chromosome_to_int(self, chrom: str) -> int:
        """Convert chromosome string to integer for TileDB storage"""
        chrom = chrom.replace('chr', '')
        if chrom == 'X':
            return 23
        elif chrom == 'Y':
            return 24
        elif chrom == 'MT' or chrom == 'M':
            return 25
        else:
            return int(chrom)
    
    def parse_vcf_line(self, line: str) -> Optional[List[PopulationFrequency]]:
        """Parse a gnomAD VCF line and extract population frequency data
        
        Returns a list of PopulationFrequency objects (one per alt allele)
        """
        if line.startswith('#'):
            return None
            
        fields = line.strip().split('\t')
        if len(fields) < 8:
            return None
        
        chrom = fields[0]
        pos = int(fields[1])
        ref = fields[3]
        alts = fields[4].split(',')  # Handle multi-allelic sites
        info = fields[7]
        
        # Parse INFO field for population frequencies
        info_dict = {}
        for item in info.split(';'):
            if '=' in item:
                key, value = item.split('=', 1)
                info_dict[key] = value
        
        variants = []
        
        # For multi-allelic sites, frequencies are comma-separated
        # Parse arrays of values for each alt allele
        def parse_array_field(field_name, parse_func=float, default=0.0):
            value = info_dict.get(field_name, str(default))
            if ',' in value:
                return [parse_func(v) for v in value.split(',')]
            else:
                return [parse_func(value)] * len(alts)
        
        try:
            # Extract gnomAD v4.1 population frequencies (arrays for multi-allelic)
            af_globals = parse_array_field('AF_joint', float, 0.0)
            af_afrs = parse_array_field('AF_joint_afr', float, 0.0)
            af_amrs = parse_array_field('AF_joint_amr', float, 0.0)
            af_asjs = parse_array_field('AF_joint_asj', float, 0.0)
            af_eass = parse_array_field('AF_joint_eas', float, 0.0)
            af_fins = parse_array_field('AF_joint_fin', float, 0.0)
            af_nfes = parse_array_field('AF_joint_nfe', float, 0.0)
            af_oths = parse_array_field('AF_joint_oth', float, 0.0)
            
            # Allele counts and numbers (arrays for multi-allelic)
            ac_globals = parse_array_field('AC_joint', int, 0)
            an_global = int(info_dict.get('AN_joint', 0))  # AN is shared across all alts
            nhomalt_globals = parse_array_field('nhomalt_joint', int, 0)
            
            # Filtering allele frequency at 95% confidence
            faf95_globals = parse_array_field('faf95_joint', float, 0.0)
            
            # Create a PopulationFrequency object for each alt allele
            for i, alt in enumerate(alts):
                # Skip if allele frequency is 0 (not observed)
                if af_globals[i] == 0.0:
                    continue
                    
                # Determine if variant is common (>1% global frequency)
                is_common = af_globals[i] > 0.01
                
                variants.append(PopulationFrequency(
                    chrom=chrom,
                    pos=pos,
                    ref=ref,
                    alt=alt,
                    af_global=af_globals[i],
                    af_afr=af_afrs[i] if i < len(af_afrs) else 0.0,
                    af_amr=af_amrs[i] if i < len(af_amrs) else 0.0,
                    af_asj=af_asjs[i] if i < len(af_asjs) else 0.0,
                    af_eas=af_eass[i] if i < len(af_eass) else 0.0,
                    af_fin=af_fins[i] if i < len(af_fins) else 0.0,
                    af_nfe=af_nfes[i] if i < len(af_nfes) else 0.0,
                    af_oth=af_oths[i] if i < len(af_oths) else 0.0,
                    ac_global=ac_globals[i] if i < len(ac_globals) else 0,
                    an_global=an_global,
                    nhomalt_global=nhomalt_globals[i] if i < len(nhomalt_globals) else 0,
                    faf95_global=faf95_globals[i] if i < len(faf95_globals) else af_globals[i],
                    is_common=is_common
                ))
            
            return variants if variants else None
            
        except (ValueError, KeyError, IndexError) as e:
            print(f"Warning: Could not parse variant at {chrom}:{pos} - {e}")
            return None
    
    def process_chromosome(self, chromosome: str, batch_size: int = 10000) -> int:
        """Process a single chromosome's gnomAD VCF file"""
        
        vcf_file = os.path.join(self.gnomad_dir, f'gnomad.joint.v4.1.sites.chr{chromosome}.vcf.bgz')
        
        if not os.path.exists(vcf_file):
            print(f"Warning: VCF file not found for chromosome {chromosome}: {vcf_file}")
            return 0
        
        print(f"📝 Processing chromosome {chromosome}...")
        print(f"  File: {vcf_file}")
        print(f"  File size: {os.path.getsize(vcf_file) / 1024 / 1024 / 1024:.2f} GB")
        
        variants_processed = 0
        common_count = 0
        lines_processed = 0
        
        # Track allele indices per position to avoid duplicates
        position_allele_map = {}
        
        # Prepare batch data for TileDB insertion
        batch_data = []
        
        try:
            with gzip.open(vcf_file, 'rt') as f:
                for line_num, line in enumerate(f):
                    lines_processed += 1
                    if line_num % 100000 == 0 and line_num > 0:
                        print(f"  Processed {line_num:,} lines, {variants_processed:,} variants...")
                    
                    variants = self.parse_vcf_line(line)
                    if variants is None:
                        continue
                    
                    # Process each variant (handles multi-allelic sites)
                    for variant in variants:
                        # Convert chromosome to integer
                        chrom_int = self.chromosome_to_int(variant.chrom)
                        
                        # Create unique allele index for this position
                        pos_key = (chrom_int, variant.pos)
                        if pos_key not in position_allele_map:
                            position_allele_map[pos_key] = {}
                        
                        allele_key = f"{variant.ref}>{variant.alt}"
                        if allele_key not in position_allele_map[pos_key]:
                            # Assign next available index for this position
                            position_allele_map[pos_key][allele_key] = len(position_allele_map[pos_key])
                        
                        allele_idx = position_allele_map[pos_key][allele_key]
                        
                        
                        # Add to batch with 3D coordinates
                        batch_data.append({
                            'coords': (chrom_int, variant.pos, allele_idx),
                            'data': variant
                        })
                        
                        variants_processed += 1
                        if variant.is_common:
                            common_count += 1
                    
                    # Write batch when it reaches batch_size
                    if len(batch_data) >= batch_size:
                        self._write_batch_to_tiledb(batch_data)
                        batch_data = []
                
                # Write remaining batch
                if batch_data:
                    self._write_batch_to_tiledb(batch_data)
            
            print(f"✅ Chromosome {chromosome}: {variants_processed:,} variants ({common_count:,} common)")
            print(f"  Total lines processed: {lines_processed:,}")
            
        except Exception as e:
            print(f"❌ Error processing chromosome {chromosome}: {e}")
            print(f"  Stopped at line {lines_processed:,}")
            raise
        
        return variants_processed
    
    def _write_batch_to_tiledb(self, batch_data: List[Dict]) -> None:
        """Write a batch of variants to TileDB array"""
        if not batch_data:
            return
        
        # Prepare coordinate and attribute arrays
        coords = [item['coords'] for item in batch_data]
        
        # Separate coordinates into dimensions (now 3D) with explicit numpy types
        chrom_coords = np.array([int(c[0]) for c in coords], dtype=np.int8)
        pos_coords = np.array([int(c[1]) for c in coords], dtype=np.uint32)
        allele_idx_coords = np.array([int(c[2]) for c in coords], dtype=np.uint16)
        
        # Prepare attribute data with explicit numpy conversion
        ref_data = np.array([item['data'].ref for item in batch_data], dtype='U300')
        alt_data = np.array([item['data'].alt for item in batch_data], dtype='U300')
        af_global_data = np.array([item['data'].af_global for item in batch_data], dtype=np.float32)
        af_afr_data = np.array([item['data'].af_afr for item in batch_data], dtype=np.float32)
        af_amr_data = np.array([item['data'].af_amr for item in batch_data], dtype=np.float32)
        af_asj_data = np.array([item['data'].af_asj for item in batch_data], dtype=np.float32)
        af_eas_data = np.array([item['data'].af_eas for item in batch_data], dtype=np.float32)
        af_fin_data = np.array([item['data'].af_fin for item in batch_data], dtype=np.float32)
        af_nfe_data = np.array([item['data'].af_nfe for item in batch_data], dtype=np.float32)
        af_oth_data = np.array([item['data'].af_oth for item in batch_data], dtype=np.float32)
        ac_global_data = np.array([item['data'].ac_global for item in batch_data], dtype=np.uint32)
        an_global_data = np.array([item['data'].an_global for item in batch_data], dtype=np.uint32)
        nhomalt_global_data = np.array([item['data'].nhomalt_global for item in batch_data], dtype=np.uint32)
        faf95_global_data = np.array([item['data'].faf95_global for item in batch_data], dtype=np.float32)
        is_common_data = np.array([item['data'].is_common for item in batch_data], dtype=bool)
        
        # Write to TileDB with 3D coordinates
        try:
            # Validate coordinates before writing
            for i, (c, p, a) in enumerate(zip(chrom_coords[:3], pos_coords[:3], allele_idx_coords[:3])):
                if not isinstance(c, (int, np.integer)) or not isinstance(p, (int, np.integer)) or not isinstance(a, (int, np.integer)):
                    print(f"  Invalid coordinate types at index {i}: c={type(c)}, p={type(p)}, a={type(a)}")
                    print(f"  Values: c={c}, p={p}, a={a}")
                    
            with tiledb.open(self.pop_freq_array, 'w') as A:
                
                A[chrom_coords, pos_coords, allele_idx_coords] = {
                    'ref': ref_data,
                    'alt': alt_data,
                    'af_global': af_global_data,
                    'af_afr': af_afr_data,
                    'af_amr': af_amr_data,
                    'af_asj': af_asj_data,
                    'af_eas': af_eas_data,
                    'af_fin': af_fin_data,
                    'af_nfe': af_nfe_data,
                    'af_oth': af_oth_data,
                    'ac_global': ac_global_data,
                    'an_global': an_global_data,
                    'nhomalt_global': nhomalt_global_data,
                    'faf95_global': faf95_global_data,
                    'is_common': is_common_data
                }
        except Exception as e:
            print(f"  TileDB write error: {e}")
            print(f"  Batch size: {len(chrom_coords)}")
            if len(chrom_coords) > 0:
                print(f"  Sample coords: {list(zip(chrom_coords[:3], pos_coords[:3], allele_idx_coords[:3]))}")
                print(f"  Sample ref/alt: {list(zip(ref_data[:3], alt_data[:3]))}")
            print(f"  Skipping this batch and continuing...")
            return  # Skip this batch and continue processing
    
    def process_all_chromosomes(self, chromosomes: Optional[List[str]] = None) -> None:
        """Process all available gnomAD chromosome files"""
        
        if chromosomes is None:
            # Auto-detect available chromosome files
            chromosomes = []
            for i in range(1, 23):  # chr1-22
                if os.path.exists(os.path.join(self.gnomad_dir, f'gnomad.joint.v4.1.sites.chr{i}.vcf.bgz')):
                    chromosomes.append(str(i))
            
            # Check for sex chromosomes
            for chrom in ['X', 'Y']:
                if os.path.exists(os.path.join(self.gnomad_dir, f'gnomad.joint.v4.1.sites.chr{chrom}.vcf.bgz')):
                    chromosomes.append(chrom)
        
        print(f"🧬 Processing gnomAD population frequencies for {len(chromosomes)} chromosomes")
        print(f"Output: {self.pop_freq_array}")
        
        # Create TileDB array if it doesn't exist
        if not tiledb.object_type(self.pop_freq_array) == "array":
            print("📋 Creating population frequency TileDB array...")
            schema = self.create_population_frequency_schema()
            tiledb.Array.create(self.pop_freq_array, schema)
            print("✅ Array created")
        
        start_time = time.time()
        
        for chrom in chromosomes:
            variants_count = self.process_chromosome(chrom)
            self.stats['total_variants'] += variants_count
            self.stats['chromosomes_processed'].append(chrom)
        
        self.stats['processing_time'] = time.time() - start_time
        
        # Update common/rare variant counts
        self._calculate_final_stats()
        
        print(f"\n✅ gnomAD processing completed in {self.stats['processing_time']:.1f} seconds")
        print(f"📊 Total variants: {self.stats['total_variants']:,}")
        print(f"📊 Common variants (>1%): {self.stats['common_variants']:,}")
        print(f"📊 Rare variants (<1%): {self.stats['rare_variants']:,}")
    
    def _calculate_final_stats(self) -> None:
        """Calculate final statistics by querying the TileDB array"""
        try:
            with tiledb.open(self.pop_freq_array, 'r') as A:
                # Query for common variants
                common_query = A.query(attrs=['is_common']).df[:]
                self.stats['common_variants'] = common_query['is_common'].sum()
                self.stats['rare_variants'] = self.stats['total_variants'] - self.stats['common_variants']
        except Exception as e:
            print(f"Warning: Could not calculate final stats: {e}")
    
    def optimize_arrays(self) -> None:
        """Optimize TileDB arrays by consolidating fragments"""
        print("🔧 Optimizing population frequency arrays...")
        
        try:
            # Consolidate fragments
            tiledb.consolidate(self.pop_freq_array)
            
            # Vacuum array
            tiledb.vacuum(self.pop_freq_array)
            
            print("✅ Array optimization completed")
            
        except Exception as e:
            print(f"❌ Optimization failed: {e}")
    
    def get_array_info(self) -> Dict:
        """Get information about the created arrays"""
        info = {
            'array_path': self.pop_freq_array,
            'exists': tiledb.object_type(self.pop_freq_array) == "array",
            'stats': self.stats
        }
        
        if info['exists']:
            try:
                with tiledb.open(self.pop_freq_array, 'r') as A:
                    info['schema'] = str(A.schema)
                    info['non_empty_domain'] = A.non_empty_domain()
            except Exception as e:
                info['error'] = str(e)
        
        return info

def main():
    parser = argparse.ArgumentParser(description='Process gnomAD VCF files for population frequency analysis')
    parser.add_argument('workspace_path', help='Path to TileDB workspace directory')
    parser.add_argument('--chromosomes', nargs='+', help='Specific chromosomes to process (default: all available)')
    parser.add_argument('--optimize', action='store_true', help='Optimize arrays after processing')
    parser.add_argument('--info', action='store_true', help='Show array information only')
    
    args = parser.parse_args()
    
    processor = GnomadProcessor(args.workspace_path)
    
    if args.info:
        info = processor.get_array_info()
        print(json.dumps(info, indent=2, default=str))
        return
    
    try:
        processor.process_all_chromosomes(args.chromosomes)
        
        if args.optimize:
            processor.optimize_arrays()
            
    except KeyboardInterrupt:
        print("\n⏹️  Processing interrupted by user")
        sys.exit(1)
    except Exception as e:
        print(f"❌ Processing failed: {e}")
        sys.exit(1)

if __name__ == '__main__':
    main()