#!/bin/bash
cd /Users/ryan/dev/myExomeAnalyzer
source venv/bin/activate
mkdir -p /tmp/tiledb
exec node dist/mcp-server/server.js "$@"