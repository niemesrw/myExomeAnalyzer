#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { VCFImporter } from '../parser/vcf-importer.js';
import { VCFAnalysisProgress } from '../utils/progress.js';
import { VCFMCPServer } from '../mcp-server/server.js';
import { config } from '../config/index.js';
import path from 'path';
import { existsSync } from 'fs';

const program = new Command();

program
    .name('myexome')
    .description('VCF file analyzer with LLM query capabilities')
    .version('1.0.0');

// Import command
program
    .command('import')
    .description('Import VCF file into the database')
    .argument('<file>', 'VCF file path (.vcf or .vcf.gz)')
    .option('-t, --threads <number>', 'Number of worker threads', config.workers.maxThreads.toString())
    .option('-b, --batch-size <number>', 'Batch size for database operations', config.analysis.batchSize.toString())
    .option('--reference <genome>', 'Reference genome (GRCh38 or GRCh37)', 'GRCh38')
    .action(async (file: string, options) => {
        try {
            console.log(chalk.blue('🧬 Starting VCF import...'));
            
            // Validate file exists
            if (!existsSync(file)) {
                throw new Error(`File not found: ${file}`);
            }

            // TileDB will be checked during initialization

            const threads = parseInt(options.threads);
            const batchSize = parseInt(options.batchSize);
            
            console.log(chalk.gray(`📁 File: ${file}`));
            console.log(chalk.gray(`🔄 Threads: ${threads}`));
            console.log(chalk.gray(`📦 Batch size: ${batchSize}`));

            // Initialize progress tracking
            const progress = new VCFAnalysisProgress(path.basename(file));

            // Create importer
            const importer = new VCFImporter(batchSize);

            // Set up event handlers
            importer.on('start', () => {
                console.log(chalk.green('📊 Starting analysis...'));
            });

            importer.on('header', (header) => {
                console.log(chalk.blue(`👥 Found ${header.samples.length} samples`));
                console.log(chalk.gray(`📋 Format: ${header.version}`));
            });

            importer.on('progress', (progressData) => {
                progress.updateProgress(progressData.processedRecords, {
                    chrom: progressData.currentChrom,
                    pos: progressData.currentPos,
                    rate: `${Math.round(progressData.rate)}/s`
                });
            });

            importer.on('complete', (stats) => {
                progress.complete();
                console.log(chalk.green(`✅ Import complete!`));
                console.log(chalk.gray(`📊 Total records: ${stats.totalRecords}`));
                console.log(chalk.gray(`⏱️  Time: ${Math.round(stats.elapsedTime / 1000)}s`));
            });

            importer.on('error', (error) => {
                progress.error(error.message);
                console.error(chalk.red('❌ Import failed:'), error.message);
                process.exit(1);
            });

            // Start import
            await importer.importFile(file);

        } catch (error) {
            console.error(chalk.red('❌ Error:'), error instanceof Error ? error.message : String(error));
            process.exit(1);
        }
    });

// Stats command
program
    .command('stats')
    .description('Show TileDB array statistics')
    .action(async () => {
        try {
            console.log(chalk.blue('📊 TileDB Array Statistics'));
            console.log('─'.repeat(50));

            const { queryEngine } = await import('../tiledb/query-engine.js');
            const stats = await queryEngine.getArrayStats();
            
            console.log(chalk.green(`Total variants: ${stats.totalVariants.toLocaleString()}`));
            console.log(chalk.green(`Chromosomes: ${stats.chromosomes.join(', ')}`));
            console.log(chalk.green(`Position range: ${stats.positionRange[0].toLocaleString()} - ${stats.positionRange[1].toLocaleString()}`));
            console.log(chalk.green(`Sample count: ${stats.sampleCount}`));
            console.log(chalk.green(`Array size: ${stats.arraySize}`));

        } catch (error) {
            console.error(chalk.red('❌ Error:'), error instanceof Error ? error.message : String(error));
            process.exit(1);
        }
    });

// Query command
program
    .command('query')
    .description('Query variants from TileDB arrays')
    .option('-c, --chrom <chromosome>', 'Chromosome')
    .option('-s, --start <position>', 'Start position')
    .option('-e, --end <position>', 'End position')
    .option('-r, --ref <sequence>', 'Reference allele')
    .option('-a, --alt <sequence>', 'Alternate allele')
    .option('-q, --min-qual <score>', 'Minimum quality score')
    .option('-l, --limit <number>', 'Maximum results', '100')
    .action(async (options) => {
        try {
            const { queryEngine } = await import('../tiledb/query-engine.js');
            
            const query = {
                chrom: options.chrom,
                start: options.start ? parseInt(options.start) : undefined,
                end: options.end ? parseInt(options.end) : undefined,
                ref: options.ref,
                alt: options.alt,
                minQual: options.minQual ? parseFloat(options.minQual) : undefined,
                limit: parseInt(options.limit)
            };

            const results = await queryEngine.queryVariants(query);

            console.log(chalk.blue(`📊 Found ${results.length} variants`));
            console.log('─'.repeat(80));

            for (const variant of results) {
                console.log(chalk.green(`${variant.chrom}:${variant.pos} ${variant.ref}→${variant.alt.join(',')}`));
                console.log(chalk.gray(`  Quality: ${variant.qual || 'N/A'} | Filter: ${variant.filter.join(';') || 'N/A'}`));
                console.log(chalk.gray(`  Samples: ${Object.keys(variant.samples).length}`));
                console.log();
            }

        } catch (error) {
            console.error(chalk.red('❌ Error:'), error instanceof Error ? error.message : String(error));
            process.exit(1);
        }
    });

