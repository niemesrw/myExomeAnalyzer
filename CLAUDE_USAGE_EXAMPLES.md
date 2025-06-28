# Claude AI Usage Examples - Phase 1 Features

Real-world examples of how to use Claude with your new population frequency and gene annotation features.

## 🚀 Quick Start with Claude

### 1. Ensure MCP Server is Running
```bash
# Copy configuration
cp claude-desktop-config.json ~/Library/Application\ Support/Claude/claude_desktop_config.json

# Restart Claude Desktop app
```

### 2. Test Basic Connection
In Claude, try:
```
"Show me statistics about my genomic data"
```

## 🧬 Population Frequency Analysis

### Basic Frequency Lookups
```
"Look up population frequency for variants at these positions:
- Chromosome 17, position 43044295, G to A
- Chromosome 13, position 32315508, G to A"
```

### Filtering by Population Frequency
```
"Show me rare variants (less than 0.1% population frequency) on chromosome 17 between positions 43000000 and 44000000"
```

### Population-Specific Analysis
```
"Filter variants on chromosome 1 between 100000000-200000000, excluding variants common in European populations (>1% in NFE)"
```

### Clinical Interpretation with Population Context
```
"Analyze variants in the BRCA1 gene region with population frequency context and clinical interpretation. Focus on rare variants that might be clinically significant."
```

## 🧬 Gene-Based Analysis

### Gene Coordinate Lookups
```
"What are the genomic coordinates for the BRCA1 gene?"
```

### Gene Region Analysis
```
"Search for variants in the TP53 gene region and provide clinical context for any findings"
```

### Clinical Gene Panels
```
"Analyze all cardiac genes in my genomic data for potential pathogenic variants, filtering out common population variants"
```

### Multi-Gene Analysis
```
"Look for variants in Lynch syndrome genes (MLH1, MSH2, MSH6, PMS2) with population frequency analysis and clinical interpretation"
```

## 💊 Pharmacogenomic Analysis

### Drug Metabolism Genes
```
"Analyze pharmacogenomic genes (CYP2D6, CYP2C19, CYP2C9) in my genomic data and explain how variants might affect drug metabolism"
```

### Warfarin Sensitivity
```
"Look for variants in VKORC1 and CYP2C9 genes that affect warfarin sensitivity, including population frequency context"
```

## ❤️ Cardiac Genetic Analysis

### Comprehensive Cardiac Panel
```
"Perform a comprehensive cardiac genetic analysis including MYBPC3, MYH7, TNNT2, and TNNI3. Filter for rare variants and provide clinical significance assessment."
```

### Hypertrophic Cardiomyopathy Focus
```
"Search for variants in genes associated with hypertrophic cardiomyopathy, excluding common population variants, and provide clinical interpretation"
```

## 🔬 Cancer Genetics Analysis

### BRCA Analysis
```
"Analyze BRCA1 and BRCA2 genes for potential pathogenic variants. Include population frequency data and clinical significance assessment."
```

### Lynch Syndrome Screening
```
"Screen for Lynch syndrome by analyzing MLH1, MSH2, MSH6, and PMS2 genes. Focus on rare variants with potential clinical significance."
```

### Li-Fraumeni Syndrome
```
"Look for variants in the TP53 gene associated with Li-Fraumeni syndrome, including population frequency analysis"
```

## 📊 Advanced Analysis Workflows

### Comprehensive Rare Variant Analysis
```
"Identify all rare variants (global frequency <0.1%) in clinically actionable genes across my entire exome. Provide a summary with clinical prioritization."
```

### Population Frequency Distribution
```
"Analyze the population frequency distribution of variants in my dataset. How many are common vs. rare? What's the clinical significance of the rare variants?"
```

### Gene Burden Analysis
```
"Calculate the burden of rare variants in cardiac genes compared to cancer genes in my genomic data"
```

### Novel Variant Discovery
```
"Identify variants in my data that are not found in gnomAD (novel variants) within clinically relevant genes"
```

## 🎯 Specific Clinical Scenarios

### Scenario 1: Hereditary Cancer Risk Assessment
```
"I have a family history of breast cancer. Analyze my BRCA1, BRCA2, TP53, and PTEN genes for variants that might indicate increased cancer risk. Include population frequency context and clinical interpretation."
```

### Scenario 2: Cardiac Screening
```
"I'm an athlete concerned about sudden cardiac death risk. Analyze genes associated with hypertrophic cardiomyopathy and arrhythmogenic conditions."
```

### Scenario 3: Medication Response Prediction
```
"I'm starting antidepressant therapy. Analyze my CYP2D6 and CYP2C19 variants to predict medication metabolism and recommend dosing considerations."
```

### Scenario 4: Family Planning
```
"My partner and I are planning a family. Analyze autosomal recessive disease genes where we might both be carriers of pathogenic variants."
```

## 🔍 Quality Control and Validation

### Data Quality Assessment
```
"Assess the quality of variants in clinically important genes. What percentage are high-quality (PASS filter) vs. lower quality?"
```

### Population Frequency Validation
```
"Compare the population frequencies of variants in my data to expected distributions. Are there any unusual frequency patterns?"
```

### Coverage Analysis
```
"Which clinically important genes have good variant coverage in my dataset vs. which might need additional sequencing?"
```

## 💡 Research and Exploration

### Rare Disease Gene Discovery
```
"Identify genes with multiple rare variants that might be candidates for novel disease associations"
```

### Population Genetics Analysis
```
"Analyze my genomic ancestry based on population-specific variant frequencies in my dataset"
```

### Variant Effect Prediction
```
"For variants in cancer genes, predict their functional impact based on position within the gene (exon, splice site, etc.)"
```

## ⚠️ Important Usage Notes

### Always Include Clinical Context
When asking Claude about medical implications, include:
- "For research purposes only"
- "Requires clinical validation"
- "Consult genetic counselor for health decisions"

### Best Practices
1. **Start Simple**: Begin with single gene queries before complex analyses
2. **Verify Results**: Cross-check important findings with gnomAD browser
3. **Clinical Validation**: All health-related findings need professional confirmation
4. **Population Context**: Always consider population frequency in interpretation
5. **Quality Filtering**: Focus on high-quality variants (PASS filter, high scores)

### Example Professional Query
```
"For research and educational purposes only: Analyze BRCA1 variants in my genomic data with population frequency context. This is not for clinical decision-making and would require validation by certified clinical laboratories."
```

## 🔗 Useful Resources for Validation

- **gnomAD Browser**: https://gnomad.broadinstitute.org/
- **ClinVar**: https://www.ncbi.nlm.nih.gov/clinvar/
- **ACMG Guidelines**: For variant classification standards
- **Gene Cards**: https://www.genecards.org/
- **OMIM**: https://www.omim.org/

---

**Remember: This is a research tool. All health-related findings require professional clinical genetics consultation and validation!** 🧬⚕️