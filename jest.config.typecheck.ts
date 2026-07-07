const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env.test') });

module.exports = {
  testMatch: [
    '**/tests/**/*.test.js'
  ],
  "setupFilesAfterEnv": [
    '<rootDir>/tests/setup.js',
  ],
  reporters: [
    'default',
    '<rootDir>/tests/failedTestsReporter.js'
  ],
  testEnvironment: 'node',
  moduleFileExtensions: ['js', 'json', 'node', 'ts'],
  transform: {
    '^.+\\.js$': 'babel-jest',
    '^.+\\.ts$': '<rootDir>/scripts/jestTsTransformer.js'
  },
  testPathIgnorePatterns: [
    '<rootDir>/tests/e2e/'
  ],
  coveragePathIgnorePatterns: ['/node_modules/', '/packages/'],
  modulePathIgnorePatterns: [
    '<rootDir>/.ts-build/',
    '<rootDir>/build/',
    '<rootDir>/serverless-deploy/',
    '<rootDir>/serverless-deploy-test/',
    '<rootDir>/serverless-deploy-test-beta/'
  ],
};

export {};
