# Claude Integration Guide - MyExome Analyzer

## Overview

MyExome Analyzer integrates seamlessly with Claude Desktop through the Model Context Protocol (MCP), enabling natural language genomic analysis. This guide provides comprehensive instructions for setup, usage, and advanced features.

## Quick Start

### 1. Prerequisites
```bash
# Ensure the platform is built and running
npm run build
npm run analyze stats  # Verify data is loaded

# Ensure Claude Desktop is installed
# Download from: https://claude.ai/desktop
```

### 2. Claude Desktop Configuration

Add to your Claude Desktop MCP configuration file:

**Location**: `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS)

```json
{
  "mcpServers": {
    "myexome-analyzer": {
      "command": "node",
      "args": ["dist/mcp-server/server.js"],
      "cwd": "/Users/[username]/dev/myExomeAnalyzer"
    }
  }
}
```

### 3. Start Analysis Session
```bash
# Start Claude Desktop
# Look for "⚡ 12 tools" indicator in chat interface
# Begin genomic analysis with natural language
```

## Available Analysis Tools

### 1. Variant Discovery and Search

#### search_variants
**Purpose**: Find variants in specific genomic regions  
**Usage**: "Find all variants in the BRCA1 gene region"

```typescript
// Parameters
{
  chromosome: string,    // e.g., "17", "X"
  start: number,        // Start position
  end: number,          // End position  
  limit?: number        // Max results (default: 100)
}
```

**Example Queries**:
- "Show me variants in chromosome 17 between positions 41,000,000 and 42,000,000"
- "Find variants in the TP53 gene region (chr17:7,661,779-7,687,550)"
- "What variants are present in chromosome 22?"

#### get_variant_details
**Purpose**: Get comprehensive information about specific variants  
**Usage**: "Tell me about the variant chr17:43044295 G>A"

```typescript
// Parameters
{
  chromosome: string,
  position: number,
  reference: string,
  alternate: string
}
```

**Example Queries**:
- "Get details for chr17:43044295 G>A" 
- "What do we know about the BRCA1 variant at position 43124027?"
- "Analyze the clinical significance of chr13:32315355 deletion"

### 2. Population Frequency Analysis

#### calculate_allele_frequency
**Purpose**: Determine how common a variant is in populations  
**Usage**: "What's the allele frequency of chr17:43044295 G>A?"

```typescript
// Returns population-specific frequencies
{
  global_frequency: number,
  african: number,
  latino: number, 
  ashkenazi: number,
  east_asian: number,
  finnish: number,
  european: number,
  interpretation: {
    rarity: 'common' | 'uncommon' | 'rare' | 'ultra-rare',
    clinical_significance: string
  }
}
```

**Example Queries**:
- "How common is this variant across different populations?"
- "Is chr17:43044295 G>A a rare variant?"
- "Compare population frequencies for this BRCA1 mutation"

### 3. Advanced Filtering and Analysis

#### filter_variants
**Purpose**: Complex variant filtering with multiple criteria  
**Usage**: "Find rare pathogenic variants in chromosome 17"

```typescript
// Advanced filtering options
{
  chromosome?: string,
  position_range?: [number, number],
  allele_frequency?: { max: number, min: number },
  clinical_significance?: string[],
  gene_symbol?: string,
  variant_type?: string[]
}
```

**Example Queries**:
- "Show me all pathogenic variants with frequency less than 0.1%"
- "Find likely pathogenic variants in cancer genes"
- "Filter for ultra-rare variants in BRCA1 and BRCA2"

#### get_sample_genotypes
**Purpose**: Retrieve genotype information for specific positions  
**Usage**: "What are the genotypes at chr17:43044295?"

```typescript
// Sample-specific genotype data
{
  position: string,
  genotypes: [{
    sample_id: string,
    genotype: string,    // e.g., "0/1", "1/1"
    quality: number,
    depth: number
  }]
}
```

### 4. Clinical Analysis Tools

#### analyze_clinical_variants
**Purpose**: Clinical significance assessment and interpretation  
**Usage**: "Analyze the clinical impact of variants in this sample"

```typescript
// Clinical analysis results
{
  pathogenic_variants: VariantDetail[],
  likely_pathogenic: VariantDetail[],
  vus_variants: VariantDetail[],
  clinical_summary: string,
  recommendations: string[]
}
```

**Example Queries**:
- "What are the clinically significant variants in this dataset?"
- "Identify potentially pathogenic mutations for cancer risk"
- "Generate a clinical summary of genetic findings"

### 5. Statistics and Reporting

#### get_variant_stats
**Purpose**: Overall dataset statistics and quality metrics  
**Usage**: "Give me an overview of the genomic data"

```typescript
// Comprehensive statistics
{
  total_variants: number,
  chromosomes: string[],
  position_range: [number, number],
  sample_count: number,
  array_size: string,
  quality_metrics: QualityMetrics
}
```

**Example Queries**:
- "What's the overall quality of this genomic dataset?"
- "How many variants are loaded in the database?"
- "Show me chromosome coverage statistics"

## Advanced Usage Patterns

### 1. Multi-step Clinical Analysis

```markdown
**Query**: "I want to do a comprehensive cancer risk analysis"

