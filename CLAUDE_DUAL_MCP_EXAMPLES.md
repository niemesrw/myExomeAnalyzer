# Claude Dual MCP Server Examples

## Overview

With the dual MCP server architecture, Claude can now access both your personal genomic data and population reference data through separate, specialized servers:

- **myexome-analyzer** - Your personal VCF data
- **gnomad-reference** - Population frequency database

## Example Queries

### 1. Basic Population Frequency Lookup

```
"What's the population frequency of the variant at chromosome 17, position 43044295, G to A?"
```

Expected response:
- Global frequency percentage
- Population-specific breakdowns
- Clinical interpretation of rarity

### 2. Checking Your Variants Against Population Data

```
"I have variants in the BRCA1 gene. Which ones are rare in the general population?"
```

Claude will:
1. Query your personal data for BRCA1 variants
2. Look up each variant in gnomAD
3. Filter for rare variants (<0.1% frequency)
4. Provide clinical context

### 3. Population-Specific Analysis

```
"Do any of my cardiac gene variants show different frequencies between European and East Asian populations?"
```

This query:
- Searches your cardiac gene variants
- Compares frequencies across populations
- Identifies population-stratified variants

### 4. Novel Variant Discovery

```
"Which of my variants are not found in the gnomAD database?"
```

Novel variants could be:
- Family-specific mutations
- Very rare variants
- Potential de novo mutations
- Sequencing artifacts (requiring validation)

### 5. Pharmacogenomic Analysis with Population Context

```
"Analyze my CYP2D6 variants and tell me how common they are in different populations"
```

Response includes:
- Your specific CYP2D6 variants
- Population frequencies
- Drug metabolism implications
- Population-specific drug response patterns

### 6. Rare Disease Gene Screening

```
"Screen my exome for rare variants (gnomAD frequency <0.01%) in OMIM disease genes"
```

This comprehensive analysis:
- Searches known disease genes
- Filters for very rare variants
- Provides disease associations
- Prioritizes candidates

### 7. Ancestry-Informed Analysis

```
"I have European ancestry. Find variants in my data that are common in Europeans but rare in other populations"
```

Useful for:
- Understanding ancestry-specific risks
- Identifying population-specific pharmacogenomic variants
- Explaining certain trait variations

### 8. Family Planning Queries

```
"Check if I carry any pathogenic variants for recessive diseases that are common in my population"
```

Analysis includes:
- Carrier status for recessive conditions
- Population-specific carrier frequencies
- Partner screening recommendations

### 9. Complex Multi-Gene Analysis

```
"Analyze all my cancer predisposition genes, focusing on variants that are:
1. High quality (PASS or BOOSTED)
2. Rare in gnomAD (<0.1%)
3. In genes with strong cancer associations
Provide a risk assessment summary"
```

### 10. Quality Control Using Population Data

```
"Are there any common variants (>5% in gnomAD) in my data that are marked as potentially pathogenic? These might be misannotated."
```

Helps identify:
- Annotation errors
- Benign variants incorrectly flagged
- Quality control issues

## Advanced Combined Queries

### Research-Grade Analysis

```
"Compare the population frequency distribution of my variants to the expected gnomAD distribution. Do I have an unusual number of rare variants in any specific gene families?"
```

### Clinical Interpretation

```
"For my rare variants in cardiac genes, provide:
1. gnomAD frequencies across all populations
2. Clinical significance predictions
3. Whether the variant shows population stratification
4. Recommendations for family screening"
```

### Pharmacogenomic Profiling

```
"Create a comprehensive pharmacogenomic profile including:
1. All my variants in drug metabolism genes
2. Population frequencies for each variant
3. Drugs that might be affected
4. Population-specific dosing considerations"
```

## Technical Integration Examples

### How Claude Combines Both Servers

When you ask: "Are any of my BRCA variants common in the Finnish population?"

Claude performs:
```
1. myexome-analyzer.search_variants({gene: "BRCA1"})
   → Returns your BRCA1 variants

2. gnomad-reference.batch_frequency_lookup({
     variants: [your_variants],
     populations: ["fin"]
   })
   → Returns Finnish frequencies

3. Combines results for interpretation
```

### Error Handling

If gnomAD data isn't available:
```
"Check the status of gnomAD data availability"
```

Claude will report:
- Whether gnomAD data is installed
- Instructions for downloading if needed
- Alternative analysis options

## Best Practices

### Privacy-Conscious Queries

✅ Good: "What's the frequency of chr17:43044295 G>A?"
❌ Avoid: Including personal identifiers with variant data

### Efficient Batch Queries

✅ Good: "Check population frequencies for all my BRCA variants"
❌ Avoid: Asking about variants one at a time

### Population-Appropriate Analysis

✅ Good: "Analyze considering East Asian population frequencies"
❌ Avoid: Using only global frequencies for ancestry-specific analysis

## Clinical Disclaimers

All analyses include appropriate disclaimers:
- Research use only
- Clinical validation required
- Genetic counseling recommended
- Population-specific considerations

## Getting Started

1. Ensure both MCP servers are configured in Claude
2. Start with simple frequency lookups
3. Progress to complex multi-gene analyses
4. Always consider population context
5. Validate interesting findings clinically

Remember: The combination of personal genomic data and population frequencies provides powerful insights, but clinical decisions require professional genetic counseling and validated clinical testing.