#!/usr/bin/env python3
"""Test the population frequency TileDB database"""

import tiledb
import numpy as np
import sys

def test_population_queries():
    """Test various queries against the population frequency database"""
    
    array_path = "tiledb_workspace/population_arrays/population_frequencies"
    
    print("🧬 Testing Population Frequency Database")
    print(f"Array path: {array_path}")
    print()
    
    # Open the array
    with tiledb.open(array_path, 'r') as A:
        # Get array schema info
        print("📊 Array Schema:")
        print(f"  Dimensions: {[dim.name for dim in A.schema.domain]}")
        print(f"  Attributes: {[attr.name for attr in A.schema]}")
        print()
        
        # Test 1: Query a specific position on chr22
        print("Test 1: Query specific position chr22:16050075")
        result = A.query(attrs=['ref', 'alt', 'af_global', 'af_nfe', 'ac_global']).multi_index[22, 16050075, :]
        if len(result) > 0:
            for idx in range(len(result['ref'])):
                print(f"  {result['ref'][idx]} > {result['alt'][idx]}: AF={result['af_global'][idx]:.6f}, AF_NFE={result['af_nfe'][idx]:.6f}, AC={result['ac_global'][idx]}")
        else:
            print("  No variants found at this position")
        print()
        
        # Test 2: Query a range on chr17 (BRCA1 region)
        print("Test 2: Query BRCA1 region chr17:43044295-43125370")
        result = A.query(attrs=['ref', 'alt', 'af_global', 'is_common']).multi_index[17, 43044295:43125370, :]
        print(f"  Found {len(result['ref'])} variants in BRCA1 region")
        common_count = np.sum(result['is_common'])
        print(f"  Common variants (AF>1%): {common_count}")
        print()
        
        # Test 3: Query a range on chr13 (BRCA2 region)
        print("Test 3: Query BRCA2 region chr13:32315474-32400266")
        result = A.query(attrs=['ref', 'alt', 'af_global', 'is_common']).multi_index[13, 32315474:32400266, :]
        print(f"  Found {len(result['ref'])} variants in BRCA2 region")
        common_count = np.sum(result['is_common'])
        print(f"  Common variants (AF>1%): {common_count}")
        print()
        
        # Test 4: Find some common variants
        print("Test 4: Find common variants on chr22")
        # Query first 1 million positions
        result = A.query(attrs=['ref', 'alt', 'af_global', 'is_common'], coords=True).multi_index[22, 10000000:11000000, :]
        common_mask = result['is_common']
        if np.any(common_mask):
            common_indices = np.where(common_mask)[0][:5]  # Show first 5
            print(f"  Found {np.sum(common_mask)} common variants in range")
            print("  Examples:")
            for idx in common_indices:
                pos = result['pos'][idx]
                print(f"    chr22:{pos} {result['ref'][idx]}>{result['alt'][idx]} AF={result['af_global'][idx]:.3f}")
        else:
            print("  No common variants found in this range")
        print()
        
        # Test 5: Multi-allelic site handling
        print("Test 5: Check multi-allelic site handling")
        # Look for positions with multiple alleles
        result = A.query(attrs=['ref', 'alt', 'af_global'], coords=True).multi_index[22, 16000000:16100000, :]
        positions = result['pos']
        unique_positions, counts = np.unique(positions, return_counts=True)
        multi_allelic = unique_positions[counts > 1]
        if len(multi_allelic) > 0:
            example_pos = multi_allelic[0]
            print(f"  Example multi-allelic site at chr22:{example_pos}")
            mask = positions == example_pos
            for i, is_at_pos in enumerate(mask):
                if is_at_pos:
                    print(f"    Allele {result['allele_idx'][i]}: {result['ref'][i]}>{result['alt'][i]} AF={result['af_global'][i]:.6f}")
        else:
            print("  No multi-allelic sites found in test range")

if __name__ == "__main__":
    try:
        test_population_queries()
    except Exception as e:
        print(f"❌ Error: {e}")
        sys.exit(1)