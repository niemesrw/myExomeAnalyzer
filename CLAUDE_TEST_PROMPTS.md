# Claude AI Test Prompts - Phase 1 Features

A comprehensive collection of test prompts to explore your new population frequency and gene annotation capabilities.

## 🚀 **Level 1: Basic System Testing**

### **System Status & Overview**
```
"Show me statistics about my genomic data"
```

```
"What's the overview of my 38.8 million variants? Include quality distribution and chromosome coverage."
```

```
"Give me a summary of my exome data including total variants, chromosomes analyzed, and data quality metrics."
```

### **Basic Variant Queries**
```
"Search for variants on chromosome 17 between positions 43000000 and 44000000"
```

```
"Find clinical-quality variants (PASS, BOOSTED, IMP) on chromosome 22"
```

```
"Show me high-quality variants on chromosome 13 between 32000000-33000000 excluding low-quality (LOWQ) variants"
```

## 🧬 **Level 2: Population Frequency Testing**

### **Single Variant Frequency Lookups**
```
"Look up population frequency for variants at chromosome 17 position 43044295 G to A"
```

```
"What's the population frequency for these specific variants:
- Chromosome 13, position 32315508, G to A
- Chromosome 11, position 108121423, G to A"
```

### **Frequency-Based Filtering** 
```
"Show me rare, clinical-quality variants (less than 0.1% population frequency) on chromosome 17 between positions 43000000-44000000"
```

```
"Filter high-quality variants (PASS, BOOSTED, IMP) on chromosome 22, excluding those common in the general population (>1% frequency)"
```

```
"Find novel clinical-quality variants in my data that aren't present in gnomAD population database"
```

### **Population-Specific Analysis**
```
"Analyze variants on chromosome 1 between 100000000-200000000, focusing on those rare in European populations but excluding common variants"
```

```
"Show me variants that have different frequencies across populations - particularly those common in one population but rare in others"
```

## 🏥 **Level 3: Clinical Gene Analysis**

### **Famous Disease Genes**
```
"Analyze variants in the BRCA1 gene region with population frequency context and clinical interpretation"
```

```
"Search for variants in the BRCA2 gene region, filtering out common population variants and focusing on potentially clinically significant findings"
```

```
"Look for variants in the TP53 gene (Li-Fraumeni syndrome) including population frequency analysis and clinical significance assessment"
```

### **Gene Panels**
```
"Analyze all cardiac genes in my genomic data for potential pathogenic variants, filtering out common population variants"
```

```
"Perform Lynch syndrome screening by analyzing MLH1, MSH2, MSH6, and PMS2 genes with population frequency context"
```

```
"Screen for hereditary cancer variants in BRCA1, BRCA2, TP53, APC, and VHL genes with clinical interpretation"
```

## 💊 **Level 4: Pharmacogenomic Analysis**

### **Drug Metabolism**
```
"Analyze pharmacogenomic genes (CYP2D6, CYP2C19, CYP2C9) in my genomic data and explain how variants might affect drug metabolism"
```

```
"Look for variants in genes affecting warfarin sensitivity (VKORC1, CYP2C9) including population frequency and clinical implications"
```

```
"Screen for pharmacogenomic variants that might affect antidepressant metabolism and response"
```

### **Medication Safety**
```
"Identify variants in DPYD gene that might affect fluoropyrimidine chemotherapy toxicity risk"
```

```
"Analyze TPMT variants for thiopurine drug sensitivity with population frequency context"
```

## ❤️ **Level 5: Cardiovascular Genetics**

### **Cardiomyopathy Screening**
```
"Perform comprehensive cardiac genetic analysis for hypertrophic cardiomyopathy genes (MYBPC3, MYH7, TNNT2, TNNI3)"
```

```
"Screen for sudden cardiac death risk by analyzing cardiac genes, filtering for rare potentially pathogenic variants"
```

```
"Analyze my data for variants in genes associated with arrhythmogenic cardiomyopathy and dilated cardiomyopathy"
```

### **Athletic Screening**
```
"I'm an athlete - screen my genomic data for variants that might indicate risk for exercise-related cardiac events"
```

## 🔬 **Level 6: Advanced Analysis Workflows**

### **Comprehensive Rare Variant Analysis**
```
"Identify all rare variants (global frequency <0.1%) in clinically actionable genes across my entire exome with clinical prioritization"
```

```
"Perform a comprehensive analysis of variants in cancer predisposition genes, including population frequency, clinical significance, and family screening recommendations"
```

### **Research-Grade Analysis**
```
"Calculate the burden of rare variants in cardiac genes compared to cancer genes in my genomic data"
```

```
"Analyze the population frequency distribution of variants in my dataset - what percentage are common vs rare, and what's the clinical significance breakdown?"
```

```
"Identify gene regions with multiple rare variants that might indicate compound heterozygosity or increased disease risk"
```

## 🎯 **Level 7: Real-World Clinical Scenarios**