**Claude Response**: I'll help you perform a comprehensive cancer risk analysis using our genomic data. Let me start by gathering statistics and then focus on cancer-related genes.

[Tool: get_variant_stats]
[Tool: search_variants - BRCA1 region]
[Tool: search_variants - BRCA2 region] 
[Tool: analyze_clinical_variants]
[Tool: calculate_allele_frequency for key variants]

**Analysis Results**: Based on your genomic data, I found 3 pathogenic variants in cancer susceptibility genes...
```

### 2. Population Frequency Analysis Workflow

```markdown
**Query**: "Compare this variant's frequency across different populations"

**Step 1**: Get variant details
[Tool: get_variant_details]

**Step 2**: Calculate population frequencies  
[Tool: calculate_allele_frequency]

**Step 3**: Clinical interpretation
Based on the frequencies:
- Global: 0.0023% (rare)
- European: 0.0031% (rare)  
- Ashkenazi: 0.0145% (uncommon)

This variant shows population-specific differences suggesting founder effects...
```

### 3. Gene-focused Analysis

```markdown
**Query**: "Analyze all variants in the TP53 gene"

**Workflow**:
1. Search TP53 region (chr17:7,661,779-7,687,550)
2. Filter for clinical significance
3. Calculate population frequencies
4. Generate clinical summary

**Results**: Found 23 variants in TP53, including 4 pathogenic mutations...
```

## Example Analysis Sessions

### Session 1: BRCA1/BRCA2 Analysis
```markdown
User: "I want to analyze BRCA1 and BRCA2 variants for hereditary cancer risk"

Claude: I'll analyze BRCA1 and BRCA2 variants to assess hereditary cancer risk. Let me search both gene regions and identify clinically significant variants.

[Searches BRCA1 region: chr17:41,000,000-42,000,000]
[Searches BRCA2 region: chr13:32,000,000-33,000,000]
[Analyzes clinical variants]
[Calculates frequencies for pathogenic variants]

Analysis Results:
🧬 BRCA1 (chr17): Found 145 variants
   - 12 pathogenic/likely pathogenic
   - 89 VUS (variants of uncertain significance)
   - 44 benign/likely benign

🧬 BRCA2 (chr13): Found 203 variants  
   - 18 pathogenic/likely pathogenic
   - 134 VUS
   - 51 benign/likely benign

Key Findings:
📍 chr17:43044295 G>A (BRCA1): Pathogenic founder mutation
   - Frequency: 0.0145% in Ashkenazi population
   - Clinical significance: High cancer risk
   
📍 chr13:32315355 deletion (BRCA2): Pathogenic frameshift
   - Frequency: 0.0089% globally
   - Clinical significance: High cancer risk

Recommendations:
1. Genetic counseling for carriers of pathogenic variants
2. Enhanced screening protocols
3. Family cascade testing consideration
```

### Session 2: Pharmacogenomic Analysis
```markdown
User: "Check for variants that might affect drug metabolism"

Claude: I'll search for variants in key pharmacogenomic genes that affect drug metabolism. Let me check CYP2D6, CYP2C19, and other important drug-metabolizing genes.

[Searches pharmacogene regions]
[Analyzes clinical significance]
[Checks population frequencies]

Pharmacogenomic Findings:
💊 CYP2D6 variants: 3 variants affecting metabolism
   - chr22:42522613 G>A: Reduced function allele
   - Population frequency: 15.2% (common)
   - Drug impact: Reduced metabolism of codeine, tramadol

