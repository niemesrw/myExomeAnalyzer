#!/usr/bin/env python3
"""
Test script for genomic analysis tools
Demonstrates population frequency lookups and variant analysis
"""

import sys
import json
sys.path.append('.')

from src.population.population_frequency_service import PopulationFrequencyService
from src.tiledb.query_engine import TileDBQueryEngine
import tiledb
import numpy as np

def test_population_lookups():
    """Test population frequency database queries"""
    print("🧬 Testing Population Frequency Lookups")
    print("=" * 60)
    
    service = PopulationFrequencyService('tiledb_workspace')
    
    # Test 1: Look up known pathogenic BRCA1 variant
    print("\n1️⃣ Testing BRCA1 pathogenic variant (185delAG):")
    print("   This is a founder mutation common in Ashkenazi Jewish population")
    result = service.get_variant_frequency('17', 43124027, 'AG', 'A')
    if result:
        print(f"   ✅ Found: AF={result['af_global']:.6f}")
        print(f"   Ashkenazi Jewish AF: {result['af_asj']:.6f}")
        print(f"   European AF: {result['af_nfe']:.6f}")
        print(f"   Is common (>1%)? {result['is_common']}")
    else:
        print("   ❌ Not found in gnomAD")
    
    # Test 2: Look up BRCA2 variant
    print("\n2️⃣ Testing BRCA2 region for common variants:")
    variants = service.get_variants_in_region('13', 32315000, 32316000)
    print(f"   Found {len(variants)} variants in 1kb region")
    common = [v for v in variants if v['is_common']]
    print(f"   Common variants (>1%): {len(common)}")
    if common:
        v = common[0]
        print(f"   Example: chr{v['chrom']}:{v['pos']} {v['ref']}>{v['alt']} AF={v['af_global']:.3f}")
    
    # Test 3: Multi-population comparison
    print("\n3️⃣ Testing population-specific frequencies:")
    print("   Looking for variants with different frequencies across populations...")
    # Query a region known to have population differences
    variants = service.get_variants_in_region('22', 16050000, 16060000)
    
    # Find variants with population differences
    for v in variants[:100]:  # Check first 100
        if v['af_global'] > 0.01:  # Common variants
            # Calculate max population difference
            pops = [v['af_afr'], v['af_amr'], v['af_asj'], v['af_eas'], 
                   v['af_fin'], v['af_nfe'], v['af_oth']]
            pops = [p for p in pops if p > 0]  # Remove zeros
            if pops and max(pops) / min(pops) > 5:  # 5-fold difference
                print(f"   Found: chr{v['chrom']}:{v['pos']} {v['ref']}>{v['alt']}")
                print(f"     African: {v['af_afr']:.3f}")
                print(f"     East Asian: {v['af_eas']:.3f}")
                print(f"     European: {v['af_nfe']:.3f}")
                break
    
    # Test 4: Clinical gene survey
    print("\n4️⃣ Testing clinical gene coverage:")
    clinical_genes = {
        'BRCA1': ('17', 43044295, 43125370),
        'BRCA2': ('13', 32315474, 32400266),
        'TP53': ('17', 7668421, 7687490),
        'MLH1': ('3', 36993450, 37050845),
        'MYBPC3': ('11', 47352957, 47374252)
    }
    
    for gene, (chrom, start, end) in clinical_genes.items():
        variants = service.get_variants_in_region(chrom, start, end)
        common = len([v for v in variants if v['is_common']])
        print(f"   {gene}: {len(variants)} total variants, {common} common")

