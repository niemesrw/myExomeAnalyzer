#!/usr/bin/env python3
"""
ClinVar Variant Processor

Processes ClinVar VCF files and creates optimized TileDB arrays
for fast clinical significance lookups during variant analysis.
"""

import os
import sys
import gzip
import time
import argparse
from typing import Dict, List, Tuple, Optional
from dataclasses import dataclass
from pathlib import Path

import tiledb
import numpy as np

@dataclass
class ClinVarVariant:
    chrom: str
    pos: int
    ref: str
    alt: str
    variant_id: str
    clinical_significance: str
    review_status: str
    condition: str
    gene_symbol: str
    molecular_consequence: str
    origin: str
    last_evaluated: str
    url: str

class ClinVarProcessor:
    """Process ClinVar VCF files and create TileDB clinical significance arrays"""
    
    def __init__(self, workspace_path: str):
        self.workspace_path = workspace_path
        self.clinvar_dir = os.path.join(workspace_path, 'clinvar_data')
        self.arrays_dir = os.path.join(workspace_path, 'clinvar_arrays')
        
        # Ensure output directory exists
        os.makedirs(self.arrays_dir, exist_ok=True)
        
        # ClinVar TileDB array path
        self.clinvar_array = os.path.join(self.arrays_dir, 'clinvar_variants')
        
        # Statistics for processing
        self.stats = {
            'total_variants': 0,
            'pathogenic': 0,
            'likely_pathogenic': 0,
            'benign': 0,
            'likely_benign': 0,
            'vus': 0,
            'conflicting': 0,
            'processing_time': 0
        }
    
    def create_clinvar_schema(self) -> tiledb.ArraySchema:
        """Create TileDB schema optimized for ClinVar variant lookups"""
        
        # Dimensions: chromosome, position, and allele index for multi-allelic sites
        dims = [
            tiledb.Dim(name="chrom", domain=(1, 25), tile=1, dtype=np.int8),  # 1-22, X=23, Y=24, MT=25
            tiledb.Dim(name="pos", domain=(1, 300_000_000), tile=100_000, dtype=np.uint32),
            tiledb.Dim(name="allele_idx", domain=(0, 100), tile=10, dtype=np.uint8)  # Max 100 alt alleles per position
        ]
        
        # Attributes: ClinVar data
        attrs = [
            tiledb.Attr(name="variant_id", dtype='U50'),  # ClinVar variation ID
            tiledb.Attr(name="ref", dtype='U200'),        # Reference allele
            tiledb.Attr(name="alt", dtype='U200'),        # Alternate allele
            tiledb.Attr(name="clinical_significance", dtype='U100'),  # Pathogenic, Benign, VUS, etc.
            tiledb.Attr(name="review_status", dtype='U100'),          # Review confidence
            tiledb.Attr(name="condition", dtype='U500'),              # Associated condition/disease
            tiledb.Attr(name="gene_symbol", dtype='U50'),             # Gene symbol
            tiledb.Attr(name="molecular_consequence", dtype='U100'),   # Consequence type
            tiledb.Attr(name="origin", dtype='U50'),                  # Germline, somatic, etc.
            tiledb.Attr(name="last_evaluated", dtype='U20'),          # Last evaluation date
            tiledb.Attr(name="url", dtype='U200'),                    # ClinVar URL
        ]
        
        # Create sparse array schema
        domain = tiledb.Domain(*dims)
        schema = tiledb.ArraySchema(domain=domain, sparse=True, attrs=attrs)
        
        return schema
    
    def chromosome_to_int(self, chrom: str) -> Optional[int]:
        """Convert chromosome string to integer for TileDB storage"""
        chrom = chrom.replace('chr', '')
        
        # Skip non-standard chromosomes (scaffolds, patches, etc.)
        if chrom.startswith('NT_') or chrom.startswith('NW_') or chrom.startswith('GL'):
            return None
        
        if chrom == 'X':
            return 23
        elif chrom == 'Y':
            return 24
        elif chrom == 'MT' or chrom == 'M':
            return 25
        else:
            try:
                chrom_int = int(chrom)
                if 1 <= chrom_int <= 22:
                    return chrom_int
                else:
                    return None  # Skip invalid chromosome numbers
            except ValueError:
                return None  # Skip unparseable chromosome names
    
    def parse_vcf_line(self, line: str) -> Optional[List[ClinVarVariant]]:
        """Parse a ClinVar VCF line and extract clinical significance data"""
        if line.startswith('#'):
            return None
            
        fields = line.strip().split('\t')
        if len(fields) < 8:
            return None
        
        chrom = fields[0]
        pos = int(fields[1])
        variant_id = fields[2]  # ClinVar variation ID
        ref = fields[3]
        alts = fields[4].split(',')  # Handle multi-allelic sites
        info = fields[7]
        
        # Parse INFO field for ClinVar data
        info_dict = {}
        for item in info.split(';'):
            if '=' in item:
                key, value = item.split('=', 1)
                info_dict[key] = value
        
        variants = []
        
        try:
            # Extract ClinVar-specific fields
            clinical_significance = info_dict.get('CLNSIG', 'not_provided')
            review_status = info_dict.get('CLNREVSTAT', 'not_provided')
            condition = info_dict.get('CLNDN', 'not_provided')
            gene_symbol = info_dict.get('GENEINFO', '').split(':')[0] if info_dict.get('GENEINFO') else 'unknown'
            molecular_consequence = info_dict.get('MC', 'unknown')
            origin = info_dict.get('ORIGIN', 'unknown')
            
            # ClinVar URL
            url = f"https://www.ncbi.nlm.nih.gov/clinvar/variation/{variant_id}/"
            
            # Last evaluated date (try multiple fields)
            last_evaluated = info_dict.get('CLNHGVS', 'unknown')[:10]  # Extract date if present
            
            # Create a variant for each alt allele
            for i, alt in enumerate(alts):
                # Handle multi-allelic clinical significance
                if ',' in clinical_significance:
                    sig_parts = clinical_significance.split(',')
                    sig = sig_parts[i] if i < len(sig_parts) else sig_parts[0]
                else:
                    sig = clinical_significance
                
                variants.append(ClinVarVariant(
                    chrom=chrom,
                    pos=pos,
                    ref=ref,
                    alt=alt,
                    variant_id=variant_id,
                    clinical_significance=sig.replace('_', ' '),
                    review_status=review_status.replace('_', ' '),
                    condition=condition.replace('_', ' ').replace('|', '; '),
                    gene_symbol=gene_symbol,
                    molecular_consequence=molecular_consequence.replace('_', ' '),
                    origin=origin.replace('_', ' '),
                    last_evaluated=last_evaluated,
                    url=url
                ))
            
            return variants if variants else None
            
        except (ValueError, KeyError, IndexError) as e:
            print(f"Warning: Could not parse ClinVar variant at {chrom}:{pos} - {e}")
            return None
    
    def process_clinvar_vcf(self, batch_size: int = 10000) -> int:
        """Process ClinVar VCF file and populate TileDB array"""
        
        vcf_file = os.path.join(self.clinvar_dir, 'clinvar.vcf.gz')
        
        if not os.path.exists(vcf_file):
            raise FileNotFoundError(f"ClinVar VCF file not found: {vcf_file}")
        
        print(f"📝 Processing ClinVar VCF file...")
        print(f"  File: {vcf_file}")
        print(f"  File size: {os.path.getsize(vcf_file) / 1024 / 1024:.1f} MB")
        
        variants_processed = 0
        lines_processed = 0
        
        # Track allele indices per position
        position_allele_map = {}
        
        # Prepare batch data for TileDB insertion
        batch_data = []
        
        try:
            with gzip.open(vcf_file, 'rt') as f:
                for line_num, line in enumerate(f):
                    lines_processed += 1
                    if line_num % 50000 == 0 and line_num > 0:
                        print(f"  Processed {line_num:,} lines, {variants_processed:,} variants...")
                    
                    variants = self.parse_vcf_line(line)
                    if variants is None:
                        continue
                    
                    # Process each variant
                    for variant in variants:
                        # Convert chromosome to integer
                        chrom_int = self.chromosome_to_int(variant.chrom)
                        
                        # Skip non-standard chromosomes
                        if chrom_int is None:
                            continue
                        
                        # Create unique allele index for this position
                        pos_key = (chrom_int, variant.pos)
                        if pos_key not in position_allele_map:
                            position_allele_map[pos_key] = {}
                        
                        allele_key = f"{variant.ref}>{variant.alt}"
                        if allele_key not in position_allele_map[pos_key]:
                            position_allele_map[pos_key][allele_key] = len(position_allele_map[pos_key])
                        
                        allele_idx = position_allele_map[pos_key][allele_key]
                        
                        # Add to batch with 3D coordinates
                        batch_data.append({
                            'coords': (chrom_int, variant.pos, allele_idx),
                            'data': variant
                        })
                        
                        variants_processed += 1
                        
                        # Update statistics
                        sig = variant.clinical_significance.lower()
                        if 'pathogenic' in sig and 'likely' not in sig:
                            self.stats['pathogenic'] += 1
                        elif 'likely pathogenic' in sig:
                            self.stats['likely_pathogenic'] += 1
                        elif 'benign' in sig and 'likely' not in sig:
                            self.stats['benign'] += 1
                        elif 'likely benign' in sig:
                            self.stats['likely_benign'] += 1
                        elif 'uncertain' in sig or 'vus' in sig:
                            self.stats['vus'] += 1
                        elif 'conflicting' in sig:
                            self.stats['conflicting'] += 1
                    
                    # Write batch when it reaches batch_size
                    if len(batch_data) >= batch_size:
                        self._write_batch_to_tiledb(batch_data)
                        batch_data = []
                
                # Write remaining batch
                if batch_data:
                    self._write_batch_to_tiledb(batch_data)
            
            print(f"✅ ClinVar processing: {variants_processed:,} variants")
            print(f"  Total lines processed: {lines_processed:,}")
            
        except Exception as e:
            print(f"❌ Error processing ClinVar VCF: {e}")
            print(f"  Stopped at line {lines_processed:,}")
            raise
        
        return variants_processed
    
    def _write_batch_to_tiledb(self, batch_data: List[Dict]) -> None:
        """Write a batch of ClinVar variants to TileDB array"""
        if not batch_data:
            return
        
        # Prepare coordinate and attribute arrays
        coords = [item['coords'] for item in batch_data]
        
        # Separate coordinates into dimensions
        chrom_coords = np.array([c[0] for c in coords], dtype=np.int8)
        pos_coords = np.array([c[1] for c in coords], dtype=np.uint32)
        allele_idx_coords = np.array([c[2] for c in coords], dtype=np.uint8)
        
        # Prepare attribute data
        variant_id_data = np.array([item['data'].variant_id for item in batch_data], dtype='U50')
        ref_data = np.array([item['data'].ref for item in batch_data], dtype='U200')
        alt_data = np.array([item['data'].alt for item in batch_data], dtype='U200')
        clinical_significance_data = np.array([item['data'].clinical_significance for item in batch_data], dtype='U100')
        review_status_data = np.array([item['data'].review_status for item in batch_data], dtype='U100')
        condition_data = np.array([item['data'].condition for item in batch_data], dtype='U500')
        gene_symbol_data = np.array([item['data'].gene_symbol for item in batch_data], dtype='U50')
        molecular_consequence_data = np.array([item['data'].molecular_consequence for item in batch_data], dtype='U100')
        origin_data = np.array([item['data'].origin for item in batch_data], dtype='U50')
        last_evaluated_data = np.array([item['data'].last_evaluated for item in batch_data], dtype='U20')
        url_data = np.array([item['data'].url for item in batch_data], dtype='U200')
        
        # Write to TileDB
        try:
            with tiledb.open(self.clinvar_array, 'w') as A:
                A[chrom_coords, pos_coords, allele_idx_coords] = {
                    'variant_id': variant_id_data,
                    'ref': ref_data,
                    'alt': alt_data,
                    'clinical_significance': clinical_significance_data,
                    'review_status': review_status_data,
                    'condition': condition_data,
                    'gene_symbol': gene_symbol_data,
                    'molecular_consequence': molecular_consequence_data,
                    'origin': origin_data,
                    'last_evaluated': last_evaluated_data,
                    'url': url_data
                }
        except Exception as e:
            print(f"  TileDB write error: {e}")
            print(f"  Batch size: {len(chrom_coords)}")
            print(f"  Skipping this batch and continuing...")
            return
    
    def process_all_clinvar_data(self) -> None:
        """Process all ClinVar data"""
        
        print(f"🧬 Processing ClinVar Clinical Significance Data")
        print(f"Output: {self.clinvar_array}")
        
        # Create TileDB array if it doesn't exist
        if not tiledb.object_type(self.clinvar_array) == "array":
            print("📋 Creating ClinVar TileDB array...")
            schema = self.create_clinvar_schema()
            tiledb.Array.create(self.clinvar_array, schema)
            print("✅ Array created")
        
        start_time = time.time()
        
        variants_count = self.process_clinvar_vcf()
        self.stats['total_variants'] = variants_count
        self.stats['processing_time'] = time.time() - start_time
        
        print(f"\n✅ ClinVar processing completed in {self.stats['processing_time']:.1f} seconds")
        print(f"📊 Total variants: {self.stats['total_variants']:,}")
        print(f"📊 Pathogenic: {self.stats['pathogenic']:,}")
        print(f"📊 Likely pathogenic: {self.stats['likely_pathogenic']:,}")
        print(f"📊 Benign: {self.stats['benign']:,}")
        print(f"📊 Likely benign: {self.stats['likely_benign']:,}")
        print(f"📊 VUS (uncertain significance): {self.stats['vus']:,}")
        print(f"📊 Conflicting interpretations: {self.stats['conflicting']:,}")

def main():
    parser = argparse.ArgumentParser(description='Process ClinVar VCF files for clinical significance analysis')
    parser.add_argument('workspace_path', help='Path to TileDB workspace directory')
    
    args = parser.parse_args()
    
    processor = ClinVarProcessor(args.workspace_path)
    
    try:
        processor.process_all_clinvar_data()
    except KeyboardInterrupt:
        print("\n⏹️  Processing interrupted by user")
        sys.exit(1)
    except Exception as e:
        print(f"❌ Processing failed: {e}")
        sys.exit(1)

if __name__ == '__main__':
    main()