💊 CYP2C19 variants: 2 variants identified
   - chr10:94852738 C>T: No function allele  
   - Population frequency: 12.8% (common)
   - Drug impact: Altered clopidogrel effectiveness

Clinical Recommendations:
1. Consider alternative dosing for affected medications
2. Monitor therapeutic response closely
3. Genetic testing confirmation recommended
```

### Session 3: Quality Control Analysis
```markdown
User: "Assess the overall quality and completeness of our genomic data"

Claude: I'll perform a comprehensive quality assessment of your genomic dataset.

[Gets variant statistics]
[Analyzes chromosome coverage]
[Checks data completeness]

Quality Control Report:
📊 Dataset Overview:
   - Total variants: 38,821,856
   - Chromosomes: Complete coverage (1-22, X, Y, MT)
   - Position range: 1 - 248,946,058
   - Storage efficiency: 7.2 GB (compressed)

📈 Quality Metrics:
   - Variant density: Expected for whole genome
   - Chromosome distribution: Normal
   - Position coverage: 99.2% of expected regions

🔍 Data Completeness:
   - Population frequencies: 57.2M gnomAD variants
   - Clinical annotations: 3.5M ClinVar variants  
   - Benchmark validation: GIAB HG002/HG001 loaded

✅ Overall Assessment: High-quality dataset suitable for clinical analysis
```

## Troubleshooting

### Common Issues and Solutions

#### 1. "No tools available" Error
```bash
# Check MCP server status
npm run mcp-server

# Verify configuration path in Claude Desktop
# Ensure absolute path is correct in config
```

#### 2. Slow Query Performance
```markdown
Query: "Why are my searches taking a long time?"

Claude: Let me check the database performance and suggest optimizations.

[Runs performance diagnostics]

Performance Analysis:
- Array size: 7.2 GB (normal)
- Index status: Optimized
- Memory usage: Within limits

Suggestions:
1. Use smaller genomic regions for initial searches
2. Add specific filters to reduce result sets
3. Consider chromosome-specific queries for better performance
```

#### 3. Missing Data Warnings
```markdown
Query: "Some variants seem to be missing frequency data"

Claude: I'll investigate the data completeness for population frequencies.

[Checks population frequency coverage]

Data Coverage Analysis:
✅ Chromosome 17: Complete gnomAD coverage
✅ Chromosome 22: Complete gnomAD coverage  
✅ Chromosome 13: Complete gnomAD coverage
⚠️  Other chromosomes: gnomAD data not yet processed

Recommendation: Process additional chromosomes if genome-wide frequency data is needed.
```

## Advanced MCP Features

### 1. Resource Access
Claude can access additional platform resources:

- `tiledb://arrays/summary`: Array metadata and statistics
- `tiledb://samples/list`: Available sample information
- `tiledb://statistics/overview`: Platform performance metrics

### 2. Pre-built Analysis Prompts
The MCP server provides ready-to-use analysis templates:

- `pathogenic_variant_analysis`: Clinical significance assessment
- `sample_comparison`: Multi-sample variant comparison
- `quality_control_report`: Data quality evaluation

### 3. Streaming Results
For large datasets, the MCP server supports streaming responses to handle:
- Chromosome-wide variant searches
- Large gene region analyses
- Comprehensive clinical reports

## Best Practices

### 1. Query Optimization
```markdown
❌ Avoid: "Show me all variants in the genome"
✅ Better: "Find variants in chromosome 17 between 41M-42M"
✅ Best: "Find pathogenic variants in BRCA1 gene region"
```

### 2. Clinical Context
```markdown
❌ Generic: "What variants are here?"
✅ Specific: "Identify cancer risk variants in BRCA genes"
✅ Clinical: "Assess hereditary cancer risk based on these variants"
```

### 3. Multi-step Analysis
```markdown
✅ Structured approach:
1. "First, give me an overview of the dataset"
2. "Then search for variants in cancer genes"  
3. "Finally, analyze clinical significance"
```

## Future Enhancements

### Planned MCP Features
- Real-time variant interpretation with ACMG guidelines
- Automated clinical report generation
- Integration with external databases (OMIM, PharmGKB)
- Advanced statistical analysis tools

### Performance Optimizations  
- Query result caching for frequently accessed variants
- Parallel processing for complex analyses
- Enhanced filtering capabilities
- Streaming analysis for large datasets

---

This Claude integration transforms complex genomic analysis into natural, conversational interactions while maintaining clinical accuracy and comprehensive data access.