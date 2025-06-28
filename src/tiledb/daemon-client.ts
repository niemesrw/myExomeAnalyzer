import * as net from 'net';
import * as path from 'path';
import * as fs from 'fs';
import { spawn, ChildProcess } from 'child_process';
import { config } from '../config/index.js';
import { VariantQuery, VariantResult, ArrayStats } from './query-engine.js';

export interface PopulationFrequencyQuery {
    type: 'population_frequency_lookup';
    chrom: number;
    pos: number;
    ref: string;
    alt: string;
}

export interface PopulationFrequencyResult {
    variants: Array<{
        chrom: string;
        pos: number;
        ref: string;
        alt: string;
        af_global: number;
        af_afr: number;
        af_amr: number;
        af_asj: number;
        af_eas: number;
        af_fin: number;
        af_nfe: number;
        af_oth: number;
        ac_global: number;
        an_global: number;
        nhomalt_global: number;
        faf95_global: number;
        is_common: boolean;
    }>;
}

export class TileDBDaemonClient {
    private socketPath: string;
    private daemonProcess: ChildProcess | null = null;
    private pythonEnv: string;
    private workspace: string;
    private isStarting: boolean = false;

    constructor() {
        this.workspace = config.tiledb.workspace;
        this.pythonEnv = path.join(process.cwd(), 'venv', 'bin', 'python');
        this.socketPath = path.join(config.tiledb.tempDir, 'tiledb-daemon.sock');
    }

    private async ensureDaemonRunning(): Promise<void> {
        // Check if socket exists and daemon is responsive
        if (await this.isDaemonRunning()) {
            return;
        }

        if (this.isStarting) {
            // Wait for startup to complete
            await this.waitForDaemon();
            return;
        }

        this.isStarting = true;
        await this.startDaemon();
        this.isStarting = false;
    }

    private async isDaemonRunning(): Promise<boolean> {
        if (!fs.existsSync(this.socketPath)) {
            return false;
        }

        try {
            const response = await this.sendRequest({ operation: 'ping' });
            return response.status === 'ok';
        } catch (error) {
            return false;
        }
    }

    private async startDaemon(): Promise<void> {
        console.log('Starting TileDB daemon...');
        
        const daemonScript = path.join(process.cwd(), 'src', 'tiledb', 'python-daemon.py');
        
        this.daemonProcess = spawn(this.pythonEnv, [
            daemonScript,
            this.workspace,
            this.socketPath
        ], {
            stdio: ['ignore', 'ignore', 'ignore'], // Suppress all output to avoid JSON conflicts
            detached: false
        });

        // Output is suppressed to avoid JSON parsing conflicts

        this.daemonProcess.on('exit', (code) => {
            console.log(`TileDB daemon exited with code ${code}`);
            this.daemonProcess = null;
        });

        // Wait for daemon to start
        await this.waitForDaemon();
        console.log('TileDB daemon started successfully');
    }

