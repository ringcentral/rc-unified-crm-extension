// Test setup for @app-connect/core package
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env.test') });

// Set test timeout
jest.setTimeout(30000);

// Mock console methods to reduce noise in tests
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

// Setup database models for testing
beforeAll(async () => {
  try {
    // Set up test database URL if not provided
    if (!process.env.DATABASE_URL) {
      process.env.DATABASE_URL = 'sqlite::memory:';
    }

    // Import models
    const { CallLogModel } = require('../models/callLogModel');
    const { MessageLogModel } = require('../models/messageLogModel');
    const { UserModel } = require('../models/userModel');
    const { CacheModel } = require('../models/cacheModel');
    const { AdminConfigModel } = require('../models/adminConfigModel');

    // Sync database models
    await CallLogModel.sync({ force: true });
    await MessageLogModel.sync({ force: true });
    await UserModel.sync({ force: true });
    await CacheModel.sync({ force: true });
    await AdminConfigModel.sync({ force: true });

    console.log('Database models synced for testing');
  } catch (error) {
    console.error('Error setting up test database:', error);
    // Don't fail the setup, some tests might not need database
  }
});

// Clean up after all tests
afterAll(async () => {
  try {
    // Close database connections
    const { sequelize } = require('../models/sequelize');
    if (sequelize) {
      await sequelize.close();
    }
  } catch (error) {
    console.error('Error closing database connection:', error);
  }
});

// Global test utilities
global.testUtils = {
  // Helper to create mock user
  createMockUser: (overrides = {}) => ({
    id: 'test-user-id',
    platform: 'testCRM',
    accessToken: 'test-access-token',
    refreshToken: 'test-refresh-token',
    tokenExpiry: new Date(Date.now() + 3600000), // 1 hour from now
    platformUserInfo: {
      id: 'test-platform-user-id',
      name: 'Test User',
      timezoneName: 'America/Los_Angeles',
      timezoneOffset: 0,
      platformAdditionalInfo: {}
    },
    ...overrides
  }),

  // Helper to create mock call log
  createMockCallLog: (overrides = {}) => ({
    id: 'test-call-log-id',
    userId: 'test-user-id',
    platform: 'testCRM',
    thirdPartyLogId: 'test-third-party-id',
    contactId: 'test-contact-id',
    contactType: 'Contact',
    phoneNumber: '+1234567890',
    callDirection: 'Inbound',
    callResult: 'Answered',
    callDuration: 120,
    callStartTime: new Date(),
    callEndTime: new Date(Date.now() + 120000),
    recordingLink: 'https://example.com/recording.mp3',
    subject: 'Test Call',
    note: 'Test call note',
    ...overrides
  }),

  // Helper to create mock contact
  createMockContact: (overrides = {}) => ({
    id: 'test-contact-id',
    name: 'Test Contact',
    type: 'Contact',
    phone: '+1234567890',
    additionalInfo: null,
    ...overrides
  }),

  // Helper to reset connector registry
  resetConnectorRegistry: () => {
    const connectorRegistry = require('../connector/registry');
    connectorRegistry.connectors.clear();
    connectorRegistry.manifests.clear();
    connectorRegistry.platformInterfaces.clear();
    connectorRegistry.releaseNotes = {};
  },

  // Helper to create mock connector
  createMockConnector: (overrides = {}) => ({
    getAuthType: jest.fn().mockReturnValue('apiKey'),
    getUserInfo: jest.fn().mockResolvedValue({
      successful: true,
      platformUserInfo: {
        id: 'test-user-id',
        name: 'Test User',
        timezoneName: 'America/Los_Angeles',
        timezoneOffset: 0,
        platformAdditionalInfo: {}
      }
    }),
    createCallLog: jest.fn().mockResolvedValue({
      logId: 'test-log-id',
      returnMessage: {
        message: 'Call logged successfully',
        messageType: 'success',
        ttl: 2000
      }
    }),
    updateCallLog: jest.fn().mockResolvedValue({
      updatedNote: 'Call log updated',
      returnMessage: {
        message: 'Call log updated successfully',
        messageType: 'success',
        ttl: 2000
      }
    }),
    unAuthorize: jest.fn().mockResolvedValue({
      returnMessage: {
        messageType: 'success',
        message: 'Logged out successfully',
        ttl: 1000
      }
    }),
    findContact: jest.fn().mockResolvedValue([
      {
        id: 'test-contact-id',
        name: 'Test Contact',
        type: 'Contact',
        phone: '+1234567890',
        additionalInfo: null
      }
    ]),
    createContact: jest.fn().mockResolvedValue({
      contactInfo: {
        id: 'new-contact-id',
        name: 'New Contact'
      },
      returnMessage: {
        message: 'Contact created successfully',
        messageType: 'success',
        ttl: 2000
      }
    }),
    ...overrides
  })
};
