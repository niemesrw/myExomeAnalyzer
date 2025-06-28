#!/bin/bash

# Minimal Overnight Download - Just the essentials
# Downloads 3 key chromosomes (~7GB total)

set -e

echo "🌙 Minimal overnight gnomAD download starting..."
echo "============================================="
echo "Time: $(date)"

# Log file
LOG_FILE="minimal_gnomad_$(date +%Y%m%d_%H%M%S).log"

# Essential chromosomes only
ESSENTIAL_CHROMS=("22" "17" "13")  # chr22 (test), BRCA1, BRCA2

echo "📋 Downloading 3 essential chromosomes:" | tee -a "$LOG_FILE"
echo "- chr22: Testing, smallest chromosome (~1.5GB)" | tee -a "$LOG_FILE"
echo "- chr17: BRCA1, TP53 genes (~3GB)" | tee -a "$LOG_FILE"
echo "- chr13: BRCA2 gene (~2.5GB)" | tee -a "$LOG_FILE"
echo "Total: ~7GB download, ~200MB after compression" | tee -a "$LOG_FILE"
echo ""

# Setup Python environment
source venv/bin/activate 2>/dev/null || {
    python3 -m venv venv
    source venv/bin/activate
    pip install tiledb numpy
}

# Download and process each chromosome
for chrom in "${ESSENTIAL_CHROMS[@]}"; do
    echo "[$(date '+%H:%M:%S')] Starting chromosome $chrom..." | tee -a "$LOG_FILE"
    
    # Download
    if npm run analyze -- population download --chromosomes "$chrom" >> "$LOG_FILE" 2>&1; then
        echo "[$(date '+%H:%M:%S')] ✅ chr$chrom downloaded" | tee -a "$LOG_FILE"
        
        # Process and cleanup raw file to save space
        if npm run analyze -- population process --chromosomes "$chrom" >> "$LOG_FILE" 2>&1; then
            echo "[$(date '+%H:%M:%S')] ✅ chr$chrom processed" | tee -a "$LOG_FILE"
            # Remove raw VCF to save space after processing
            rm -f "tiledb_workspace/gnomad_data/gnomad.joint.v4.1.sites.chr${chrom}.vcf.bgz" 2>/dev/null || true
            echo "[$(date '+%H:%M:%S')] 🗑️  Removed raw VCF for chr$chrom" | tee -a "$LOG_FILE"
        fi
    else
        echo "[$(date '+%H:%M:%S')] ❌ chr$chrom failed" | tee -a "$LOG_FILE"
    fi
done

# Download gene annotations (tiny, 40MB)
echo "[$(date '+%H:%M:%S')] Downloading gene annotations..." | tee -a "$LOG_FILE"
npm run analyze -- gene download >> "$LOG_FILE" 2>&1
npm run analyze -- gene process >> "$LOG_FILE" 2>&1

echo "" | tee -a "$LOG_FILE"
echo "🎉 Minimal download complete!" | tee -a "$LOG_FILE"
echo "End time: $(date)" | tee -a "$LOG_FILE"

# macOS notification
osascript -e 'display notification "Essential gnomAD data downloaded!" with title "MyExome Analyzer"' 2>/dev/null || true