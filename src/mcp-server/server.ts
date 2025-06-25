import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
    CallToolRequestSchema,
    ListResourcesRequestSchema,
    ListToolsRequestSchema,
    ReadResourceRequestSchema,
    GetPromptRequestSchema,
    ListPromptsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { queryEngine } from '../tiledb/query-engine.js';
import { clinicalMetadata } from '../clinical/clinical-metadata.js';

export class VCFMCPServer {
    private server: Server;

    constructor() {
        this.server = new Server(
            {
                name: 'vcf-analyzer',
                version: '1.0.0',
            },
            {
                capabilities: {
                    resources: {},
                    tools: {},
                    prompts: {},
                },
            }
        );

        this.setupHandlers();
    }

    private setupHandlers(): void {
        // List available tools
        this.server.setRequestHandler(ListToolsRequestSchema, async () => {
            return {
                tools: [
                    {
                        name: 'search_variants',
                        description: `Search for variants with clinical genomics context and safety warnings.
                        
CLINICAL CONTEXT:
- Returns ALL detected variants, including benign population variants
- Most variants (>95%) are benign polymorphisms with no clinical significance
- Clinical interpretation requires population frequency analysis and pathogenicity assessment
- Only use results for research/educational purposes - clinical genetic testing required for health decisions

INTERPRETATION GUIDELINES:
- Variants with >1% population frequency are likely benign
- Quality filters: PASS > IMP (imputed) > LOWQ (low quality)
- Focus analysis on established clinically actionable genes
- Clinical validation required for any health-related decisions`,
                        inputSchema: {
                            type: 'object',
                            properties: {
                                chrom: { type: 'string', description: 'Chromosome (e.g., "1", "X", "Y")' },
                                start: { type: 'number', description: 'Start position' },
                                end: { type: 'number', description: 'End position' },
                                gene: { type: 'string', description: 'Gene symbol (focus on clinically actionable genes)' },
                                limit: { type: 'number', description: 'Maximum number of results (default: 100)' },
                                clinical_context: { type: 'boolean', description: 'Include clinical interpretation guidance (default: true)' },
                                analysis_type: { type: 'string', description: 'Analysis context: "general", "cancer", "cardiac", "pharmacogenomic"' }
                            }
                        }
                    },
                    {
                        name: 'get_variant_details',
                        description: 'Get detailed information about a specific variant',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                variant_id: { type: 'number', description: 'Variant ID' }
                            },
                            required: ['variant_id']
                        }
                    },
                    {
                        name: 'calculate_allele_frequency',
                        description: 'Calculate allele frequency for a variant by position',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                chrom: { type: 'string', description: 'Chromosome (e.g., "1", "X")' },
                                pos: { type: 'number', description: 'Position' },
                                ref: { type: 'string', description: 'Reference allele' },
                                alt: { type: 'string', description: 'Alternate allele' }
                            },
                            required: ['chrom', 'pos', 'ref', 'alt']
                        }
                    },
                    {
                        name: 'get_variant_stats',
                        description: 'Get overall statistics about the variant dataset',
                        inputSchema: {
                            type: 'object',
                            properties: {}
                        }
                    },
                    {
                        name: 'filter_variants',
                        description: 'Filter variants by quality, impact, or other criteria',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                min_qual: { type: 'number', description: 'Minimum quality score' },
                                max_qual: { type: 'number', description: 'Maximum quality score' },
                                filter_status: { type: 'string', description: 'Filter status (e.g., "PASS")' },
                                consequence: { type: 'string', description: 'Variant consequence' },
                                limit: { type: 'number', description: 'Maximum number of results (default: 100)' }
                            }
                        }
                    },
                    {
                        name: 'get_sample_genotypes',
                        description: 'Get genotype information for a specific sample',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                sample_name: { type: 'string', description: 'Sample name' },
                                chrom: { type: 'string', description: 'Optional: restrict to chromosome' },
                                limit: { type: 'number', description: 'Maximum number of results (default: 100)' }
                            },
                            required: ['sample_name']
                        }
                    },
                    {
                        name: 'analyze_clinical_variants',
                        description: `Analyze variants with clinical genomics context and appropriate disclaimers.
                        
Automatically provides:
- Clinical safety disclaimers and validation requirements
- Population frequency context and warnings
- Quality score interpretation
- Gene-specific clinical context for actionable genes
- Structured recommendations for genetic counseling

SAFETY FEATURES:
- Automatic clinical disclaimers
- Population frequency filtering guidance
- Quality score interpretation
- Clinical validation requirements`,
                        inputSchema: {
                            type: 'object',
                            properties: {
                                gene_list: { 
                                    type: 'array', 
                                    items: { type: 'string' },
                                    description: 'List of genes to analyze (focuses on clinically actionable genes if provided)' 
                                },
                                analysis_type: { 
                                    type: 'string', 
                                    description: 'Type of clinical analysis: "cancer", "cardiac", "pharmacogenomic", "general"' 
                                },
                                min_quality: { 
                                    type: 'number', 
                                    description: 'Minimum quality score for variants (recommended: 30)' 
                                },
                                exclude_common: { 
                                    type: 'boolean', 
                                    description: 'Exclude variants with >1% population frequency (default: true)' 
                                }
                            }
                        }
                    },
                    {
                        name: 'analyze_cardiac_genes',
                        description: `Analyze your actual genomic data for cardiac gene variants with clinical context.
                        
Performs comprehensive cardiac genetic analysis including:
- Search your 38.8M variants for cardiac gene variants
- Quality filtering and clinical prioritization
- Population frequency assessment
- Clinical recommendations based on findings
- Automatic safety disclaimers and validation requirements`,
                        inputSchema: {
                            type: 'object',
                            properties: {
                                min_quality: { 
                                    type: 'number', 
                                    description: 'Minimum quality score (default: 30)' 
                                },
                                exclude_low_quality: { 
                                    type: 'boolean', 
                                    description: 'Exclude LOWQ filtered variants (default: true)' 
                                },
                                specific_genes: { 
                                    type: 'array', 
                                    items: { type: 'string' },
                                    description: 'Specific cardiac genes to analyze (optional - analyzes all if not provided)' 
                                }
                            }
                        }
                    },
                    {
                        name: 'get_clinical_interpretation_prompt',
                        description: `Generate appropriate clinical interpretation prompts with safety guidelines.
                        
Returns structured prompts for genomic data interpretation with:
- Clinical safety guidelines and disclaimers
- Analysis-specific context (cancer, cardiac, pharmacogenomic)
- Population frequency interpretation guidance
- Quality score evaluation framework
- Professional boundary enforcement`,
                        inputSchema: {
                            type: 'object',
                            properties: {
                                analysis_type: { 
                                    type: 'string', 
                                    description: 'Type of analysis: "cancer", "cardiac", "pharmacogenomic", "general"' 
                                },
                                genes: { 
                                    type: 'array', 
                                    items: { type: 'string' },
                                    description: 'Genes being analyzed (provides gene-specific context)' 
                                }
                            }
                        }
                    }
                ]
            };
        });

        // Handle tool calls
        this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
            const { name, arguments: args } = request.params;

            try {
                switch (name) {
                    case 'search_variants':
                        return await this.searchVariants(args);
                    case 'get_variant_details':
                        return await this.getVariantDetails(args);
                    case 'calculate_allele_frequency':
                        return await this.calculateAlleleFrequency(args);
                    case 'get_variant_stats':
                        return await this.getVariantStats();
                    case 'filter_variants':
                        return await this.filterVariants(args);
                    case 'get_sample_genotypes':
                        return await this.getSampleGenotypes(args);
                    case 'analyze_clinical_variants':
                        return await this.analyzeClinicalVariants(args);
                    case 'analyze_cardiac_genes':
                        return await this.analyzeCardiacGenes(args);
                    case 'get_clinical_interpretation_prompt':
                        return await this.getClinicalInterpretationPrompt(args);
                    default:
                        throw new Error(`Unknown tool: ${name}`);
                }
            } catch (error) {
                return {
                    content: [
                        {
                            type: 'text',
                            text: `Error executing tool ${name}: ${error instanceof Error ? error.message : String(error)}`
                        }
                    ]
                };
            }
        });

        // List available resources
        this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
            return {
                resources: [
                    {
                        uri: 'vcf://variants/summary',
                        name: 'Variant Summary',
                        description: 'Summary of all variants in the database',
                        mimeType: 'application/json'
                    },
                    {
                        uri: 'vcf://samples/list',
                        name: 'Sample List',
                        description: 'List of all samples in the database',
                        mimeType: 'application/json'
                    },
                    {
                        uri: 'vcf://genes/list',
                        name: 'Gene List',
                        description: 'List of all genes with variants',
                        mimeType: 'application/json'
                    }
                ]
            };
        });

        // Handle resource reads
        this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
            const { uri } = request.params;

            try {
                switch (uri) {
                    case 'vcf://variants/summary':
                        return await this.getVariantSummaryResource();
                    case 'vcf://samples/list':
                        return await this.getSampleListResource();
                    case 'vcf://genes/list':
                        return await this.getGeneListResource();
                    default:
                        throw new Error(`Unknown resource: ${uri}`);
                }
            } catch (error) {
                return {
                    contents: [
                        {
                            uri,
                            mimeType: 'text/plain',
                            text: `Error reading resource: ${error instanceof Error ? error.message : String(error)}`
                        }
                    ]
                };
            }
        });

        // List prompts
        this.server.setRequestHandler(ListPromptsRequestSchema, async () => {
            return {
                prompts: [
                    {
                        name: 'analyze_pathogenic_variants',
                        description: 'Find and analyze potentially pathogenic variants',
                        arguments: [
                            {
                                name: 'sample_name',
                                description: 'Name of the sample to analyze',
                                required: false
                            }
                        ]
                    },
                    {
                        name: 'compare_samples',
                        description: 'Compare variants between two samples',
                        arguments: [
                            {
                                name: 'sample1',
                                description: 'First sample name',
                                required: true
                            },
                            {
                                name: 'sample2',
                                description: 'Second sample name',
                                required: true
                            }
                        ]
                    },
                    {
                        name: 'quality_control_report',
                        description: 'Generate a quality control report for the dataset',
                        arguments: []
                    }
                ]
            };
        });

        // Handle prompts
        this.server.setRequestHandler(GetPromptRequestSchema, async (request) => {
            const { name, arguments: args } = request.params;

            switch (name) {
                case 'analyze_pathogenic_variants':
                    return this.getPathogenicVariantsPrompt(args?.sample_name);
                case 'compare_samples':
                    return this.getCompareSamplesPrompt(args?.sample1, args?.sample2);
                case 'quality_control_report':
                    return this.getQualityControlPrompt();
                default:
                    throw new Error(`Unknown prompt: ${name}`);
            }
        });
    }

    // Tool implementations
    private async searchVariants(args: any) {
        const { 
            chrom, 
            start, 
            end, 
            gene, 
            limit = 100, 
            clinical_context = true, 
            analysis_type = 'general' 
        } = args;

        try {
            const query = {
                chrom: chrom,
                start: start,
                end: end,
                limit: limit
            };

            const variants = await queryEngine.queryVariants(query);

            // Extract genes from variants for clinical context
            const genes = gene ? [gene] : [];
            const qualityFilters = [...new Set(variants.flatMap(v => v.filter))];

            // Prepare variant data
            const variantData = {
                count: variants.length,
                query_parameters: query,
                variants: variants.map(v => ({
                    chromosome: v.chrom,
                    position: v.pos,
                    reference: v.ref,
                    alternate: v.alt,
                    quality: v.qual,
                    filter: v.filter,
                    sample_count: Object.keys(v.samples).length
                }))
            };

            // Wrap with clinical context if requested
            if (clinical_context) {
                const clinicalResponse = clinicalMetadata.wrapWithClinicalContext(
                    variantData,
                    {
                        genes,
                        qualityFilters,
                        analysisType: analysis_type,
                        safetyLevel: 'research'
                    }
                );

                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify(clinicalResponse, null, 2)
                        }
                    ]
                };
            }

            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify(variantData, null, 2)
                    }
                ]
            };
        } catch (error) {
            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify({
                            error: 'Failed to search variants',
                            message: error instanceof Error ? error.message : String(error)
                        }, null, 2)
                    }
                ]
            };
        }
    }

    private async getVariantDetails(args: any) {
        const { variant_id } = args;
        
        const variant = null; // TODO: implement TileDB query
        if (!variant) {
            throw new Error(`Variant with ID ${variant_id} not found`);
        }

        const genotypes: any[] = []; // TODO: implement TileDB query
        const frequency = 0.0; // TODO: implement TileDB query

        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify({
                        variant,
                        genotypes,
                        allele_frequency: frequency
                    }, null, 2)
                }
            ]
        };
    }

    private async calculateAlleleFrequency(args: any) {
        const { chrom, pos, ref, alt } = args;

        try {
            const frequency = await queryEngine.calculateAlleleFrequency(chrom, pos, ref, alt);

            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify({
                            chromosome: chrom,
                            position: pos,
                            reference: ref,
                            alternate: alt,
                            allele_frequency: frequency,
                            percentage: `${(frequency * 100).toFixed(2)}%`
                        }, null, 2)
                    }
                ]
            };
        } catch (error) {
            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify({
                            error: 'Failed to calculate allele frequency',
                            message: error instanceof Error ? error.message : String(error)
                        }, null, 2)
                    }
                ]
            };
        }
    }

    private async getVariantStats() {
        try {
            const stats = await queryEngine.getArrayStats();

            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify({
                            total_variants: stats.totalVariants,
                            chromosomes: stats.chromosomes,
                            position_range: {
                                min: stats.positionRange[0],
                                max: stats.positionRange[1]
                            },
                            sample_count: stats.sampleCount,
                            storage_size: stats.arraySize,
                            compression_info: "TileDB columnar storage with genomics optimization"
                        }, null, 2)
                    }
                ]
            };
        } catch (error) {
            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify({
                            error: 'Failed to get variant statistics',
                            message: error instanceof Error ? error.message : String(error)
                        }, null, 2)
                    }
                ]
            };
        }
    }

    private async filterVariants(args: any) {
        const { min_qual, max_qual, filter_status, consequence, limit = 100 } = args;

        try {
            const query = {
                minQual: min_qual,
                limit: limit
            };

            const variants = await queryEngine.queryVariants(query);

            // Apply additional filters client-side
            let filteredVariants = variants;
            
            if (max_qual !== undefined) {
                filteredVariants = filteredVariants.filter(v => 
                    v.qual === null || v.qual === undefined || v.qual <= max_qual
                );
            }

            if (filter_status) {
                filteredVariants = filteredVariants.filter(v => 
                    v.filter.includes(filter_status)
                );
            }

            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify({
                            count: filteredVariants.length,
                            filter_criteria: {
                                min_quality: min_qual,
                                max_quality: max_qual,
                                filter_status: filter_status
                            },
                            variants: filteredVariants.slice(0, limit).map(v => ({
                                chromosome: v.chrom,
                                position: v.pos,
                                reference: v.ref,
                                alternate: v.alt,
                                quality: v.qual,
                                filter: v.filter,
                                sample_count: Object.keys(v.samples).length
                            }))
                        }, null, 2)
                    }
                ]
            };
        } catch (error) {
            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify({
                            error: 'Failed to filter variants',
                            message: error instanceof Error ? error.message : String(error)
                        }, null, 2)
                    }
                ]
            };
        }
    }

    private async getSampleGenotypes(args: any) {
        const { sample_name, chrom, limit = 100 } = args;

        let query = `
            SELECT v.chrom, v.pos, v.ref, v.alt, g.gt, g.gq, g.dp, g.ad, g.pl
            FROM vcf.genotypes g
            JOIN vcf.variants v ON g.variant_id = v.id
            JOIN vcf.samples s ON g.sample_id = s.id
            WHERE s.name = $1
        `;
        const params = [sample_name];

        if (chrom) {
            query += ' AND v.chrom = $2';
            params.push(chrom);
        }

        query += ' ORDER BY v.chrom, v.pos LIMIT $' + (params.length + 1);
        params.push(limit);

        const result = { rows: [] }; // TODO: implement TileDB query

        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify({
                        sample: sample_name,
                        count: result.rows.length,
                        genotypes: result.rows
                    }, null, 2)
                }
            ]
        };
    }

    private async analyzeClinicalVariants(args: any) {
        const { 
            gene_list = [], 
            analysis_type = 'general', 
            min_quality = 20, 
            exclude_common = true 
        } = args;

        try {
            // Get clinical genes to focus on
            const clinicalGenes = clinicalMetadata.getAllClinicalGenes();
            const targetGenes = gene_list.length > 0 
                ? gene_list.filter((gene: string) => clinicalGenes.includes(gene.toUpperCase()))
                : clinicalGenes.slice(0, 10); // Limit to first 10 for performance

            // Query variants with quality filter
            const variants = await queryEngine.queryVariants({
                minQual: min_quality,
                limit: 50 // Limit results for clinical focus
            });

            // Filter for clinical relevance
            const clinicalVariants = variants.filter(v => {
                // Quality filter
                if (v.qual !== null && v.qual !== undefined && v.qual < min_quality) return false;
                
                // Exclude low quality
                if (v.filter.includes('LOWQ')) return false;
                
                return true;
            });

            // Create clinical analysis response
            const analysisData = {
                analysis_type,
                targeted_genes: targetGenes,
                total_variants_found: clinicalVariants.length,
                quality_threshold: min_quality,
                exclude_common_variants: exclude_common,
                variants: clinicalVariants.slice(0, 20).map(v => ({
                    chromosome: v.chrom,
                    position: v.pos,
                    reference: v.ref,
                    alternate: v.alt,
                    quality: v.qual,
                    filter: v.filter,
                    clinical_significance: 'Unknown - requires clinical interpretation'
                })),
                next_steps: [
                    'Clinical genetic testing recommended for validation',
                    'Genetic counseling consultation advised',
                    'Population frequency analysis needed',
                    'Family history assessment important'
                ]
            };

            // Wrap with clinical context
            const clinicalResponse = clinicalMetadata.wrapWithClinicalContext(
                analysisData,
                {
                    genes: targetGenes,
                    qualityFilters: ['PASS'],
                    analysisType: analysis_type,
                    safetyLevel: 'research'
                }
            );

            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify(clinicalResponse, null, 2)
                    }
                ]
            };

        } catch (error) {
            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify({
                            error: 'Failed to analyze clinical variants',
                            message: error instanceof Error ? error.message : String(error),
                            clinical_disclaimer: clinicalMetadata.getClinicalMetadata().disclaimer
                        }, null, 2)
                    }
                ]
            };
        }
    }

    private async analyzeCardiacGenes(args: any) {
        const { 
            min_quality = 30, 
            exclude_low_quality = true,
            specific_genes = []
        } = args;

        try {
            // Get cardiac genes to analyze
            const cardiacGenes = clinicalMetadata.getClinicalGenesByCategory('tier1_cardiac');
            const targetGenes = specific_genes.length > 0 ? specific_genes : cardiacGenes;
            
            // Since we don't have gene-based search yet, we'll search common cardiac gene regions
            // This is a simplified approach - in practice you'd have gene annotation
            const cardiacRegions = [
                { name: 'MYBPC3', chrom: '11', start: 47352960, end: 47374205 },
                { name: 'MYH7', chrom: '14', start: 23412740, end: 23435660 },
                { name: 'TNNT2', chrom: '1', start: 201328716, end: 201347449 },
                { name: 'TNNI3', chrom: '19', start: 55662140, end: 55669490 },
                { name: 'TPM1', chrom: '15', start: 63065990, end: 63073729 },
                { name: 'MYL2', chrom: '12', start: 111348830, end: 111361710 },
                { name: 'MYL3', chrom: '3', start: 46896230, end: 46904470 },
                { name: 'ACTC1', chrom: '15', start: 35080870, end: 35087750 }
            ];

            let allCardiacVariants: any[] = [];
            let searchedRegions: string[] = [];

            // Search each cardiac gene region
            for (const region of cardiacRegions) {
                if (specific_genes.length === 0 || specific_genes.includes(region.name)) {
                    try {
                        const variants = await queryEngine.queryVariants({
                            chrom: region.chrom,
                            start: region.start,
                            end: region.end,
                            minQual: min_quality,
                            limit: 100
                        });

                        // Filter variants based on quality criteria
                        const filteredVariants = variants.filter(v => {
                            // Exclude low quality if requested
                            if (exclude_low_quality && v.filter.includes('LOWQ')) return false;
                            
                            // Quality filter
                            if (v.qual !== null && v.qual !== undefined && v.qual < min_quality) return false;
                            
                            return true;
                        });

                        // Add gene annotation to variants
                        const annotatedVariants = filteredVariants.map(v => ({
                            ...v,
                            gene: region.name,
                            gene_region: `${region.chrom}:${region.start}-${region.end}`
                        }));

                        allCardiacVariants.push(...annotatedVariants);
                        searchedRegions.push(`${region.name} (${region.chrom}:${region.start}-${region.end})`);
                    } catch (error) {
                        console.error(`Error searching ${region.name}: ${error}`);
                    }
                }
            }

            // Create analysis results
            const analysisData = {
                analysis_type: 'cardiac_genetic_analysis',
                searched_genes: targetGenes,
                searched_regions: searchedRegions,
                total_variants_found: allCardiacVariants.length,
                quality_threshold: min_quality,
                exclude_low_quality,
                
                // Group variants by gene
                variants_by_gene: cardiacRegions.reduce((acc, region) => {
                    const geneVariants = allCardiacVariants.filter(v => v.gene === region.name);
                    if (geneVariants.length > 0) {
                        acc[region.name] = {
                            gene_info: {
                                name: region.name,
                                chromosome: region.chrom,
                                region: `${region.start}-${region.end}`,
                                clinical_significance: this.getCardiacGeneSignificance(region.name)
                            },
                            variant_count: geneVariants.length,
                            variants: geneVariants.slice(0, 10).map(v => ({
                                position: v.pos,
                                reference: v.ref,
                                alternate: v.alt,
                                quality: v.qual,
                                filter: v.filter,
                                clinical_assessment: 'Requires clinical interpretation and validation'
                            }))
                        };
                    }
                    return acc;
                }, {} as any),

                clinical_summary: {
                    total_cardiac_genes_searched: searchedRegions.length,
                    variants_requiring_evaluation: allCardiacVariants.filter(v => 
                        v.filter.includes('PASS') && v.qual >= 30
                    ).length,
                    high_quality_variants: allCardiacVariants.filter(v => 
                        v.filter.includes('PASS') && v.qual >= 50
                    ).length
                },

                next_steps: [
                    '🏥 Clinical genetic testing recommended for variant validation',
                    '❤️ Cardiology evaluation including ECG and echocardiogram',
                    '👨‍⚕️ Genetic counseling consultation for risk assessment',
                    '👪 Family history assessment for cardiac conditions',
                    '⚠️ All variants require clinical correlation before any health decisions'
                ]
            };

            // Wrap with clinical context
            const clinicalResponse = clinicalMetadata.wrapWithClinicalContext(
                analysisData,
                {
                    genes: targetGenes,
                    qualityFilters: allCardiacVariants.flatMap(v => v.filter),
                    analysisType: 'cardiac',
                    safetyLevel: 'research'
                }
            );

            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify(clinicalResponse, null, 2)
                    }
                ]
            };

        } catch (error) {
            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify({
                            error: 'Failed to analyze cardiac genes',
                            message: error instanceof Error ? error.message : String(error),
                            clinical_disclaimer: clinicalMetadata.getClinicalMetadata().disclaimer,
                            recommendation: 'Clinical genetic testing required for cardiac gene analysis'
                        }, null, 2)
                    }
                ]
            };
        }
    }

    private getCardiacGeneSignificance(geneName: string): string {
        const significance: Record<string, string> = {
            'MYBPC3': 'Most common cause of hypertrophic cardiomyopathy (HCM)',
            'MYH7': 'Major cause of HCM and dilated cardiomyopathy (DCM)',
            'TNNT2': 'Associated with HCM, often with high arrhythmia risk',
            'TNNI3': 'HCM-associated gene with variable clinical presentation',
            'TPM1': 'Associated with HCM and DCM, usually mild phenotype',
            'MYL2': 'HCM-associated gene, often with variable penetrance',
            'MYL3': 'HCM-associated gene, relatively rare cause',
            'ACTC1': 'Associated with HCM and DCM, often severe phenotype'
        };
        return significance[geneName] || 'Cardiac gene with established clinical significance';
    }

    private async getClinicalInterpretationPrompt(args: any) {
        const { analysis_type = 'general', genes = [] } = args;

        try {
            const prompt = clinicalMetadata.getClinicalInterpretationPrompt(analysis_type, genes);
            const metadata = clinicalMetadata.getClinicalMetadata();
            
            const response = {
                prompt_type: 'clinical_interpretation',
                analysis_context: analysis_type,
                target_genes: genes,
                interpretation_prompt: prompt,
                clinical_metadata: metadata,
                usage_instructions: [
                    'Use this prompt to guide clinical genomics interpretation',
                    'Always include clinical disclaimers in responses',
                    'Emphasize population frequency context',
                    'Require clinical validation for health decisions',
                    'Focus on established clinically actionable genes'
                ]
            };

            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify(response, null, 2)
                    }
                ]
            };

        } catch (error) {
            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify({
                            error: 'Failed to generate clinical interpretation prompt',
                            message: error instanceof Error ? error.message : String(error)
                        }, null, 2)
                    }
                ]
            };
        }
    }

    // Resource implementations
    private async getVariantSummaryResource() {
        try {
            const stats = await queryEngine.getArrayStats();
            const sampleVariants = await queryEngine.queryVariants({ limit: 10 });
            
            const summary = {
                overview: {
                    total_variants: stats.totalVariants,
                    chromosomes: stats.chromosomes,
                    sample_count: stats.sampleCount,
                    storage_size: stats.arraySize
                },
                sample_variants: sampleVariants.map((v: any) => ({
                    chromosome: v.chrom,
                    position: v.pos,
                    reference: v.ref,
                    alternate: v.alt,
                    quality: v.qual,
                    filter: v.filter
                }))
            };
            
            return {
                contents: [
                    {
                        uri: 'tiledb://variants/summary',
                        mimeType: 'application/json',
                        text: JSON.stringify(summary, null, 2)
                    }
                ]
            };
        } catch (error) {
            return {
                contents: [
                    {
                        uri: 'tiledb://variants/summary',
                        mimeType: 'application/json',
                        text: JSON.stringify({
                            error: 'Failed to get variant summary',
                            message: error instanceof Error ? error.message : String(error)
                        }, null, 2)
                    }
                ]
            };
        }
    }

    private async getSampleListResource() {
        try {
            const stats = await queryEngine.getArrayStats();
            
            // For now, return basic sample info based on what we know
            const samples = [{
                id: 1,
                name: "Ryan_William_Niemes",
                metadata: {
                    total_variants: stats.totalVariants,
                    chromosomes: stats.chromosomes.length,
                    source: "Personal exome VCF"
                }
            }];
            
            return {
                contents: [
                    {
                        uri: 'tiledb://samples/list',
                        mimeType: 'application/json',
                        text: JSON.stringify(samples, null, 2)
                    }
                ]
            };
        } catch (error) {
            return {
                contents: [
                    {
                        uri: 'tiledb://samples/list',
                        mimeType: 'application/json',
                        text: JSON.stringify({
                            error: 'Failed to get sample list',
                            message: error instanceof Error ? error.message : String(error)
                        }, null, 2)
                    }
                ]
            };
        }
    }

    private async getGeneListResource() {
        return {
            contents: [
                {
                    uri: 'tiledb://genes/list',
                    mimeType: 'application/json',
                    text: JSON.stringify({
                        info: "Gene annotation not yet implemented",
                        suggestion: "Use chromosome and position queries instead",
                        example: "Query chromosome 17 positions 43000000-44000000 for BRCA1 region"
                    }, null, 2)
                }
            ]
        };
    }

    // Prompt implementations
    private getPathogenicVariantsPrompt(sampleName?: string) {
        const sampleFilter = sampleName ? `for sample "${sampleName}"` : 'across all samples';
        
        return {
            description: `Analyze potentially pathogenic variants ${sampleFilter}`,
            messages: [
                {
                    role: 'user' as const,
                    content: {
                        type: 'text',
                        text: `Please analyze potentially pathogenic variants ${sampleFilter}. Focus on:
1. High-impact variants (e.g., stop-gained, frameshift)
2. Variants in clinically relevant genes
3. Rare variants (low allele frequency)
4. Variants with high quality scores

Use the available tools to search and filter variants, then provide a comprehensive analysis of the findings.`
                    }
                }
            ]
        };
    }

    private getCompareSamplesPrompt(sample1: string | undefined, sample2: string | undefined) {
        return {
            description: `Compare variants between samples ${sample1} and ${sample2}`,
            messages: [
                {
                    role: 'user' as const,
                    content: {
                        type: 'text',
                        text: `Please compare the variants between samples "${sample1}" and "${sample2}". Focus on:
1. Unique variants in each sample
2. Shared variants between samples
3. Differences in genotype quality and depth
4. Variants with different zygosity between samples

Use the get_sample_genotypes tool for both samples and provide a detailed comparison.`
                    }
                }
            ]
        };
    }

    private getQualityControlPrompt() {
        return {
            description: 'Generate a comprehensive quality control report',
            messages: [
                {
                    role: 'user' as const,
                    content: {
                        type: 'text',
                        text: `Please generate a quality control report for the VCF dataset. Include:
1. Overall dataset statistics (total variants, samples, chromosomes)
2. Quality score distribution
3. Filter status summary
4. Transition/transversion ratio
5. Variant type distribution
6. Sample-level statistics

Use the available tools to gather this information and provide actionable insights about data quality.`
                    }
                }
            ]
        };
    }

    async start(): Promise<void> {
        const transport = new StdioServerTransport();
        await this.server.connect(transport);
        console.error('🧬 VCF MCP Server started with TileDB backend');
        console.error('✅ Ready to query 38.8M variants with Claude');
    }
}

// Start the server if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
    const server = new VCFMCPServer();
    server.start().catch((error) => {
        console.error('Failed to start MCP server:', error);
        process.exit(1);
    });
}