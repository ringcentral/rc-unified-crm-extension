const baseConfig = require('./jest.config');

module.exports = {
  ...baseConfig,
  displayName: 'server-e2e',
  testMatch: [
    '<rootDir>/tests/e2e/**/*.test.ts'
  ],
  testPathIgnorePatterns: [],
};

export {};