### **Family History Context**
```
"I have a family history of breast and ovarian cancer. Analyze my BRCA1, BRCA2, TP53, and PTEN genes for variants that might indicate increased cancer risk, including detailed population frequency context."
```

```
"My family has a history of sudden cardiac death. Perform comprehensive cardiac genetic screening focusing on genes associated with inherited cardiomyopathies and arrhythmias."
```

```
"There's colon cancer in my family. Screen for Lynch syndrome and familial adenomatous polyposis variants with clinical interpretation."
```

### **Medication Planning**
```
"I'm starting psychiatric medication. Analyze my CYP2D6, CYP2C19, and related genes to predict medication metabolism and recommend dosing considerations."
```

```
"I may need blood thinners in the future. Analyze my warfarin sensitivity genes and provide pharmacogenomic guidance."
```

### **Family Planning**
```
"My partner and I are planning children. Identify autosomal recessive disease genes where I might be a carrier of pathogenic variants."
```

```
"Screen my data for carrier status of common recessive disorders like cystic fibrosis, sickle cell disease, and Tay-Sachs disease."
```

## 🔍 **Level 8: Quality Control & Validation**

### **Data Quality Assessment**
```
"Assess the quality of variants in clinically important genes. What percentage are high-quality (PASS filter) vs lower quality, and how does this affect interpretation?"
```

```
"Compare the population frequencies of variants in my data to expected gnomAD distributions. Are there any unusual patterns?"
```

### **Coverage Analysis**
```
"Which clinically important genes have good variant coverage in my dataset vs which might need additional testing?"
```

```
"Analyze the distribution of variant types (SNVs, indels) across clinically relevant genes and their quality scores."
```

## 🧪 **Level 9: Stress Testing**

### **Large-Scale Analysis**
```
"Perform genome-wide analysis of all variants with population frequency <0.01% and predict their functional impact based on gene location and type."
```

```
"Identify all stop-gain, frameshift, and splice-site variants across clinically actionable genes with population frequency analysis."
```

### **Complex Queries**
```
"Find variants that are: 1) Located in cancer genes, 2) Have population frequency <0.1%, 3) Are predicted to be functionally significant, 4) Have quality scores >50"
```

```
"Analyze variants in cardiac genes that are rare globally but show population-specific frequency differences, and assess their clinical significance."
```

## 📊 **Level 10: Research & Discovery**

### **Population Genetics**
```
"Analyze my genomic ancestry based on population-specific variant frequencies and compare to major population groups in gnomAD."
```

```
"Identify variants in my data that show interesting population frequency patterns - common in some populations but rare in others."
```

### **Novel Variant Discovery**
```
"Find variants in clinically relevant genes that aren't present in gnomAD - these could be novel discoveries. What's their predicted functional impact?"
```

```
"Identify gene regions with unusually high numbers of rare variants that might represent new disease associations."
```

## ⚠️ **Important Testing Notes**

### **Helix Exome Quality Filtering**
Your data uses Helix's commercial exome pipeline with specific quality filters:
- **PASS**: Highest quality variants (rare but most reliable)
- **BOOSTED**: Quality-boosted variants (high confidence) 
- **IMP**: Imputed variants (moderate confidence, statistically inferred)
- **LOWQ**: Low quality variants (not suitable for clinical decisions)

**Recommended for clinical analysis**: Include PASS, BOOSTED, and IMP variants while excluding LOWQ.

### **Always Include Clinical Context**
For any health-related queries, include:
- "For research and educational purposes only"
- "This analysis requires clinical validation"
- "Consult genetic counselor for health decisions"

### **Professional Query Example**
```
"For research purposes only: Analyze BRCA1 and BRCA2 variants in my genomic data with population frequency context. This is educational analysis and not for clinical decision-making - any health-related findings would require validation by certified clinical laboratories and genetic counseling."
```

## 🚀 **Getting Started Recommendations**

### **Start With These 5 Prompts:**
1. `"Show me statistics about my genomic data"`
2. `"Search for clinical-quality variants on chromosome 17 between 43000000-44000000"`
3. `"Analyze cardiac genes in my genomic data with quality filtering"`
4. `"Look for rare, high-quality variants on chromosome 22"`
5. `"Screen for pharmacogenomic variants affecting drug metabolism (PASS, BOOSTED, IMP quality)"`

### **Then Progress To:**
1. **Gene-specific analysis** (BRCA1, TP53, etc.)
2. **Population frequency filtering**
3. **Clinical gene panels**
4. **Complex multi-gene analysis**
5. **Research-grade queries**

---

## 🎯 **Expected Claude Responses**

When working correctly, Claude should provide:
- ✅ Detailed variant information with coordinates
- ✅ Population frequency data from gnomAD v4.1
- ✅ Clinical interpretation and significance
- ✅ Automatic clinical disclaimers
- ✅ Professional boundary enforcement
- ✅ Gene annotation context
- ✅ Quality score interpretation
- ✅ Structured analysis results

**Happy testing! Your 38.8M variants are ready for AI-powered analysis!** 🧬🤖