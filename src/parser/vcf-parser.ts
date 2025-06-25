import { createReadStream } from 'fs';
import { createGunzip } from 'zlib';
import { Transform, pipeline } from 'stream';
import { promisify } from 'util';
import { EventEmitter } from 'events';

const pipelineAsync = promisify(pipeline);

export interface VCFHeader {
    version: string;
    info: Map<string, VCFInfoField>;
    format: Map<string, VCFFormatField>;
    filter: Map<string, string>;
    samples: string[];
    meta: string[];
}

export interface VCFInfoField {
    id: string;
    number: string;
    type: string;
    description: string;
}

export interface VCFFormatField {
    id: string;
    number: string;
    type: string;
    description: string;
}

export interface VCFRecord {
    chrom: string;
    pos: number;
    id?: string;
    ref: string;
    alt: string[];
    qual?: number;
    filter: string[];
    info: Record<string, any>;
    format?: string[];
    samples: Record<string, Record<string, any>>;
}

export class VCFParser extends EventEmitter {
    private header: VCFHeader | null = null;
    private lineNumber = 0;
    private recordCount = 0;

    constructor() {
        super();
    }

    async parseFile(filePath: string): Promise<void> {
        const isGzipped = filePath.endsWith('.gz');
        let stream = createReadStream(filePath);

        if (isGzipped) {
            stream = stream.pipe(createGunzip()) as any;
        }

        let lineBuffer = '';
        const lineTransform = new Transform({
            objectMode: true,
            transform(chunk: Buffer, encoding, callback) {
                lineBuffer += chunk.toString();
                const lines = lineBuffer.split('\n');
                
                // Keep the last partial line in the buffer
                lineBuffer = lines.pop() || '';
                
                // Process complete lines
                for (const line of lines) {
                    if (line.trim()) {
                        this.push(line.trim());
                    }
                }
                callback();
            },
            flush(callback) {
                // Process any remaining line in buffer
                if (lineBuffer.trim()) {
                    this.push(lineBuffer.trim());
                }
                callback();
            }
        });

        const parseTransform = new Transform({
            objectMode: true,
            transform: (line: string, encoding, callback) => {
                try {
                    this.processLine(line);
                    callback();
                } catch (error) {
                    callback(error instanceof Error ? error : new Error(String(error)));
                }
            }
        });

        this.emit('start');

        try {
            await pipelineAsync(
                stream,
                lineTransform,
                parseTransform
            );
            this.emit('complete', { totalRecords: this.recordCount });
        } catch (error) {
            this.emit('error', error);
        }
    }

    private processLine(line: string): void {
        this.lineNumber++;

        if (line.startsWith('##')) {
            this.parseMetaLine(line);
        } else if (line.startsWith('#CHROM')) {
            this.parseHeaderLine(line);
        } else if (line.trim() && this.header) {
            const record = this.parseDataLine(line);
            this.recordCount++;
            this.emit('record', record);
            
            if (this.recordCount % 1000 === 0) {
                this.emit('progress', { 
                    processed: this.recordCount,
                    line: this.lineNumber 
                });
            }
        }
    }

    private parseMetaLine(line: string): void {
        if (!this.header) {
            this.header = {
                version: '',
                info: new Map(),
                format: new Map(),
                filter: new Map(),
                samples: [],
                meta: []
            };
        }

        if (line.startsWith('##fileformat=')) {
            this.header.version = line.split('=')[1];
        } else if (line.startsWith('##INFO=')) {
            const info = this.parseStructuredField(line);
            if (info) {
                this.header.info.set(info.id, info as VCFInfoField);
            }
        } else if (line.startsWith('##FORMAT=')) {
            const format = this.parseStructuredField(line);
            if (format) {
                this.header.format.set(format.id, format as VCFFormatField);
            }
        } else if (line.startsWith('##FILTER=')) {
            const filter = this.parseStructuredField(line);
            if (filter) {
                this.header.filter.set(filter.id, filter.description);
            }
        } else {
            this.header.meta.push(line);
        }
    }

