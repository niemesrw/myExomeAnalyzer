/**
 * Unit tests for TileDB Query Engine
 */

import { describe, it, expect, beforeEach, jest, afterEach } from '@jest/globals';
import { TileDBQueryEngine, VariantQuery, VariantResult } from '../../src/tiledb/query-engine';

// Mock the child_process spawn function
jest.mock('child_process', () => ({
  spawn: jest.fn()
}));

// Mock the config
jest.mock('../../src/config/index', () => ({
  config: {
    tiledb: {
      workspace: '/test/workspace'
    }
  }
}));

describe('TileDBQueryEngine', () => {
  let queryEngine: TileDBQueryEngine;
  let mockSpawn: jest.MockedFunction<any>;

  beforeEach(() => {
    queryEngine = new TileDBQueryEngine();
    mockSpawn = require('child_process').spawn as jest.MockedFunction<any>;
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Query Building', () => {
    it('should build a basic query correctly', async () => {
      const mockResult = JSON.stringify([
        {
          chrom: '17',
          pos: 43044295,
          ref: 'G',
          alt: ['A'],
          qual: 50.0,
          filter: ['PASS'],
          info: { DP: '30' },
          samples: { 'HG002': { GT: '0/1', DP: '25' } }
        }
      ]);

      // Mock successful Python execution
      mockSpawn.mockImplementation(() => ({
        stdout: {
          on: (event: string, callback: Function) => {
            if (event === 'data') {
              callback(Buffer.from(mockResult));
            }
          }
        },
        stderr: {
          on: (event: string, callback: Function) => {
            // No error
          }
        },
        on: (event: string, callback: Function) => {
          if (event === 'close') {
            callback(0); // Exit code 0
          }
        }
      }));

      const query: VariantQuery = {
        chrom: '17',
        start: 43044295,
        end: 43044296,
        samples: ['HG002'],
        limit: 1
      };

      const results = await queryEngine.queryVariants(query);

      expect(results).toHaveLength(1);
      expect(results[0].chrom).toBe('17');
      expect(results[0].pos).toBe(43044295);
      expect(results[0].samples).toHaveProperty('HG002');
    });

    it('should handle chromosome normalization in queries', async () => {
      const mockResult = JSON.stringify([]);
      
      mockSpawn.mockImplementation(() => ({
        stdout: { on: (event: string, callback: Function) => {
          if (event === 'data') callback(Buffer.from(mockResult));
        }},
        stderr: { on: (event: string, callback: Function) => {} },
        on: (event: string, callback: Function) => {
          if (event === 'close') callback(0);
        }
      }));

      const query: VariantQuery = {
        chrom: 'chr17', // Should be normalized to '17'
        start: 1,
        end: 1000
      };

      await queryEngine.queryVariants(query);

      // Verify the Python script was called with normalized chromosome
      expect(mockSpawn).toHaveBeenCalled();
      const spawnArgs = mockSpawn.mock.calls[0];
      expect(spawnArgs[1]).toContain('17'); // Should contain normalized chromosome
    });

    it('should apply sample filtering correctly', async () => {
      const mockResult = JSON.stringify([
        {
          chrom: '17',
          pos: 43044295,
          ref: 'G',
          alt: ['A'],
          qual: 50.0,
          filter: ['PASS'],
          info: { DP: '30' },
          samples: { 'HG002': { GT: '0/1', DP: '25' } }
        }
      ]);

      mockSpawn.mockImplementation(() => ({
        stdout: { on: (event: string, callback: Function) => {
          if (event === 'data') callback(Buffer.from(mockResult));
        }},
        stderr: { on: (event: string, callback: Function) => {} },
        on: (event: string, callback: Function) => {
          if (event === 'close') callback(0);
        }
      }));

      const query: VariantQuery = {
        chrom: '17',
        start: 43044295,
        end: 43044296,
        samples: ['HG002', 'HG001'],
        limit: 10
      };

      const results = await queryEngine.queryVariants(query);

      expect(results).toHaveLength(1);
      // Should only contain requested samples
      expect(Object.keys(results[0].samples)).toEqual(['HG002']);
    });

    it('should handle quality filtering', async () => {
      const mockResult = JSON.stringify([]);
      
      mockSpawn.mockImplementation(() => ({
        stdout: { on: (event: string, callback: Function) => {
          if (event === 'data') callback(Buffer.from(mockResult));
        }},
        stderr: { on: (event: string, callback: Function) => {} },
        on: (event: string, callback: Function) => {
          if (event === 'close') callback(0);
        }
      }));

      const query: VariantQuery = {
        chrom: '17',
        start: 1,
        end: 1000,
        minQual: 30.0
      };

      await queryEngine.queryVariants(query);

      expect(mockSpawn).toHaveBeenCalled();
      // Verify quality filter was applied
      const spawnArgs = mockSpawn.mock.calls[0];
      expect(JSON.stringify(spawnArgs)).toContain('30');
    });

    it('should respect limit parameter', async () => {
      const mockResults = Array(100).fill(null).map((_, i) => ({
        chrom: '1',
        pos: i + 1,
        ref: 'A',
        alt: ['T'],
        qual: 50.0,
        filter: ['PASS'],
        info: {},
        samples: { 'test': { GT: '0/1' } }
      }));

      mockSpawn.mockImplementation(() => ({
        stdout: { on: (event: string, callback: Function) => {
          if (event === 'data') callback(Buffer.from(JSON.stringify(mockResults.slice(0, 5))));
        }},
        stderr: { on: (event: string, callback: Function) => {} },
        on: (event: string, callback: Function) => {
          if (event === 'close') callback(0);
        }
      }));

      const query: VariantQuery = {
        chrom: '1',
        start: 1,
        end: 1000,
        limit: 5
      };

      const results = await queryEngine.queryVariants(query);

      expect(results).toHaveLength(5);
    });
  });

  describe('Sample Statistics', () => {
    it('should calculate sample-specific statistics', async () => {
      const mockResult = JSON.stringify({
        totalVariants: 229739,
        chromosomes: ['1', '13', '17', '22'],
        positionRange: [1, 248946058],
        sampleCount: 1,
        arraySize: '15.4 GB'
      });

      mockSpawn.mockImplementation(() => ({
        stdout: { on: (event: string, callback: Function) => {
          if (event === 'data') callback(Buffer.from(mockResult));
        }},
        stderr: { on: (event: string, callback: Function) => {} },
        on: (event: string, callback: Function) => {
          if (event === 'close') callback(0);
        }
      }));

      const stats = await queryEngine.getSampleStats(['HG002']);

      expect(stats.totalVariants).toBe(229739);
      expect(stats.sampleCount).toBe(1);
      expect(stats.chromosomes).toContain('17');
      expect(stats.arraySize).toBe('15.4 GB');
    });

    it('should handle multiple samples in statistics', async () => {
      const mockResult = JSON.stringify({
        totalVariants: 2598374,
        chromosomes: ['1', '2', '13', '17', '22'],
        positionRange: [1, 248946058],
        sampleCount: 3,
        arraySize: '15.4 GB'
      });

      mockSpawn.mockImplementation(() => ({
        stdout: { on: (event: string, callback: Function) => {
          if (event === 'data') callback(Buffer.from(mockResult));
        }},
        stderr: { on: (event: string, callback: Function) => {} },
        on: (event: string, callback: Function) => {
          if (event === 'close') callback(0);
        }
      }));

      const stats = await queryEngine.getSampleStats(['HG001', 'HG002', 'US-WWCJ-HMH24']);

      expect(stats.totalVariants).toBe(2598374);
      expect(stats.sampleCount).toBe(3);
    });
  });

  describe('Error Handling', () => {
    it('should handle Python execution errors gracefully', async () => {
      mockSpawn.mockImplementation(() => ({
        stdout: { on: (event: string, callback: Function) => {} },
        stderr: { on: (event: string, callback: Function) => {
          if (event === 'data') callback(Buffer.from('Python error occurred'));
        }},
        on: (event: string, callback: Function) => {
          if (event === 'close') callback(1); // Non-zero exit code
        }
      }));

      const query: VariantQuery = {
        chrom: '17',
        start: 1,
        end: 1000
      };

      const results = await queryEngine.queryVariants(query);

      // Should return empty array on error
      expect(results).toEqual([]);
    });

    it('should handle malformed JSON responses', async () => {
      mockSpawn.mockImplementation(() => ({
        stdout: { on: (event: string, callback: Function) => {
          if (event === 'data') callback(Buffer.from('invalid json'));
        }},
        stderr: { on: (event: string, callback: Function) => {} },
        on: (event: string, callback: Function) => {
          if (event === 'close') callback(0);
        }
      }));

      const query: VariantQuery = {
        chrom: '17',
        start: 1,
        end: 1000
      };

      const results = await queryEngine.queryVariants(query);

      expect(results).toEqual([]);
    });

    it('should validate query parameters', () => {
      const invalidQueries = [
        { chrom: '', start: 1, end: 1000 }, // Empty chromosome
        { chrom: '1', start: -1, end: 1000 }, // Negative start
        { chrom: '1', start: 1000, end: 500 }, // End before start
      ];

      // Note: This assumes validation is implemented in the query engine
      // If not implemented yet, this test can guide the implementation
      invalidQueries.forEach(query => {
        expect(() => {
          // This should validate and throw for invalid queries
          queryEngine.queryVariants(query as VariantQuery);
        }).toThrow();
      });
    });
  });

  describe('Allele Frequency Calculation', () => {
    it('should calculate allele frequency for specific variants', async () => {
      const mockResult = '0.0123'; // 1.23% frequency

      mockSpawn.mockImplementation(() => ({
        stdout: { on: (event: string, callback: Function) => {
          if (event === 'data') callback(Buffer.from(mockResult));
        }},
        stderr: { on: (event: string, callback: Function) => {} },
        on: (event: string, callback: Function) => {
          if (event === 'close') callback(0);
        }
      }));

      const frequency = await queryEngine.calculateAlleleFrequency('17', 43044295, 'G', 'A');

      expect(frequency).toBe(0.0123);
    });

    it('should handle variants not found in database', async () => {
      const mockResult = '0.0'; // Not found

      mockSpawn.mockImplementation(() => ({
        stdout: { on: (event: string, callback: Function) => {
          if (event === 'data') callback(Buffer.from(mockResult));
        }},
        stderr: { on: (event: string, callback: Function) => {} },
        on: (event: string, callback: Function) => {
          if (event === 'close') callback(0);
        }
      }));

      const frequency = await queryEngine.calculateAlleleFrequency('99', 999999999, 'G', 'A');

      expect(frequency).toBe(0.0);
    });
  });
});