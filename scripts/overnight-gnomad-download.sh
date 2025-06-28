#!/bin/bash

# Overnight gnomAD Download Script
# Downloads key chromosomes for clinical genomics analysis

set -e

echo "🌙 Starting overnight gnomAD download..."
echo "===================================="
echo "Time: $(date)"
echo ""

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Log file for overnight run
LOG_FILE="gnomad_download_$(date +%Y%m%d_%H%M%S).log"
echo "Logging to: $LOG_FILE"
echo ""

# Function to log with timestamp
log_progress() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# Check Python environment
log_progress "Checking Python environment..."
if [ ! -d "venv" ]; then
    python3 -m venv venv
    source venv/bin/activate
    pip install tiledb numpy
else
    source venv/bin/activate
fi

# Priority chromosomes for clinical genomics
# These cover most important disease genes
PRIORITY_CHROMOSOMES=(
    "22"  # Smallest, good for testing (~1.5GB)
    "17"  # BRCA1, TP53 (~3GB)
    "13"  # BRCA2 (~2GB)
    "19"  # Pharmacogenomics genes, LDLR (~2.5GB)
    "7"   # CFTR, many cancer genes (~3.5GB)
    "11"  # Many important genes (~3GB)
    "1"   # Largest chromosome (~5GB)
    "2"   # Second largest (~4.5GB)
    "X"   # Sex-linked disorders (~3GB)
)

echo "📋 Download Plan:" | tee -a "$LOG_FILE"
echo "Will download ${#PRIORITY_CHROMOSOMES[@]} priority chromosomes" | tee -a "$LOG_FILE"
echo "Estimated total size: ~28GB" | tee -a "$LOG_FILE"
echo "Estimated time: 1-3 hours (depending on connection)" | tee -a "$LOG_FILE"
echo "" | tee -a "$LOG_FILE"

# Check AWS CLI
if ! command -v aws &> /dev/null; then
    log_progress "⚠️  AWS CLI not found. Installing..."
    if command -v brew &> /dev/null; then
        brew install awscli
    else
        log_progress "❌ Please install AWS CLI manually"
        exit 1
    fi
fi

# Start downloads
log_progress "🚀 Starting downloads..."

for chrom in "${PRIORITY_CHROMOSOMES[@]}"; do
    log_progress "📥 Downloading chromosome $chrom..."
    
    if npm run analyze -- population download --chromosomes "$chrom" >> "$LOG_FILE" 2>&1; then
        log_progress "✅ Chromosome $chrom downloaded successfully"
        
        # Process immediately to save space
        log_progress "🔄 Processing chromosome $chrom to TileDB..."
        if npm run analyze -- population process --chromosomes "$chrom" >> "$LOG_FILE" 2>&1; then
            log_progress "✅ Chromosome $chrom processed and compressed"
            # Remove raw VCF to save space after successful processing
            rm -f "tiledb_workspace/gnomad_data/gnomad.joint.v4.1.sites.chr${chrom}.vcf.bgz" 2>/dev/null || true
            log_progress "🗑️  Removed raw VCF for chromosome $chrom"
        else
            log_progress "⚠️  Failed to process chromosome $chrom"
        fi
    else
        log_progress "❌ Failed to download chromosome $chrom"
    fi
    
    # Brief pause between downloads
    sleep 5
done

# Download gene annotations (small, ~40MB)
log_progress "📥 Downloading gene annotations..."
if npm run analyze -- gene download >> "$LOG_FILE" 2>&1; then
    log_progress "✅ Gene annotations downloaded"
    
    # Process gene annotations
    if npm run analyze -- gene process >> "$LOG_FILE" 2>&1; then
        log_progress "✅ Gene annotations processed"
    fi
else
    log_progress "⚠️  Failed to download gene annotations"
fi

# Summary
echo "" | tee -a "$LOG_FILE"
echo "🎉 Download Complete!" | tee -a "$LOG_FILE"
echo "===================" | tee -a "$LOG_FILE"
echo "End time: $(date)" | tee -a "$LOG_FILE"

# Check what was successfully downloaded
log_progress "📊 Final status:"
npm run analyze -- population status >> "$LOG_FILE" 2>&1
npm run analyze -- gene status >> "$LOG_FILE" 2>&1

# Disk usage
echo "" | tee -a "$LOG_FILE"
echo "💾 Disk usage:" | tee -a "$LOG_FILE"
du -sh data/* | tee -a "$LOG_FILE"

echo "" | tee -a "$LOG_FILE"
echo "✨ Ready for genomic analysis in the morning!" | tee -a "$LOG_FILE"
echo "" | tee -a "$LOG_FILE"
echo "Next steps:" | tee -a "$LOG_FILE"
echo "1. Configure Claude Desktop with both MCP servers" | tee -a "$LOG_FILE"
echo "2. Try queries like:" | tee -a "$LOG_FILE"
echo '   "What population frequency does chr17:43044295 G>A have?"' | tee -a "$LOG_FILE"
echo '   "Are any of my BRCA1 variants rare in gnomAD?"' | tee -a "$LOG_FILE"

# Send notification if on macOS
if [[ "$OSTYPE" == "darwin"* ]]; then
    osascript -e 'display notification "gnomAD download complete! Check gnomad_download_*.log for details." with title "MyExome Analyzer"'
fi