    private async waitForDaemon(maxWaitMs: number = 10000): Promise<void> {
        const startTime = Date.now();
        
        while (Date.now() - startTime < maxWaitMs) {
            if (fs.existsSync(this.socketPath)) {
                try {
                    const response = await this.sendRequest({ operation: 'ping' });
                    if (response.status === 'ok') {
                        return;
                    }
                } catch (error) {
                    // Continue waiting
                }
            }
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        throw new Error('Timeout waiting for TileDB daemon to start');
    }

    private async sendRequest(request: any): Promise<any> {
        return new Promise((resolve, reject) => {
            const client = net.createConnection(this.socketPath);
            
            client.on('connect', () => {
                client.write(JSON.stringify(request));
            });

            client.on('data', (data) => {
                try {
                    const response = JSON.parse(data.toString());
                    resolve(response);
                } catch (error) {
                    reject(new Error(`Invalid JSON response: ${data.toString()}`));
                }
                client.end();
            });

            client.on('error', (error) => {
                reject(error);
            });

            client.on('timeout', () => {
                reject(new Error('Request timeout'));
            });

            // Set timeout
            client.setTimeout(30000);
        });
    }

    async queryVariants(query: VariantQuery): Promise<VariantResult[]> {
        try {
            await this.ensureDaemonRunning();
            
            const response = await this.sendRequest({
                operation: 'query_variants',
                params: query
            });

            if (response.error) {
                console.error(`Query error: ${response.error}`);
                return [];
            }

            return response.variants || [];
        } catch (error) {
            console.error(`Error querying variants: ${error}`);
            return [];
        }
    }

    async getArrayStats(): Promise<ArrayStats> {
        try {
            await this.ensureDaemonRunning();
            
            const response = await this.sendRequest({
                operation: 'get_stats'
            });

            if (response.error) {
                console.error(`Stats error: ${response.error}`);
                return {
                    totalVariants: 0,
                    chromosomes: [],
                    positionRange: [0, 0],
                    sampleCount: 0,
                    arraySize: '0 B'
                };
            }

            return response;
        } catch (error) {
            console.error(`Error getting array stats: ${error}`);
            return {
                totalVariants: 0,
                chromosomes: [],
                positionRange: [0, 0],
                sampleCount: 0,
                arraySize: '0 B'
            };
        }
    }

    async calculateAlleleFrequency(chrom: string, pos: number, ref: string, alt: string): Promise<number> {
        try {
            await this.ensureDaemonRunning();
            
            const response = await this.sendRequest({
                operation: 'allele_frequency',
                params: { chrom, pos, ref, alt }
            });

            if (response.error) {
                console.error(`Allele frequency error: ${response.error}`);
                return 0.0;
            }

            return response.frequency || 0.0;
        } catch (error) {
            console.error(`Error calculating allele frequency: ${error}`);
            return 0.0;
        }
    }

    async lookupPopulationFrequency(chrom: string, pos: number, ref: string, alt: string): Promise<PopulationFrequencyResult> {
        try {
            await this.ensureDaemonRunning();
            
            const response = await this.sendRequest({
                operation: 'population_frequency_lookup',
                params: { chrom, pos, ref, alt }
            });

            if (response.error) {
                console.error(`Population frequency lookup error: ${response.error}`);
                return { variants: [] };
            }

            return response;
        } catch (error) {
            console.error(`Error looking up population frequency: ${error}`);
            return { variants: [] };
        }
    }

    async getPopulationStatistics(): Promise<{
        totalVariants: number;
        commonVariants: number;
        rareVariants: number;
        arrayAvailable: boolean;
    }> {
        try {
            await this.ensureDaemonRunning();
            
            const response = await this.sendRequest({
                operation: 'population_frequency_stats'
            });

            if (response.error) {
                console.error(`Population stats error: ${response.error}`);
                return {
                    totalVariants: 0,
                    commonVariants: 0,
                    rareVariants: 0,
                    arrayAvailable: false
                };
            }

            return {
                totalVariants: response.total_variants || 0,
                commonVariants: response.common_variants || 0,
                rareVariants: response.rare_variants || 0,
                arrayAvailable: response.array_available || false
            };
        } catch (error) {
            console.error(`Error getting population statistics: ${error}`);
            return {
                totalVariants: 0,
                commonVariants: 0,
                rareVariants: 0,
                arrayAvailable: false
            };
        }
    }

    async shutdown(): Promise<void> {
        if (this.daemonProcess) {
            this.daemonProcess.kill('SIGTERM');
            this.daemonProcess = null;
        }
        
        // Remove socket file
        if (fs.existsSync(this.socketPath)) {
            fs.unlinkSync(this.socketPath);
        }
    }
}

// Simplified client for use by other services
export class DaemonClient {
    private client: TileDBDaemonClient;

    constructor(workspacePath: string) {
        this.client = new TileDBDaemonClient();
    }

    async executeQuery(query: PopulationFrequencyQuery | any): Promise<any> {
        switch (query.type) {
            case 'population_frequency_lookup':
                return await this.client.lookupPopulationFrequency(
                    query.chrom.toString(),
                    query.pos,
                    query.ref,
                    query.alt
                );
            case 'population_frequency_stats':
                return await this.client.getPopulationStatistics();
            default:
                // Fallback to variants query for compatibility
                const variants = await this.client.queryVariants({
                    chrom: query.chrom?.toString(),
                    start: query.start,
                    end: query.end,
                    ref: query.ref,
                    alt: query.alt,
                    minQual: query.minQual,
                    limit: query.limit || 100
                });
                return variants;
        }
    }
}

// Create singleton instance
export const daemonClient = new TileDBDaemonClient();

// Cleanup on process exit
process.on('exit', () => {
    daemonClient.shutdown();
});

process.on('SIGTERM', () => {
    daemonClient.shutdown();
    process.exit(0);
});

process.on('SIGINT', () => {
    daemonClient.shutdown();
    process.exit(0);
});