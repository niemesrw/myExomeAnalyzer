import { spawn } from 'child_process';
import { promisify } from 'util';
import { config } from '../config/index.js';
import { existsSync, mkdirSync } from 'fs';
import path from 'path';

export interface TileDBArrayInfo {
    name: string;
    path: string;
    schema: TileDBArraySchema;
}

export interface TileDBArraySchema {
    dimensions: TileDBDimension[];
    attributes: TileDBAttribute[];
}

export interface TileDBDimension {
    name: string;
    type: string;
    domain: [number, number];
    tile: number;
}

export interface TileDBAttribute {
    name: string;
    type: string;
    nullable?: boolean;
}

export class TileDBArrayManager {
    private workspace: string;
    private pythonEnv: string;

    constructor() {
        this.workspace = config.tiledb.workspace;
        this.pythonEnv = path.join(process.cwd(), 'venv', 'bin', 'python');
        
        // Ensure workspace exists
        if (!existsSync(this.workspace)) {
            mkdirSync(this.workspace, { recursive: true });
        }
    }

    async createVariantsArray(arrayName: string = 'variants'): Promise<string> {
        const arrayPath = path.join(this.workspace, arrayName);
        
        if (existsSync(arrayPath)) {
            console.log(`Array ${arrayName} already exists at ${arrayPath}`);
            return arrayPath;
        }

        const pythonScript = `
import tiledb
import numpy as np
import sys

def create_variants_array(array_path):
    """Create a TileDB array optimized for genomic variants"""
    
    # Define dimensions
    chrom_dim = tiledb.Dim(
        name="chrom",
        domain=(1, 25),  # 1-22, X=23, Y=24, MT=25
        tile=1,
        dtype=np.uint8
    )
    
    pos_dim = tiledb.Dim(
        name="pos",
        domain=(1, 300_000_000),  # Maximum chromosome length
        tile=10000,  # 10kb tiles for efficient range queries
        dtype=np.uint32
    )
    
    # Define attributes
    attrs = [
        tiledb.Attr(name="ref", dtype="U100", nullable=False),
        tiledb.Attr(name="alt", dtype="U500", nullable=False),  # Comma-separated alts
        tiledb.Attr(name="qual", dtype=np.float32, nullable=True),
        tiledb.Attr(name="filter", dtype="U100", nullable=True),
        tiledb.Attr(name="info", dtype="U2000", nullable=True),  # JSON string
        tiledb.Attr(name="samples", dtype="U5000", nullable=True),  # JSON string
    ]
    
    # Create schema
    domain = tiledb.Domain(chrom_dim, pos_dim)
    schema = tiledb.ArraySchema(
        domain=domain,
        sparse=True,  # Sparse array for genomic coordinates
        attrs=attrs,
        cell_order='row-major',
        tile_order='row-major'
    )
    
    # Create array
    tiledb.Array.create(array_path, schema)
    print(f"Created variants array at {array_path}")

if __name__ == "__main__":
    array_path = sys.argv[1]
    create_variants_array(array_path)
`;

        await this.runPythonScript(pythonScript, [arrayPath]);
        return arrayPath;
    }

    async createSamplesArray(arrayName: string = 'samples'): Promise<string> {
        const arrayPath = path.join(this.workspace, arrayName);
        
        if (existsSync(arrayPath)) {
            console.log(`Array ${arrayName} already exists at ${arrayPath}`);
            return arrayPath;
        }

        const pythonScript = `
import tiledb
import numpy as np
import sys

def create_samples_array(array_path):
    """Create a TileDB array for sample metadata"""
    
    # Define dimension
    sample_dim = tiledb.Dim(
        name="sample_id",
        domain=(0, 1000000),  # Support up to 1M samples
        tile=1000,
        dtype=np.uint32
    )
    
    # Define attributes
    attrs = [
        tiledb.Attr(name="sample_name", dtype="U100", nullable=False),
        tiledb.Attr(name="metadata", dtype="U1000", nullable=True),  # JSON string
    ]
    
    # Create schema
    domain = tiledb.Domain(sample_dim)
    schema = tiledb.ArraySchema(
        domain=domain,
        sparse=True,
        attrs=attrs
    )
    
    # Create array
    tiledb.Array.create(array_path, schema)
    print(f"Created samples array at {array_path}")

if __name__ == "__main__":
    array_path = sys.argv[1]
    create_samples_array(array_path)
`;

        await this.runPythonScript(pythonScript, [arrayPath]);
        return arrayPath;
    }

