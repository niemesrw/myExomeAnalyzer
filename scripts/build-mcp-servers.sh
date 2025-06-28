#!/bin/bash

# Build script for both MCP servers

set -e

echo "🔨 Building MCP servers..."
echo "=========================="

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

# Build main myExomeAnalyzer (includes MCP server)
echo -e "${BLUE}Building myExomeAnalyzer MCP server...${NC}"
npm run build
echo -e "${GREEN}✅ myExomeAnalyzer MCP server built${NC}"

# Build gnomAD MCP server
echo -e "${BLUE}Building gnomAD MCP server...${NC}"
cd src/gnomad-mcp-server
npm install
npm run build
cd ../..
echo -e "${GREEN}✅ gnomAD MCP server built${NC}"

echo ""
echo -e "${GREEN}🎉 Both MCP servers built successfully!${NC}"
echo ""
echo "To use with Claude Desktop:"
echo "1. Copy the configuration:"
echo "   cp claude-desktop-config-dual.json ~/Library/Application\\ Support/Claude/claude_desktop_config.json"
echo ""
echo "2. Restart Claude Desktop"
echo ""
echo "3. Both servers will be available:"
echo "   - myexome-analyzer: Personal genomic data queries"
echo "   - gnomad-reference: Population frequency queries"