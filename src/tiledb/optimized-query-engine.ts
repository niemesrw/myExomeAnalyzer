import { daemonClient } from './daemon-client.js';
import { VariantQuery, VariantResult, ArrayStats } from './query-engine.js';

export class OptimizedTileDBQueryEngine {
    constructor() {
        // Engine uses persistent daemon for all operations
    }

    async queryVariants(query: VariantQuery): Promise<VariantResult[]> {
        return await daemonClient.queryVariants(query);
    }

    async getArrayStats(): Promise<ArrayStats> {
        return await daemonClient.getArrayStats();
    }

    async calculateAlleleFrequency(chrom: string, pos: number, ref: string, alt: string): Promise<number> {
        return await daemonClient.calculateAlleleFrequency(chrom, pos, ref, alt);
    }

    async shutdown(): Promise<void> {
        await daemonClient.shutdown();
    }
}

// Export optimized engine instance
export const optimizedQueryEngine = new OptimizedTileDBQueryEngine();