/**
 * Unit tests for VCF Importer
 */

import { describe, it, expect, beforeEach, jest, afterEach } from '@jest/globals';
import { VCFImporter } from '../../src/importer/vcf-importer.js';
import { VCFParser } from '../../src/parser/vcf-parser.js';
import { TileDBQueryEngine } from '../../src/tiledb/query-engine.js';
import { createMockVCFRecord, createMockVCFHeader } from '../setup.js';

// Mock dependencies
jest.mock('../../src/parser/vcf-parser.js');
jest.mock('../../src/tiledb/query-engine.js');
jest.mock('fs', () => ({
  createReadStream: jest.fn(),
  promises: {
    stat: jest.fn(),
    access: jest.fn(),
  }
}));

describe('VCFImporter', () => {
  let importer: VCFImporter;
  let mockParser: jest.Mocked<VCFParser>;
  let mockQueryEngine: jest.Mocked<TileDBQueryEngine>;

  beforeEach(() => {
    mockParser = new VCFParser() as jest.Mocked<VCFParser>;
    mockQueryEngine = new TileDBQueryEngine() as jest.Mocked<TileDBQueryEngine>;
    importer = new VCFImporter();
    
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('File Validation', () => {
    it('should validate VCF file existence', async () => {
      const fs = require('fs');
      fs.promises.access.mockResolvedValue(true);
      fs.promises.stat.mockResolvedValue({
        size: 1024 * 1024, // 1MB
        isFile: () => true
      });

      const isValid = await importer.validateFile('/path/to/test.vcf.gz');

      expect(isValid).toBe(true);
      expect(fs.promises.access).toHaveBeenCalledWith('/path/to/test.vcf.gz');
    });

    it('should reject non-existent files', async () => {
      const fs = require('fs');
      fs.promises.access.mockRejectedValue(new Error('File not found'));

      const isValid = await importer.validateFile('/path/to/missing.vcf');

      expect(isValid).toBe(false);
    });

    it('should reject empty files', async () => {
      const fs = require('fs');
      fs.promises.access.mockResolvedValue(true);
      fs.promises.stat.mockResolvedValue({
        size: 0,
        isFile: () => true
      });

      const isValid = await importer.validateFile('/path/to/empty.vcf');

      expect(isValid).toBe(false);
    });

    it('should validate VCF file extensions', () => {
      const validExtensions = ['.vcf', '.vcf.gz', '.VCF', '.VCF.GZ'];
      const invalidExtensions = ['.txt', '.csv', '.bam', '.fastq'];

      validExtensions.forEach(ext => {
        expect(importer['isValidVCFExtension'](`test${ext}`)).toBe(true);
      });

      invalidExtensions.forEach(ext => {
        expect(importer['isValidVCFExtension'](`test${ext}`)).toBe(false);
      });
    });
  });

  describe('Sample ID Extraction and Tagging', () => {
    it('should extract sample IDs from VCF header', async () => {
      const mockHeader = createMockVCFHeader({
        samples: ['HG001', 'HG002', 'Patient_001']
      });

      mockParser.on = jest.fn((event, callback) => {
        if (event === 'header') {
          callback(mockHeader);
        }
      });

      const sampleIds = await importer['extractSampleIds']('/path/to/test.vcf', mockParser);

      expect(sampleIds).toEqual(['HG001', 'HG002', 'Patient_001']);
    });

    it('should handle VCF files with no samples', async () => {
      const mockHeader = createMockVCFHeader({
        samples: []
      });

      mockParser.on = jest.fn((event, callback) => {
        if (event === 'header') {
          callback(mockHeader);
        }
      });

      const sampleIds = await importer['extractSampleIds']('/path/to/no-samples.vcf', mockParser);

      expect(sampleIds).toEqual([]);
    });

    it('should normalize sample IDs consistently', () => {
      const testCases = [
        { input: 'HG001_NA12878', expected: 'HG001_NA12878' },
        { input: 'Sample 1', expected: 'Sample_1' },
        { input: 'patient-001', expected: 'patient-001' },
        { input: '', expected: 'UNKNOWN_SAMPLE' }
      ];

      testCases.forEach(({ input, expected }) => {
        expect(importer['normalizeSampleId'](input)).toBe(expected);
      });
    });

    it('should tag variants with correct sample IDs during import', async () => {
      const mockRecord = createMockVCFRecord({
        samples: {
          'HG001': { GT: '0/1', DP: '30' },
          'HG002': { GT: '1/1', DP: '25' }
        }
      });

      const taggedVariant = importer['tagVariantWithSamples'](mockRecord);

      expect(taggedVariant).toEqual({
        ...mockRecord,
        sample_ids: ['HG001', 'HG002'],
        sample_data: {
          'HG001': { GT: '0/1', DP: '30' },
          'HG002': { GT: '1/1', DP: '25' }
        }
      });
    });
  });

  describe('Batch Processing', () => {
    it('should process variants in configurable batches', async () => {
      const batchSize = 1000;
      importer.setBatchSize(batchSize);

      // Create mock variants
      const mockVariants = Array(2500).fill(null).map((_, i) => 
        createMockVCFRecord({
          pos: i + 1,
          samples: { [`Sample_${i % 3}`]: { GT: '0/1' } }
        })
      );

      let batchCount = 0;
      mockQueryEngine.importVariantBatch = jest.fn().mockImplementation(async (variants) => {
        batchCount++;
        expect(variants.length).toBeLessThanOrEqual(batchSize);
        return { success: true, imported: variants.length };
      });

      mockParser.on = jest.fn((event, callback) => {
        if (event === 'record') {
          mockVariants.forEach(variant => callback(variant));
        }
        if (event === 'end') {
          callback();
        }
      });

      await importer.import('/path/to/large.vcf', mockQueryEngine);

      expect(batchCount).toBe(3); // 3 batches for 2500 variants with batch size 1000
      expect(mockQueryEngine.importVariantBatch).toHaveBeenCalledTimes(3);
    });

    it('should handle batch import failures gracefully', async () => {
      const mockVariants = [createMockVCFRecord()];

      mockQueryEngine.importVariantBatch = jest.fn()
        .mockResolvedValueOnce({ success: true, imported: 1 })
        .mockRejectedValueOnce(new Error('Database connection failed'))
        .mockResolvedValueOnce({ success: true, imported: 1 });

      mockParser.on = jest.fn((event, callback) => {
        if (event === 'record') {
          mockVariants.forEach(variant => callback(variant));
          mockVariants.forEach(variant => callback(variant)); // Second batch fails
          mockVariants.forEach(variant => callback(variant)); // Third batch succeeds
        }
        if (event === 'end') {
          callback();
        }
      });

      const result = await importer.import('/path/to/test.vcf', mockQueryEngine);

      expect(result.success).toBe(false);
      expect(result.totalProcessed).toBe(3);
      expect(result.totalImported).toBe(2); // Only 2 successful imports
      expect(result.failedBatches).toBe(1);
    });
  });

  describe('Progress Tracking', () => {
    it('should emit progress events during import', async () => {
      const progressCallback = jest.fn();
      importer.on('progress', progressCallback);

      const mockVariants = Array(500).fill(null).map((_, i) => 
        createMockVCFRecord({ pos: i + 1 })
      );

      mockParser.on = jest.fn((event, callback) => {
        if (event === 'record') {
          mockVariants.forEach((variant, index) => {
            callback(variant);
            // Simulate progress emission every 100 records
            if ((index + 1) % 100 === 0) {
              callback(variant);
            }
          });
        }
        if (event === 'end') {
          callback();
        }
      });

      mockQueryEngine.importVariantBatch = jest.fn().mockResolvedValue({
        success: true,
        imported: 100
      });

      await importer.import('/path/to/test.vcf', mockQueryEngine);

      expect(progressCallback).toHaveBeenCalled();
      expect(progressCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          processed: expect.any(Number),
          imported: expect.any(Number),
          percentage: expect.any(Number)
        })
      );
    });

    it('should calculate accurate progress percentages', () => {
      const testCases = [
        { processed: 0, total: 1000, expected: 0 },
        { processed: 250, total: 1000, expected: 25 },
        { processed: 500, total: 1000, expected: 50 },
        { processed: 1000, total: 1000, expected: 100 }
      ];

      testCases.forEach(({ processed, total, expected }) => {
        const percentage = importer['calculateProgress'](processed, total);
        expect(percentage).toBe(expected);
      });
    });

    it('should estimate time remaining accurately', () => {
      const startTime = Date.now() - 30000; // 30 seconds ago
      const processed = 300;
      const total = 1000;

      const eta = importer['estimateTimeRemaining'](startTime, processed, total);

      // Should estimate approximately 70 seconds remaining (30s * (700/300))
      expect(eta).toBeCloseTo(70, 0);
    });
  });

  describe('Error Handling and Recovery', () => {
    it('should handle parser errors gracefully', async () => {
      const errorCallback = jest.fn();
      importer.on('error', errorCallback);

      mockParser.on = jest.fn((event, callback) => {
        if (event === 'error') {
          callback(new Error('Invalid VCF format at line 42'));
        }
      });

      const result = await importer.import('/path/to/invalid.vcf', mockQueryEngine);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid VCF format');
      expect(errorCallback).toHaveBeenCalled();
    });

    it('should continue processing after recoverable errors', async () => {
      let recordCount = 0;
      mockParser.on = jest.fn((event, callback) => {
        if (event === 'record') {
          recordCount++;
          if (recordCount === 2) {
            // Simulate error on second record
            callback(new Error('Malformed record'));
          } else {
            callback(createMockVCFRecord({ pos: recordCount }));
          }
        }
        if (event === 'end' && recordCount >= 3) {
          callback();
        }
      });

      mockQueryEngine.importVariantBatch = jest.fn().mockResolvedValue({
        success: true,
        imported: 1
      });

      const result = await importer.import('/path/to/partial-errors.vcf', mockQueryEngine);

      // Should process 2 valid records despite 1 error
      expect(result.totalProcessed).toBe(2);
      expect(result.errors).toBe(1);
    });

    it('should validate variant data before import', () => {
      const validVariants = [
        createMockVCFRecord({ chrom: '1', pos: 12345, ref: 'A', alt: ['T'] }),
        createMockVCFRecord({ chrom: '22', pos: 67890, ref: 'G', alt: ['C'] })
      ];

      const invalidVariants = [
        createMockVCFRecord({ chrom: '', pos: 12345 }), // Empty chromosome
        createMockVCFRecord({ chrom: '1', pos: -1 }), // Invalid position
        createMockVCFRecord({ chrom: '1', pos: 12345, ref: '' }) // Empty reference
      ];

      validVariants.forEach(variant => {
        expect(importer['isValidVariant'](variant)).toBe(true);
      });

      invalidVariants.forEach(variant => {
        expect(importer['isValidVariant'](variant)).toBe(false);
      });
    });
  });

  describe('Import Summary and Reporting', () => {
    it('should generate comprehensive import summary', async () => {
      const mockVariants = Array(1000).fill(null).map((_, i) => 
        createMockVCFRecord({ 
          pos: i + 1,
          samples: { 'HG001': { GT: '0/1' } }
        })
      );

      mockParser.on = jest.fn((event, callback) => {
        if (event === 'record') {
          mockVariants.forEach(variant => callback(variant));
        }
        if (event === 'end') {
          callback();
        }
      });

      mockQueryEngine.importVariantBatch = jest.fn().mockResolvedValue({
        success: true,
        imported: 100
      });

      const result = await importer.import('/path/to/test.vcf', mockQueryEngine);

      expect(result).toEqual({
        success: true,
        filePath: '/path/to/test.vcf',
        totalProcessed: 1000,
        totalImported: 1000,
        failedBatches: 0,
        errors: 0,
        sampleIds: expect.arrayContaining(['HG001']),
        duration: expect.any(Number),
        averageSpeed: expect.any(Number) // variants per second
      });
    });

    it('should track unique sample IDs across all variants', async () => {
      const mockVariants = [
        createMockVCFRecord({ samples: { 'HG001': { GT: '0/1' } } }),
        createMockVCFRecord({ samples: { 'HG002': { GT: '1/1' } } }),
        createMockVCFRecord({ samples: { 'HG001': { GT: '0/0' }, 'HG003': { GT: '0/1' } } })
      ];

      mockParser.on = jest.fn((event, callback) => {
        if (event === 'record') {
          mockVariants.forEach(variant => callback(variant));
        }
        if (event === 'end') {
          callback();
        }
      });

      mockQueryEngine.importVariantBatch = jest.fn().mockResolvedValue({
        success: true,
        imported: 3
      });

      const result = await importer.import('/path/to/multi-sample.vcf', mockQueryEngine);

      expect(result.sampleIds).toEqual(expect.arrayContaining(['HG001', 'HG002', 'HG003']));
      expect(result.sampleIds).toHaveLength(3);
    });
  });
});