const path = require('path');

const ROOT_DIR = path.basename(__dirname) === '.ts-build'
  ? path.resolve(__dirname, '..')
  : __dirname;

require('dotenv').config({ path: path.resolve(ROOT_DIR, '.env.test') });

module.exports = {
  rootDir: ROOT_DIR,
  testMatch: [
    '**/tests/**/*.test.ts'
  ],
  "setupFilesAfterEnv": [
    '<rootDir>/tests/setup.ts',
  ],
  reporters: [
    'default',
    '<rootDir>/.ts-build/tests/failedTestsReporter.js'
  ],
  testEnvironment: 'node',
  moduleFileExtensions: ['js', 'json', 'node', 'ts'],
  transform: {
    '^.+\\.js$': 'babel-jest',
    '^.+\\.ts$': '<rootDir>/.ts-build/scripts/jestTsTransformer.js'
  },
  moduleNameMapper: {
    '^@app-connect/core$': '<rootDir>/packages/core/index',
    '^@app-connect/core/(.*)$': '<rootDir>/packages/core/$1'
  },
  testPathIgnorePatterns: [
    '<rootDir>/tests/e2e/'
  ],
  coveragePathIgnorePatterns: ['/node_modules/', '/packages/'],
  modulePathIgnorePatterns: [
    '<rootDir>/.ts-build/',
    '<rootDir>/build/',
    '<rootDir>/packages/core/dist/',
    '<rootDir>/serverless-deploy/',
    '<rootDir>/serverless-deploy-test/',
    '<rootDir>/serverless-deploy-test-beta/'
  ],
};

export {};
