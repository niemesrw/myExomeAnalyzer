import { DaemonClient } from '../tiledb/daemon-client.js';
import { PopulationFrequency } from './population-frequency-manager.js';

export interface PopulationLookupResult {
  found: boolean;
  frequency?: PopulationFrequency;
  interpretation: {
    isCommon: boolean;
    rarity: 'very_rare' | 'rare' | 'uncommon' | 'common' | 'very_common';
    description: string;
    clinical_significance: string;
  };
}

export interface PopulationFilterOptions {
  maxFrequency?: number; // Filter out variants above this frequency
  minFrequency?: number; // Filter out variants below this frequency
  populations?: string[]; // Specific populations to consider
  excludeCommon?: boolean; // Exclude common variants (>1%)
}

export class PopulationFrequencyService {
  private daemonClient: DaemonClient;
  private arrayPath: string;

  constructor(workspacePath: string) {
    this.daemonClient = new DaemonClient(workspacePath);
    this.arrayPath = `${workspacePath}/population_arrays/population_frequencies`;
  }

  /**
   * Look up population frequency for a specific variant
   */
  async lookupVariantFrequency(
    chrom: string, 
    pos: number, 
    ref: string, 
    alt: string
  ): Promise<PopulationLookupResult> {
    
    try {
      const chromInt = this.chromosomeToInt(chrom);
      
      // Query TileDB array for exact match
      const query = {
        type: 'population_frequency_lookup',
        chrom: chromInt,
        pos: pos,
        ref: ref,
        alt: alt
      };

      const result = await this.daemonClient.executeQuery(query);
      
      if (result.variants && result.variants.length > 0) {
        const variant = result.variants[0];
        
        const frequency: PopulationFrequency = {
          chrom: chrom,
          pos: pos,
          ref: ref,
          alt: alt,
          af_global: variant.af_global,
          af_afr: variant.af_afr,
          af_amr: variant.af_amr,
          af_asj: variant.af_asj,
          af_eas: variant.af_eas,
          af_fin: variant.af_fin,
          af_nfe: variant.af_nfe,
          af_oth: variant.af_oth,
          ac_global: variant.ac_global,
          an_global: variant.an_global,
          nhomalt_global: variant.nhomalt_global,
          faf95_global: variant.faf95_global,
          is_common: variant.is_common
        };

        return {
          found: true,
          frequency: frequency,
          interpretation: this.interpretFrequency(frequency)
        };
      } else {
        // Variant not found in gnomAD - likely very rare or novel
        return {
          found: false,
          interpretation: {
            isCommon: false,
            rarity: 'very_rare',
            description: 'Not found in gnomAD v4.1 (>730k exomes + 76k genomes)',
            clinical_significance: 'Novel or extremely rare variant - requires careful clinical evaluation'
          }
        };
      }

    } catch (error) {
      console.error('Error looking up population frequency:', error);
      throw new Error(`Population frequency lookup failed: ${error}`);
    }
  }

  /**
   * Get population frequency context for variant interpretation
   */
  async getPopulationContext(variants: Array<{chrom: string, pos: number, ref: string, alt: string}>): Promise<Array<PopulationLookupResult>> {
    const results = [];
    
    for (const variant of variants) {
      const result = await this.lookupVariantFrequency(variant.chrom, variant.pos, variant.ref, variant.alt);
      results.push(result);
    }
    
    return results;
  }

  /**
   * Filter variants based on population frequency criteria
   */
  async filterVariantsByFrequency(
    variants: Array<{chrom: string, pos: number, ref: string, alt: string}>,
    options: PopulationFilterOptions
  ): Promise<Array<{variant: any, populationData: PopulationLookupResult, passesFilter: boolean}>> {
    
    const results = [];
    
    for (const variant of variants) {
      const populationData = await this.lookupVariantFrequency(variant.chrom, variant.pos, variant.ref, variant.alt);
      
      let passesFilter = true;
      
      if (populationData.found && populationData.frequency) {
        const freq = populationData.frequency;
        
        // Apply frequency filters
        if (options.maxFrequency !== undefined && freq.af_global > options.maxFrequency) {
          passesFilter = false;
        }
        
        if (options.minFrequency !== undefined && freq.af_global < options.minFrequency) {
          passesFilter = false;
        }
        
        // Exclude common variants
        if (options.excludeCommon && freq.is_common) {
          passesFilter = false;
        }
        
        // Population-specific filtering
        if (options.populations && options.populations.length > 0) {
          const popFreqs = this.getPopulationFrequencies(freq, options.populations);
          const maxPopFreq = Math.max(...popFreqs);
          
          if (options.maxFrequency !== undefined && maxPopFreq > options.maxFrequency) {
            passesFilter = false;
          }
        }
      }
      
      results.push({
        variant: variant,
        populationData: populationData,
        passesFilter: passesFilter
      });
    }
    
    return results;
  }

