import cliProgress from 'cli-progress';
import chalk from 'chalk';
import { EventEmitter } from 'events';

export interface ProgressConfig {
    title: string;
    total?: number;
    showEta: boolean;
    showRate: boolean;
    showPercentage: boolean;
    format?: string;
}

export interface ProgressUpdate {
    current: number;
    total?: number;
    message?: string;
    details?: Record<string, any>;
}

export class ProgressTracker extends EventEmitter {
    private bars: Map<string, cliProgress.SingleBar> = new Map();
    private multiBar: cliProgress.MultiBar;
    private stats: Map<string, any> = new Map();

    constructor() {
        super();
        this.multiBar = new cliProgress.MultiBar({
            clearOnComplete: false,
            hideCursor: true,
            format: ' {bar} | {percentage}% | {value}/{total} | Rate: {rate} | ETA: {eta}s | {status}',
            barCompleteChar: '\u2588',
            barIncompleteChar: '\u2591',
        }, cliProgress.Presets.shades_grey);
    }

    createProgressBar(id: string, config: ProgressConfig): void {
        const format = config.format || this.buildFormat(config);
        
        const bar = this.multiBar.create(config.total || 100, 0, {
            status: config.title,
            rate: '0/s',
            eta: '∞'
        }, {
            format: format
        });

        this.bars.set(id, bar);
        this.stats.set(id, {
            startTime: Date.now(),
            lastUpdate: Date.now(),
            lastValue: 0,
            rate: 0,
            title: config.title
        });
    }

    private buildFormat(config: ProgressConfig): string {
        let format = ` ${chalk.cyan('{status}')} {bar}`;
        
        if (config.showPercentage) {
            format += ' | {percentage}%';
        }
        
        format += ' | {value}/{total}';
        
        if (config.showRate) {
            format += ' | Rate: {rate}';
        }
        
        if (config.showEta) {
            format += ' | ETA: {eta}s';
        }

        return format;
    }

    updateProgress(id: string, update: ProgressUpdate): void {
        const bar = this.bars.get(id);
        const stats = this.stats.get(id);
        
        if (!bar || !stats) {
            throw new Error(`Progress bar '${id}' not found`);
        }

        const now = Date.now();
        const timeDiff = (now - stats.lastUpdate) / 1000;
        const valueDiff = update.current - stats.lastValue;
        
        // Calculate rate
        if (timeDiff > 0) {
            stats.rate = valueDiff / timeDiff;
            stats.lastUpdate = now;
            stats.lastValue = update.current;
        }

        // Update total if provided
        if (update.total) {
            bar.setTotal(update.total);
        }

        // Calculate ETA
        const remaining = bar.getTotal() - update.current;
        const eta = stats.rate > 0 ? Math.ceil(remaining / stats.rate) : '∞';

        // Update bar
        bar.update(update.current, {
            status: update.message || stats.title,
            rate: `${Math.round(stats.rate)}/s`,
            eta: eta,
            ...update.details
        });

        this.emit('update', { id, ...update, rate: stats.rate, eta });
    }

    completeProgress(id: string, message?: string): void {
        const bar = this.bars.get(id);
        const stats = this.stats.get(id);
        
        if (!bar || !stats) return;

        const elapsed = (Date.now() - stats.startTime) / 1000;
        const total = bar.getTotal();
        
        bar.update(total, {
            status: message || `${stats.title} - Complete!`,
            rate: `${Math.round(total / elapsed)}/s`,
            eta: '0'
        });

        this.emit('complete', { 
            id, 
            elapsed, 
            total, 
            averageRate: total / elapsed 
        });
    }

    failProgress(id: string, error: string): void {
        const bar = this.bars.get(id);
        const stats = this.stats.get(id);
        
        if (!bar || !stats) return;

        bar.update((bar as any).value || 0, {
            status: chalk.red(`${stats.title} - Failed: ${error}`),
            rate: '0/s',
            eta: '∞'
        });

        this.emit('error', { id, error });
    }

    removeProgress(id: string): void {
        const bar = this.bars.get(id);
        if (bar) {
            this.multiBar.remove(bar);
            this.bars.delete(id);
            this.stats.delete(id);
        }
    }

    stop(): void {
        this.multiBar.stop();
    }

