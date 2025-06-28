# gnomAD MCP Server

A Model Context Protocol (MCP) server providing access to gnomAD population frequency data for genomic variants.

## Overview

This MCP server enables Claude and other LLMs to query population frequency data from the Genome Aggregation Database (gnomAD). It provides tools for looking up variant frequencies, filtering by population frequency, and analyzing population-specific patterns.

## Features

### Tools

1. **lookup_variant_frequency** - Look up population frequency for a specific variant
2. **batch_frequency_lookup** - Query multiple variants at once
3. **filter_by_frequency** - Find variants in a region filtered by frequency
4. **get_population_statistics** - Get detailed population statistics for a variant
5. **check_gnomad_status** - Check if gnomAD data is available

### Resources

- `gnomad://status` - Current status of gnomAD data
- `gnomad://populations` - Available population codes and descriptions
- `gnomad://statistics` - Overall database statistics

## Installation

1. Build the server:
```bash
cd src/gnomad-mcp-server
npm install
npm run build
```

2. Add to Claude Desktop configuration:
```json
{
  "mcpServers": {
    "gnomad-reference": {
      "command": "node",
      "args": ["/path/to/myExomeAnalyzer/src/gnomad-mcp-server/dist/server.js"],
      "env": {
        "GNOMAD_DATA_DIR": "/path/to/gnomad/data"
      }
    }
  }
}
```

## Usage Examples

### Looking up a variant frequency
```
"What's the population frequency of the variant at chromosome 17, position 43044295, G>A?"
```

### Filtering rare variants
```
"Find all variants on chromosome 22 with frequency less than 0.1% in the European population"
```

### Population comparison
```
"Compare the frequency of this variant across different populations"
```

## Data Requirements

The server requires processed gnomAD data in TileDB format. Download and process using the main myExomeAnalyzer tool:

```bash
npm run analyze population download
npm run analyze population process
```

## Environment Variables

- `GNOMAD_DATA_DIR` - Path to gnomAD TileDB arrays (default: `./data/gnomad`)

## Population Codes

- `afr` - African/African American
- `amr` - Admixed American  
- `asj` - Ashkenazi Jewish
- `eas` - East Asian
- `fin` - Finnish
- `nfe` - Non-Finnish European
- `sas` - South Asian

## Integration with myExomeAnalyzer

This server complements the main myExomeAnalyzer MCP server by providing reference population data. Use both servers together for comprehensive genomic analysis:

- myExomeAnalyzer MCP: Personal genomic variants
- gnomAD MCP: Population frequencies and filtering