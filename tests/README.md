# MyExome Analyzer Test Suite

This directory contains comprehensive tests for the MyExome Analyzer platform, focusing on genomic data processing, GIAB validation, and clinical workflows.

## Test Structure

```
tests/
├── unit/                    # Unit tests for individual components
│   ├── basic.test.ts        # Basic functionality tests (working)
│   ├── vcf-parser.test.ts   # VCF parsing logic tests
│   ├── query-engine.test.ts # TileDB query engine tests
│   ├── giab-manager.test.ts # GIAB sample management tests
│   ├── vcf-importer.test.ts # VCF import workflow tests
│   └── clinical-metadata.test.ts # Clinical annotation tests
├── integration/             # End-to-end workflow tests
│   └── giab-workflow.test.ts # Complete GIAB import/validation workflow
├── fixtures/                # Test data and fixtures
└── setup.ts                # Jest test configuration
```

## Running Tests

### Unit Tests
```bash
# Run all unit tests
npm run test:unit

# Run specific test file
npm test tests/unit/basic.test.ts

# Run tests with coverage
npm run test:coverage
```

### Integration Tests
```bash
# Run integration tests
npm run test:integration

# Run all tests
npm test
```

### Coverage Reporting
```bash
# Generate coverage report
npm run test:coverage

# View coverage in browser
open coverage/lcov-report/index.html
```

## Test Categories

### 1. Unit Tests

#### VCF Parser Tests (`vcf-parser.test.ts`)
- **Header Parsing**: VCF version, INFO/FORMAT/FILTER field definitions
- **Record Parsing**: Basic records, multiple alleles, missing data
- **Validation**: Malformed data, insufficient columns, empty samples
- **Chromosome Normalization**: chr1 → 1, chrX → X, chrMT → MT
- **Error Handling**: Invalid data, large positions, error events

#### Query Engine Tests (`query-engine.test.ts`)
- **Query Building**: Basic queries, chromosome normalization, sample filtering
- **Quality Filtering**: Minimum quality thresholds
- **Limit Handling**: Result set size limits
- **Sample Statistics**: Sample-specific stats, multi-sample aggregation
- **Error Handling**: Python errors, malformed JSON, query validation
- **Allele Frequency**: Variant frequency calculations

#### GIAB Manager Tests (`giab-manager.test.ts`)
- **Sample Management**: Known samples (HG001, HG002), sample details
- **Data Integrity**: Variant count validation, variance calculations
- **Download Management**: Local file checks, download workflows
- **Import Workflow**: Complete import process, error recovery
- **Quality Control**: Sample naming validation, variance thresholds

#### VCF Importer Tests (`vcf-importer.test.ts`)
- **File Validation**: Existence, size, extensions
- **Sample ID Extraction**: Header parsing, ID normalization, tagging
- **Batch Processing**: Configurable batch sizes, failure handling
- **Progress Tracking**: Events, percentages, time estimation
- **Error Handling**: Parser errors, validation, recovery
- **Import Summary**: Comprehensive reporting, unique sample tracking

#### Clinical Metadata Tests (`clinical-metadata.test.ts`)
- **Variant Classification**: Pathogenic, benign, VUS, unknown variants
- **Gene Annotation**: Gene information, intergenic regions, prioritization
- **Clinical Decision Support**: Recommendations, action items
- **Population Frequency**: Categorization, population-specific analysis
- **Report Generation**: Clinical reports, HGVS formatting
- **Quality Control**: Annotation validation, consistency checks

### 2. Integration Tests

#### GIAB Workflow Tests (`giab-workflow.test.ts`)
- **Complete Import**: Download, import, validation workflow
- **Multi-Sample**: Multiple GIAB samples, isolation testing
- **Query Integration**: Region queries, allele frequencies, filtering
- **Error Recovery**: Network failures, partial imports, data validation
- **Performance**: Large queries, batch processing, scalability
- **Data Consistency**: Quality thresholds, validation reports

## Test Configuration

### Jest Configuration (`jest.config.js`)
- **TypeScript Support**: ts-jest with ESM modules
- **Coverage Thresholds**: 60% statements/lines, 50% branches/functions
- **Test Patterns**: `**/tests/**/*.test.ts`
- **Setup**: Custom test environment and mocks
- **Timeout**: 10 seconds for integration tests

### Coverage Targets
- **Statements**: 60% minimum
- **Lines**: 60% minimum  
- **Branches**: 50% minimum
- **Functions**: 50% minimum

## Test Data and Fixtures

### Mock Data
- **VCF Records**: Realistic genomic variants
- **VCF Headers**: Complete metadata and sample information
- **Sample Data**: HG001, HG002, patient samples
- **Test Workspace**: Isolated test environment

### Fixtures
- **Small VCF Files**: Test data for parsing
- **GIAB Samples**: Reference truth sets
- **Clinical Variants**: Pathogenic/benign examples

## Continuous Integration

### GitHub Actions (`.github/workflows/test.yml`)
- **Test Matrix**: Node.js 18.x and 20.x
- **Security Audit**: Vulnerability scanning
- **Coverage Upload**: Codecov integration
- **Integration Tests**: Python/TileDB environment

### Quality Gates
1. **TypeScript Compilation**: `npm run typecheck`
2. **ESLint**: `npm run lint` 
3. **Unit Tests**: All tests must pass
4. **Coverage**: Meet minimum thresholds
5. **Security**: No moderate+ vulnerabilities

## GIAB Validation Focus

The test suite specifically validates GIAB (Genome in a Bottle) functionality:

### Sample Isolation
- Ensure GIAB samples (HG001, HG002) are correctly isolated
- Validate sample-specific queries return appropriate data
- Test truth set comparisons against expected variant counts

### Data Integrity
- Verify imported GIAB variants match expected counts
- Test chromosome coverage and position ranges  
- Validate quality metrics and filter rates

### Clinical Workflows
- Test pathogenic variant identification in GIAB samples
- Validate clinical recommendations for known variants
- Ensure proper segregation of patient vs. reference data

## Running Specific Test Scenarios

```bash
# Test GIAB sample isolation
npm test tests/unit/giab-manager.test.ts

# Test VCF parsing with GIAB data
npm test tests/unit/vcf-parser.test.ts

# Test complete GIAB workflow
npm test tests/integration/giab-workflow.test.ts

# Test sample-specific queries
npm test tests/unit/query-engine.test.ts
```

## Expected Coverage Report

Current coverage focuses on:
- Core VCF processing logic
- GIAB sample management
- Query engine functionality
- Clinical annotation pipelines

Target coverage by component:
- VCF Parser: 80%+
- Query Engine: 75%+
- GIAB Manager: 70%+
- Clinical Metadata: 65%+

## Notes

- **Integration tests** require Python environment with TileDB-VCF
- **Unit tests** use comprehensive mocking for external dependencies
- **Coverage excludes** CLI entry points and node_modules
- **Test isolation** ensures no cross-test contamination
- **Error scenarios** are thoroughly tested for robustness