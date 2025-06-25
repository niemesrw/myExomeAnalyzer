import dotenv from 'dotenv';
import { cpus } from 'os';

dotenv.config();

interface Config {
    tiledb: {
        workspace: string;
        tempDir: string;
        compression: string;
    };
    workers: {
        maxThreads: number;
        memoryLimit: number;
    };
    mcp: {
        port: number;
        host: string;
    };
    analysis: {
        batchSize: number;
        progressUpdateInterval: number;
    };
}

export const config: Config = {
    tiledb: {
        workspace: process.env.TILEDB_WORKSPACE || './tiledb_workspace',
        tempDir: process.env.TILEDB_TEMP_DIR || '/tmp/tiledb',
        compression: process.env.TILEDB_COMPRESSION || 'gzip',
    },
    workers: {
        maxThreads: parseInt(process.env.MAX_WORKER_THREADS || cpus().length.toString()),
        memoryLimit: parseInt(process.env.WORKER_MEMORY_LIMIT || '2048'),
    },
    mcp: {
        port: parseInt(process.env.MCP_PORT || '3000'),
        host: process.env.MCP_HOST || 'localhost',
    },
    analysis: {
        batchSize: parseInt(process.env.BATCH_SIZE || '10000'),
        progressUpdateInterval: parseInt(process.env.PROGRESS_UPDATE_INTERVAL || '1000'),
    },
};