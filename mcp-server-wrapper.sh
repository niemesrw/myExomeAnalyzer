#!/bin/bash
set -e
cd "/Users/ryan/dev/myExomeAnalyzer" || exit 1
source venv/bin/activate || exit 1
mkdir -p /tmp/tiledb
export TILEDB_WORKSPACE="/Users/ryan/dev/myExomeAnalyzer/tiledb_workspace"
export TILEDB_TEMP_DIR="/tmp/tiledb"
exec node dist/mcp-server/server.js "$@"