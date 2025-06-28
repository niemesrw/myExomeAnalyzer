# Dual MCP Server Architecture Guide

## Overview

MyExomeAnalyzer now features a dual MCP server architecture that separates personal genomic data from reference population data:

1. **myexome-analyzer** - Personal genomic data queries
2. **gnomad-reference** - Population frequency reference data

This separation provides better privacy, modularity, and allows other tools to use the gnomAD reference server independently.

## Architecture Benefits

### Privacy & Security
- Personal genomic data stays isolated in its own server
- Reference data queries don't need access to personal information
- Clear separation of concerns between personal and population data

### Modularity
- Update gnomAD versions without touching personal data
- Other genomics tools can use the gnomAD MCP server
- Independent scaling and caching strategies

### Performance
- Population frequency queries can be cached aggressively
- Reference data server can be optimized for read-heavy workloads
- Personal data server optimized for complex analytical queries

## Setup Instructions

### 1. Build Both Servers
```bash
npm run build:all
```

This builds:
- Main myExomeAnalyzer with personal data MCP server
- Standalone gnomAD reference MCP server

### 2. Configure Claude Desktop
```bash
cp claude-desktop-config-dual.json ~/Library/Application\ Support/Claude/claude_desktop_config.json
```

### 3. Restart Claude Desktop
Quit and restart Claude Desktop to load both MCP servers.

## Usage Examples

### Personal Data Queries (myexome-analyzer)
```
"What variants do I have in the BRCA1 gene?"
"Show me all my variants on chromosome 17"
"Which of my variants are high quality (PASS filter)?"
```

### Population Reference Queries (gnomad-reference)
```
"What's the population frequency of chr17:43044295 G>A?"
"Is this variant common in European populations?"
"Show me the frequency distribution across all populations"
```

### Combined Analysis (Both Servers)
```
"Which of my BRCA1 variants are rare in the general population?"
"Filter my cardiac gene variants for those absent from gnomAD"
"Compare my variant frequencies to global populations"
```

## Technical Details

### Server Communication
Claude can query both servers in a single conversation:
1. Query personal variants from myexome-analyzer
2. Look up population frequencies from gnomad-reference
3. Combine results for comprehensive analysis

### Data Flow Example
```
User: "Find my rare variants in cardiac genes"
         ↓
Claude → myexome-analyzer: get_variants_in_genes(['MYH7', 'MYBPC3', ...])
         ↓
Claude → gnomad-reference: batch_frequency_lookup([variants])
         ↓
Claude: Filters variants with frequency < 0.1%
         ↓
Response: "Found 3 rare variants in your cardiac genes..."
```

## Available Tools

### myexome-analyzer MCP
- `search_variants` - Search genomic regions
- `get_variant_details` - Detailed variant information
- `filter_variants` - Quality and annotation filtering
- `get_sample_genotypes` - Genotype information
- `calculate_allele_frequency` - Internal frequency calculations

### gnomad-reference MCP
- `lookup_variant_frequency` - Single variant lookup
- `batch_frequency_lookup` - Multiple variants at once
- `filter_by_frequency` - Region-based frequency filtering
- `get_population_statistics` - Detailed population breakdown
- `check_gnomad_status` - Data availability check

## Best Practices

### 1. Query Optimization
- Use batch lookups when checking multiple variants
- Filter by region before population lookup to reduce queries
- Cache frequently accessed reference data

### 2. Privacy Considerations
- Never send personal identifiers to the reference server
- Use variant coordinates only (chr:pos:ref:alt)
- Keep clinical interpretations in the personal data server

### 3. Error Handling
- Check gnomAD data status before population queries
- Handle missing frequency data gracefully
- Provide fallbacks for variants not in gnomAD

## Troubleshooting

### Both servers not appearing in Claude
1. Check configuration syntax in claude_desktop_config.json
2. Ensure both servers are built (`npm run build:all`)
3. Restart Claude Desktop completely

### gnomAD queries failing
1. Check data status: "Check gnomAD data availability"
2. Ensure gnomAD data is downloaded and processed
3. Verify GNOMAD_DATA_DIR environment variable

### Performance issues
1. Consider filtering variants before population lookup
2. Use batch queries instead of individual lookups
3. Check if gnomAD data needs optimization

## Future Enhancements

### Planned Features
- ClinVar MCP server for clinical significance
- OMIM MCP server for disease associations
- PharmGKB MCP server for pharmacogenomics
- Automated cross-server query optimization

### Integration Opportunities
- Combine with lab LIMS systems
- Connect to clinical decision support
- Enable multi-sample family analysis

## Example Advanced Query

```
"I have a family history of sudden cardiac death. Analyze my variants in 
cardiac genes, focusing on those that are rare (gnomAD frequency < 0.1%) 
and potentially pathogenic. Include population-specific frequencies and 
highlight any variants that show significant differences between populations."
```

This query would:
1. Use myexome-analyzer to find variants in cardiac genes
2. Use gnomad-reference to check population frequencies
3. Filter for rare variants
4. Analyze population stratification
5. Combine results for clinical interpretation

---

The dual MCP architecture provides a powerful, privacy-preserving platform for comprehensive genomic analysis with AI assistance.