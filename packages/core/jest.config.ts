// @ts-check

const path = require('path');

function getCoreRoot() {
  const maybeBuildRoot = path.resolve(__dirname, '..', '..');
  if (path.basename(maybeBuildRoot) === '.ts-build') {
    return path.resolve(maybeBuildRoot, '..', 'packages', 'core');
  }

  return __dirname;
}

const CORE_ROOT = getCoreRoot();

module.exports = {
  rootDir: CORE_ROOT,
  // Test environment
  testEnvironment: 'node',
  moduleFileExtensions: ['js', 'json', 'node', 'ts'],
  transform: {
    '^.+\\.js$': 'babel-jest',
    '^.+\\.ts$': '<rootDir>/../../.ts-build/scripts/jestTsTransformer.js'
  },
  
  // Test file patterns
  testMatch: [
    '<rootDir>/test/**/*.test.ts',
    '<rootDir>/**/*.test.ts'
  ],
  
  // Setup files
  setupFilesAfterEnv: [
    '<rootDir>/test/setup.ts'
  ],
  
  // Coverage configuration
  collectCoverage: true,
  coverageDirectory: '<rootDir>/coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  coveragePathIgnorePatterns: [
    '/node_modules/',
    '/test/',
    '/coverage/',
    'jest.config.js',
    'setup.ts'
  ],
  
  // Module resolution
  moduleDirectories: ['node_modules', '<rootDir>'],
  moduleNameMapper: {
    '^@app-connect/core$': '<rootDir>/index',
    '^@app-connect/core/(.*)$': '<rootDir>/$1'
  },
  
  // Test timeout
  testTimeout: 30000,
  
  // Reporters
  reporters: ['default'],
  
  // Ignore patterns
  modulePathIgnorePatterns: [
    '<rootDir>/node_modules/',
    '<rootDir>/coverage/',
    '<rootDir>/dist/',
    '<rootDir>/test-results/'
  ],
  
  // Clear mocks between tests
  clearMocks: true,
  
  // Restore mocks between tests
  restoreMocks: true,
  
  // Verbose output
  verbose: true
};

export {};
