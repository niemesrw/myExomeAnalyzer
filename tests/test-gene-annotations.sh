#!/bin/bash

echo "🧬 Testing GENCODE gene annotations..."
echo

GTF_FILE="tiledb_workspace/gene_annotations/gencode.v48.basic.annotation.gtf.gz"

if [ -f "$GTF_FILE" ]; then
    echo "✅ GTF file exists: $GTF_FILE"
    echo "📊 File size: $(ls -lh $GTF_FILE | awk '{print $5}')"
    echo
    
    echo "📋 First 10 gene records:"
    gunzip -c "$GTF_FILE" | grep -E "^\w+\s+\w+\s+gene\s+" | head -10
    echo
    
    echo "📊 Statistics:"
    echo -n "  Total genes: "
    gunzip -c "$GTF_FILE" | grep -E "^\w+\s+\w+\s+gene\s+" | wc -l
    
    echo -n "  Protein-coding genes: "
    gunzip -c "$GTF_FILE" | grep -E "^\w+\s+\w+\s+gene\s+" | grep "protein_coding" | wc -l
    
    echo "  Clinical genes found:"
    for gene in BRCA1 BRCA2 TP53 MLH1 MSH2 MYBPC3; do
        count=$(gunzip -c "$GTF_FILE" | grep -E "gene_name \"$gene\"" | grep -E "^\w+\s+\w+\s+gene\s+" | wc -l)
        if [ $count -gt 0 ]; then
            echo "    ✓ $gene"
        fi
    done
else
    echo "❌ GTF file not found!"
fi