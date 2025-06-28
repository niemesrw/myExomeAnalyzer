/**
 * Unit tests for Clinical Metadata Processing
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { ClinicalMetadataService } from '../../src/clinical/clinical-metadata.js';

// Mock external APIs and databases
jest.mock('node-fetch', () => jest.fn());

describe('ClinicalMetadataService', () => {
  let processor: ClinicalMetadataService;

  beforeEach(() => {
    processor = new ClinicalMetadataService();
    jest.clearAllMocks();
  });

  describe('Variant Classification', () => {
    it('should classify pathogenic variants correctly', () => {
      const pathogenicVariant = {
        chrom: '17',
        pos: 43044295,
        ref: 'G',
        alt: ['A'],
        info: {
          CLNSIG: 'Pathogenic',
          CLNDN: 'Breast and ovarian cancer',
          CLNHGVS: 'NC_000017.11:g.43044295G>A'
        }
      };

      const classification = processor.classifyVariant(pathogenicVariant);

      expect(classification).toEqual({
        significance: 'Pathogenic',
        confidence: 'high',
        disease: 'Breast and ovarian cancer',
        gene: expect.any(String),
        hgvs: 'NC_000017.11:g.43044295G>A',
        actionable: true,
        clinicalRelevance: 'high'
      });
    });

    it('should classify benign variants correctly', () => {
      const benignVariant = {
        chrom: '1',
        pos: 12345,
        ref: 'A',
        alt: ['T'],
        info: {
          CLNSIG: 'Benign',
          CLNDN: 'not provided',
          AF: '0.45' // Common variant
        }
      };

      const classification = processor.classifyVariant(benignVariant);

      expect(classification).toEqual({
        significance: 'Benign',
        confidence: 'high',
        disease: 'not provided',
        gene: expect.any(String),
        actionable: false,
        clinicalRelevance: 'low',
        populationFrequency: 0.45
      });
    });

    it('should handle variants of uncertain significance (VUS)', () => {
      const vusVariant = {
        chrom: '13',
        pos: 32906729,
        ref: 'C',
        alt: ['T'],
        info: {
          CLNSIG: 'Uncertain significance',
          CLNDN: 'Hereditary cancer-predisposing syndrome'
        }
      };

      const classification = processor.classifyVariant(vusVariant);

      expect(classification).toEqual({
        significance: 'Uncertain significance',
        confidence: 'medium',
        disease: 'Hereditary cancer-predisposing syndrome',
        gene: expect.any(String),
        actionable: false,
        clinicalRelevance: 'medium',
        requiresReview: true
      });
    });

    it('should classify variants without ClinVar annotations', () => {
      const novelVariant = {
        chrom: '2',
        pos: 234567,
        ref: 'G',
        alt: ['C'],
        info: {
          AF: '0.001' // Rare variant
        }
      };

      const classification = processor.classifyVariant(novelVariant);

      expect(classification).toEqual({
        significance: 'Unknown',
        confidence: 'low',
        actionable: false,
        clinicalRelevance: 'unknown',
        requiresReview: true,
        populationFrequency: 0.001,
        isNovel: true
      });
    });
  });

  describe('Gene Annotation', () => {
    it('should annotate variants with gene information', async () => {
      // Mock gene database response
      const mockGeneInfo = {
        symbol: 'BRCA1',
        name: 'BRCA1 DNA repair associated',
        location: '17q21.31',
        function: 'DNA repair',
        diseases: ['Breast cancer', 'Ovarian cancer'],
        inheritance: 'Autosomal dominant'
      };

      processor['geneDatabase'] = {
        getGeneByPosition: jest.fn().mockResolvedValue(mockGeneInfo)
      };

      const variant = {
        chrom: '17',
        pos: 43044295,
        ref: 'G',
        alt: ['A']
      };

      const annotation = await processor.annotateWithGene(variant);

      expect(annotation).toEqual({
        ...variant,
        gene: mockGeneInfo,
        geneSymbol: 'BRCA1',
        geneName: 'BRCA1 DNA repair associated',
        chromosomeLocation: '17q21.31'
      });
    });

    it('should handle variants in intergenic regions', async () => {
      processor['geneDatabase'] = {
        getGeneByPosition: jest.fn().mockResolvedValue(null)
      };

      const intergenicVariant = {
        chrom: '1',
        pos: 12345,
        ref: 'A',
        alt: ['T']
      };

      const annotation = await processor.annotateWithGene(intergenicVariant);

      expect(annotation).toEqual({
        ...intergenicVariant,
        gene: null,
        geneSymbol: 'INTERGENIC',
        geneName: 'Intergenic region',
        chromosomeLocation: '1p36.33' // Approximate cytogenetic band
      });
    });

    it('should prioritize variants in disease-associated genes', () => {
      const variants = [
        { chrom: '1', pos: 12345, gene: { symbol: 'GENE1', diseases: [] } },
        { chrom: '17', pos: 43044295, gene: { symbol: 'BRCA1', diseases: ['Breast cancer'] } },
        { chrom: '2', pos: 67890, gene: { symbol: 'GENE2', diseases: [] } }
      ];

      const prioritized = processor.prioritizeByGene(variants);

      expect(prioritized[0].gene.symbol).toBe('BRCA1');
      expect(prioritized[0].priority).toBe('high');
    });
  });

  describe('Clinical Decision Support', () => {
    it('should generate clinical recommendations for pathogenic variants', () => {
      const pathogenicVariant = {
        chrom: '17',
        pos: 43044295,
        ref: 'G',
        alt: ['A'],
        classification: {
          significance: 'Pathogenic',
          disease: 'Breast and ovarian cancer',
          gene: 'BRCA1'
        }
      };

      const recommendations = processor.generateRecommendations(pathogenicVariant);

      expect(recommendations).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'genetic_counseling',
            urgency: 'high',
            description: expect.stringContaining('genetic counseling')
          }),
          expect.objectContaining({
            type: 'family_screening',
            urgency: 'high',
            description: expect.stringContaining('family members')
          }),
          expect.objectContaining({
            type: 'surveillance',
            urgency: 'medium',
            description: expect.stringContaining('screening')
          })
        ])
      );
    });

    it('should recommend no action for benign variants', () => {
      const benignVariant = {
        chrom: '1',
        pos: 12345,
        ref: 'A',
        alt: ['T'],
        classification: {
          significance: 'Benign',
          populationFrequency: 0.35
        }
      };

      const recommendations = processor.generateRecommendations(benignVariant);

      expect(recommendations).toEqual([
        expect.objectContaining({
          type: 'no_action',
          urgency: 'none',
          description: 'No clinical action required for this benign variant'
        })
      ]);
    });

    it('should recommend periodic review for VUS', () => {
      const vusVariant = {
        chrom: '13',
        pos: 32906729,
        ref: 'C',
        alt: ['T'],
        classification: {
          significance: 'Uncertain significance',
          disease: 'Hereditary cancer-predisposing syndrome'
        }
      };

      const recommendations = processor.generateRecommendations(vusVariant);

      expect(recommendations).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'periodic_review',
            urgency: 'low',
            description: expect.stringContaining('reclassification')
          }),
          expect.objectContaining({
            type: 'family_segregation',
            urgency: 'medium',
            description: expect.stringContaining('segregation analysis')
          })
        ])
      );
    });
  });

  describe('Population Frequency Analysis', () => {
    it('should categorize variants by population frequency', () => {
      const testCases = [
        { af: 0.5, expected: 'common' },
        { af: 0.05, expected: 'low_frequency' },
        { af: 0.005, expected: 'rare' },
        { af: 0.0001, expected: 'very_rare' },
        { af: undefined, expected: 'unknown' }
      ];

      testCases.forEach(({ af, expected }) => {
        const category = processor.categorizeByFrequency(af);
        expect(category).toBe(expected);
      });
    });

    it('should calculate population-specific allele frequencies', () => {
      const variant = {
        info: {
          AF: '0.01',
          AF_AFR: '0.05',
          AF_EUR: '0.008',
          AF_EAS: '0.002',
          AF_SAS: '0.015'
        }
      };

      const frequencies = processor.extractPopulationFrequencies(variant);

      expect(frequencies).toEqual({
        overall: 0.01,
        african: 0.05,
        european: 0.008,
        east_asian: 0.002,
        south_asian: 0.015
      });
    });

    it('should identify population-specific variants', () => {
      const variant = {
        info: {
          AF: '0.001',
          AF_AFR: '0.05',
          AF_EUR: '0.0001'
        }
      };

      const analysis = processor.analyzePopulationSpecificity(variant);

      expect(analysis).toEqual({
        isPopulationSpecific: true,
        enrichedPopulations: ['african'],
        foldEnrichment: { african: 50 }, // 0.05 / 0.001
        clinicalConsiderations: expect.arrayContaining([
          expect.stringContaining('population-specific')
        ])
      });
    });
  });

  describe('Clinical Report Generation', () => {
    it('should generate comprehensive clinical reports', async () => {
      const variants = [
        {
          chrom: '17',
          pos: 43044295,
          ref: 'G',
          alt: ['A'],
          classification: { significance: 'Pathogenic', gene: 'BRCA1' }
        },
        {
          chrom: '1',
          pos: 12345,
          ref: 'A',
          alt: ['T'],
          classification: { significance: 'Benign' }
        }
      ];

      const report = await processor.generateClinicalReport(variants, {
        patientId: 'PATIENT_001',
        indication: 'Hereditary cancer screening'
      });

      expect(report).toEqual({
        patientId: 'PATIENT_001',
        indication: 'Hereditary cancer screening',
        reportDate: expect.any(String),
        summary: {
          totalVariants: 2,
          pathogenic: 1,
          benign: 1,
          vus: 0,
          actionableFindings: 1
        },
        clinicalFindings: expect.arrayContaining([
          expect.objectContaining({
            variant: expect.objectContaining({ chrom: '17' }),
            significance: 'Pathogenic',
            recommendations: expect.any(Array)
          })
        ]),
        disclaimer: expect.stringContaining('clinical interpretation'),
        methodology: expect.any(String)
      });
    });

    it('should format variants in HGVS nomenclature', () => {
      const variant = {
        chrom: '17',
        pos: 43044295,
        ref: 'G',
        alt: ['A'],
        gene: { symbol: 'BRCA1', transcript: 'NM_007294.3' }
      };

      const hgvs = processor.formatHGVS(variant);

      expect(hgvs).toEqual({
        genomic: 'NC_000017.11:g.43044295G>A',
        transcript: 'NM_007294.3:c.185G>A',
        protein: expect.stringMatching(/p\.\w+\d+\w+/)
      });
    });

    it('should validate clinical report completeness', () => {
      const completeReport = {
        patientId: 'PATIENT_001',
        indication: 'Cancer screening',
        reportDate: '2024-01-01',
        summary: { totalVariants: 1 },
        clinicalFindings: [{}],
        disclaimer: 'Clinical interpretation disclaimer',
        methodology: 'WES analysis'
      };

      const incompleteReport = {
        patientId: 'PATIENT_001',
        // Missing required fields
      };

      expect(processor.validateReport(completeReport)).toBe(true);
      expect(processor.validateReport(incompleteReport)).toBe(false);
    });
  });

  describe('Quality Control and Validation', () => {
    it('should validate clinical annotation sources', () => {
      const validSources = ['ClinVar', 'OMIM', 'HGMD', 'LOVD'];
      const invalidSources = ['Wikipedia', 'Blog', ''];

      validSources.forEach(source => {
        expect(processor.isValidAnnotationSource(source)).toBe(true);
      });

      invalidSources.forEach(source => {
        expect(processor.isValidAnnotationSource(source)).toBe(false);
      });
    });

    it('should flag inconsistent annotations', () => {
      const inconsistentVariant = {
        info: {
          CLNSIG: 'Pathogenic',
          AF: '0.25' // High frequency conflicts with pathogenic classification
        }
      };

      const flags = processor.checkAnnotationConsistency(inconsistentVariant);

      expect(flags).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'frequency_significance_conflict',
            severity: 'warning',
            description: expect.stringContaining('frequency')
          })
        ])
      );
    });

    it('should require manual review for complex cases', () => {
      const complexVariant = {
        classification: { significance: 'Uncertain significance' },
        info: { 
          CLNREVSTAT: 'conflicting interpretations of pathogenicity',
          AF: '0.001'
        }
      };

      const reviewRequired = processor.requiresManualReview(complexVariant);

      expect(reviewRequired).toBe(true);
      expect(processor.getReviewReasons(complexVariant)).toEqual(
        expect.arrayContaining([
          'Conflicting interpretations in ClinVar',
          'Variant of uncertain significance',
          'Rare variant requiring additional evidence'
        ])
      );
    });
  });
});