    async getArrayInfo(arrayName: string): Promise<TileDBArrayInfo | null> {
        const arrayPath = path.join(this.workspace, arrayName);
        
        if (!existsSync(arrayPath)) {
            return null;
        }

        const pythonScript = `
import tiledb
import json
import sys

def get_array_info(array_path):
    """Get array schema information"""
    try:
        with tiledb.open(array_path) as A:
            schema = A.schema
            
            dimensions = []
            for dim in schema.domain:
                dimensions.append({
                    "name": dim.name,
                    "type": str(dim.dtype),
                    "domain": [int(dim.domain[0]), int(dim.domain[1])],
                    "tile": int(dim.tile)
                })
            
            attributes = []
            for attr in schema:
                attributes.append({
                    "name": attr.name,
                    "type": str(attr.dtype),
                    "nullable": getattr(attr, 'nullable', False)
                })
            
            info = {
                "name": array_path.split("/")[-1],
                "path": array_path,
                "schema": {
                    "dimensions": dimensions,
                    "attributes": attributes
                }
            }
            
            print(json.dumps(info))
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    array_path = sys.argv[1]
    get_array_info(array_path)
`;

        try {
            const result = await this.runPythonScript(pythonScript, [arrayPath]);
            return JSON.parse(result.stdout);
        } catch (error) {
            console.error(`Error getting array info: ${error}`);
            return null;
        }
    }

    async listArrays(): Promise<string[]> {
        const pythonScript = `
import os
import sys

def list_arrays(workspace):
    """List all TileDB arrays in workspace"""
    arrays = []
    if os.path.exists(workspace):
        for item in os.listdir(workspace):
            item_path = os.path.join(workspace, item)
            if os.path.isdir(item_path):
                # Check if it's a TileDB array by looking for array metadata files
                tiledb_files = [
                    "__array_schema.tdb",
                    "__meta",
                    "__fragments"
                ]
                has_tiledb_files = any(
                    os.path.exists(os.path.join(item_path, tiledb_file)) 
                    for tiledb_file in tiledb_files
                )
                if has_tiledb_files:
                    arrays.append(item)
    
    print("\\n".join(arrays))

if __name__ == "__main__":
    workspace = sys.argv[1]
    list_arrays(workspace)
`;

        try {
            const result = await this.runPythonScript(pythonScript, [this.workspace]);
            return result.stdout.split('\n').filter(line => line.trim());
        } catch (error) {
            console.error(`Error listing arrays: ${error}`);
            return [];
        }
    }

    private async runPythonScript(script: string, args: string[] = []): Promise<{stdout: string, stderr: string}> {
        return new Promise((resolve, reject) => {
            const pythonProcess = spawn(this.pythonEnv, ['-c', script, ...args]);
            
            let stdout = '';
            let stderr = '';
            
            pythonProcess.stdout.on('data', (data) => {
                stdout += data.toString();
            });
            
            pythonProcess.stderr.on('data', (data) => {
                stderr += data.toString();
            });
            
            pythonProcess.on('close', (code) => {
                if (code === 0) {
                    resolve({ stdout: stdout.trim(), stderr: stderr.trim() });
                } else {
                    reject(new Error(`Python script failed with code ${code}: ${stderr}`));
                }
            });
            
            pythonProcess.on('error', (error) => {
                reject(error);
            });
        });
    }
}

export const arrayManager = new TileDBArrayManager();