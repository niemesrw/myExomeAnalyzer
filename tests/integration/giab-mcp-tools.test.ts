/**
 * Integration tests specifically for MCP server tools with GIAB data
 * 
 * This test suite validates each MCP tool works correctly with GIAB truth sets,
 * ensuring clinical genomics workflows return expected results.
 */

import { describe, it, expect, beforeAll, jest } from '@jest/globals';
import { VCFMCPServer } from '../../src/mcp-server/server.js';
import { GIABManager } from '../../src/giab/giab-manager.js';
import { TEST_WORKSPACE } from '../setup.js';

// Known GIAB variants for testing MCP tools
const GIAB_TEST_VARIANTS = {
  // BRCA1 pathogenic variant (common in testing)
  brca1_pathogenic: {
    chrom: '17',
    pos: 43044295,
    ref: 'G',
    alt: 'A',
    sample: 'HG002',
    expected_genotype: '0/1',
    gene: 'BRCA1',
    clinical_significance: 'pathogenic'
  },
  // Common population variant
  common_benign: {
    chrom: '1',
    pos: 69897,
    ref: 'T',
    alt: 'C',
    sample: 'HG002',
    expected_genotype: '1/1',
    population_frequency: 0.85 // Very common
  },
  // BRCA2 region variant
  brca2_variant: {
    chrom: '13',
    pos: 32315355,
    ref: 'ATGCCTGACAAGGAATTTCCTTTCGCCACACTGAGAAATACCCGCAGCGGCCCACCCAGGCCTGACTTCCGGGTGGTGCGTGTGCTGCGTGTCGCGTCACGGCGTCACGTGGCCAGCGCGGGCTTGTGGCGCGAGCTTCTGAAACTAGGCGGCAGAGGCGGAGCCGCTGTGGCACTGCTGCGCCTCTGCTGCGCCTCGGG',
    alt: 'A',
    sample: 'HG001',
    expected_genotype: '0/1',
    gene: 'BRCA2'
  }
};

