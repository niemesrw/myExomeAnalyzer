# Testing and Usage Guide - Phase 1 Features

This guide shows how to test and use the new gnomAD population frequency and gene annotation features.

## 🚀 Quick Start Testing

### 1. Build the Project
```bash
npm run build
```

### 2. Set Up Python Environment (if not already done)
```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install tiledb numpy
```

## 📊 Testing Population Frequency Features

### Step 1: Check Current Status
```bash
npm run analyze population status
```

### Step 2: Download Sample gnomAD Data (Start Small)
```bash
# Download just chromosome 22 (smallest autosome) for testing
npm run analyze population download --chromosomes 22
```

### Step 3: Process gnomAD Data into TileDB
```bash
npm run analyze population process --chromosomes 22 --optimize
```

### Step 4: Test Population Frequency Lookups
```bash
# Look up a specific variant
npm run analyze population lookup -c 22 -p 50000000 -r A -a G

# Example with a real variant (if exists in your data)
npm run analyze population lookup -c 17 -p 43044295 -r G -a A
```

### Step 5: Check Population Statistics
```bash
npm run analyze population status
```

## 🧬 Testing Gene Annotation Features

### Step 1: Download Gene Annotations
```bash
# Download GENCODE basic annotations (recommended for testing)
npm run analyze gene download --type basic
```

### Step 2: Process Gene Annotations
```bash
npm run analyze gene process --optimize
```

### Step 3: Test Gene Lookups
```bash
# Look up famous genes
npm run analyze gene lookup -g BRCA1
npm run analyze gene lookup -g TP53
npm run analyze gene lookup -g MYBPC3

# Search for genes in a region (BRCA1 region)
npm run analyze gene region -c 17 -s 43000000 -e 44000000

# Find clinical genes only
npm run analyze gene region -c 17 -s 43000000 -e 44000000 --clinical
```

### Step 4: Check Gene Statistics
```bash
npm run analyze gene status
```

## 🤖 Testing Claude AI Integration (MCP)

### Step 1: Start the MCP Server
```bash
npm run mcp-server
```

### Step 2: Configure Claude Desktop
Copy the MCP configuration:
```bash
cp claude-desktop-config.json ~/Library/Application\ Support/Claude/claude_desktop_config.json
```

### Step 3: Restart Claude Desktop
Close and reopen Claude Desktop app.

### Step 4: Test New MCP Tools in Claude

#### Population Frequency Queries:
```
"Look up population frequency for variants at chromosome 17 position 43044295 G->A"
```

#### Frequency-Based Filtering:
```
"Filter variants on chromosome 17 between positions 43000000-44000000 excluding common variants (>1% frequency)"
```

#### Gene-Based Analysis:
```
"Search for variants in the BRCA1 gene region with population frequency context"
```

#### Clinical Gene Analysis:
```
"Analyze cardiac genes in my genomic data with frequency filtering"
```

## 🧪 Comprehensive Testing Scenarios

### Scenario 1: BRCA1 Analysis
```bash
# 1. Look up BRCA1 gene coordinates
npm run analyze gene lookup -g BRCA1

# 2. Search for variants in BRCA1 region (using coordinates from step 1)
npm run analyze query -c 17 -s 43044295 -e 43170245 -l 10

# 3. In Claude, ask:
"Analyze variants in BRCA1 with population frequency context and clinical interpretation"
```

### Scenario 2: Cardiac Gene Panel
```bash
# 1. Look up cardiac genes
npm run analyze gene lookup -g MYBPC3
npm run analyze gene lookup -g MYH7

# 2. In Claude, ask:
"Analyze cardiac genes in my genomic data for potential variants with population frequency filtering"
```

### Scenario 3: Common Variant Filtering
```bash
# In Claude, ask:
"Show me rare variants (<0.1% population frequency) on chromosome 22 with gene annotations"
```

## 🔍 Debugging and Troubleshooting

### Check TileDB Arrays
```bash
npm run analyze tiledb list
```

### Check Python Environment
```bash
source venv/bin/activate
python -c "import tiledb; print('TileDB version:', tiledb.version())"
```

### Test TileDB Daemon
```bash
# Check if daemon starts correctly
npm run analyze stats
```

### View Logs
```bash
# Check daemon logs
tail -f /tmp/tiledb/daemon.log
```

### Reset Everything (if needed)
```bash
# Remove all data and start fresh
rm -rf tiledb_workspace/
rm -rf venv/
# Then follow setup steps again
```

## 📈 Performance Testing

### Test Query Speed
```bash
# Time population frequency lookups
time npm run analyze population lookup -c 22 -p 50000000 -r A -a G

# Time gene lookups  
time npm run analyze gene lookup -g BRCA1
```

### Load Testing with Claude
Try multiple rapid queries in Claude:
```
"Look up population frequencies for these variants: 17:43044295 G->A, 13:32315508 G->A, 11:108121423 G->A"
```

## 🎯 Expected Results

### Population Frequency Results Should Show:
- Global frequency (AF_global)
- Population-specific frequencies (AFR, AMR, ASJ, EAS, FIN, NFE, OTH)
- Clinical interpretation (very_rare, rare, uncommon, common, very_common)
- Clinical significance assessment
- gnomAD v4.1 data source confirmation

### Gene Annotation Results Should Show:
- Gene name, chromosome, coordinates
- Gene type (protein_coding, etc.)
- Clinical significance (for clinical genes)
- Transcript count
- Strand information

### Claude Integration Should Provide:
- Natural language responses with clinical context
- Population frequency warnings
- Clinical disclaimers
- Professional interpretation guidelines
- Structured analysis results

## 🚨 Known Limitations

1. **Disk Space**: Full gnomAD download requires ~60GB
2. **Processing Time**: Full chromosome processing takes 10-30 minutes each
3. **Memory**: Gene annotation processing needs ~4GB RAM
4. **First Query**: Initial queries may be slower (daemon startup)

## 💡 Tips for Testing

1. **Start Small**: Test with chromosome 22 first (smallest)
2. **Check Status**: Always run status commands to verify setup
3. **Monitor Resources**: Watch disk space and memory usage
4. **Use Known Genes**: Test with famous genes (BRCA1, TP53, etc.)
5. **Verify Results**: Cross-check with gnomAD browser for validation

## 🔗 Useful Resources

- **gnomAD Browser**: https://gnomad.broadinstitute.org/
- **GENCODE**: https://www.gencodegenes.org/
- **TileDB Docs**: https://docs.tiledb.com/
- **Gene Cards**: https://www.genecards.org/

---

**Ready to explore your 38.8M variants with population frequency context and comprehensive gene annotations!** 🧬🚀