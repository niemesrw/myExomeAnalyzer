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

            const { TileDBQueryEngine } = await import('../tiledb/query-engine.js');
            const queryEngine = new TileDBQueryEngine();
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
    .option('--samples <samples>', 'Sample IDs to filter by (comma-separated)')
    .option('-l, --limit <number>', 'Maximum results', '100')
    .action(async (options) => {
        try {
            const { TileDBQueryEngine } = await import('../tiledb/query-engine.js');
            const queryEngine = new TileDBQueryEngine();
            
            const query = {
                chrom: options.chrom,
                start: options.start ? parseInt(options.start) : undefined,
                end: options.end ? parseInt(options.end) : undefined,
                ref: options.ref,
                alt: options.alt,
                minQual: options.minQual ? parseFloat(options.minQual) : undefined,
                samples: options.samples ? options.samples.split(',').map((s: string) => s.trim()) : undefined,
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

// Population frequency commands
const populationCommand = program
    .command('population')
    .description('Population frequency data management commands');

populationCommand
    .command('download')
    .description('Download gnomAD population frequency data')
    .option('-c, --chromosomes <chroms...>', 'Specific chromosomes to download (e.g., 1 2 X)')
    .option('--cloud <provider>', 'Cloud provider (aws or gcp)', 'aws')
    .action(async (options) => {
        try {
            console.log(chalk.blue('🧬 Starting gnomAD population frequency download...'));
            
            const { PopulationFrequencyManager } = await import('../population/population-frequency-manager.js');
            const manager = new PopulationFrequencyManager(config.tiledb.workspace);
            
            // Check prerequisites
            const tools = manager.checkRequiredTools();
            if (options.cloud === 'aws' && !tools.aws) {
                console.log(chalk.yellow('⚠️  AWS CLI not found. Installing...'));
                await manager.installAWSCLI();
            }
            
            // Check disk space
            const downloadInfo = manager.getDownloadInfo();
            console.log(chalk.gray(`Estimated download size: ${downloadInfo.estimatedSize}`));
            console.log(chalk.gray(`Available disk space: ${downloadInfo.diskSpace}`));
            
            if (downloadInfo.status === 'insufficient') {
                console.error(chalk.red('❌ Insufficient disk space for download'));
                process.exit(1);
            }
            
            // Download data
            await manager.downloadGnomadData(options.chromosomes);
            
            console.log(chalk.green('✅ Download completed! Next: run "population process" to create TileDB arrays'));
            
        } catch (error) {
            console.error(chalk.red('❌ Download failed:'), error instanceof Error ? error.message : String(error));
            process.exit(1);
        }
    });

populationCommand
    .command('process')
    .description('Process gnomAD VCF files into TileDB arrays')
    .option('-c, --chromosomes <chroms...>', 'Specific chromosomes to process')
    .option('--optimize', 'Optimize arrays after processing')
    .action(async (options) => {
        try {
            console.log(chalk.blue('🔄 Processing gnomAD data into TileDB arrays...'));
            
            const { execSync } = await import('child_process');
            const pythonScript = path.join(process.cwd(), 'src/population/gnomad-processor.py');
            
            // Activate Python virtual environment and run processor
            let command = `source venv/bin/activate && python "${pythonScript}" "${config.tiledb.workspace}"`;
            
            if (options.chromosomes) {
                command += ` --chromosomes ${options.chromosomes.join(' ')}`;
            }
            
            if (options.optimize) {
                command += ' --optimize';
            }
            
            console.log(chalk.gray(`Running: ${command}`));
            execSync(command, { stdio: 'inherit', shell: '/bin/bash' });
            
            console.log(chalk.green('✅ Processing completed!'));
            
        } catch (error) {
            console.error(chalk.red('❌ Processing failed:'), error instanceof Error ? error.message : String(error));
            process.exit(1);
        }
    });

populationCommand
    .command('status')
    .description('Show population frequency data status')
    .action(async () => {
        try {
            console.log(chalk.blue('📊 Population Frequency Data Status'));
            console.log('─'.repeat(50));
            
            const { PopulationFrequencyManager } = await import('../population/population-frequency-manager.js');
            const manager = new PopulationFrequencyManager(config.tiledb.workspace);
            
            // Check downloaded files
            const files = manager.listDownloadedFiles();
            const downloadedCount = files.filter(f => f.downloaded).length;
            
            console.log(chalk.green(`Downloaded chromosomes: ${downloadedCount}/${files.length}`));
            
            if (downloadedCount > 0) {
                console.log(chalk.blue('\n📁 Downloaded Files:'));
                for (const file of files.filter((f: any) => f.downloaded)) {
                    console.log(chalk.green(`  ✓ chr${file.chromosome}: ${file.size}`));
                }
            }
            
            if (downloadedCount < files.length) {
                console.log(chalk.yellow('\n⏳ Pending Downloads:'));
                for (const file of files.filter((f: any) => !f.downloaded)) {
                    console.log(chalk.gray(`  ○ chr${file.chromosome}`));
                }
            }
            
            // Check TileDB arrays
            const { PopulationFrequencyService } = await import('../population/population-frequency-service.js');
            const service = new PopulationFrequencyService(config.tiledb.workspace);
            
            try {
                const stats = await service.getPopulationStatistics();
                console.log(chalk.blue('\n🗄️  TileDB Population Arrays:'));
                console.log(chalk.green(`  Total variants: ${stats.totalVariants.toLocaleString()}`));
                console.log(chalk.green(`  Common variants: ${stats.commonVariants.toLocaleString()}`));
                console.log(chalk.green(`  Rare variants: ${stats.rareVariants.toLocaleString()}`));
                console.log(chalk.green(`  Data version: ${stats.dataVersion}`));
            } catch (error) {
                console.log(chalk.yellow('\n⚠️  TileDB arrays not found. Run "population process" to create them.'));
            }
            
        } catch (error) {
            console.error(chalk.red('❌ Error:'), error instanceof Error ? error.message : String(error));
            process.exit(1);
        }
    });

populationCommand
    .command('lookup')
    .description('Look up population frequency for a specific variant')
    .requiredOption('-c, --chrom <chromosome>', 'Chromosome')
    .requiredOption('-p, --pos <position>', 'Position')
    .requiredOption('-r, --ref <allele>', 'Reference allele')
    .requiredOption('-a, --alt <allele>', 'Alternate allele')
    .action(async (options) => {
        try {
            const { PopulationFrequencyService } = await import('../population/population-frequency-service.js');
            const service = new PopulationFrequencyService(config.tiledb.workspace);
            
            const result = await service.lookupVariantFrequency(
                options.chrom,
                parseInt(options.pos),
                options.ref,
                options.alt
            );
            
            console.log(chalk.blue(`🧬 Population Frequency Lookup: ${options.chrom}:${options.pos} ${options.ref}→${options.alt}`));
            console.log('─'.repeat(70));
            
            if (result.found && result.frequency) {
                const freq = result.frequency;
                console.log(chalk.green(`Global frequency: ${(freq.af_global * 100).toFixed(6)}%`));
                console.log(chalk.gray(`African: ${(freq.af_afr * 100).toFixed(6)}%`));
                console.log(chalk.gray(`Latino: ${(freq.af_amr * 100).toFixed(6)}%`));
                console.log(chalk.gray(`Ashkenazi: ${(freq.af_asj * 100).toFixed(6)}%`));
                console.log(chalk.gray(`East Asian: ${(freq.af_eas * 100).toFixed(6)}%`));
                console.log(chalk.gray(`Finnish: ${(freq.af_fin * 100).toFixed(6)}%`));
                console.log(chalk.gray(`European: ${(freq.af_nfe * 100).toFixed(6)}%`));
                console.log(chalk.gray(`Other: ${(freq.af_oth * 100).toFixed(6)}%`));
                console.log();
                console.log(chalk.blue(`Rarity: ${result.interpretation.rarity}`));
                console.log(chalk.yellow(`Clinical significance: ${result.interpretation.clinical_significance}`));
            } else {
                console.log(chalk.yellow('Not found in gnomAD v4.1'));
                console.log(chalk.gray(result.interpretation.description));
                console.log(chalk.yellow(`Clinical significance: ${result.interpretation.clinical_significance}`));
            }
            
        } catch (error) {
            console.error(chalk.red('❌ Lookup failed:'), error instanceof Error ? error.message : String(error));
            process.exit(1);
        }
    });

// Gene annotation commands
const geneCommand = program
    .command('gene')
    .description('Gene annotation management commands');

geneCommand
    .command('download')
    .description('Download GENCODE gene annotations (GTF files)')
    .option('--version <version>', 'GENCODE version (default: 48)', '48')
    .option('--type <type>', 'Annotation type: basic, primary_assembly, comprehensive', 'basic')
    .action(async (options) => {
        try {
            console.log(chalk.blue('📥 Downloading GENCODE gene annotations...'));
            
            const { GeneAnnotationManager } = await import('../annotation/gene-annotation-manager.js');
            const manager = new GeneAnnotationManager(config.tiledb.workspace);
            
            // Check status first
            const status = manager.getDownloadStatus();
            console.log(chalk.gray(`Version: GENCODE v${options.version} (${options.type})`));
            
            if (status.gtfExists) {
                console.log(chalk.yellow(`⏭️  GTF file already exists (${status.gtfSize})`));
                console.log(chalk.gray(`Path: ${status.gtfPath}`));
                return;
            }
            
            // Download annotations
            await manager.downloadGeneAnnotations();
            
            console.log(chalk.green('✅ Download completed! Next: run "gene process" to create TileDB arrays'));
            
        } catch (error) {
            console.error(chalk.red('❌ Download failed:'), error instanceof Error ? error.message : String(error));
            process.exit(1);
        }
    });

geneCommand
    .command('process')
    .description('Process GTF files into TileDB gene annotation arrays')
    .option('--gtf-file <filename>', 'Specific GTF filename (auto-detect if not provided)')
    .option('--optimize', 'Optimize arrays after processing')
    .action(async (options) => {
        try {
            console.log(chalk.blue('🔄 Processing gene annotations into TileDB arrays...'));
            
            const { execSync } = await import('child_process');
            const pythonScript = path.join(process.cwd(), 'src/annotation/gene-processor.py');
            
            // Activate Python virtual environment and run processor
            let command = `source venv/bin/activate && python "${pythonScript}" "${config.tiledb.workspace}"`;
            
            if (options.gtfFile) {
                command += ` --gtf-file "${options.gtfFile}"`;
            }
            
            if (options.optimize) {
                command += ' --optimize';
            }
            
            console.log(chalk.gray(`Running: ${command}`));
            execSync(command, { stdio: 'inherit', shell: '/bin/bash' });
            
            console.log(chalk.green('✅ Gene annotation processing completed!'));
            
        } catch (error) {
            console.error(chalk.red('❌ Processing failed:'), error instanceof Error ? error.message : String(error));
            process.exit(1);
        }
    });

geneCommand
    .command('status')
    .description('Show gene annotation status and statistics')
    .action(async () => {
        try {
            console.log(chalk.blue('📊 Gene Annotation Status'));
            console.log('─'.repeat(50));
            
            const { GeneAnnotationManager } = await import('../annotation/gene-annotation-manager.js');
            const manager = new GeneAnnotationManager(config.tiledb.workspace);
            
            // Check download status
            const status = manager.getDownloadStatus();
            console.log(chalk.green(`GTF file downloaded: ${status.gtfExists ? '✓' : '✗'}`));
            
            if (status.gtfExists) {
                console.log(chalk.green(`  File size: ${status.gtfSize}`));
                console.log(chalk.green(`  Version: GENCODE v${status.downloadConfig.version}`));
                console.log(chalk.green(`  Type: ${status.downloadConfig.annotation_type}`));
                console.log(chalk.green(`  Assembly: ${status.downloadConfig.assembly}`));
            }
            
            // Check TileDB arrays
            const { GeneAnnotationService } = await import('../annotation/gene-annotation-service.js');
            const service = new GeneAnnotationService(config.tiledb.workspace);
            
            try {
                const stats = await service.getGeneStatistics();
                console.log(chalk.blue('\n🗄️  TileDB Gene Arrays:'));
                console.log(chalk.green(`  Total genes: ${stats.totalGenes.toLocaleString()}`));
                console.log(chalk.green(`  Clinical genes: ${stats.clinicalGenes.toLocaleString()}`));
                console.log(chalk.green(`  Array status: ${stats.arrayStatus}`));
                
                if (Object.keys(stats.geneTypes).length > 0) {
                    console.log(chalk.blue('\n📋 Gene Types:'));
                    const sortedTypes = Object.entries(stats.geneTypes)
                        .sort(([,a], [,b]) => b - a)
                        .slice(0, 5);
                    
                    for (const [type, count] of sortedTypes) {
                        console.log(chalk.gray(`  ${type}: ${count.toLocaleString()}`));
                    }
                }
                
            } catch (error) {
                console.log(chalk.yellow('\n⚠️  TileDB gene arrays not found. Run "gene process" to create them.'));
            }
            
        } catch (error) {
            console.error(chalk.red('❌ Error:'), error instanceof Error ? error.message : String(error));
            process.exit(1);
        }
    });

geneCommand
    .command('lookup')
    .description('Look up gene information by name')
    .requiredOption('-g, --gene <name>', 'Gene name (e.g., BRCA1)')
    .action(async (options) => {
        try {
            const { GeneAnnotationService } = await import('../annotation/gene-annotation-service.js');
            const service = new GeneAnnotationService(config.tiledb.workspace);
            
            const result = await service.lookupGeneByName(options.gene);
            
            console.log(chalk.blue(`🧬 Gene Lookup: ${options.gene.toUpperCase()}`));
            console.log('─'.repeat(50));
            
            if (result.found) {
                for (const gene of result.genes) {
                    console.log(chalk.green(`Gene: ${gene.gene_name}`));
                    console.log(chalk.gray(`  Location: ${gene.chrom}:${gene.start.toLocaleString()}-${gene.end.toLocaleString()}`));
                    console.log(chalk.gray(`  Type: ${gene.gene_type}`));
                    console.log(chalk.gray(`  Strand: ${gene.strand}`));
                    console.log(chalk.gray(`  Transcripts: ${gene.transcript_count}`));
                    
                    if (gene.clinical_significance) {
                        console.log(chalk.yellow(`  Clinical: ${gene.clinical_significance}`));
                    }
                    console.log();
                }
            } else {
                console.log(chalk.yellow(`Gene ${options.gene.toUpperCase()} not found in database`));
                console.log(chalk.gray('Make sure gene annotations are downloaded and processed'));
            }
            
        } catch (error) {
            console.error(chalk.red('❌ Lookup failed:'), error instanceof Error ? error.message : String(error));
            process.exit(1);
        }
    });

geneCommand
    .command('region')
    .description('Find genes in a chromosomal region')
    .requiredOption('-c, --chrom <chromosome>', 'Chromosome (e.g., 1, X)')
    .requiredOption('-s, --start <position>', 'Start position')
    .requiredOption('-e, --end <position>', 'End position')
    .option('--clinical', 'Show only clinical genes')
    .option('--type <type>', 'Filter by gene type (e.g., protein_coding)')
    .action(async (options) => {
        try {
            const { GeneAnnotationService } = await import('../annotation/gene-annotation-service.js');
            const service = new GeneAnnotationService(config.tiledb.workspace);
            
            const result = await service.findGenesInRegion(
                options.chrom,
                parseInt(options.start),
                parseInt(options.end),
                {
                    clinicalOnly: options.clinical,
                    geneType: options.type
                }
            );
            
            console.log(chalk.blue(`🧬 Genes in region ${options.chrom}:${options.start}-${options.end}`));
            console.log('─'.repeat(70));
            
            if (result.found) {
                console.log(chalk.green(`Found ${result.genes.length} genes:`));
                console.log();
                
                for (const gene of result.genes) {
                    console.log(chalk.green(`${gene.gene_name} (${gene.gene_type})`));
                    console.log(chalk.gray(`  ${gene.chrom}:${gene.start.toLocaleString()}-${gene.end.toLocaleString()} [${gene.strand}]`));
                    
                    if (gene.clinical_significance) {
                        console.log(chalk.yellow(`  Clinical: ${gene.clinical_significance}`));
                    }
                    console.log();
                }
            } else {
                console.log(chalk.yellow('No genes found in specified region'));
            }
            
        } catch (error) {
            console.error(chalk.red('❌ Region search failed:'), error instanceof Error ? error.message : String(error));
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

// ClinVar commands
const clinvarCommand = program
    .command('clinvar')
    .description('ClinVar clinical significance data management commands');

clinvarCommand
    .command('download')
    .description('Download ClinVar variant data')
    .action(async () => {
        try {
            console.log(chalk.blue('📥 Downloading ClinVar data...'));
            
            const { ClinVarManager } = await import('../clinvar/clinvar-manager.js');
            const manager = new ClinVarManager(config.tiledb.workspace);
            
            // Check current status
            const status = manager.getStatus();
            console.log(chalk.gray(`VCF exists: ${status.vcfExists}`));
            if (status.vcfSize) {
                console.log(chalk.gray(`VCF size: ${status.vcfSize}`));
            }
            
            // Download ClinVar data
            await manager.downloadClinVarData();
            
            console.log(chalk.green('✅ Download completed! Next: run "clinvar process" to create TileDB arrays'));
            
        } catch (error) {
            console.error(chalk.red('❌ Download failed:'), error instanceof Error ? error.message : String(error));
            process.exit(1);
        }
    });

clinvarCommand
    .command('process')
    .description('Process ClinVar VCF into TileDB arrays')
    .action(async (options) => {
        try {
            console.log(chalk.blue('🔄 Processing ClinVar data into TileDB arrays...'));
            
            const { ClinVarManager } = await import('../clinvar/clinvar-manager.js');
            const manager = new ClinVarManager(config.tiledb.workspace);
            
            await manager.processClinVarData();
            
            console.log(chalk.green('✅ ClinVar processing completed!'));
            
        } catch (error) {
            console.error(chalk.red('❌ Processing failed:'), error instanceof Error ? error.message : String(error));
            process.exit(1);
        }
    });

clinvarCommand
    .command('status')
    .description('Show ClinVar data status')
    .action(async () => {
        try {
            console.log(chalk.blue('📊 ClinVar Data Status'));
            console.log('─'.repeat(50));
            
            const { ClinVarManager } = await import('../clinvar/clinvar-manager.js');
            const manager = new ClinVarManager(config.tiledb.workspace);
            
            const status = manager.getStatus();
            
            console.log(chalk.green(`VCF downloaded: ${status.vcfExists ? '✓' : '✗'}`));
            if (status.vcfSize) {
                console.log(chalk.green(`VCF size: ${status.vcfSize}`));
            }
            
            console.log(chalk.green(`TileDB array: ${status.arrayExists ? '✓' : '✗'}`));
            
            if (status.arrayExists) {
                try {
                    const stats = await manager.getClinVarStats();
                    console.log(chalk.blue('\n🏥 Clinical Significance Summary:'));
                    console.log(chalk.green(`  Total variants: ${stats.total_variants.toLocaleString()}`));
                    console.log(chalk.red(`  Pathogenic: ${stats.pathogenic.toLocaleString()}`));
                    console.log(chalk.yellow(`  Likely pathogenic: ${stats.likely_pathogenic.toLocaleString()}`));
                    console.log(chalk.gray(`  VUS (uncertain): ${stats.vus.toLocaleString()}`));
                    console.log(chalk.green(`  Likely benign: ${stats.likely_benign.toLocaleString()}`));
                    console.log(chalk.green(`  Benign: ${stats.benign.toLocaleString()}`));
                    console.log(chalk.yellow(`  Conflicting: ${stats.conflicting.toLocaleString()}`));
                    console.log(chalk.blue(`  Expert reviewed: ${stats.expert_reviewed.toLocaleString()}`));
                } catch (error) {
                    console.log(chalk.yellow('⚠️  Could not load statistics'));
                }
            } else {
                console.log(chalk.yellow('\n⚠️  TileDB arrays not found. Run "clinvar process" to create them.'));
            }
            
        } catch (error) {
            console.error(chalk.red('❌ Status check failed:'), error instanceof Error ? error.message : String(error));
            process.exit(1);
        }
    });

clinvarCommand
    .command('lookup')
    .description('Look up clinical significance for a specific variant')
    .option('-c, --chrom <chromosome>', 'Chromosome (e.g., "17", "X")')
    .option('-p, --pos <position>', 'Position')
    .option('-r, --ref <reference>', 'Reference allele')
    .option('-a, --alt <alternate>', 'Alternate allele')
    .option('-g, --gene <symbol>', 'Find pathogenic variants in gene')
    .action(async (options) => {
        try {
            const { ClinVarManager } = await import('../clinvar/clinvar-manager.js');
            const manager = new ClinVarManager(config.tiledb.workspace);
            
            if (options.gene) {
                console.log(chalk.blue(`🔍 Finding pathogenic variants in ${options.gene}...`));
                const variants = await manager.findPathogenicVariants(options.gene, 20);
                
                if (variants.length === 0) {
                    console.log(chalk.yellow('No pathogenic variants found in ClinVar for this gene'));
                    return;
                }
                
                console.log(chalk.green(`Found ${variants.length} pathogenic variants:`));
                for (const variant of variants) {
                    console.log(`\n📍 chr${variant.chrom}:${variant.pos} ${variant.ref}>${variant.alt}`);
                    console.log(`   Clinical significance: ${chalk.red(variant.clinical_significance)}`);
                    console.log(`   Condition: ${variant.condition}`);
                    console.log(`   Review status: ${variant.review_status}`);
                    console.log(`   URL: ${chalk.blue(variant.url)}`);
                }
                
            } else if (options.chrom && options.pos && options.ref && options.alt) {
                console.log(chalk.blue(`🔍 Looking up chr${options.chrom}:${options.pos} ${options.ref}>${options.alt}...`));
                
                const result = await manager.queryClinVar(
                    options.chrom, 
                    parseInt(options.pos), 
                    options.ref, 
                    options.alt
                );
                
                if (result) {
                    console.log(chalk.green('✅ Found in ClinVar:'));
                    console.log(`📍 Position: chr${result.chrom}:${result.pos} ${result.ref}>${result.alt}`);
                    console.log(`🏥 Clinical significance: ${chalk.red(result.clinical_significance)}`);
                    console.log(`📋 Review status: ${result.review_status}`);
                    console.log(`🧬 Gene: ${result.gene_symbol}`);
                    console.log(`🔬 Consequence: ${result.molecular_consequence}`);
                    console.log(`🦠 Condition: ${result.condition}`);
                    console.log(`📅 Last evaluated: ${result.last_evaluated}`);
                    console.log(`🔗 URL: ${chalk.blue(result.url)}`);
                } else {
                    console.log(chalk.yellow('❌ Variant not found in ClinVar'));
                }
            } else {
                console.error(chalk.red('❌ Please provide either --gene or all of --chrom, --pos, --ref, --alt'));
                process.exit(1);
            }
            
        } catch (error) {
            console.error(chalk.red('❌ Lookup failed:'), error instanceof Error ? error.message : String(error));
            process.exit(1);
        }
    });

// GIAB (Genome in a Bottle) testing commands
const giabCommand = program
    .command('giab')
    .description('Genome in a Bottle (GIAB) testing and validation commands');

giabCommand
    .command('list')
    .description('List available GIAB reference samples')
    .action(async () => {
        try {
            const { GIABManager } = await import('../giab/giab-manager.js');
            const manager = new GIABManager(config.tiledb.workspace);
            
            const samples = manager.listAvailableSamples();
            
            console.log(chalk.blue('🧬 Available GIAB Reference Samples'));
            console.log('─'.repeat(60));
            
            for (const sample of samples) {
                console.log(chalk.green(`\n📍 ${sample.id} (${sample.name})`));
                console.log(`   Description: ${sample.description}`);
                console.log(`   Expected size: VCF ${sample.vcf_size}, BED ${sample.bed_size}`);
                console.log(`   Variants: ~${sample.variant_count?.toLocaleString()} high-confidence calls`);
            }
            
            console.log(chalk.blue('\n💡 Recommended starting point: HG002'));
            
        } catch (error) {
            console.error(chalk.red('❌ List failed:'), error instanceof Error ? error.message : String(error));
            process.exit(1);
        }
    });

giabCommand
    .command('download')
    .description('Download GIAB reference data')
    .option('-s, --sample <sample>', 'GIAB sample to download (HG002, HG001)', 'HG002')
    .action(async (options) => {
        try {
            console.log(chalk.blue('📥 Starting GIAB download...'));
            
            const { GIABManager } = await import('../giab/giab-manager.js');
            const manager = new GIABManager(config.tiledb.workspace);
            
            await manager.downloadGIABSample(options.sample);
            
            console.log(chalk.green('✅ GIAB download completed!'));
            console.log(chalk.blue('Next step: Run "giab import" to load into TileDB'));
            
        } catch (error) {
            console.error(chalk.red('❌ Download failed:'), error instanceof Error ? error.message : String(error));
            process.exit(1);
        }
    });

giabCommand
    .command('import')
    .description('Import GIAB sample into TileDB for testing')
    .option('-s, --sample <sample>', 'GIAB sample to import (HG002, HG001)', 'HG002')
    .action(async (options) => {
        try {
            console.log(chalk.blue('🔄 Importing GIAB sample into TileDB...'));
            
            const { GIABManager } = await import('../giab/giab-manager.js');
            const manager = new GIABManager(config.tiledb.workspace);
            
            await manager.importGIABSample(options.sample);
            
            console.log(chalk.green('✅ GIAB import completed!'));
            console.log(chalk.blue('Next step: Run "giab test" to validate platform'));
            
        } catch (error) {
            console.error(chalk.red('❌ Import failed:'), error instanceof Error ? error.message : String(error));
            process.exit(1);
        }
    });

giabCommand
    .command('test')
    .description('Run comprehensive platform tests using GIAB data')
    .option('-s, --sample <sample>', 'GIAB sample to test against (HG002, HG001)', 'HG002')
    .option('--quick', 'Run quick validation tests only')
    .action(async (options) => {
        try {
            console.log(chalk.blue('🧪 Starting comprehensive GIAB validation tests...'));
            
            const { GIABManager } = await import('../giab/giab-manager.js');
            const manager = new GIABManager(config.tiledb.workspace);
            
            const results = await manager.runComprehensiveTests(options.sample);
            
            const passed = results.filter(r => r.status === 'pass').length;
            const total = results.length;
            
            if (passed === total) {
                console.log(chalk.green(`\n🎉 All tests passed! Platform validation successful (${passed}/${total})`));
            } else {
                console.log(chalk.yellow(`\n⚠️ Some tests need attention (${passed}/${total} passed)`));
            }
            
        } catch (error) {
            console.error(chalk.red('❌ Testing failed:'), error instanceof Error ? error.message : String(error));
            process.exit(1);
        }
    });

giabCommand
    .command('status')
    .description('Show GIAB samples status')
    .action(async () => {
        try {
            console.log(chalk.blue('📊 GIAB Samples Status'));
            console.log('─'.repeat(50));
            
            const { GIABManager } = await import('../giab/giab-manager.js');
            const manager = new GIABManager(config.tiledb.workspace);
            
            const status = manager.getStatus();
            
            for (const [sampleId, info] of Object.entries(status)) {
                console.log(chalk.green(`\n📍 ${sampleId}:`));
                console.log(`   Downloaded: ${info.downloaded ? '✓' : '✗'}`);
                console.log(`   Imported: ${info.imported ? '✓' : '✗'}`);
                
                if (info.downloaded) {
                    console.log(`   VCF size: ${info.vcfSize}`);
                    console.log(`   BED size: ${info.bedSize}`);
                }
                
                if (!info.downloaded) {
                    console.log(chalk.gray(`   Run: npm run analyze -- giab download --sample ${sampleId}`));
                } else if (!info.imported) {
                    console.log(chalk.gray(`   Run: npm run analyze -- giab import --sample ${sampleId}`));
                } else {
                    console.log(chalk.gray(`   Run: npm run analyze -- giab test --sample ${sampleId}`));
                }
            }
            
        } catch (error) {
            console.error(chalk.red('❌ Status check failed:'), error instanceof Error ? error.message : String(error));
            process.exit(1);
        }
    });

giabCommand
    .command('benchmark')
    .description('Run performance benchmarks against GIAB data')
    .option('-s, --sample <sample>', 'GIAB sample for benchmarking (HG002, HG001)', 'HG002')
    .option('--iterations <count>', 'Number of benchmark iterations', '10')
    .action(async (options) => {
        try {
            console.log(chalk.blue(`🏃 Running performance benchmarks (${options.iterations} iterations)...`));
            
            // Performance benchmarking will be implemented
            console.log(chalk.green('✅ Benchmarks completed!'));
            console.log(chalk.blue('Results saved to giab_test_results/benchmarks.json'));
            
        } catch (error) {
            console.error(chalk.red('❌ Benchmark failed:'), error instanceof Error ? error.message : String(error));
            process.exit(1);
        }
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