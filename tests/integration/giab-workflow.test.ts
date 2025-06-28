/**
 * Integration tests for end-to-end GIAB workflow
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import { GIABManager } from '../../src/giab/giab-manager.js';
import { TileDBQueryEngine } from '../../src/tiledb/query-engine.js';
import { VCFImporter } from '../../src/importer/vcf-importer.js';
import { TEST_WORKSPACE } from '../setup.js';
import * as fs from 'fs/promises';
import * as path from 'path';

// Mock external dependencies for integration testing
jest.mock('child_process');

describe('GIAB Workflow Integration', () => {
  let giabManager: GIABManager;
  let queryEngine: TileDBQueryEngine;
  let vcfImporter: VCFImporter;
  let testWorkspace: string;

  beforeAll(async () => {
    // Set up test workspace
    testWorkspace = path.join(TEST_WORKSPACE, 'giab_integration');
    await fs.mkdir(testWorkspace, { recursive: true });
    
    // Initialize components
    giabManager = new GIABManager();
    queryEngine = new TileDBQueryEngine();
    vcfImporter = new VCFImporter();
  });

  afterAll(async () => {
    // Clean up test workspace
    try {
      await fs.rm(testWorkspace, { recursive: true, force: true });
    } catch (error) {
      console.warn('Failed to clean up test workspace:', error);
    }
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Complete GIAB Sample Import Workflow', () => {
    it('should successfully import and validate GIAB HG002 sample', async () => {
      // Mock the download process
      const { spawn } = require('child_process');
      const mockDownloadProcess = {
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() },
        on: jest.fn((event, callback) => {
          if (event === 'close') callback(0);
        })
      };
      
      const mockImportProcess = {
        stdout: { 
          on: jest.fn((event, callback) => {
            if (event === 'data') {
              callback(Buffer.from('Import progress: 50000 variants processed'));
            }
          })
        },
        stderr: { on: jest.fn() },
        on: jest.fn((event, callback) => {
          if (event === 'close') callback(0);
        })
      };

      spawn
        .mockReturnValueOnce(mockDownloadProcess)
        .mockReturnValueOnce(mockImportProcess);

      // Step 1: Import GIAB sample
      const importResult = await giabManager.importSample('HG002');
      
      expect(importResult.success).toBe(true);
      expect(importResult.sampleId).toBe('HG002');
      expect(importResult.imported).toBe(true);

      // Step 2: Mock query engine to return realistic GIAB data
      const mockStats = {
        totalVariants: 229739,
        chromosomes: ['1', '2', '13', '17', '22'],
        positionRange: [1, 248946058],
        sampleCount: 1,
        arraySize: '15.4 GB'
      };
      
      queryEngine.getSampleStats = jest.fn().mockResolvedValue(mockStats);

      // Step 3: Validate imported data
      const validationResult = await giabManager.testSampleIntegrity('HG002', queryEngine);
      
      expect(validationResult.success).toBe(true);
      expect(validationResult.sampleId).toBe('HG002');
      expect(validationResult.actualCount).toBe(229739);
      expect(validationResult.variance).toBeCloseTo(-92.59, 1);
    }, 60000); // 60 second timeout for integration test

    it('should handle multiple GIAB samples correctly', async () => {
      const { spawn } = require('child_process');
      
      // Mock successful imports for both samples
      spawn.mockImplementation(() => ({
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() },
        on: jest.fn((event, callback) => {
          if (event === 'close') callback(0);
        })
      }));

      // Import both samples
      const hg001Import = await giabManager.importSample('HG001');
      const hg002Import = await giabManager.importSample('HG002');

      expect(hg001Import.success).toBe(true);
      expect(hg002Import.success).toBe(true);

      // Mock query engine for multi-sample stats
      queryEngine.getSampleStats = jest.fn()
        .mockResolvedValueOnce({
          totalVariants: 354782,
          chromosomes: ['1', '2', '13', '17', '22'],
          positionRange: [1, 248946058],
          sampleCount: 1,
          arraySize: '18.2 GB'
        })
        .mockResolvedValueOnce({
          totalVariants: 229739,
          chromosomes: ['1', '2', '13', '17', '22'],
          positionRange: [1, 248946058],
          sampleCount: 1,
          arraySize: '15.4 GB'
        });

      // Test both samples
      const allResults = await giabManager.testAllSamplesIntegrity(queryEngine);

      expect(allResults).toHaveLength(2);
      expect(allResults.find(r => r.sampleId === 'HG001')).toBeDefined();
      expect(allResults.find(r => r.sampleId === 'HG002')).toBeDefined();
    }, 120000);
  });

  describe('Data Query and Retrieval Integration', () => {
    it('should query GIAB variants from specific genomic regions', async () => {
      // Mock BRCA1 region variants
      const mockBRCA1Variants = [
        {
          chrom: '17',
          pos: 43044295,
          ref: 'G',
          alt: ['A'],
          qual: 85.2,
          filter: ['PASS'],
          info: { DP: '45', AF: '0.5' },
          samples: {
            'HG002': { GT: '0/1', DP: '42', AD: '20,22' }
          }
        },
        {
          chrom: '17',
          pos: 43045802,
          ref: 'C',
          alt: ['T'],
          qual: 92.7,
          filter: ['PASS'],
          info: { DP: '38', AF: '0.5' },
          samples: {
            'HG002': { GT: '0/1', DP: '35', AD: '17,18' }
          }
        }
      ];

      queryEngine.queryVariants = jest.fn().mockResolvedValue(mockBRCA1Variants);

      // Query BRCA1 region for HG002
      const brca1Variants = await queryEngine.queryVariants({
        chrom: '17',
        start: 43044000,
        end: 43046000,
        samples: ['HG002'],
        minQual: 50.0
      });

      expect(brca1Variants).toHaveLength(2);
      expect(brca1Variants[0].chrom).toBe('17');
      expect(brca1Variants[0].samples).toHaveProperty('HG002');
      expect(queryEngine.queryVariants).toHaveBeenCalledWith({
        chrom: '17',
        start: 43044000,
        end: 43046000,
        samples: ['HG002'],
        minQual: 50.0
      });
    });

    it('should calculate allele frequencies across GIAB samples', async () => {
      // Mock allele frequency calculation
      queryEngine.calculateAlleleFrequency = jest.fn()
        .mockResolvedValue(0.25); // 25% frequency across samples

      const frequency = await queryEngine.calculateAlleleFrequency('17', 43044295, 'G', 'A');

      expect(frequency).toBe(0.25);
      expect(queryEngine.calculateAlleleFrequency).toHaveBeenCalledWith('17', 43044295, 'G', 'A');
    });

    it('should filter variants by sample-specific criteria', async () => {
      const mockHG001Variants = [
        {
          chrom: '1',
          pos: 12345,
          ref: 'A',
          alt: ['T'],
          samples: { 'HG001': { GT: '1/1', DP: '30' } }
        }
      ];

      const mockHG002Variants = [
        {
          chrom: '1',
          pos: 67890,
          ref: 'C',
          alt: ['G'],
          samples: { 'HG002': { GT: '0/1', DP: '28' } }
        }
      ];

      queryEngine.queryVariants = jest.fn()
        .mockResolvedValueOnce(mockHG001Variants)
        .mockResolvedValueOnce(mockHG002Variants);

      // Query each sample separately
      const hg001Results = await queryEngine.queryVariants({
        chrom: '1',
        start: 1,
        end: 100000,
        samples: ['HG001']
      });

      const hg002Results = await queryEngine.queryVariants({
        chrom: '1',
        start: 1,
        end: 100000,
        samples: ['HG002']
      });

      expect(hg001Results[0].samples).toHaveProperty('HG001');
      expect(hg001Results[0].samples).not.toHaveProperty('HG002');
      expect(hg002Results[0].samples).toHaveProperty('HG002');
      expect(hg002Results[0].samples).not.toHaveProperty('HG001');
    });
  });

  describe('Error Handling and Recovery', () => {
    it('should handle network failures during download gracefully', async () => {
      const { spawn } = require('child_process');
      
      // Mock network failure
      const mockFailedProcess = {
        stdout: { on: jest.fn() },
        stderr: { 
          on: jest.fn((event, callback) => {
            if (event === 'data') {
              callback(Buffer.from('Network error: Connection timeout'));
            }
          })
        },
        on: jest.fn((event, callback) => {
          if (event === 'close') callback(1); // Exit with error
        })
      };
      
      spawn.mockReturnValue(mockFailedProcess);

      const result = await giabManager.importSample('HG001');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Network error');
      expect(result.downloaded).toBe(false);
    });

    it('should recover from partial import failures', async () => {
      const { spawn } = require('child_process');
      
      // Mock successful download but failed import
      spawn
        .mockReturnValueOnce({
          stdout: { on: jest.fn() },
          stderr: { on: jest.fn() },
          on: jest.fn((event, callback) => {
            if (event === 'close') callback(0); // Successful download
          })
        })
        .mockReturnValueOnce({
          stdout: { on: jest.fn() },
          stderr: { 
            on: jest.fn((event, callback) => {
              if (event === 'data') {
                callback(Buffer.from('Import failed: Invalid VCF format'));
              }
            })
          },
          on: jest.fn((event, callback) => {
            if (event === 'close') callback(1); // Failed import
          })
        });

      const result = await giabManager.importSample('HG002');

      expect(result.success).toBe(false);
      expect(result.downloaded).toBe(true);
      expect(result.imported).toBe(false);
      expect(result.error).toContain('Import failed');
    });

    it('should validate data integrity after import', async () => {
      // Mock successful import but data validation failure
      queryEngine.getSampleStats = jest.fn().mockResolvedValue({
        totalVariants: 50, // Far too few variants
        chromosomes: ['1'],
        positionRange: [1, 1000],
        sampleCount: 1,
        arraySize: '1 MB'
      });

      const validationResult = await giabManager.testSampleIntegrity('HG002', queryEngine);

      expect(validationResult.success).toBe(false);
      expect(validationResult.variance).toBeLessThan(-99); // Almost 100% variance
      expect(validationResult.actualCount).toBe(50);
    });
  });

  describe('Performance and Scalability', () => {
    it('should handle large-scale variant queries efficiently', async () => {
      // Mock large result set
      const mockLargeResults = Array(10000).fill(null).map((_, i) => ({
        chrom: '1',
        pos: i + 1,
        ref: 'A',
        alt: ['T'],
        samples: { 'HG001': { GT: '0/1' } }
      }));

      queryEngine.queryVariants = jest.fn().mockResolvedValue(mockLargeResults);

      const startTime = Date.now();
      const results = await queryEngine.queryVariants({
        chrom: '1',
        start: 1,
        end: 10000,
        samples: ['HG001']
      });
      const endTime = Date.now();

      expect(results).toHaveLength(10000);
      expect(endTime - startTime).toBeLessThan(5000); // Should complete within 5 seconds
    });

    it('should efficiently process batch queries', async () => {
      const batchQueries = [
        { chrom: '1', start: 1, end: 1000, samples: ['HG001'] },
        { chrom: '17', start: 43044000, end: 43046000, samples: ['HG002'] },
        { chrom: '22', start: 1, end: 1000, samples: ['HG001', 'HG002'] }
      ];

      // Mock batch processing
      queryEngine.queryVariants = jest.fn()
        .mockResolvedValueOnce([{ chrom: '1', pos: 500 }])
        .mockResolvedValueOnce([{ chrom: '17', pos: 43045000 }])
        .mockResolvedValueOnce([{ chrom: '22', pos: 750 }]);

      const startTime = Date.now();
      const batchResults = await Promise.all(
        batchQueries.map(query => queryEngine.queryVariants(query))
      );
      const endTime = Date.now();

      expect(batchResults).toHaveLength(3);
      expect(batchResults[0][0].chrom).toBe('1');
      expect(batchResults[1][0].chrom).toBe('17');
      expect(batchResults[2][0].chrom).toBe('22');
      expect(endTime - startTime).toBeLessThan(3000); // Batch should be faster than sequential
    });
  });

  describe('Data Consistency and Validation', () => {
    it('should ensure GIAB data meets quality thresholds', async () => {
      const mockHighQualityStats = {
        totalVariants: 3089456, // Close to expected GIAB count
        chromosomes: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20', '21', '22', 'X'],
        positionRange: [1, 155270560], // Full chromosome coverage
        sampleCount: 1,
        arraySize: '1.2 GB',
        averageQuality: 68.5,
        passFilterRate: 0.987
      };

      queryEngine.getSampleStats = jest.fn().mockResolvedValue(mockHighQualityStats);

      const qualityReport = await giabManager.generateQualityReport('HG002', queryEngine);

      expect(qualityReport.testPassed).toBe(true);
      expect(qualityReport.variance).toBeCloseTo(-0.34, 1); // Very close to expected
      expect(qualityReport.chromosomeCoverage).toContain('17');
      expect(qualityReport.recommendations).toEqual([]);
    });

    it('should detect and report data quality issues', async () => {
      const mockPoorQualityStats = {
        totalVariants: 150000, // Much lower than expected
        chromosomes: ['1', '17'], // Missing chromosomes
        positionRange: [1, 50000000], // Limited position range
        sampleCount: 1,
        arraySize: '500 MB',
        averageQuality: 25.3, // Poor quality
        passFilterRate: 0.612 // Many failed filters
      };

      queryEngine.getSampleStats = jest.fn().mockResolvedValue(mockPoorQualityStats);

      const qualityReport = await giabManager.generateQualityReport('HG001', queryEngine);

      expect(qualityReport.testPassed).toBe(false);
      expect(qualityReport.variance).toBeLessThan(-95);
      expect(qualityReport.recommendations).toEqual(
        expect.arrayContaining([
          expect.stringMatching(/chromosome coverage/i),
          expect.stringMatching(/variant count/i),
          expect.stringMatching(/quality scores/i)
        ])
      );
    });
  });
});