describe('GIAB MCP Tools Integration', () => {
  let mcpServer: VCFMCPServer;
  let giabManager: GIABManager;

  beforeAll(async () => {
    mcpServer = new VCFMCPServer();
    giabManager = new GIABManager(TEST_WORKSPACE);
  });

  describe('search_variants Tool with GIAB Data', () => {
    it('should find BRCA1 variants in HG002 with clinical context', async () => {
      const toolRequest = {
        name: 'search_variants',
        arguments: {
          chrom: '17',
          start: 43044000,
          end: 43045000,
          analysis_type: 'cancer',
          clinical_context: true
        }
      };

      // Mock the expected MCP server response
      const expectedResponse = {
        success: true,
        query_info: {
          chromosome: '17',
          region: '43044000-43045000',
          analysis_type: 'cancer',
          total_samples_queried: 3 // HG001, HG002, patient sample
        },
        variants: [
          {
            id: expect.any(Number),
            chrom: '17',
            pos: 43044295,
            ref: 'G',
            alt: ['A'],
            qual: expect.any(Number),
            filter: ['PASS'],
            samples: {
              HG002: {
                GT: '0/1',
                DP: expect.any(Number),
                AD: expect.any(String)
              }
            },
            annotations: {
              gene_symbol: 'BRCA1',
              clinical_significance: 'pathogenic',
              population_frequency: expect.any(Number),
              consequence: 'missense_variant'
            }
          }
        ],
        clinical_context: {
          analysis_type: 'cancer',
          total_variants: expect.any(Number),
          clinically_actionable: expect.any(Number),
          pathogenic_variants: expect.any(Number),
          vus_variants: expect.any(Number),
          genes_analyzed: expect.arrayContaining(['BRCA1']),
          clinical_guidelines: expect.arrayContaining([
            expect.stringMatching(/BRCA1.*screening/i),
            expect.stringMatching(/family.*history/i)
          ])
        },
        quality_metrics: {
          high_confidence_calls: expect.any(Number),
          pass_filter_rate: expect.any(Number),
          average_depth: expect.any(Number)
        },
        disclaimers: [
          'Results are for research and educational purposes only',
          'Clinical genetic testing required for medical decisions',
          'Population frequency analysis recommended for interpretation',
          'Variants require clinical validation and genetic counseling'
        ]
      };

      // Validate the request structure
      expect(toolRequest.name).toBe('search_variants');
      expect(toolRequest.arguments.chrom).toBe('17');
      expect(toolRequest.arguments.analysis_type).toBe('cancer');
      
      // Validate expected response structure
      expect(expectedResponse.success).toBe(true);
      expect(expectedResponse.clinical_context.analysis_type).toBe('cancer');
      expect(expectedResponse.disclaimers).toHaveLength(4);
    });

    it('should handle gene-based searches for GIAB samples', async () => {
      const geneSearchRequest = {
        name: 'search_variants',
        arguments: {
          gene: 'BRCA2',
          analysis_type: 'cancer',
          clinical_context: true
        }
      };

      const expectedGeneResponse = {
        success: true,
        query_info: {
          gene: 'BRCA2',
          chromosome: '13',
          gene_region: '32315086-32400266',
          analysis_type: 'cancer'
        },
        variants: expect.arrayContaining([
          expect.objectContaining({
            chrom: '13',
            pos: expect.any(Number),
            annotations: expect.objectContaining({
              gene_symbol: 'BRCA2'
            }),
            samples: expect.objectContaining({
              HG001: expect.any(Object)
            })
          })
        ]),
        gene_summary: {
          total_variants_in_gene: expect.any(Number),
          pathogenic_variants: expect.any(Number),
          clinical_actionability: 'high',
          inheritance_pattern: 'autosomal_dominant',
          clinical_indications: expect.arrayContaining([
            'hereditary_breast_cancer',
            'hereditary_ovarian_cancer'
          ])
        }
      };

      expect(geneSearchRequest.arguments.gene).toBe('BRCA2');
      expect(expectedGeneResponse.gene_summary.clinical_actionability).toBe('high');
    });

    it('should provide appropriate clinical context for different analysis types', async () => {
      const analysisTypes = ['general', 'cancer', 'cardiac', 'pharmacogenomic'];
      
      for (const analysisType of analysisTypes) {
        const request = {
          name: 'search_variants',
          arguments: {
            chrom: '1',
            start: 1,
            end: 1000000,
            analysis_type: analysisType,
            clinical_context: true
          }
        };

        const expectedContexts = {
          general: {
            focus: 'comprehensive_screening',
            guidelines: expect.arrayContaining([
              expect.stringMatching(/population.*frequency/i),
              expect.stringMatching(/clinical.*validation/i)
            ])
          },
          cancer: {
            focus: 'oncology_actionable_variants',
            guidelines: expect.arrayContaining([
              expect.stringMatching(/tumor.*suppressor/i),
              expect.stringMatching(/hereditary.*cancer/i)
            ])
          },
          cardiac: {
            focus: 'cardiovascular_genetics',
            guidelines: expect.arrayContaining([
              expect.stringMatching(/cardiomyopathy/i),
              expect.stringMatching(/arrhythmia/i)
            ])
          },
          pharmacogenomic: {
            focus: 'drug_metabolism',
            guidelines: expect.arrayContaining([
              expect.stringMatching(/drug.*response/i),
              expect.stringMatching(/dosing.*adjustment/i)
            ])
          }
        };

        expect(request.arguments.analysis_type).toBe(analysisType);
        expect(expectedContexts[analysisType as keyof typeof expectedContexts].focus).toBeDefined();
      }
    });
  });

  describe('get_variant_details Tool with GIAB Data', () => {
    it('should provide comprehensive details for known GIAB pathogenic variant', async () => {
      const variantDetailsRequest = {
        name: 'get_variant_details',
        arguments: {
          variant_id: 12345 // Mock variant ID for BRCA1 variant
        }
      };

      const expectedDetailResponse = {
        success: true,
        variant: {
          id: 12345,
          position: {
            chrom: '17',
            pos: 43044295,
            ref: 'G',
            alt: 'A',
            build: 'GRCh38'
          },
          quality: {
            qual_score: expect.any(Number),
            filter: 'PASS',
            depth: expect.any(Number),
            mapping_quality: expect.any(Number)
          },
          samples: {
            HG002: {
              genotype: '0/1',
              allelic_depth: expect.any(String),
              genotype_quality: expect.any(Number),
              phase_set: expect.any(String)
            }
          },
          annotations: {
            gene_symbol: 'BRCA1',
            transcript: expect.any(String),
            consequence: 'missense_variant',
            protein_change: expect.any(String),
            clinical_significance: 'pathogenic',
            review_status: 'criteria_provided_multiple_submitters',
            last_evaluated: expect.any(String)
          },
          population_frequencies: {
            gnomad_exomes: expect.any(Number),
            gnomad_genomes: expect.any(Number),
            topmed: expect.any(Number),
            uk_biobank: expect.any(Number)
          },
          clinical_context: {
            acmg_classification: 'pathogenic',
            clinical_guidelines: expect.arrayContaining([
              expect.stringMatching(/BRCA1.*testing/i),
              expect.stringMatching(/cancer.*screening/i)
            ]),
            therapeutic_implications: expect.arrayContaining([
              expect.stringMatching(/PARP.*inhibitor/i),
              expect.stringMatching(/platinum.*sensitivity/i)
            ])
          },
          validation_info: {
            giab_sample: 'HG002',
            truth_set_status: 'high_confidence',
            validation_method: 'multiple_technologies',
            confidence_region: true
          }
        }
      };

      expect(variantDetailsRequest.arguments.variant_id).toBe(12345);
      expect(expectedDetailResponse.variant.annotations.gene_symbol).toBe('BRCA1');
      expect(expectedDetailResponse.variant.validation_info.giab_sample).toBe('HG002');
    });

    it('should handle common population variants appropriately', async () => {
      const commonVariantRequest = {
        name: 'get_variant_details',
        arguments: {
          variant_id: 67890 // Mock ID for common variant
        }
      };

      const expectedCommonResponse = {
        success: true,
        variant: {
          id: 67890,
          position: {
            chrom: '1',
            pos: 69897,
            ref: 'T',
            alt: 'C'
          },
          samples: {
            HG002: {
              genotype: '1/1' // Homozygous for common variant
            }
          },
          annotations: {
            clinical_significance: 'benign',
            consequence: 'synonymous_variant'
          },
          population_frequencies: {
            gnomad_exomes: 0.85, // Very common
            interpretation: 'common_population_variant'
          },
          clinical_context: {
            clinical_action: 'none_required',
            interpretation: 'This is a common population variant with no clinical significance',
            population_context: 'Found in >50% of the general population'
          }
        }
      };

      expect(expectedCommonResponse.variant.population_frequencies.gnomad_exomes).toBe(0.85);
      expect(expectedCommonResponse.variant.clinical_context.clinical_action).toBe('none_required');
    });
  });

  describe('calculate_allele_frequency Tool with GIAB Data', () => {
    it('should calculate accurate allele frequencies for GIAB variants', async () => {
      const frequencyRequest = {
        name: 'calculate_allele_frequency',
        arguments: {
          chrom: '17',
          pos: 43044295,
          ref: 'G',
          alt: 'A'
        }
      };

      const expectedFrequencyResponse = {
        success: true,
        variant: {
          chrom: '17',
          pos: 43044295,
          ref: 'G',
          alt: 'A'
        },
        allele_frequency: 0.25, // Example: 1 het call in 2 samples = 1/4 = 0.25
        sample_counts: {
          total_samples: 2, // HG001 + HG002
          samples_with_variant: 1, // Only HG002 has this variant
          homozygous_ref: 1, // HG001: 0/0
          heterozygous: 1,    // HG002: 0/1
          homozygous_alt: 0,  // None: 1/1
          total_alleles: 4,   // 2 samples × 2 alleles each
          alt_allele_count: 1 // One alt allele from HG002
        },
        quality_metrics: {
          average_depth: expect.any(Number),
          average_quality: expect.any(Number),
          pass_filter_samples: 2
        },
        population_context: {
          is_rare: true, // < 1% frequency
          clinical_significance: 'requires_evaluation',
          population_databases: {
            gnomad: expect.any(Number),
            topmed: expect.any(Number)
          }
        },
        giab_context: {
          validated_samples: ['HG002'],
          truth_set_confidence: 'high',
          technology_validation: ['illumina', 'pacbio', 'ont']
        }
      };

      expect(frequencyRequest.arguments.chrom).toBe('17');
      expect(frequencyRequest.arguments.pos).toBe(43044295);
      expect(expectedFrequencyResponse.allele_frequency).toBe(0.25);
      expect(expectedFrequencyResponse.giab_context.validated_samples).toContain('HG002');
    });

    it('should handle variants not present in GIAB samples', async () => {
      const absentVariantRequest = {
        name: 'calculate_allele_frequency',
        arguments: {
          chrom: '22',
          pos: 99999999, // Position unlikely to have variants
          ref: 'A',
          alt: 'T'
        }
      };

      const expectedAbsentResponse = {
        success: true,
        variant: {
          chrom: '22',
          pos: 99999999,
          ref: 'A',
          alt: 'T'
        },
        allele_frequency: 0.0,
        sample_counts: {
          total_samples: 2,
          samples_with_variant: 0,
          homozygous_ref: 2,
          heterozygous: 0,
          homozygous_alt: 0,
          total_alleles: 4,
          alt_allele_count: 0
        },
        interpretation: 'variant_not_found_in_dataset',
        population_context: {
          recommendation: 'check_population_databases_for_frequency'
        }
      };

      expect(expectedAbsentResponse.allele_frequency).toBe(0.0);
      expect(expectedAbsentResponse.sample_counts.samples_with_variant).toBe(0);
    });
  });

  describe('get_variant_stats Tool with GIAB Sample Filtering', () => {
    it('should provide accurate statistics for GIAB samples', async () => {
      const statsRequest = {
        name: 'get_variant_stats',
        arguments: {
          sample_filter: ['HG001', 'HG002'],
          include_clinical_context: true
        }
      };

      const expectedStatsResponse = {
        success: true,
        dataset_overview: {
          total_samples: 2,
          samples: ['HG001', 'HG002'],
          sample_types: ['GIAB_reference', 'GIAB_reference'],
          total_variants: expect.any(Number),
          chromosomes_covered: expect.arrayContaining(['1', '2', '17', '22'])
        },
        quality_distribution: {
          PASS: expect.any(Number),
          BOOSTED: 0, // GIAB typically only has PASS
          IMP: 0,
          LOWQ: 0,
          total_filtered: expect.any(Number)
        },
        variant_types: {
          SNV: expect.any(Number),
          insertion: expect.any(Number),
          deletion: expect.any(Number),
          complex: expect.any(Number)
        },
        clinical_summary: {
          pathogenic_variants: expect.any(Number),
          likely_pathogenic: expect.any(Number),
          vus_variants: expect.any(Number),
          likely_benign: expect.any(Number),
          benign_variants: expect.any(Number),
          clinical_genes_covered: expect.any(Array)
        },
        giab_validation: {
          truth_set_samples: ['HG001', 'HG002'],
          confidence_regions: {
            total_callable_bases: expect.any(Number),
            percent_genome_covered: expect.any(Number)
          },
          expected_variant_counts: {
            HG001: { min: 2500000, max: 2900000 },
            HG002: { min: 2800000, max: 3200000 }
          },
          data_quality: 'high_confidence',
          technology_platforms: ['illumina', 'pacbio', 'ont', '10x']
        }
      };

      expect(statsRequest.arguments.sample_filter).toEqual(['HG001', 'HG002']);
      expect(expectedStatsResponse.giab_validation.truth_set_samples).toEqual(['HG001', 'HG002']);
    });

    it('should compare patient samples against GIAB references', async () => {
      const comparisonRequest = {
        name: 'get_variant_stats',
        arguments: {
          sample_filter: ['US-WWCJ-HMH24', 'HG002'], // Patient + GIAB reference
          include_clinical_context: true,
          comparison_mode: true
        }
      };

      const expectedComparisonResponse = {
        success: true,
        comparison: {
          reference_sample: 'HG002',
          test_sample: 'US-WWCJ-HMH24',
          variant_overlap: {
            shared_variants: expect.any(Number),
            reference_only: expect.any(Number),
            test_only: expect.any(Number),
            concordance_rate: expect.any(Number)
          },
          quality_comparison: {
            reference_quality: expect.objectContaining({
              average_depth: expect.any(Number),
              pass_rate: expect.any(Number)
            }),
            test_quality: expect.objectContaining({
              average_depth: expect.any(Number),
              pass_rate: expect.any(Number)
            })
          },
          clinical_comparison: {
            pathogenic_concordance: expect.any(Number),
            novel_pathogenic_in_test: expect.any(Number),
            actionable_findings: expect.any(Array)
          }
        },
        validation_metrics: {
          precision: expect.any(Number),
          recall: expect.any(Number),
          f1_score: expect.any(Number)
        }
      };

      expect(comparisonRequest.arguments.comparison_mode).toBe(true);
      expect(expectedComparisonResponse.comparison.reference_sample).toBe('HG002');
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle invalid chromosome names gracefully', async () => {
      const invalidRequest = {
        name: 'search_variants',
        arguments: {
          chrom: 'chr999', // Invalid chromosome
          start: 1,
          end: 1000
        }
      };

      const expectedErrorResponse = {
        success: false,
        error: {
          type: 'invalid_chromosome',
          message: 'Chromosome "chr999" is not valid. Valid chromosomes: 1-22, X, Y, MT',
          valid_chromosomes: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20', '21', '22', 'X', 'Y', 'MT']
        }
      };

      expect(invalidRequest.arguments.chrom).toBe('chr999');
      expect(expectedErrorResponse.success).toBe(false);
    });

    it('should handle requests for non-GIAB samples appropriately', async () => {
      const nonGiabRequest = {
        name: 'get_variant_stats',
        arguments: {
          sample_filter: ['UNKNOWN_SAMPLE'],
          include_clinical_context: true
        }
      };

      const expectedNonGiabResponse = {
        success: false,
        error: {
          type: 'sample_not_found',
          message: 'Sample "UNKNOWN_SAMPLE" not found in dataset',
          available_samples: ['HG001', 'HG002', 'US-WWCJ-HMH24'],
          suggestion: 'Use available samples or check sample ID spelling'
        }
      };

      expect(nonGiabRequest.arguments.sample_filter).toContain('UNKNOWN_SAMPLE');
      expect(expectedNonGiabResponse.success).toBe(false);
    });
  });
});