// MCP Server command
program
    .command('mcp-server')
    .description('Start MCP server for LLM integration')
    .action(async () => {
        try {
            console.log(chalk.blue('🤖 Starting MCP Server...'));
            
            // TileDB workspace will be checked during server initialization

            const server = new VCFMCPServer();
            await server.start();
            
        } catch (error) {
            console.error(chalk.red('❌ Error starting MCP server:'), error instanceof Error ? error.message : String(error));
            process.exit(1);
        }
    });

// TileDB management commands
const tiledbCommand = program
    .command('tiledb')
    .description('TileDB array management commands');

tiledbCommand
    .command('init')
    .description('Initialize TileDB workspace and arrays')
    .action(async () => {
        try {
            console.log(chalk.blue('🔧 Initializing TileDB workspace...'));
            
            const { arrayManager } = await import('../tiledb/array-manager.js');
            
            console.log(chalk.gray('Creating variants array...'));
            const variantsPath = await arrayManager.createVariantsArray();
            console.log(chalk.green(`✅ Created variants array: ${variantsPath}`));
            
            console.log(chalk.gray('Creating samples array...'));
            const samplesPath = await arrayManager.createSamplesArray();
            console.log(chalk.green(`✅ Created samples array: ${samplesPath}`));
            
            console.log(chalk.green('🎉 TileDB workspace initialized!'));
            
        } catch (error) {
            console.error(chalk.red('❌ Error:'), error instanceof Error ? error.message : String(error));
            process.exit(1);
        }
    });

tiledbCommand
    .command('list')
    .description('List TileDB arrays in workspace')
    .action(async () => {
        try {
            console.log(chalk.blue('📋 TileDB Arrays'));
            console.log('─'.repeat(30));
            
            const { arrayManager } = await import('../tiledb/array-manager.js');
            const arrays = await arrayManager.listArrays();
            
            if (arrays.length === 0) {
                console.log(chalk.yellow('No arrays found. Run "tiledb init" to create arrays.'));
                return;
            }
            
            for (const arrayName of arrays) {
                const info = await arrayManager.getArrayInfo(arrayName);
                if (info) {
                    console.log(chalk.green(`📊 ${arrayName}`));
                    console.log(chalk.gray(`   Path: ${info.path}`));
                    console.log(chalk.gray(`   Dimensions: ${info.schema.dimensions.length}`));
                    console.log(chalk.gray(`   Attributes: ${info.schema.attributes.length}`));
                }
            }
            
        } catch (error) {
            console.error(chalk.red('❌ Error:'), error instanceof Error ? error.message : String(error));
            process.exit(1);
        }
    });

// Setup command for first-time users
program
    .command('setup')
    .description('Setup the VCF analyzer environment')
    .action(async () => {
        console.log(chalk.blue('🚀 Setting up VCF Analyzer...'));
        console.log();
        
        console.log(chalk.yellow('1. Install TileDB-VCF...'));
        console.log(chalk.gray('   Run: conda install -c conda-forge tiledb-vcf'));
        console.log();
        
        console.log(chalk.yellow('2. Copy environment file...'));
        console.log(chalk.gray('   Run: cp .env.example .env'));
        console.log();
        
        console.log(chalk.yellow('3. Install dependencies...'));
        console.log(chalk.gray('   Run: npm install'));
        console.log();
        
        console.log(chalk.yellow('4. Create TileDB workspace...'));
        console.log(chalk.gray('   This will be done automatically on first import'));
        console.log();
        
        console.log(chalk.green('🎉 Ready to import VCF files!'));
        console.log(chalk.gray('   Example: npm run analyze import sample.vcf.gz'));
    });

// Error handling
program.configureOutput({
    outputError: (str, write) => write(chalk.red(str))
});

program.parse();

// Handle uncaught errors
process.on('uncaughtException', (error) => {
    console.error(chalk.red('💥 Uncaught Exception:'), error.message);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error(chalk.red('💥 Unhandled Rejection at:'), promise, chalk.red('reason:'), reason);
    process.exit(1);
});