  /**
   * Get frequency interpretation and clinical context
   */
  private interpretFrequency(frequency: PopulationFrequency): PopulationLookupResult['interpretation'] {
    const af = frequency.af_global;
    
    let rarity: 'very_rare' | 'rare' | 'uncommon' | 'common' | 'very_common';
    let description: string;
    let clinical_significance: string;
    
    if (af >= 0.05) { // >= 5%
      rarity = 'very_common';
      description = `Very common variant (${(af * 100).toFixed(2)}% global frequency)`;
      clinical_significance = 'Likely benign population polymorphism - very common in general population';
    } else if (af >= 0.01) { // 1-5%
      rarity = 'common';
      description = `Common variant (${(af * 100).toFixed(2)}% global frequency)`;
      clinical_significance = 'Likely benign population polymorphism - common in general population';
    } else if (af >= 0.001) { // 0.1-1%
      rarity = 'uncommon';
      description = `Uncommon variant (${(af * 100).toFixed(3)}% global frequency)`;
      clinical_significance = 'Population polymorphism - consider functional impact and clinical context';
    } else if (af >= 0.0001) { // 0.01-0.1%
      rarity = 'rare';
      description = `Rare variant (${(af * 100).toFixed(4)}% global frequency)`;
      clinical_significance = 'Rare variant - evaluate functional impact and segregation with phenotype';
    } else { // < 0.01%
      rarity = 'very_rare';
      description = `Very rare variant (${(af * 100).toFixed(5)}% global frequency)`;
      clinical_significance = 'Very rare variant - strong candidate for pathogenic role if functionally relevant';
    }

    return {
      isCommon: frequency.is_common,
      rarity: rarity,
      description: description,
      clinical_significance: clinical_significance
    };
  }

  /**
   * Get population-specific frequencies
   */
  private getPopulationFrequencies(frequency: PopulationFrequency, populations: string[]): number[] {
    const freqs: number[] = [];
    
    for (const pop of populations) {
      switch (pop.toLowerCase()) {
        case 'afr':
        case 'african':
          freqs.push(frequency.af_afr);
          break;
        case 'amr':
        case 'latino':
          freqs.push(frequency.af_amr);
          break;
        case 'asj':
        case 'ashkenazi':
          freqs.push(frequency.af_asj);
          break;
        case 'eas':
        case 'east_asian':
          freqs.push(frequency.af_eas);
          break;
        case 'fin':
        case 'finnish':
          freqs.push(frequency.af_fin);
          break;
        case 'nfe':
        case 'european':
          freqs.push(frequency.af_nfe);
          break;
        case 'oth':
        case 'other':
          freqs.push(frequency.af_oth);
          break;
        default:
          freqs.push(frequency.af_global);
      }
    }
    
    return freqs;
  }

  /**
   * Generate population frequency clinical disclaimer
   */
  generatePopulationDisclaimer(): string {
    return `
🧬 Population Frequency Context (gnomAD v4.1):
• Data from 730,947 exomes + 76,215 genomes
• >95% of variants are benign population polymorphisms
• Common variants (>1% frequency) rarely cause Mendelian disease
• Rare variants (<0.1% frequency) require functional evaluation
• Population-specific frequencies may vary significantly

⚠️  Clinical Interpretation:
• Population frequency ≠ pathogenicity
• Consider functional impact, segregation, and phenotype
• Consult population-matched controls when possible
• Clinical genetic testing required for medical decisions
    `.trim();
  }

  /**
   * Get summary statistics about population frequency data
   */
  async getPopulationStatistics(): Promise<{
    totalVariants: number;
    commonVariants: number;
    rareVariants: number;
    arrayPath: string;
    dataVersion: string;
  }> {
    try {
      const query = {
        type: 'population_frequency_stats'
      };

      const result = await this.daemonClient.executeQuery(query);
      
      return {
        totalVariants: result.total_variants || 0,
        commonVariants: result.common_variants || 0,
        rareVariants: result.rare_variants || 0,
        arrayPath: this.arrayPath,
        dataVersion: 'gnomAD v4.1'
      };
      
    } catch (error) {
      console.error('Error getting population statistics:', error);
      return {
        totalVariants: 0,
        commonVariants: 0,
        rareVariants: 0,
        arrayPath: this.arrayPath,
        dataVersion: 'gnomAD v4.1 (not loaded)'
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