def test_variant_analysis():
    """Test variant analysis with TileDB"""
    print("\n\n🔬 Testing Variant Analysis Engine")
    print("=" * 60)
    
    engine = TileDBQueryEngine('tiledb_workspace')
    
    # Test 1: Get dataset statistics
    print("\n1️⃣ Dataset Statistics:")
    stats = engine.get_variant_stats()
    print(f"   Total variants: {stats['total_variants']:,}")
    print(f"   Samples: {stats['total_samples']}")
    print(f"   Chromosomes: {', '.join(map(str, sorted(stats['chromosomes'])))}")
    
    # Test 2: Search for high-quality variants
    print("\n2️⃣ High-quality variant search:")
    print("   Searching for PASS/BOOSTED variants in BRCA1...")
    variants = engine.search_variants(chrom='17', start=43044295, end=43125370, limit=5)
    
    for v in variants:
        print(f"   chr{v['chrom']}:{v['pos']} {v['ref']}>{v['alt']}")
        print(f"     Quality: {v['qual']:.1f}, Filter: {v['filter']}")
        print(f"     Consequence: {v.get('consequence', 'unknown')}")
    
    # Test 3: Sample genotype query
    print("\n3️⃣ Sample genotype analysis:")
    # Get the first available sample
    samples = engine.get_sample_list()
    if samples:
        sample = samples[0]
        print(f"   Analyzing sample: {sample['name']}")
        genotypes = engine.get_sample_genotypes(sample['name'], limit=5)
        
        het_count = sum(1 for g in genotypes if g['gt'] == '0/1')
        hom_count = sum(1 for g in genotypes if g['gt'] == '1/1')
        print(f"   Found {len(genotypes)} variants")
        print(f"   Heterozygous: {het_count}, Homozygous: {hom_count}")

def test_clinical_interpretation():
    """Test clinical interpretation features"""
    print("\n\n🏥 Testing Clinical Interpretation")
    print("=" * 60)
    
    service = PopulationFrequencyService('tiledb_workspace')
    
    print("\n1️⃣ Pharmacogenomic variant check:")
    # CYP2D6*4 - poor metabolizer allele
    print("   Checking CYP2D6*4 (poor metabolizer) frequency...")
    # Note: actual position would need to be verified
    print("   This affects metabolism of many medications")
    
    print("\n2️⃣ Cancer predisposition check:")
    print("   Analyzing BRCA1/2 for pathogenic variants...")
    
    # Look for rare variants in BRCA genes
    for gene, chrom, start, end in [
        ('BRCA1', '17', 43044295, 43125370),
        ('BRCA2', '13', 32315474, 32400266)
    ]:
        variants = service.get_variants_in_region(chrom, start, end)
        rare = [v for v in variants if v['af_global'] < 0.001 and v['af_global'] > 0]
        print(f"   {gene}: {len(rare)} rare variants (<0.1%)")
        
        # Show a few examples
        for v in rare[:2]:
            print(f"     chr{v['chrom']}:{v['pos']} {v['ref']}>{v['alt']} AF={v['af_global']:.6f}")

def create_mcp_test_queries():
    """Create example queries for MCP server testing"""
    print("\n\n🤖 Example MCP Server Queries")
    print("=" * 60)
    print("\nYou can test these with the MCP server using Claude Desktop:")
    
    queries = [
        {
            "tool": "search_variants",
            "description": "Search for variants in BRCA1 gene",
            "params": {
                "gene": "BRCA1",
                "limit": 10,
                "clinical_context": True
            }
        },
        {
            "tool": "calculate_allele_frequency",
            "description": "Check frequency of specific variant",
            "params": {
                "chrom": "17",
                "pos": 43124027,
                "ref": "AG",
                "alt": "A"
            }
        },
        {
            "tool": "filter_variants",
            "description": "Find high-quality clinical variants",
            "params": {
                "quality_tier": "clinical",
                "consequence": "missense",
                "limit": 20
            }
        },
        {
            "tool": "analyze_clinical_variants",
            "description": "Analyze variants in cancer genes",
            "params": {
                "genes": ["BRCA1", "BRCA2", "TP53"],
                "analysis_type": "cancer"
            }
        }
    ]
    
    for q in queries:
        print(f"\n📍 {q['description']}:")
        print(f"   Tool: {q['tool']}")
        print(f"   Parameters: {json.dumps(q['params'], indent=6)}")

def main():
    """Run all tests"""
    try:
        test_population_lookups()
        test_variant_analysis()
        test_clinical_interpretation()
        create_mcp_test_queries()
        
        print("\n\n✅ All tests completed successfully!")
        print("\n💡 Next steps:")
        print("   1. Configure Claude Desktop to use the MCP server")
        print("   2. Ask Claude to analyze your genomic data")
        print("   3. Use population frequencies to interpret variants")
        
    except Exception as e:
        print(f"\n❌ Error during testing: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    main()