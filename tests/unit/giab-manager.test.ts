/**
 * Unit tests for GIAB Manager
 */

import { describe, it, expect, beforeEach, jest, afterEach } from '@jest/globals';
import { GIABManager } from '../../src/giab/giab-manager.js';
import { TileDBQueryEngine } from '../../src/tiledb/query-engine.js';

// Mock the query engine
jest.mock('../../src/tiledb/query-engine.js');

// Mock fs for file operations
jest.mock('fs', () => ({
  promises: {
    access: jest.fn(),
    mkdir: jest.fn(),
    writeFile: jest.fn(),
    readFile: jest.fn(),
  },
  constants: {
    F_OK: 0,
  }
}));

// Mock child_process for downloads
jest.mock('child_process', () => ({
  spawn: jest.fn()
}));

describe('GIABManager', () => {
  let manager: GIABManager;
  let mockQueryEngine: jest.Mocked<TileDBQueryEngine>;

  beforeEach(() => {
    mockQueryEngine = new TileDBQueryEngine() as jest.Mocked<TileDBQueryEngine>;
    manager = new GIABManager();
    
    // Reset all mocks
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Sample Management', () => {
    it('should initialize with known GIAB samples', () => {
      const samples = manager['samples'];
      
      expect(samples).toHaveProperty('HG001');
      expect(samples).toHaveProperty('HG002');
      expect(samples.HG001).toEqual({
        name: 'HG001',
        description: 'GIAB Ashkenazi Jewish son',
        vcf_url: expect.stringContaining('HG001'),
        variant_count: expect.any(Number)
      });
      expect(samples.HG002).toEqual({
        name: 'HG002',
        description: 'GIAB Ashkenazi Jewish father',
        vcf_url: expect.stringContaining('HG002'),
        variant_count: expect.any(Number)
      });
    });

    it('should provide list of available samples', () => {
      const sampleList = manager.getAvailableSamples();
      
      expect(sampleList).toEqual(['HG001', 'HG002']);
    });

    it('should get sample details correctly', () => {
      const hg002Details = manager.getSampleDetails('HG002');
      
      expect(hg002Details).toEqual({
        name: 'HG002',
        description: 'GIAB Ashkenazi Jewish father',
        vcf_url: expect.stringContaining('HG002'),
        variant_count: expect.any(Number)
      });
    });

    it('should return undefined for non-existent samples', () => {
      const invalidSample = manager.getSampleDetails('HG999');
      
      expect(invalidSample).toBeUndefined();
    });
  });

  describe('Data Integrity Testing', () => {
    it('should test sample variant counts correctly', async () => {
      // Mock successful stats retrieval
      mockQueryEngine.getSampleStats.mockResolvedValue({
        totalVariants: 229739,
        chromosomes: ['1', '13', '17', '22'],
        positionRange: [1, 248946058],
        sampleCount: 1,
        arraySize: '15.4 GB'
      });

      const result = await manager.testSampleIntegrity('HG002', mockQueryEngine);

      expect(result.success).toBe(true);
      expect(result.sampleId).toBe('HG002');
      expect(result.expectedCount).toBe(3100000); // Expected GIAB HG002 variants
      expect(result.actualCount).toBe(229739);
      expect(result.variance).toBeCloseTo(-92.59, 2); // Calculated variance
      expect(mockQueryEngine.getSampleStats).toHaveBeenCalledWith(['HG002']);
    });

    it('should handle missing sample data gracefully', async () => {
      // Mock no variants found
      mockQueryEngine.getSampleStats.mockResolvedValue({
        totalVariants: 0,
        chromosomes: [],
        positionRange: [0, 0],
        sampleCount: 0,
        arraySize: '0 GB'
      });

      const result = await manager.testSampleIntegrity('HG001', mockQueryEngine);

      expect(result.success).toBe(false);
      expect(result.sampleId).toBe('HG001');
      expect(result.actualCount).toBe(0);
      expect(result.variance).toBe(-100); // 100% variance (no data found)
    });

    it('should calculate variance correctly', async () => {
      // Test exact match
      mockQueryEngine.getSampleStats.mockResolvedValue({
        totalVariants: 3500000, // Exactly expected for HG001
        chromosomes: ['1', '2', '3'],
        positionRange: [1, 248946058],
        sampleCount: 1,
        arraySize: '20 GB'
      });

      const result = await manager.testSampleIntegrity('HG001', mockQueryEngine);

      expect(result.variance).toBe(0); // Perfect match
      expect(result.success).toBe(true);
    });

    it('should handle query engine errors', async () => {
      // Mock query engine throwing an error
      mockQueryEngine.getSampleStats.mockRejectedValue(new Error('TileDB connection failed'));

      const result = await manager.testSampleIntegrity('HG002', mockQueryEngine);

      expect(result.success).toBe(false);
      expect(result.error).toBe('TileDB connection failed');
      expect(result.actualCount).toBe(0);
    });

    it('should test all samples when no specific sample provided', async () => {
      // Mock different responses for each sample
      mockQueryEngine.getSampleStats
        .mockResolvedValueOnce({
          totalVariants: 354000,
          chromosomes: ['1', '2'],
          positionRange: [1, 248946058],
          sampleCount: 1,
          arraySize: '10 GB'
        })
        .mockResolvedValueOnce({
          totalVariants: 231000,
          chromosomes: ['1', '2'],
          positionRange: [1, 248946058],
          sampleCount: 1,
          arraySize: '8 GB'
        });

      const results = await manager.testAllSamplesIntegrity(mockQueryEngine);

      expect(results).toHaveLength(2);
      expect(results[0].sampleId).toBe('HG001');
      expect(results[1].sampleId).toBe('HG002');
      expect(mockQueryEngine.getSampleStats).toHaveBeenCalledTimes(2);
    });
  });

  describe('Download Management', () => {
    it('should check if sample VCF exists locally', async () => {
      const fs = require('fs');
      fs.promises.access.mockResolvedValue(true);

      const exists = await manager.checkSampleExists('HG001');

      expect(exists).toBe(true);
      expect(fs.promises.access).toHaveBeenCalledWith(
        expect.stringContaining('HG001'),
        fs.constants.F_OK
      );
    });

    it('should return false when sample VCF does not exist', async () => {
      const fs = require('fs');
      fs.promises.access.mockRejectedValue(new Error('File not found'));

      const exists = await manager.checkSampleExists('HG002');

      expect(exists).toBe(false);
    });

    it('should download sample VCF when missing', async () => {
      const { spawn } = require('child_process');
      const mockProcess = {
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() },
        on: jest.fn((event, callback) => {
          if (event === 'close') {
            callback(0); // Successful download
          }
        })
      };
      spawn.mockReturnValue(mockProcess);

      const result = await manager.downloadSample('HG001');

      expect(result).toBe(true);
      expect(spawn).toHaveBeenCalledWith('wget', expect.arrayContaining([
        expect.stringContaining('HG001'),
        '-O',
        expect.any(String)
      ]));
    });

    it('should handle download failures gracefully', async () => {
      const { spawn } = require('child_process');
      const mockProcess = {
        stdout: { on: jest.fn() },
        stderr: { 
          on: jest.fn((event, callback) => {
            if (event === 'data') {
              callback(Buffer.from('Download failed'));
            }
          })
        },
        on: jest.fn((event, callback) => {
          if (event === 'close') {
            callback(1); // Failed download
          }
        })
      };
      spawn.mockReturnValue(mockProcess);

      const result = await manager.downloadSample('HG002');

      expect(result).toBe(false);
    });
  });

  describe('Import Workflow', () => {
    it('should orchestrate complete import process', async () => {
      const fs = require('fs');
      const { spawn } = require('child_process');
      
      // Mock file doesn't exist, so download is needed
      fs.promises.access.mockRejectedValue(new Error('File not found'));
      
      // Mock successful download
      const mockDownloadProcess = {
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() },
        on: jest.fn((event, callback) => {
          if (event === 'close') callback(0);
        })
      };
      
      // Mock successful import
      const mockImportProcess = {
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() },
        on: jest.fn((event, callback) => {
          if (event === 'close') callback(0);
        })
      };
      
      spawn
        .mockReturnValueOnce(mockDownloadProcess) // Download
        .mockReturnValueOnce(mockImportProcess); // Import

      const result = await manager.importSample('HG001');

      expect(result.success).toBe(true);
      expect(result.downloaded).toBe(true);
      expect(result.imported).toBe(true);
      expect(spawn).toHaveBeenCalledTimes(2); // Download + Import
    });

    it('should skip download if file already exists', async () => {
      const fs = require('fs');
      const { spawn } = require('child_process');
      
      // Mock file exists
      fs.promises.access.mockResolvedValue(true);
      
      // Mock successful import only
      const mockImportProcess = {
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() },
        on: jest.fn((event, callback) => {
          if (event === 'close') callback(0);
        })
      };
      spawn.mockReturnValue(mockImportProcess);

      const result = await manager.importSample('HG002');

      expect(result.success).toBe(true);
      expect(result.downloaded).toBe(false); // Skipped download
      expect(result.imported).toBe(true);
      expect(spawn).toHaveBeenCalledTimes(1); // Only import
    });

    it('should handle import failures', async () => {
      const fs = require('fs');
      const { spawn } = require('child_process');
      
      fs.promises.access.mockResolvedValue(true); // File exists
      
      // Mock failed import
      const mockImportProcess = {
        stdout: { on: jest.fn() },
        stderr: { 
          on: jest.fn((event, callback) => {
            if (event === 'data') {
              callback(Buffer.from('Import failed: Invalid VCF format'));
            }
          })
        },
        on: jest.fn((event, callback) => {
          if (event === 'close') callback(1); // Failed
        })
      };
      spawn.mockReturnValue(mockImportProcess);

      const result = await manager.importSample('HG001');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Import failed');
    });
  });

  describe('Validation and Quality Control', () => {
    it('should validate GIAB sample naming conventions', () => {
      const validSamples = ['HG001', 'HG002', 'HG003', 'HG004'];
      const invalidSamples = ['hg001', 'HG', 'SAMPLE1', ''];

      validSamples.forEach(sample => {
        expect(manager['isValidGIABSample'](sample)).toBe(true);
      });

      invalidSamples.forEach(sample => {
        expect(manager['isValidGIABSample'](sample)).toBe(false);
      });
    });

    it('should enforce acceptable variance thresholds', () => {
      const acceptableVariances = [0, 5, -10, 15]; // Within ±20%
      const unacceptableVariances = [25, -30, 50, -45]; // Outside ±20%

      acceptableVariances.forEach(variance => {
        expect(manager['isAcceptableVariance'](variance)).toBe(true);
      });

      unacceptableVariances.forEach(variance => {
        expect(manager['isAcceptableVariance'](variance)).toBe(false);
      });
    });

    it('should generate comprehensive quality reports', async () => {
      mockQueryEngine.getSampleStats.mockResolvedValue({
        totalVariants: 350000,
        chromosomes: ['1', '2', '13', '17', '22'],
        positionRange: [1, 248946058],
        sampleCount: 1,
        arraySize: '12 GB'
      });

      const report = await manager.generateQualityReport('HG001', mockQueryEngine);

      expect(report).toEqual({
        sampleId: 'HG001',
        testPassed: true,
        variantCount: 350000,
        expectedCount: 3500000,
        variance: -90, // 10% of expected
        chromosomeCoverage: ['1', '2', '13', '17', '22'],
        recommendations: expect.arrayContaining([
          expect.stringMatching(/variance/i)
        ])
      });
    });
  });
});