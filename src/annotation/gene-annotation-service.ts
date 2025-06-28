import { DaemonClient } from '../tiledb/daemon-client.js';
import { GeneRegion } from './gene-annotation-manager.js';

export interface GeneLookupResult {
  found: boolean;
  genes: GeneRegion[];
  search_type: 'by_name' | 'by_region' | 'by_position';
  clinical_genes_only?: boolean;
}

export interface VariantGeneAnnotation {
  chrom: string;
  pos: number;
  ref: string;
  alt: string;
  overlapping_genes: Array<{
    gene_name: string;
    gene_type: string;
    distance_to_gene: number; // 0 if inside gene, positive if outside
    clinical_significance?: string;
    strand: '+' | '-';
    gene_region: {
      start: number;
      end: number;
      length: number;
    };
  }>;
  nearest_gene?: {
    gene_name: string;
    distance: number;
    direction: 'upstream' | 'downstream';
  };
}

export interface GeneQuery {
  gene_name?: string;
  chrom?: string;
  start?: number;
  end?: number;
  gene_type?: string;
  clinical_only?: boolean;
  limit?: number;
}

export class GeneAnnotationService {
  private daemonClient: DaemonClient;
  private arrayPath: string;

  constructor(workspacePath: string) {
    this.daemonClient = new DaemonClient(workspacePath);
    this.arrayPath = `${workspacePath}/gene_arrays`;
  }

  /**
   * Look up gene by name
   */
  async lookupGeneByName(geneName: string): Promise<GeneLookupResult> {
    try {
      const query = {
        type: 'gene_lookup_by_name',
        gene_name: geneName.toUpperCase()
      };

      const result = await this.daemonClient.executeQuery(query);
      
      return {
        found: result.genes && result.genes.length > 0,
        genes: result.genes || [],
        search_type: 'by_name'
      };

    } catch (error) {
      console.error('Error looking up gene by name:', error);
      return {
        found: false,
        genes: [],
        search_type: 'by_name'
      };
    }
  }

  /**
   * Find genes in a chromosomal region
   */
  async findGenesInRegion(chrom: string, start: number, end: number, options: {
    clinicalOnly?: boolean;
    geneType?: string;
    limit?: number;
  } = {}): Promise<GeneLookupResult> {
    try {
      const query = {
        type: 'genes_in_region',
        chrom: this.chromosomeToInt(chrom),
        start: start,
        end: end,
        clinical_only: options.clinicalOnly || false,
        gene_type: options.geneType,
        limit: options.limit || 100
      };

      const result = await this.daemonClient.executeQuery(query);
      
      return {
        found: result.genes && result.genes.length > 0,
        genes: result.genes || [],
        search_type: 'by_region',
        clinical_genes_only: options.clinicalOnly
      };

    } catch (error) {
      console.error('Error finding genes in region:', error);
      return {
        found: false,
        genes: [],
        search_type: 'by_region'
      };
    }
  }

  /**
   * Annotate variants with gene information
   */
  async annotateVariants(variants: Array<{
    chrom: string;
    pos: number;
    ref: string;
    alt: string;
  }>): Promise<VariantGeneAnnotation[]> {
    
    const annotations = [];
    
    for (const variant of variants) {
      try {
        // Find overlapping genes (position within gene boundaries)
        const overlappingGenes = await this.findGenesInRegion(
          variant.chrom, 
          variant.pos - 1, // Expand by 1bp to catch boundary cases
          variant.pos + 1,
          { limit: 50 }
        );

        // Find nearby genes (within 10kb) if no overlapping genes
        let nearbyGenes: GeneLookupResult | null = null;
        if (!overlappingGenes.found) {
          nearbyGenes = await this.findGenesInRegion(
            variant.chrom,
            Math.max(1, variant.pos - 10000),
            variant.pos + 10000,
            { limit: 10 }
          );
        }

        // Process overlapping genes
        const geneAnnotations = overlappingGenes.genes.map(gene => {
          const distanceToGene = this.calculateDistanceToGene(variant.pos, gene);
          
          return {
            gene_name: gene.gene_name,
            gene_type: gene.gene_type,
            distance_to_gene: distanceToGene,
            clinical_significance: gene.clinical_significance,
            strand: gene.strand,
            gene_region: {
              start: gene.start,
              end: gene.end,
              length: gene.end - gene.start + 1
            }
          };
        });

        // Find nearest gene if no overlapping genes
        let nearestGene;
        if (!overlappingGenes.found && nearbyGenes?.found) {
          const closest = nearbyGenes.genes.reduce((closest, gene) => {
            const distance = this.calculateDistanceToGene(variant.pos, gene);
            return (!closest || Math.abs(distance) < Math.abs(closest.distance)) ? 
              { gene, distance } : closest;
          }, null as any);

          if (closest) {
            nearestGene = {
              gene_name: closest.gene.gene_name,
              distance: Math.abs(closest.distance),
              direction: (closest.distance < 0 ? 'downstream' : 'upstream') as 'upstream' | 'downstream'
            };
          }
        }

        annotations.push({
          chrom: variant.chrom,
          pos: variant.pos,
          ref: variant.ref,
          alt: variant.alt,
          overlapping_genes: geneAnnotations,
          nearest_gene: nearestGene
        });

      } catch (error) {
        console.error(`Error annotating variant ${variant.chrom}:${variant.pos}:`, error);
        
        // Add empty annotation on error
        annotations.push({
          chrom: variant.chrom,
          pos: variant.pos,
          ref: variant.ref,
          alt: variant.alt,
          overlapping_genes: []
        });
      }
    }

    return annotations;
  }

