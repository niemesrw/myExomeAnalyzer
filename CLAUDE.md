# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview
MyExome Analyzer is a high-performance VCF (Variant Call Format) file analyzer using TileDB for storage and LLM query capabilities via Model Context Protocol (MCP). It enables genomics researchers to efficiently analyze exome data and query it using natural language through Claude.

## Python Environment Management
This project uses Python for TileDB-VCF integration alongside Node.js for the main application. **Always use virtual environments** for Python dependencies on macOS:

```bash
# Create virtual environment (one time setup)
python3 -m venv venv

# Activate virtual environment (required for each session)
source venv/bin/activate

# Install Python dependencies
pip install tiledb-vcf

# Deactivate when done
deactivate
```

**Important**: Never use system pip or brew pip directly. Always activate the virtual environment first.

## Essential Development Commands

### Build and Development
```bash
npm run build          # Compile TypeScript to JavaScript
npm run dev            # Watch mode compilation
npm run typecheck      # Type checking without compilation
npm run lint           # ESLint code analysis
```

### TileDB Management
```bash
# Python environment setup (required first)
source venv/bin/activate

# TileDB workspace operations will be handled automatically
# No manual database services needed
```

### VCF Analysis Workflow
```bash
# Ensure Python environment is active first
source venv/bin/activate

# Import VCF files using TileDB-VCF (much faster than previous PostgreSQL approach)
npm run analyze import file.vcf.gz --threads 8 --batch-size 10000
npm run analyze stats                    # TileDB array statistics
npm run analyze query --chrom 1 --start 100000 --end 200000
npm run mcp-server                      # Start MCP server for Claude integration
```

## Architecture Overview

### TileDB-VCF Integration Architecture
The system uses TileDB for high-performance genomics storage:
1. **Main Process**: Manages CLI and coordinates TileDB-VCF operations
2. **TileDB-VCF**: Direct VCF ingestion using optimized columnar storage
3. **Python Bridge**: Node.js calls Python TileDB-VCF for import/query operations
4. **Storage Layer**: Compressed arrays optimized for genomic range queries

### MCP Server Architecture
The MCP server (`src/mcp-server/server.ts`) exposes genomics data to LLMs through:
- **Tools**: `search_variants`, `get_variant_details`, `calculate_allele_frequency`, `filter_variants`, `get_sample_genotypes`
- **Resources**: Dataset overviews (`tiledb://arrays/summary`, `tiledb://samples/list`)
- **Prompts**: Pre-built analysis templates for pathogenic variants, sample comparisons, QC reports

### TileDB Array Design
TileDB arrays optimized for genomics queries:
- **Variants Array**: Columnar storage with chromosome/position dimensions
- **Samples Array**: Sample metadata with efficient compression
- **Automatic Indexing**: TileDB handles spatial indexing for position ranges
- **Compression**: Genomic data compressed up to 100x smaller than raw VCF

### Event-Driven Progress System
Progress tracking uses EventEmitter pattern:
- VCF parser emits record/progress events
- Worker pool aggregates progress from multiple workers
- CLI displays real-time progress bars with ETA calculations

## Critical Implementation Details

### Data Handling
Because genomic data is large, we want to ensure we can resume sessions if they are interrupted.

### Worker Thread Communication
Workers communicate via message passing:
```typescript
// Main to worker
worker.postMessage({ type: 'task', data: { filePath, chrom, sampleMapping } });

// Worker to main
parentPort.postMessage({ type: 'progress', data: { processed, chrom, pos } });
```

### TileDB Bulk Operations
TileDB-VCF handles bulk operations automatically with optimized columnar storage and compression.

### MCP Tool Pattern
All MCP tools follow this structure:
1. Parse and validate input arguments
2. Query database using repository pattern
3. Return structured JSON response
4. Handle errors gracefully with descriptive messages

### VCF Parsing Strategy
Streaming parser handles large files efficiently:
- Line-by-line processing without loading entire file
- Batch processing with configurable batch sizes
- Memory-efficient transformation of VCF records to database objects

## Key Configuration Points

### Environment Variables
Critical settings in `.env`:
- `MAX_WORKER_THREADS`: CPU core utilization (default: detected cores)
- `BATCH_SIZE`: TileDB operation batch size (default: 10000)
- `TILEDB_WORKSPACE`: TileDB array storage location (default: ./tiledb_workspace)

### TileDB Configuration
TileDB arrays are automatically configured with:
- Optimized compression for genomic data (up to 100x reduction)
- Spatial indexing for fast chromosome/position queries
- Columnar storage for efficient variant filtering

## Testing and Development Workflow

### Example Data
- `data/example.vcf`: Small test dataset
- `scripts/example-workflow.sh`: Complete demo script
- `scripts/example-queries.sql`: SQL query examples

### Development Cycle
1. Make code changes
2. Run `npm run typecheck` and `npm run lint`
3. Test with `npm run example` for full workflow
4. Use `npm run analyze import` with real VCF files
5. Verify MCP integration with `npm run mcp-server`

## Extension Points

### Adding MCP Tools
1. Add tool definition in `ListToolsRequestSchema` handler
2. Implement logic in `CallToolRequestSchema` handler
3. Follow existing pattern of database queries + JSON responses

### TileDB Schema Evolution
1. Update array schemas in `src/tiledb/query-engine.ts`
2. Add TypeScript interfaces for new attributes
3. Update query methods for new data types
4. TileDB handles schema versioning automatically

### CLI Command Extensions
Extend `src/cli/index.ts` using Commander.js patterns:
```typescript
program.command('new-command')
    .description('Description')
    .option('--flag <value>', 'Option description')
    .action(async (options) => { /* implementation */ });
```
