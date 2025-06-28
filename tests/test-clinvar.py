#!/usr/bin/env python3
"""Test ClinVar database functionality"""

import tiledb
import numpy as np

def test_clinvar_database():
    """Test direct queries against the ClinVar database"""
    print("🏥 Testing ClinVar Clinical Significance Database")
    print("=" * 60)
    
    array_path = "tiledb_workspace/clinvar_arrays/clinvar_variants"
    
    try:
        with tiledb.open(array_path, 'r') as A:
            # Test 1: Get overall statistics
            print("\n1️⃣ Database Statistics:")
            result = A.query(attrs=['clinical_significance']).submit()
            total_variants = len(result['clinical_significance'])
            print(f"   Total variants: {total_variants:,}")
            
            # Count significance categories
            pathogenic = sum(1 for sig in result['clinical_significance'] 
                           if 'pathogenic' in sig.lower() and 'likely' not in sig.lower())
            likely_pathogenic = sum(1 for sig in result['clinical_significance'] 
                                  if 'likely pathogenic' in sig.lower())
            benign = sum(1 for sig in result['clinical_significance'] 
                        if 'benign' in sig.lower() and 'likely' not in sig.lower())
            likely_benign = sum(1 for sig in result['clinical_significance'] 
                              if 'likely benign' in sig.lower())
            vus = sum(1 for sig in result['clinical_significance'] 
                     if 'uncertain' in sig.lower() or 'vus' in sig.lower())
            
            print(f"   Pathogenic: {pathogenic:,}")
            print(f"   Likely pathogenic: {likely_pathogenic:,}")
            print(f"   VUS (uncertain): {vus:,}")
            print(f"   Likely benign: {likely_benign:,}")
            print(f"   Benign: {benign:,}")
            
            # Test 2: Query specific chromosomes of interest
            print("\n2️⃣ Coverage by Chromosome:")
            coords_result = A.query(attrs=['clinical_significance'], coords=True).submit()
            
            # Count by chromosome
            chrom_counts = {}
            for chrom in coords_result['chrom']:
                chrom_counts[chrom] = chrom_counts.get(chrom, 0) + 1
            
            chrom_names = {17: 'Chr17 (BRCA1, TP53)', 13: 'Chr13 (BRCA2)', 22: 'Chr22'}
            for chrom_int in sorted(chrom_counts.keys()):
                count = chrom_counts[chrom_int]
                name = chrom_names.get(chrom_int, f'Chr{chrom_int}')
                print(f"   {name}: {count:,} variants")
            
            # Test 3: Find pathogenic variants in cancer genes
            print("\n3️⃣ Pathogenic Variants in Cancer Genes:")
            gene_result = A.query(attrs=['gene_symbol', 'clinical_significance', 
                                       'condition', 'ref', 'alt'], coords=True).submit()
            
            cancer_genes = ['BRCA1', 'BRCA2', 'TP53', 'MLH1', 'MSH2']
            
            for gene in cancer_genes:
                gene_variants = []
                for i, gene_symbol in enumerate(gene_result['gene_symbol']):
                    if gene_symbol == gene:
                        sig = gene_result['clinical_significance'][i].lower()
                        if 'pathogenic' in sig:
                            gene_variants.append({
                                'chrom': gene_result['chrom'][i],
                                'pos': gene_result['pos'][i],
                                'ref': gene_result['ref'][i],
                                'alt': gene_result['alt'][i],
                                'significance': gene_result['clinical_significance'][i],
                                'condition': gene_result['condition'][i]
                            })
                            if len(gene_variants) >= 3:  # Limit to first 3
                                break
                
                if gene_variants:
                    print(f"\n   {gene} pathogenic variants:")
                    for v in gene_variants[:3]:
                        chrom_name = {17: '17', 13: '13', 22: '22'}.get(v['chrom'], str(v['chrom']))
                        print(f"     chr{chrom_name}:{v['pos']} {v['ref']}>{v['alt']}")
                        print(f"       Significance: {v['significance']}")
                        print(f"       Condition: {v['condition'][:80]}...")
                else:
                    print(f"   {gene}: No pathogenic variants found")
            
            # Test 4: Sample variant lookups
            print("\n4️⃣ Sample Variant Lookups:")
            print("   Testing specific chromosome 17 positions...")
            
            # Query chr17 specifically
            chr17_result = A.query(attrs=['ref', 'alt', 'clinical_significance', 
                                        'gene_symbol'], coords=True).multi_index[17, :, :]
            
            if len(chr17_result['ref']) > 0:
                print(f"   Found {len(chr17_result['ref'])} variants on chromosome 17")
                # Show a few examples
                for i in range(min(5, len(chr17_result['ref']))):
                    pos = chr17_result['pos'][i]
                    ref = chr17_result['ref'][i]
                    alt = chr17_result['alt'][i]
                    sig = chr17_result['clinical_significance'][i]
                    gene = chr17_result['gene_symbol'][i]
                    print(f"     chr17:{pos} {ref}>{alt} - {sig} ({gene})")
            
    except Exception as e:
        print(f"❌ Error testing ClinVar database: {e}")
        import traceback
        traceback.print_exc()

def main():
    """Run ClinVar tests"""
    try:
        test_clinvar_database()
        print("\n✅ ClinVar testing completed!")
        print("\n💡 You can now use ClinVar data for:")
        print("   • Variant pathogenicity assessment")
        print("   • Clinical significance lookups")
        print("   • Disease association queries")
        print("   • Integration with Claude MCP server")
        
    except Exception as e:
        print(f"❌ Error: {e}")

if __name__ == "__main__":
    main()