    private parseStructuredField(line: string): any {
        const match = line.match(/<(.+)>/);
        if (!match) return null;

        const content = match[1];
        const fields: Record<string, string> = {};
        
        let current = '';
        let inQuotes = false;
        let key = '';
        
        for (let i = 0; i < content.length; i++) {
            const char = content[i];
            
            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === '=' && !inQuotes && !key) {
                key = current.trim();
                current = '';
            } else if (char === ',' && !inQuotes) {
                if (key) {
                    fields[key] = current.trim().replace(/^"|"$/g, '');
                    key = '';
                    current = '';
                }
            } else {
                current += char;
            }
        }
        
        if (key) {
            fields[key] = current.trim().replace(/^"|"$/g, '');
        }

        return fields;
    }

    private parseHeaderLine(line: string): void {
        const columns = line.substring(1).split('\t');
        
        if (!this.header) {
            this.header = {
                version: '',
                info: new Map(),
                format: new Map(),
                filter: new Map(),
                samples: [],
                meta: []
            };
        }

        this.header.samples = columns.slice(9);
        this.emit('header', this.header);
    }

    private parseDataLine(line: string): VCFRecord {
        const columns = line.split('\t');
        
        if (columns.length < 8) {
            throw new Error(`Invalid VCF record at line ${this.lineNumber}: insufficient columns`);
        }

        const record: VCFRecord = {
            chrom: columns[0],
            pos: parseInt(columns[1]),
            id: columns[2] === '.' ? undefined : columns[2],
            ref: columns[3],
            alt: columns[4] === '.' ? [] : columns[4].split(','),
            qual: columns[5] === '.' ? undefined : parseFloat(columns[5]),
            filter: columns[6] === '.' ? [] : columns[6].split(';'),
            info: this.parseInfo(columns[7]),
            samples: {}
        };

        if (columns.length > 8 && columns[8] !== '.') {
            record.format = columns[8].split(':');
        }

        if (columns.length > 9 && this.header?.samples && record.format) {
            for (let i = 0; i < this.header.samples.length; i++) {
                const sampleName = this.header.samples[i];
                const sampleData = columns[9 + i];
                record.samples[sampleName] = this.parseSampleData(record.format, sampleData);
            }
        }

        return record;
    }

    private parseInfo(infoStr: string): Record<string, any> {
        if (infoStr === '.') return {};

        const info: Record<string, any> = {};
        const pairs = infoStr.split(';');

        for (const pair of pairs) {
            if (pair.includes('=')) {
                const [key, value] = pair.split('=', 2);
                info[key] = this.parseInfoValue(key, value);
            } else {
                info[pair] = true;
            }
        }

        return info;
    }

    private parseInfoValue(key: string, value: string): any {
        const infoField = this.header?.info.get(key);
        if (!infoField) return value;

        if (infoField.number === '0') return true;
        if (value === '.') return null;

        const values = value.split(',');
        
        switch (infoField.type) {
            case 'Integer':
                return values.length === 1 ? parseInt(values[0]) : values.map(v => parseInt(v));
            case 'Float':
                return values.length === 1 ? parseFloat(values[0]) : values.map(v => parseFloat(v));
            case 'Flag':
                return true;
            case 'String':
            default:
                return values.length === 1 ? values[0] : values;
        }
    }

    private parseSampleData(format: string[], sampleData: string): Record<string, any> {
        if (sampleData === '.' || sampleData === './.') {
            return {};
        }

        const values = sampleData.split(':');
        const result: Record<string, any> = {};

        for (let i = 0; i < format.length && i < values.length; i++) {
            const field = format[i];
            const value = values[i];
            
            if (value === '.') {
                result[field] = null;
            } else {
                result[field] = this.parseFormatValue(field, value);
            }
        }

        return result;
    }

    private parseFormatValue(field: string, value: string): any {
        const formatField = this.header?.format.get(field);
        if (!formatField) return value;

        if (value === '.') return null;

        const values = value.split(',');

        switch (formatField.type) {
            case 'Integer':
                return values.length === 1 ? parseInt(values[0]) : values.map(v => parseInt(v));
            case 'Float':
                return values.length === 1 ? parseFloat(values[0]) : values.map(v => parseFloat(v));
            case 'String':
            default:
                return values.length === 1 ? values[0] : values;
        }
    }

    getHeader(): VCFHeader | null {
        return this.header;
    }

    getRecordCount(): number {
        return this.recordCount;
    }
}