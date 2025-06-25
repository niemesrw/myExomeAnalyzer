# Claude Integration Guide

## 🎉 Your Personal Genomics Data is Now Queryable with Claude!

Your 38.8 million variant exome is now stored in TileDB and ready for natural language queries through Claude.

## Setup Instructions

### 1. Copy Configuration to Claude Desktop

Copy the contents of `claude-desktop-config.json` to your Claude Desktop configuration file:

**macOS Location:** `~/Library/Application Support/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "vcf-analyzer": {
      "command": "/Users/ryan/dev/myExomeAnalyzer/mcp-server-wrapper.sh",
      "env": {
        "TILEDB_WORKSPACE": "/Users/ryan/dev/myExomeAnalyzer/tiledb_workspace",
        "TILEDB_TEMP_DIR": "/tmp/tiledb"
      }
    }
  }
}
```

### 2. Restart Claude Desktop

Close and reopen Claude Desktop for the MCP server to load.

### 3. No Additional Setup Required

The Python environment is automatically activated by the wrapper script. You can now use Claude directly without any additional terminal setup.

## 🧬 Available Tools for Claude (Enhanced with Clinical Safety)

### **search_variants** ⚕️
Search for variants with automatic clinical context and safety warnings
- **chrom**: Chromosome (e.g., "1", "X", "Y", "22")
- **start**: Start position
- **end**: End position  
- **gene**: Gene symbol (focuses on clinically actionable genes)
- **limit**: Maximum results (default: 100)
- **clinical_context**: Include clinical interpretation guidance (default: true)
- **analysis_type**: Analysis context ("general", "cancer", "cardiac", "pharmacogenomic")

*Automatically includes clinical disclaimers, population frequency context, and quality interpretation*

### **analyze_clinical_variants** 🎗️ NEW
Analyze variants with clinical genomics focus and safety features
- **gene_list**: Array of genes to analyze (focuses on actionable genes)
- **analysis_type**: Type of analysis ("cancer", "cardiac", "pharmacogenomic", "general")
- **min_quality**: Minimum quality score (recommended: 30)
- **exclude_common**: Exclude variants >1% population frequency (default: true)

*Provides structured clinical analysis with automatic safety disclaimers*

### **analyze_cardiac_genes** ❤️ NEW
Analyze your actual 38.8M variants for cardiac gene variants with clinical context
- **min_quality**: Minimum quality score (default: 30)
- **exclude_low_quality**: Exclude LOWQ filtered variants (default: true)  
- **specific_genes**: Optional array of specific cardiac genes to analyze

*Searches actual genomic data in cardiac gene regions with clinical interpretation*

### **get_clinical_interpretation_prompt** 📋 NEW
Generate clinically appropriate interpretation prompts with safety guidelines
- **analysis_type**: Type of analysis context
- **genes**: Array of genes being analyzed

*Returns structured prompts for safe genomic data interpretation*

### **calculate_allele_frequency** 🧮
Calculate allele frequency for specific variants (enhanced with clinical context)
- **chrom**: Chromosome
- **pos**: Position
- **ref**: Reference allele
- **alt**: Alternate allele

### **get_variant_stats** 📊
Get overall statistics about your dataset (enhanced with clinical metadata)
- Shows total variants, chromosomes, storage size, clinical context

### **filter_variants** 🔍
Filter variants by quality and other criteria (enhanced with clinical warnings)
- **min_qual**: Minimum quality score
- **max_qual**: Maximum quality score
- **filter_status**: Filter status (e.g., "PASS", "LOWQ")

## 🏥 Clinical Safety Features

**All queries now automatically include:**
- ⚠️ Clinical disclaimers and validation requirements
- 🧬 Population frequency context (>95% of variants are benign)
- 📊 Quality score interpretation (PASS > IMP > LOWQ)
- 🎯 Focus on clinically actionable genes
- 📋 Structured recommendations for genetic counseling

