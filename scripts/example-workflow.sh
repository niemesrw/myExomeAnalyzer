#!/bin/bash

# Example workflow for MyExome Analyzer with TileDB
# This script demonstrates the complete workflow from setup to analysis

set -e

echo "🧬 MyExome Analyzer - Example Workflow (TileDB Edition)"
echo "========================================================"

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Please run this script from the myExomeAnalyzer directory"
    exit 1
fi

echo "1. 🔧 Setting up environment..."

# Install Node.js dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "   📦 Installing Node.js dependencies..."
    npm install
    echo "   ✅ Dependencies installed"
else
    echo "   ✅ Node.js dependencies already installed"
fi

# Setup Python virtual environment
if [ ! -d "venv" ]; then
    echo "   🐍 Creating Python virtual environment..."
    python3 -m venv venv
    echo "   ✅ Virtual environment created"
else
    echo "   ✅ Python virtual environment already exists"
fi

# Activate virtual environment and install TileDB
echo "   🔌 Activating Python environment and checking TileDB..."
source venv/bin/activate
if ! python -c "import tiledb_vcf" 2>/dev/null; then
    echo "   📦 Installing TileDB-VCF..."
    pip install tiledb-vcf
    echo "   ✅ TileDB-VCF installed"
else
    echo "   ✅ TileDB-VCF already installed"
fi

echo
echo "2. 🏗️  Building TypeScript..."
npm run build

echo
echo "3. 📄 Creating example VCF file..."

# Create a small example VCF file if it doesn't exist
if [ ! -f "data/example.vcf" ]; then
    mkdir -p data
    cat > data/example.vcf << 'EOF'
##fileformat=VCFv4.2
##INFO=<ID=DP,Number=1,Type=Integer,Description="Total Depth">
##INFO=<ID=AF,Number=A,Type=Float,Description="Allele Frequency">
##FORMAT=<ID=GT,Number=1,Type=String,Description="Genotype">
##FORMAT=<ID=DP,Number=1,Type=Integer,Description="Read Depth">
##FORMAT=<ID=GQ,Number=1,Type=Integer,Description="Genotype Quality">
#CHROM	POS	ID	REF	ALT	QUAL	FILTER	INFO	FORMAT	Sample1	Sample2	Sample3
1	100000	rs001	A	G	99	PASS	DP=150;AF=0.33	GT:DP:GQ	0/1:50:99	1/1:45:95	0/0:55:99
1	200000	rs002	C	T	85	PASS	DP=120;AF=0.25	GT:DP:GQ	0/1:40:85	0/0:35:99	0/1:45:80
2	300000	rs003	G	A	95	PASS	DP=200;AF=0.17	GT:DP:GQ	0/0:60:99	0/1:70:90	0/0:70:99
2	400000	rs004	T	C	75	PASS	DP=90;AF=0.50	GT:DP:GQ	1/1:30:75	0/1:25:70	1/1:35:80
X	500000	rs005	A	T	60	PASS	DP=80;AF=0.40	GT:DP:GQ	0/1:25:60	1/0:30:65	0/0:25:99
EOF
    echo "   ✅ Example VCF file created: data/example.vcf"
else
    echo "   ✅ Example VCF file already exists"
fi

echo
echo "4. 📥 Importing VCF file into TileDB..."
npm run analyze import data/example.vcf --threads 4 --batch-size 1000

echo
echo "5. 📊 Getting TileDB array statistics..."
npm run analyze stats

echo
echo "6. 🔍 Running example queries..."

echo "   → Variants on chromosome 1:"
npm run analyze query --chrom 1

echo
echo "   → Variants in position range:"
npm run analyze query --chrom 2 --start 250000 --end 450000

echo
echo "7. 🤖 Starting MCP servers..."
echo "   Main server: npm run mcp-server"
echo "   gnomAD server: npm run mcp-gnomad"
echo "   Configure Claude Desktop with these servers for AI-powered analysis"

echo
echo "8. 🎯 Example Claude queries you can try:"
echo "   • 'Show me all variants with high quality scores'"
echo "   • 'What's the allele frequency for variants on chromosome 1?'"
echo "   • 'Compare the genotypes between Sample1 and Sample2'"
echo "   • 'Find pathogenic variants in the dataset'"
echo "   • 'Generate a quality control report for the samples'"

echo
echo "🎉 Workflow complete!"
echo "   • TileDB arrays created with example data"
echo "   • Try the CLI commands shown above"
echo "   • Start the MCP servers to use with Claude"
echo "   • Check out the tests/ directory for more examples"

echo
echo "📝 Notes:"
echo "   • TileDB data is stored in tiledb_workspace/"
echo "   • Always activate Python venv before running: source venv/bin/activate"
echo "   • For real VCF files, use higher thread counts: --threads 8"