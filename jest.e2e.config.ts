const baseConfig = require('./jest.config');

module.exports = {
  ...baseConfig,
  // App-level tests run the root server and real connector implementations.
  // External provider HTTP APIs are replaced at the network boundary with
  // Nock or a local HTTP stub when the client transport cannot use Nock.
  displayName: 'app-level',
  testMatch: [
    '<rootDir>/tests/e2e/**/*.test.ts'
  ],
  testPathIgnorePatterns: [],
};

export {};