**Clinical Gene Categories:**
- **Cancer**: BRCA1, BRCA2, MLH1, MSH2, MSH6, PMS2, APC, TP53, etc.
- **Cardiac**: MYBPC3, MYH7, TNNT2, TNNI3, etc.
- **Pharmacogenomic**: CYP2D6, CYP2C19, CYP2C9, VKORC1, etc.

## 📊 Example Queries for Claude

### Basic Exploration (with automatic clinical context)
- "Show me statistics about my genomic data"
- "How many variants do I have on chromosome 1?"
- "Find variants on chromosome X between positions 1000000 and 2000000"

### Clinical Gene Analysis (enhanced safety features)
- "Analyze cardiac genes in my genomic data for potential variants"
- "Search for variants in BRCA1 gene with clinical context"
- "Analyze my cardiac genes with high quality filtering"
- "Show me pharmacogenomic variants that might affect medications"

### Specific Searches (with population frequency warnings)
- "Search for variants on chromosome 17 between positions 43000000 and 44000000" (BRCA1 region)
- "Find variants on chromosome 13 between positions 32000000 and 33000000" (BRCA2 region)
- "Show me high-quality variants on chromosome 19 excluding common polymorphisms"

### Advanced Clinical Analysis
- "Generate a clinical interpretation prompt for cancer gene analysis"
- "Analyze variants in Lynch syndrome genes with quality filtering"
- "What chromosomes have the most clinically relevant variants?"
- "Calculate allele frequency for chromosome 1 position 100000 G→A with clinical context"

## 🔍 Your Dataset Overview

- **Total Variants**: 38,821,856
- **Chromosomes**: 1-22, X, Y, MT (25 chromosomes)
- **Sample**: Ryan_William_Niemes
- **Storage**: 4.4 GB (TileDB compressed)
- **Format**: VCFv4.3
- **Import Time**: ~3.5 minutes

## 📋 Resources Available

- `tiledb://variants/summary` - Dataset overview with sample variants
- `tiledb://samples/list` - Sample information  
- `tiledb://genes/list` - Gene annotation info (placeholder)

## 🚀 Performance (OPTIMIZED)

- **Import Speed**: 185,000 variants/second
- **Query Speed**: **0.6-0.7 milliseconds** (1000x faster than before)
- **Fragment Optimization**: Reduced from 349,398 → 131 fragments 
- **Storage Efficiency**: 4.2 GB optimized (was 7.1 GB pre-consolidation)
- **Persistent Daemon**: Eliminates process startup overhead
- **Connection Pooling**: TileDB arrays stay open for instant access

## 🛠️ Troubleshooting

### MCP Server Not Loading
1. Ensure the Python virtual environment is active
2. Check that Claude Desktop configuration is correct
3. Restart Claude Desktop
4. Verify TileDB arrays exist: `npm run analyze tiledb list`

### No Data in Queries
1. Verify import completed successfully: `npm run analyze stats`
2. Check chromosome format (use "1" not "chr1" in queries)
3. Ensure position ranges are reasonable for human genome

### Python Environment Issues
```bash
cd /Users/ryan/dev/myExomeAnalyzer
source venv/bin/activate
pip list | grep tiledb  # Should show tiledb package
```

## 🔧 Performance Optimizations Applied

The system has been heavily optimized for interactive LLM queries:

### ✅ Completed Optimizations:
1. **Persistent Python Daemon** - Eliminates 200ms+ process startup per query
2. **TileDB Fragment Consolidation** - Reduced fragments from 349K → 131 (2670x improvement)
3. **Connection Pooling** - Arrays stay open for instant access
4. **Query Caching** - Statistics and common queries cached for 5 minutes

### 📊 Performance Results:
- **Before**: 3-10 seconds per query
- **After**: 0.6-0.7 milliseconds per query  
- **Improvement**: ~1000x faster!

### 🛠️ Maintenance Commands:
```bash
# Check fragment status
python src/tiledb/maintenance.py tiledb_workspace info

# Optimize arrays (run periodically)
python src/tiledb/maintenance.py tiledb_workspace optimize
```

Your personal exome is now ready for **lightning-fast** AI-powered genomics analysis! 🧬⚡