// Test setup file
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env.test') });

// Mock console methods to reduce noise in tests
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};
