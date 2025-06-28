# GIAB Workflow Integration Tests

This directory contains comprehensive integration tests for validating GIAB (Genome in a Bottle) workflows through the MCP server interface.

## Overview

The GIAB tests ensure that our genomic analysis platform correctly processes reference truth sets and returns expected results through the MCP server tools. These tests validate:

- **Sample Isolation**: GIAB samples (HG001, HG002) are correctly isolated from patient data
- **Truth Set Validation**: Variant counts and quality metrics match GIAB expectations  
- **MCP Tool Integration**: All MCP tools work correctly with GIAB data
- **Clinical Workflows**: Known pathogenic variants are correctly identified
- **Performance Benchmarks**: Queries meet response time requirements

## Test Files

### `giab-mcp-workflow.test.ts`
Comprehensive end-to-end workflow tests:
- GIAB data validation through MCP search_variants
- BRCA1/BRCA2 region variant validation against truth sets
- Sample isolation and cross-contamination prevention
- Performance benchmarks and quality metrics
- Error handling and edge cases

### `giab-mcp-tools.test.ts`  
Individual MCP tool validation with GIAB data:
- `search_variants` tool with clinical context
- `get_variant_details` for known GIAB variants
- `calculate_allele_frequency` accuracy testing
- `get_variant_stats` with sample filtering
- Clinical analysis type validation (cancer, cardiac, etc.)


## GIAB Truth Variants

The tests use known variants from GIAB truth sets:

### HG002 (Ashkenazi Jewish son - NA24385)
- **Expected variants**: ~3.1M high-confidence variants
- **BRCA1 test variant**: 17:43044295 G>A (pathogenic)
- **Quality filters**: PASS only
- **Chromosomes**: 1-22 (autosomes only in v4.2.1)

### HG001 (HapMap CEU - NA12878)  
- **Expected variants**: ~2.8M high-confidence variants
- **BRCA2 test variant**: 13:32315355 complex variant
- **Quality filters**: PASS only
- **Chromosomes**: 1-22 (autosomes only)

## Running Tests

### Quick Start
```bash
# Run all GIAB integration tests
npm run test:integration

# Run specific test files
npm test tests/integration/giab-mcp-workflow.test.ts
npm test tests/integration/giab-mcp-tools.test.ts
```


### Manual Testing Commands
```bash
# Test GIAB sample statistics
node dist/cli/index.js stats --samples HG002

# Query BRCA1 region in HG002
node dist/cli/index.js query --chrom 17 --start 43044295 --end 43125370 --samples HG002 --limit 10

# Test allele frequency calculation
node dist/cli/index.js frequency --chrom 17 --pos 43044295 --ref G --alt A

# Run GIAB integrity tests
node dist/cli/index.js giab test-integrity HG002
```

## Expected Test Results

### Sample Statistics Validation
- **HG002**: 2.8M - 3.2M variants (target: ~3.1M)
- **HG001**: 2.5M - 2.9M variants (target: ~2.8M)
- **Chromosomes**: All autosomes (1-22) represented
- **Quality**: >95% PASS filter rate

### Clinical Variant Identification
- **BRCA1 pathogenic variants**: Correctly identified with clinical significance
- **Population frequency integration**: Rare variants < 1%, common variants > 5%
- **Gene annotation**: Proper gene symbol and consequence annotation

### MCP Tool Performance
- **search_variants**: < 3 seconds for gene region queries
- **get_variant_details**: < 1 second for single variant lookup
- **calculate_allele_frequency**: < 2 seconds for frequency calculation
- **get_variant_stats**: < 5 seconds for sample statistics

### Sample Isolation Verification
- **HG002 queries**: Return only HG002 sample data
- **HG001 queries**: Return only HG001 sample data  
- **Multi-sample queries**: Correctly separate sample genotypes
- **No cross-contamination**: Patient samples isolated from GIAB references

## Test Data Requirements

### GIAB Data Files (Optional for Full Integration)
```bash
# HG002 truth set files
wget https://ftp-trace.ncbi.nlm.nih.gov/ReferenceSamples/giab/release/AshkenazimTrio/HG002_NA24385_son/NISTv4.2.1/GRCh38/HG002_GRCh38_1_22_v4.2.1_benchmark.vcf.gz

# HG001 truth set files  
wget https://ftp-trace.ncbi.nlm.nih.gov/giab/ftp/release/NA12878_HG001/NISTv4.2.1/GRCh38/HG001_GRCh38_1_22_v4.2.1_benchmark.vcf.gz
```

### Mock Data (Default for Testing)
Tests use comprehensive mocks that simulate GIAB data without requiring large downloads:
- Realistic variant structures matching GIAB format
- Expected variant counts and quality distributions
- Known pathogenic variants in BRCA1/BRCA2 regions
- Proper sample ID tagging and isolation

## Continuous Integration

### GitHub Actions Integration
The tests integrate with the CI pipeline:
```yaml
- name: Run GIAB Integration Tests
  run: |
    npm run build
    npm run test:integration
```

### Coverage Requirements
- **Integration test coverage**: 80% of MCP tools tested with GIAB data
- **GIAB workflow coverage**: Complete import/query/validation pipeline
- **Error scenario coverage**: Invalid inputs, missing data, performance limits

## Troubleshooting

### Common Issues

#### Test Failures
```bash
# Check if TileDB workspace is properly initialized
ls -la test_workspace/

# Verify Python dependencies
python -c "import tiledb; print('TileDB OK')"

# Check application build
npm run typecheck && npm run build
```

#### Performance Issues
```bash
# Check system resources
top -l 1 | grep -E "CPU|PhysMem"

# Monitor query performance
time node dist/cli/index.js query --chrom 17 --start 43044295 --end 43044296 --samples HG002
```

#### GIAB Data Issues
```bash
# Verify GIAB sample import status
node dist/cli/index.js giab status

# Check sample isolation
node dist/cli/index.js stats --samples HG002 --json | jq '.sampleCount'
```

### Debug Mode
```bash
# Run tests with debug output
DEBUG=* npm test tests/integration/giab-mcp-workflow.test.ts

# Enable verbose Jest output
npm test tests/integration/ --verbose --detectOpenHandles
```

## Contributing

### Adding New GIAB Tests
1. Add test variants to `GIAB_TRUTH_VARIANTS` constant
2. Create test cases following existing patterns
3. Update expected results in validation functions
4. Add performance benchmarks if needed

### Test Data Updates
1. Update variant counts in truth sets when GIAB releases new versions
2. Add new GIAB samples (HG003, HG004) as they become available
3. Include new clinical gene regions for testing

### Performance Tuning
1. Monitor query response times and update thresholds
2. Optimize sample filtering for large datasets
3. Add benchmarks for new MCP tools

---

**Note**: These tests validate that our platform correctly processes the gold standard genomic reference data from NIST's Genome in a Bottle consortium, ensuring clinical-grade accuracy for genomic variant analysis.