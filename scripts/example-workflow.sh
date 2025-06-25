#!/bin/bash

# Example workflow for MyExome Analyzer
# This script demonstrates the complete workflow from setup to analysis

set -e

echo "🧬 MyExome Analyzer - Example Workflow"
echo "======================================"

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Please run this script from the myExomeAnalyzer directory"
    exit 1
fi

echo "1. 🔧 Setting up environment..."

# Copy environment file if it doesn't exist
if [ ! -f ".env" ]; then
    echo "   📁 Copying environment configuration..."
    cp .env.example .env
    echo "   ✅ Environment file created"
else
    echo "   ✅ Environment file already exists"
fi

# Install dependencies if node_modules doesn't exist
if [ ! -d "node_modules" ]; then
    echo "   📦 Installing dependencies..."
    npm install
    echo "   ✅ Dependencies installed"
else
    echo "   ✅ Dependencies already installed"
fi

echo
echo "2. 🐳 Starting Docker services..."

# Start Docker services
docker-compose -f docker/docker-compose.yml up -d

# Wait for PostgreSQL to be ready
echo "   ⏳ Waiting for PostgreSQL to be ready..."
max_attempts=30
attempt=1

while [ $attempt -le $max_attempts ]; do
    if npm run db:status >/dev/null 2>&1; then
        echo "   ✅ PostgreSQL is ready"
        break
    fi
    
    if [ $attempt -eq $max_attempts ]; then
        echo "   ❌ PostgreSQL failed to start after $max_attempts attempts"
        exit 1
    fi
    
    echo "   ⏳ Attempt $attempt/$max_attempts - waiting..."
    sleep 2
    ((attempt++))
done

echo
echo "3. 📊 Checking database status..."
npm run analyze db status

echo
echo "4. 📄 Creating example VCF file..."

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
echo "5. 📥 Importing VCF file..."
npm run analyze import data/example.vcf

echo
echo "6. 📊 Getting database statistics..."
npm run analyze stats

echo
echo "7. 🔍 Running example queries..."

echo "   → Variants on chromosome 1:"
npm run analyze query --chrom 1

echo
echo "   → High quality variants (>80):"
npm run analyze query --min-qual 80

echo
echo "   → Variants in position range:"
npm run analyze query --chrom 2 --start 250000 --end 450000

echo
echo "8. 🤖 Starting MCP server (in background)..."
echo "   Run in another terminal: npm run mcp-server"
echo "   Then configure Claude Desktop to use: http://localhost:3000"

echo
echo "9. 🎯 Example Claude queries you can try:"
echo "   • 'Show me all variants with high quality scores'"
echo "   • 'What's the allele frequency for variants on chromosome 1?'"
echo "   • 'Compare the genotypes between Sample1 and Sample2'"
echo "   • 'Find variants that are heterozygous in Sample1'"

echo
echo "10. 🗄️  Direct database access:"
echo "    You can also query the database directly:"
echo "    docker exec -it vcf_postgres psql -U vcf_user -d vcf_analysis"

echo
echo "🎉 Workflow complete!"
echo "   • Database is running with example data"
echo "   • Try the CLI commands shown above"
echo "   • Start the MCP server to use with Claude"
echo "   • Check out scripts/example-queries.sql for more SQL examples"

echo
echo "🛑 To stop services:"
echo "   docker-compose -f docker/docker-compose.yml down"