    getStats(id: string): any {
        return this.stats.get(id);
    }

    getAllStats(): Record<string, any> {
        const result: Record<string, any> = {};
        for (const [id, stats] of this.stats.entries()) {
            result[id] = stats;
        }
        return result;
    }
}

// Singleton instance for global use
export const globalProgress = new ProgressTracker();

// Utility functions for common progress patterns

export function createVCFImportProgress(filePath: string): string {
    const id = `vcf-import-${Date.now()}`;
    globalProgress.createProgressBar(id, {
        title: `Importing ${filePath}`,
        showEta: true,
        showRate: true,
        showPercentage: true
    });
    return id;
}

export function createWorkerProgress(workerId: number, task: string): string {
    const id = `worker-${workerId}-${Date.now()}`;
    globalProgress.createProgressBar(id, {
        title: `Worker ${workerId}: ${task}`,
        showEta: true,
        showRate: true,
        showPercentage: false
    });
    return id;
}

export function createDatabaseProgress(operation: string): string {
    const id = `db-${operation}-${Date.now()}`;
    globalProgress.createProgressBar(id, {
        title: `Database: ${operation}`,
        showEta: true,
        showRate: true,
        showPercentage: true
    });
    return id;
}

// Enhanced progress for complex operations
export class VCFAnalysisProgress {
    private tracker: ProgressTracker;
    private mainProgressId: string;
    private workerProgresses: Map<number, string> = new Map();
    private totalRecords = 0;
    private processedRecords = 0;

    constructor(filePath: string) {
        this.tracker = new ProgressTracker();
        this.mainProgressId = `vcf-analysis-${Date.now()}`;
        
        this.tracker.createProgressBar(this.mainProgressId, {
            title: chalk.blue(`📊 Analyzing ${filePath}`),
            showEta: true,
            showRate: true,
            showPercentage: true,
            format: ` ${chalk.blue('{status}')} {bar} | {percentage}% | {value}/{total} Records | {rate} | ETA: {eta}s | ${chalk.green('{workers}')} workers`
        });
    }

    setTotal(total: number): void {
        this.totalRecords = total;
        this.tracker.updateProgress(this.mainProgressId, {
            current: this.processedRecords,
            total: total
        });
    }

    updateProgress(processed: number, details?: Record<string, any>): void {
        this.processedRecords = processed;
        this.tracker.updateProgress(this.mainProgressId, {
            current: processed,
            total: this.totalRecords,
            details: {
                workers: `${this.workerProgresses.size} active`,
                ...details
            }
        });
    }

    addWorkerProgress(workerId: number, task: string): void {
        const progressId = `worker-${workerId}-${Date.now()}`;
        this.tracker.createProgressBar(progressId, {
            title: chalk.yellow(`Worker ${workerId}: ${task}`),
            showEta: false,
            showRate: true,
            showPercentage: false,
            format: ` ${chalk.yellow('⚡ Worker {workerId}')} {bar} | {value} records | {rate} | {chrom}:{pos}`
        });
        this.workerProgresses.set(workerId, progressId);
    }

    updateWorkerProgress(workerId: number, processed: number, chrom?: string, pos?: number): void {
        const progressId = this.workerProgresses.get(workerId);
        if (progressId) {
            this.tracker.updateProgress(progressId, {
                current: processed,
                details: {
                    workerId,
                    chrom: chrom || 'unknown',
                    pos: pos || 0
                }
            });
        }
    }

    removeWorkerProgress(workerId: number): void {
        const progressId = this.workerProgresses.get(workerId);
        if (progressId) {
            this.tracker.removeProgress(progressId);
            this.workerProgresses.delete(workerId);
        }
    }

    complete(message?: string): void {
        // Complete all worker progresses
        for (const [workerId, progressId] of this.workerProgresses.entries()) {
            this.tracker.completeProgress(progressId, `Worker ${workerId} completed`);
        }

        // Complete main progress
        this.tracker.completeProgress(
            this.mainProgressId, 
            message || chalk.green(`✅ Analysis complete! Processed ${this.processedRecords} records`)
        );
    }

    error(error: string): void {
        this.tracker.failProgress(this.mainProgressId, error);
    }

    stop(): void {
        this.tracker.stop();
    }
}