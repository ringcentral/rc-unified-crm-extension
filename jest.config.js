const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env.test') });

module.exports = {
  testMatch: [
    '**/tests/**/*.test.js'
  ],
  "setupFilesAfterEnv": [
    '<rootDir>/tests/setup.js',
  ],
  reporters: ['default'],
  testEnvironment: 'node',
  coveragePathIgnorePatterns: ['/node_modules/'],
  modulePathIgnorePatterns: [
    '<rootDir>/build/',
    '<rootDir>/serverless-deploy/',
    '<rootDir>/serverless-deploy-test/'
  ],
};
