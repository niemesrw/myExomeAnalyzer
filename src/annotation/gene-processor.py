#!/usr/bin/env python3
"""
Gene Annotation Processor

This script processes GENCODE GTF files and creates optimized TileDB arrays
for fast gene lookup during variant analysis.
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
class GeneAnnotation:
    gene_id: str
    gene_name: str
    gene_type: str
    chrom: str
    start: int
    end: int
    strand: str
    source: str
    transcript_id: Optional[str] = None
    exon_number: Optional[int] = None
    feature_type: str = 'gene'

@dataclass
class GeneRegion:
    gene_name: str
    chrom: str
    start: int
    end: int
    gene_type: str
    strand: str
    transcript_count: int
    clinical_significance: Optional[str] = None

class GeneAnnotationProcessor:
    """Process GENCODE GTF files and create TileDB gene annotation arrays"""
    
    def __init__(self, workspace_path: str):
        self.workspace_path = workspace_path
        self.annotation_dir = os.path.join(workspace_path, 'gene_annotations')
        self.arrays_dir = os.path.join(workspace_path, 'gene_arrays')
        
        # Ensure output directory exists
        os.makedirs(self.arrays_dir, exist_ok=True)
        
        # Gene annotation TileDB array paths
        self.gene_regions_array = os.path.join(self.arrays_dir, 'gene_regions')
        self.gene_features_array = os.path.join(self.arrays_dir, 'gene_features')
        
        # Clinical gene definitions
        self.clinical_genes = {
            # Cancer genes
            'BRCA1': 'Hereditary breast and ovarian cancer syndrome',
            'BRCA2': 'Hereditary breast and ovarian cancer syndrome',
            'MLH1': 'Lynch syndrome (hereditary nonpolyposis colorectal cancer)',
            'MSH2': 'Lynch syndrome (hereditary nonpolyposis colorectal cancer)',
            'MSH6': 'Lynch syndrome (hereditary nonpolyposis colorectal cancer)',
            'PMS2': 'Lynch syndrome (hereditary nonpolyposis colorectal cancer)',
            'APC': 'Familial adenomatous polyposis',
            'TP53': 'Li-Fraumeni syndrome',
            'VHL': 'Von Hippel-Lindau syndrome',
            'RET': 'Multiple endocrine neoplasia type 2',
            'PTEN': 'PTEN hamartoma tumor syndrome',
            
            # Cardiac genes
            'MYBPC3': 'Hypertrophic cardiomyopathy',
            'MYH7': 'Hypertrophic and dilated cardiomyopathy',
            'TNNT2': 'Hypertrophic cardiomyopathy',
            'TNNI3': 'Hypertrophic and restrictive cardiomyopathy',
            'TPM1': 'Hypertrophic and dilated cardiomyopathy',
            'MYL2': 'Hypertrophic cardiomyopathy',
            'MYL3': 'Hypertrophic cardiomyopathy',
            'ACTC1': 'Hypertrophic and dilated cardiomyopathy',
            
            # Pharmacogenomic genes
            'CYP2D6': 'Drug metabolism - antidepressants, antipsychotics',
            'CYP2C19': 'Drug metabolism - clopidogrel, proton pump inhibitors',
            'CYP2C9': 'Drug metabolism - warfarin, phenytoin',
            'VKORC1': 'Warfarin sensitivity',
            'SLCO1B1': 'Statin-induced myopathy',
            'DPYD': 'Fluoropyrimidine toxicity',
            'TPMT': 'Thiopurine toxicity',
            'UGT1A1': 'Irinotecan toxicity'
        }
        
        # Statistics for processing
        self.stats = {
            'total_features': 0,
            'genes_processed': 0,
            'clinical_genes_found': 0,
            'processing_time': 0
        }
    
    def create_gene_regions_schema(self) -> tiledb.ArraySchema:
        """Create TileDB schema for gene regions lookup"""
        
        # Dimensions: chromosome and position for fast overlap queries
        dims = [
            tiledb.Dim(name="chrom", domain=(1, 25), tile=1, dtype=np.int8),  # 1-22, X=23, Y=24, MT=25
            tiledb.Dim(name="start", domain=(1, 300_000_000), tile=100_000, dtype=np.uint32)
        ]
        
        # Attributes: gene information
        attrs = [
            tiledb.Attr(name="gene_name", dtype='U50'),
            tiledb.Attr(name="gene_id", dtype='U30'),
            tiledb.Attr(name="gene_type", dtype='U30'),
            tiledb.Attr(name="end", dtype=np.uint32),
            tiledb.Attr(name="strand", dtype='U1'),
            tiledb.Attr(name="transcript_count", dtype=np.uint16),
            tiledb.Attr(name="clinical_significance", dtype='U200'),
            tiledb.Attr(name="is_clinical", dtype=bool),
        ]
        
        # Create sparse array schema (genes are sparse across genome)
        domain = tiledb.Domain(*dims)
        schema = tiledb.ArraySchema(domain=domain, sparse=True, attrs=attrs)
        
        return schema
    
    def create_gene_features_schema(self) -> tiledb.ArraySchema:
        """Create TileDB schema for detailed gene features (exons, transcripts)"""
        
        # Dimensions: chromosome, position, and feature type
        dims = [
            tiledb.Dim(name="chrom", domain=(1, 25), tile=1, dtype=np.int8),
            tiledb.Dim(name="start", domain=(1, 300_000_000), tile=50_000, dtype=np.uint32),
            tiledb.Dim(name="feature_id", domain=(1, 10_000_000), tile=10_000, dtype=np.uint32)
        ]
        
        # Attributes: detailed feature information
        attrs = [
            tiledb.Attr(name="gene_name", dtype='U50'),
            tiledb.Attr(name="gene_id", dtype='U30'),
            tiledb.Attr(name="transcript_id", dtype='U30'),
            tiledb.Attr(name="feature_type", dtype='U20'),  # gene, transcript, exon, CDS, UTR
            tiledb.Attr(name="end", dtype=np.uint32),
            tiledb.Attr(name="strand", dtype='U1'),
            tiledb.Attr(name="exon_number", dtype=np.uint16),
            tiledb.Attr(name="source", dtype='U20'),
        ]
        
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
            try:
                return int(chrom)
            except ValueError:
                return 999  # Unknown chromosome
    
    def parse_gtf_line(self, line: str) -> Optional[GeneAnnotation]:
        """Parse a GTF line into GeneAnnotation"""
        if line.startswith('#') or not line.strip():
            return None
            
        fields = line.strip().split('\t')
        if len(fields) < 9:
            return None
        
        chrom, source, feature_type, start, end, score, strand, frame, attributes = fields
        
        # Parse attributes
        attr_dict = {}
        for attr in attributes.split(';'):
            if attr.strip():
                # GTF format: key "value"
                parts = attr.strip().split(' ', 1)
                if len(parts) == 2:
                    key = parts[0]
                    value = parts[1].strip('"')
                    attr_dict[key] = value
        
        # Only process relevant features
        allowed_features = ['gene', 'transcript', 'exon', 'CDS', 'five_prime_UTR', 'three_prime_UTR']
        if feature_type not in allowed_features:
            return None
        
        # Clean chromosome name
        clean_chrom = chrom.replace('chr', '')
        
        return GeneAnnotation(
            gene_id=attr_dict.get('gene_id', ''),
            gene_name=attr_dict.get('gene_name', attr_dict.get('gene_id', '')),
            gene_type=attr_dict.get('gene_type', attr_dict.get('gene_biotype', 'unknown')),
            chrom=clean_chrom,
            start=int(start),
            end=int(end),
            strand=strand,
            source=source,
            transcript_id=attr_dict.get('transcript_id'),
            exon_number=int(attr_dict.get('exon_number', 0)) if attr_dict.get('exon_number') else None,
            feature_type=self.normalize_feature_type(feature_type)
        )
    
    def normalize_feature_type(self, feature_type: str) -> str:
        """Normalize feature types to standard categories"""
        mapping = {
            'five_prime_UTR': 'UTR',
            'three_prime_UTR': 'UTR',
            'CDS': 'CDS',
            'exon': 'exon',
            'transcript': 'transcript',
            'gene': 'gene'
        }
        return mapping.get(feature_type, feature_type)
    
    def extract_gene_regions(self, annotations: List[GeneAnnotation]) -> List[GeneRegion]:
        """Extract unique gene regions from annotations"""
        gene_map = {}
        transcript_counts = {}
        
        # First pass: collect genes and count transcripts
        for annotation in annotations:
            if annotation.feature_type == 'gene':
                key = f"{annotation.gene_name}_{annotation.chrom}"
                
                if key not in gene_map:
                    gene_map[key] = GeneRegion(
                        gene_name=annotation.gene_name,
                        chrom=annotation.chrom,
                        start=annotation.start,
                        end=annotation.end,
                        gene_type=annotation.gene_type,
                        strand=annotation.strand,
                        transcript_count=0,
                        clinical_significance=self.clinical_genes.get(annotation.gene_name)
                    )
            
            elif annotation.feature_type == 'transcript':
                gene_key = f"{annotation.gene_name}_{annotation.chrom}"
                if gene_key not in transcript_counts:
                    transcript_counts[gene_key] = set()
                if annotation.transcript_id:
                    transcript_counts[gene_key].add(annotation.transcript_id)
        
        # Update transcript counts
        for gene_key, gene_region in gene_map.items():
            gene_region.transcript_count = len(transcript_counts.get(gene_key, set()))
        
        return list(gene_map.values())
    
    def process_gtf_file(self, gtf_file: str) -> Tuple[List[GeneRegion], List[GeneAnnotation]]:
        """Process GTF file and extract gene data"""
        
        if not os.path.exists(gtf_file):
            raise FileNotFoundError(f"GTF file not found: {gtf_file}")
        
        print(f"📋 Processing GTF file: {gtf_file}")
        
        annotations = []
        line_count = 0
        
        # Determine if file is compressed
        opener = gzip.open if gtf_file.endswith('.gz') else open
        mode = 'rt' if gtf_file.endswith('.gz') else 'r'
        
        try:
            with opener(gtf_file, mode) as f:
                for line in f:
                    line_count += 1
                    
                    if line_count % 100000 == 0:
                        print(f"  Processed {line_count:,} lines...")
                    
                    annotation = self.parse_gtf_line(line)
                    if annotation:
                        annotations.append(annotation)
            
            print(f"✅ Parsed {len(annotations):,} annotations from {line_count:,} lines")
            
            # Extract gene regions
            gene_regions = self.extract_gene_regions(annotations)
            print(f"✅ Extracted {len(gene_regions):,} unique gene regions")
            
            # Count clinical genes
            clinical_count = sum(1 for gene in gene_regions if gene.clinical_significance)
            print(f"✅ Found {clinical_count} clinical genes")
            
            self.stats['total_features'] = len(annotations)
            self.stats['genes_processed'] = len(gene_regions)
            self.stats['clinical_genes_found'] = clinical_count
            
            return gene_regions, annotations
            
        except Exception as e:
            print(f"❌ Error processing GTF file: {e}")
            raise
    
    def write_gene_regions_to_tiledb(self, gene_regions: List[GeneRegion]) -> None:
        """Write gene regions to TileDB array"""
        
        print(f"📝 Writing {len(gene_regions):,} gene regions to TileDB...")
        
        # Prepare data arrays
        chrom_coords = []
        start_coords = []
        gene_names = []
        gene_ids = []
        gene_types = []
        ends = []
        strands = []
        transcript_counts = []
        clinical_significances = []
        is_clinical = []
        
        # Sort and deduplicate gene regions to avoid coordinate conflicts
        sorted_genes = sorted(gene_regions, key=lambda g: (self.chromosome_to_int(g.chrom), g.start, g.gene_name))
        seen_coords = set()
        
        for gene in sorted_genes:
            chrom_int = self.chromosome_to_int(gene.chrom)
            coord_key = (chrom_int, gene.start)
            
            # Skip duplicates
            if coord_key in seen_coords:
                continue
            seen_coords.add(coord_key)
            
            chrom_coords.append(chrom_int)
            start_coords.append(gene.start)
            gene_names.append(gene.gene_name)
            gene_ids.append(f"GENE_{gene.gene_name}_{gene.chrom}")  # Create synthetic ID
            gene_types.append(gene.gene_type)
            ends.append(gene.end)
            strands.append(gene.strand)
            transcript_counts.append(gene.transcript_count)
            clinical_significances.append(gene.clinical_significance or '')
            is_clinical.append(gene.clinical_significance is not None)
        
        # Write to TileDB
        with tiledb.open(self.gene_regions_array, 'w') as A:
            A[chrom_coords, start_coords] = {
                'gene_name': gene_names,
                'gene_id': gene_ids,
                'gene_type': gene_types,
                'end': ends,
                'strand': strands,
                'transcript_count': transcript_counts,
                'clinical_significance': clinical_significances,
                'is_clinical': is_clinical
            }
    
    def write_gene_features_to_tiledb(self, annotations: List[GeneAnnotation]) -> None:
        """Write detailed gene features to TileDB array"""
        
        print(f"📝 Writing {len(annotations):,} gene features to TileDB...")
        
        # Prepare data arrays
        chrom_coords = []
        start_coords = []
        feature_ids = []
        gene_names = []
        gene_ids = []
        transcript_ids = []
        feature_types = []
        ends = []
        strands = []
        exon_numbers = []
        sources = []
        
        for i, annotation in enumerate(annotations):
            chrom_int = self.chromosome_to_int(annotation.chrom)
            
            chrom_coords.append(chrom_int)
            start_coords.append(annotation.start)
            feature_ids.append(i + 1)  # Feature ID (1-based)
            gene_names.append(annotation.gene_name)
            gene_ids.append(annotation.gene_id)
            transcript_ids.append(annotation.transcript_id or '')
            feature_types.append(annotation.feature_type)
            ends.append(annotation.end)
            strands.append(annotation.strand)
            exon_numbers.append(annotation.exon_number or 0)
            sources.append(annotation.source)
        
        # Write to TileDB in batches
        batch_size = 50000
        for i in range(0, len(annotations), batch_size):
            end_idx = min(i + batch_size, len(annotations))
            
            batch_chrom = chrom_coords[i:end_idx]
            batch_start = start_coords[i:end_idx]
            batch_feature_id = feature_ids[i:end_idx]
            
            with tiledb.open(self.gene_features_array, 'w') as A:
                A[batch_chrom, batch_start, batch_feature_id] = {
                    'gene_name': gene_names[i:end_idx],
                    'gene_id': gene_ids[i:end_idx],
                    'transcript_id': transcript_ids[i:end_idx],
                    'feature_type': feature_types[i:end_idx],
                    'end': ends[i:end_idx],
                    'strand': strands[i:end_idx],
                    'exon_number': exon_numbers[i:end_idx],
                    'source': sources[i:end_idx]
                }
            
            if end_idx < len(annotations):
                print(f"  Written {end_idx:,} / {len(annotations):,} features...")
    
    def process_gene_annotations(self, gtf_filename: Optional[str] = None) -> None:
        """Process gene annotations from GTF file to TileDB arrays"""
        
        # Find GTF file
        if gtf_filename is None:
            # Auto-detect GTF file in annotation directory
            gtf_files = [f for f in os.listdir(self.annotation_dir) if f.endswith('.gtf.gz')]
            if not gtf_files:
                raise FileNotFoundError(f"No GTF files found in {self.annotation_dir}")
            gtf_filename = gtf_files[0]
        
        gtf_file = os.path.join(self.annotation_dir, gtf_filename)
        
        print(f"🧬 Processing gene annotations from {gtf_filename}")
        start_time = time.time()
        
        # Create TileDB arrays if they don't exist
        if not tiledb.object_type(self.gene_regions_array) == "array":
            print("📋 Creating gene regions TileDB array...")
            schema = self.create_gene_regions_schema()
            tiledb.Array.create(self.gene_regions_array, schema)
        
        if not tiledb.object_type(self.gene_features_array) == "array":
            print("📋 Creating gene features TileDB array...")
            schema = self.create_gene_features_schema()
            tiledb.Array.create(self.gene_features_array, schema)
        
        # Process GTF file
        gene_regions, annotations = self.process_gtf_file(gtf_file)
        
        # Write to TileDB
        self.write_gene_regions_to_tiledb(gene_regions)
        self.write_gene_features_to_tiledb(annotations)
        
        self.stats['processing_time'] = time.time() - start_time
        
        print(f"\n✅ Gene annotation processing completed in {self.stats['processing_time']:.1f} seconds")
        print(f"📊 Total features processed: {self.stats['total_features']:,}")
        print(f"📊 Unique genes: {self.stats['genes_processed']:,}")
        print(f"📊 Clinical genes found: {self.stats['clinical_genes_found']:,}")
    
    def optimize_arrays(self) -> None:
        """Optimize TileDB arrays by consolidating fragments"""
        print("🔧 Optimizing gene annotation arrays...")
        
        try:
            # Consolidate gene regions array
            tiledb.consolidate(self.gene_regions_array)
            tiledb.vacuum(self.gene_regions_array)
            
            # Consolidate gene features array
            tiledb.consolidate(self.gene_features_array)
            tiledb.vacuum(self.gene_features_array)
            
            print("✅ Array optimization completed")
            
        except Exception as e:
            print(f"❌ Optimization failed: {e}")
    
    def get_array_info(self) -> Dict:
        """Get information about the created arrays"""
        info = {
            'gene_regions_array': self.gene_regions_array,
            'gene_features_array': self.gene_features_array,
            'gene_regions_exists': tiledb.object_type(self.gene_regions_array) == "array",
            'gene_features_exists': tiledb.object_type(self.gene_features_array) == "array",
            'stats': self.stats
        }
        
        return info

def main():
    parser = argparse.ArgumentParser(description='Process GENCODE GTF files for gene annotation')
    parser.add_argument('workspace_path', help='Path to TileDB workspace directory')
    parser.add_argument('--gtf-file', help='Specific GTF filename (auto-detect if not provided)')
    parser.add_argument('--optimize', action='store_true', help='Optimize arrays after processing')
    parser.add_argument('--info', action='store_true', help='Show array information only')
    
    args = parser.parse_args()
    
    processor = GeneAnnotationProcessor(args.workspace_path)
    
    if args.info:
        info = processor.get_array_info()
        print(json.dumps(info, indent=2, default=str))
        return
    
    try:
        processor.process_gene_annotations(args.gtf_file)
        
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