  /**
   * Get all clinical genes
   */
  async getClinicalGenes(): Promise<GeneLookupResult> {
    try {
      const query = {
        type: 'clinical_genes',
        limit: 1000
      };

      const result = await this.daemonClient.executeQuery(query);
      
      return {
        found: result.genes && result.genes.length > 0,
        genes: result.genes || [],
        search_type: 'by_name',
        clinical_genes_only: true
      };

    } catch (error) {
      console.error('Error getting clinical genes:', error);
      return {
        found: false,
        genes: [],
        search_type: 'by_name',
        clinical_genes_only: true
      };
    }
  }

  /**
   * Search genes by multiple criteria
   */
  async searchGenes(query: GeneQuery): Promise<GeneLookupResult> {
    try {
      if (query.gene_name) {
        return await this.lookupGeneByName(query.gene_name);
      }

      if (query.chrom && query.start !== undefined && query.end !== undefined) {
        return await this.findGenesInRegion(query.chrom, query.start, query.end, {
          clinicalOnly: query.clinical_only,
          geneType: query.gene_type,
          limit: query.limit
        });
      }

      if (query.clinical_only) {
        return await this.getClinicalGenes();
      }

      // General query by type
      const tiledbQuery = {
        type: 'genes_by_criteria',
        gene_type: query.gene_type,
        clinical_only: query.clinical_only || false,
        limit: query.limit || 100
      };

      const result = await this.daemonClient.executeQuery(tiledbQuery);
      
      return {
        found: result.genes && result.genes.length > 0,
        genes: result.genes || [],
        search_type: 'by_name'
      };

    } catch (error) {
      console.error('Error searching genes:', error);
      return {
        found: false,
        genes: [],
        search_type: 'by_name'
      };
    }
  }

  /**
   * Get gene statistics
   */
  async getGeneStatistics(): Promise<{
    totalGenes: number;
    clinicalGenes: number;
    geneTypes: Record<string, number>;
    chromosomeDistribution: Record<string, number>;
    arrayStatus: string;
  }> {
    try {
      const query = {
        type: 'gene_statistics'
      };

      const result = await this.daemonClient.executeQuery(query);
      
      return {
        totalGenes: result.total_genes || 0,
        clinicalGenes: result.clinical_genes || 0,
        geneTypes: result.gene_types || {},
        chromosomeDistribution: result.chromosome_distribution || {},
        arrayStatus: result.array_status || 'unknown'
      };

    } catch (error) {
      console.error('Error getting gene statistics:', error);
      return {
        totalGenes: 0,
        clinicalGenes: 0,
        geneTypes: {},
        chromosomeDistribution: {},
        arrayStatus: 'error'
      };
    }
  }

  /**
   * Calculate distance from position to gene
   */
  private calculateDistanceToGene(pos: number, gene: GeneRegion): number {
    if (pos >= gene.start && pos <= gene.end) {
      return 0; // Inside gene
    }
    
    if (pos < gene.start) {
      return gene.start - pos; // Upstream
    } else {
      return pos - gene.end; // Downstream
    }
  }

  /**
   * Replace hardcoded gene coordinates with database lookups
   */
  async getGeneCoordinates(geneName: string): Promise<{
    chrom: string;
    start: number;
    end: number;
  } | null> {
    try {
      const result = await this.lookupGeneByName(geneName);
      
      if (result.found && result.genes.length > 0) {
        const gene = result.genes[0]; // Take first match
        return {
          chrom: gene.chrom,
          start: gene.start,
          end: gene.end
        };
      }
      
      return null;
    } catch (error) {
      console.error(`Error getting coordinates for gene ${geneName}:`, error);
      return null;
    }
  }

  /**
   * Get clinical gene categories with coordinates
   */
  async getClinicalGeneCategories(): Promise<{
    cancer: Array<{ name: string; chrom: string; start: number; end: number; }>;
    cardiac: Array<{ name: string; chrom: string; start: number; end: number; }>;
    pharmacogenomic: Array<{ name: string; chrom: string; start: number; end: number; }>;
  }> {
    try {
      const clinicalGenes = await this.getClinicalGenes();
      
      const categories = {
        cancer: [] as any[],
        cardiac: [] as any[],
        pharmacogenomic: [] as any[]
      };

      for (const gene of clinicalGenes.genes) {
        const geneInfo = {
          name: gene.gene_name,
          chrom: gene.chrom,
          start: gene.start,
          end: gene.end
        };

        // Categorize based on clinical significance
        if (gene.clinical_significance) {
          const significance = gene.clinical_significance.toLowerCase();
          
          if (significance.includes('cancer') || significance.includes('carcinoma') || 
              significance.includes('syndrome') || significance.includes('polyposis')) {
            categories.cancer.push(geneInfo);
          } else if (significance.includes('cardiomyopathy') || significance.includes('cardiac')) {
            categories.cardiac.push(geneInfo);
          } else if (significance.includes('drug') || significance.includes('metabolism') || 
                     significance.includes('toxicity') || significance.includes('sensitivity')) {
            categories.pharmacogenomic.push(geneInfo);
          }
        }
      }

      return categories;
    } catch (error) {
      console.error('Error getting clinical gene categories:', error);
      return {
        cancer: [],
        cardiac: [],
        pharmacogenomic: []
      };
    }
  }

  private chromosomeToInt(chrom: string): number {
    const cleanChrom = chrom.replace('chr', '');
    if (cleanChrom === 'X') return 23;
    if (cleanChrom === 'Y') return 24;
    if (cleanChrom === 'MT' || cleanChrom === 'M') return 25;
    return parseInt(cleanChrom);
  }
}