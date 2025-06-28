/**
 * Jest setup file for myExome Analyzer tests
 */

// Mock the Python environment check for tests
process.env.NODE_ENV = 'test';

// Increase timeout for integration tests involving TileDB
jest.setTimeout(30000);

// Mock console methods to reduce noise in tests
global.console = {
  ...console,
  log: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: console.error, // Keep error logging for debugging
};

// Setup test data paths
export const TEST_DATA_DIR = 'tests/fixtures';
export const TEST_WORKSPACE = 'tests/fixtures/test_workspace';

// Common test utilities
export const createMockVCFRecord = (overrides = {}) => ({
  chrom: '1',
  pos: 123456,
  id: '.',
  ref: 'A',
  alt: ['T'],
  qual: 50.0,
  filter: ['PASS'],
  info: {},
  format: ['GT', 'DP'],
  samples: {
    'test_sample': {
      'GT': '0/1',
      'DP': '30'
    }
  },
  ...overrides
});

export const createMockVCFHeader = (overrides = {}) => ({
  version: 'VCFv4.2',
  info: new Map([
    ['DP', { id: 'DP', number: '1', type: 'Integer', description: 'Total Depth' }]
  ]),
  format: new Map([
    ['GT', { id: 'GT', number: '1', type: 'String', description: 'Genotype' }],
    ['DP', { id: 'DP', number: '1', type: 'Integer', description: 'Read Depth' }]
  ]),
  filter: new Map([
    ['PASS', 'All filters passed']
  ]),
  samples: ['test_sample'],
  meta: [],
  ...overrides
});