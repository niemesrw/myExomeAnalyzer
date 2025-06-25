import { VCFParser, VCFRecord } from './vcf-parser.js';
import { TileDBVCFIngester, TileDBImportStats } from '../tiledb/vcf-ingester.js';
import { EventEmitter } from 'events';
import { config } from '../config/index.js';

export interface ImportProgress {
    totalRecords: number;
    processedRecords: number;
    currentChrom: string;
    currentPos: number;
    rate: number;
    elapsedTime: number;
    eta: number;
}

export class VCFImporter extends EventEmitter {
    private ingester: TileDBVCFIngester;
    private batchSize: number;

    constructor(batchSize: number = config.analysis.batchSize) {
        super();
        this.batchSize = batchSize;
        this.ingester = new TileDBVCFIngester(batchSize);
        this.setupIngesterEvents();
    }

    private setupIngesterEvents(): void {
        this.ingester.on('start', () => {
            this.emit('start');
        });

        this.ingester.on('header', (header) => {
            this.emit('header', header);
        });

        this.ingester.on('progress', (progress) => {
            this.emit('progress', progress);
        });

        this.ingester.on('complete', (stats: TileDBImportStats) => {
            this.emit('complete', stats);
        });

        this.ingester.on('error', (error) => {
            this.emit('error', error);
        });
    }

    async importFile(filePath: string): Promise<TileDBImportStats> {
        try {
            return await this.ingester.ingestVCF(filePath);
        } catch (error) {
            this.emit('error', error);
            throw error;
        }
    }
}