// Use in-memory SQLite for isolated model tests
jest.mock('../../models/sequelize', () => {
  const { Sequelize } = require('sequelize');
  return {
    sequelize: new Sequelize({
      dialect: 'sqlite',
      storage: ':memory:',
      logging: false,
    }),
  };
});

jest.mock('../../connector/registry');
jest.mock('../../lib/oauth');
jest.mock('../../lib/callLogComposer');
jest.mock('../../models/dynamo/noteCacheSchema', () => ({
  NoteCache: {
    get: jest.fn(),
    create: jest.fn()
  }
}));
jest.mock('../../models/dynamo/connectorSchema', () => ({
  Connector: {
    getProxyConfig: jest.fn()
  }
}));
jest.mock('axios');

const logHandler = require('../../handlers/log');
const { CallLogModel } = require('../../models/callLogModel');
const { MessageLogModel } = require('../../models/messageLogModel');
const { UserModel } = require('../../models/userModel');
const { AccountDataModel } = require('../../models/accountDataModel');
const { CacheModel } = require('../../models/cacheModel');
const connectorRegistry = require('../../connector/registry');
const oauth = require('../../lib/oauth');
const { composeCallLog } = require('../../lib/callLogComposer');
const { NoteCache } = require('../../models/dynamo/noteCacheSchema');
const { Connector } = require('../../models/dynamo/connectorSchema');
const axios = require('axios');
const { sequelize } = require('../../models/sequelize');
const { getHashValue } = require('../../lib/util');
const { MessageLogResponseSchema } = require('../../contracts');
const {
  buildCallLogUser,
  buildCallLogIncomingData,
  buildCallLogUpdateData,
  rcCallLogRecordCases,
  rcCallLogResultCases,
  callLogAuthCases,
  callLogDatabaseFailureCases,
  callLogResultCases,
  callLogUpdateInputCases,
} = require('../data/callLoggingCases');
const {
  buildMessageLogUser,
  buildMessageIncomingData,
  cloneRingCentralMessageRecord,
  rcMessageFormatCases,
  rcMessageMediaCases,
  rcMessageStatusCases,
  messageLogLifecycleCases,
  messageLogAuthCases,
  messageLogDatabaseFailureCases,
  messageLogResultCases,
  oldestFirstMessageCase,
} = require('../data/messageLoggingCases');

describe('Log Handler', () => {
  beforeAll(async () => {
    await CallLogModel.sync({ force: true });
    await MessageLogModel.sync({ force: true });
    await UserModel.sync({ force: true });
    await AccountDataModel.sync({ force: true });
    await CacheModel.sync({ force: true });
  });

  afterEach(async () => {
    await CallLogModel.destroy({ where: {} });
    await MessageLogModel.destroy({ where: {} });
    await UserModel.destroy({ where: {} });
    await AccountDataModel.destroy({ where: {} });
    await CacheModel.destroy({ where: {} });
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await sequelize.close();
  });

  describe('createCallLog', () => {
    const mockUser = {
      id: 'test-user-id',
      platform: 'testCRM',
      accessToken: 'test-access-token',
      rcAccountId: '12345',
      platformAdditionalInfo: {}
    };

    const mockIncomingData = {
      logInfo: {
        sessionId: 'session-123',
        telephonySessionId: 'tel-session-123',
        id: 'call-id-123',
        direction: 'Outbound',
        startTime: new Date().toISOString(),
        duration: 120,
        result: 'Completed',
        from: { phoneNumber: '+1234567890' },
        to: { phoneNumber: '+0987654321' },
        recording: { link: 'https://recording.link' }
      },
      contactId: 'contact-123',
      contactType: 'Contact',
      contactName: 'Test Contact',
      note: 'Test note',
      aiNote: '',
      transcript: '',
      additionalSubmission: {}
    };

    async function runAsyncCallPluginLog() {
      const originalAppServer = process.env.APP_SERVER;
      process.env.APP_SERVER = 'https://app.example.com';
      try {
        await UserModel.create(mockUser);
        await AccountDataModel.create({
          rcAccountId: mockUser.rcAccountId,
          platformName: 'asyncPlugin',
          dataKey: 'pluginData',
          data: {
            name: 'plugin.async',
            supportedLogTypes: ['call'],
            isAsync: true,
            endpointUrl: 'https://plugins.example.com/plugin/asyncPlugin',
            tokenSyncUrl: 'https://plugins.example.com/plugin/asyncPlugin/token',
            jwtToken: 'plugin-jwt-token'
          }
        });

        const mockConnector = {
          getAuthType: jest.fn().mockResolvedValue('apiKey'),
          getBasicAuth: jest.fn().mockReturnValue('base64-encoded'),
          getLogFormatType: jest.fn().mockReturnValue('text/plain'),
          createCallLog: jest.fn().mockResolvedValue({
            logId: 'new-log-async',
            returnMessage: { message: 'Call logged', messageType: 'success', ttl: 2000 }
          })
        };
        connectorRegistry.getConnector.mockReturnValue(mockConnector);
        composeCallLog.mockReturnValue('Composed log details');
        axios.post.mockImplementation((url) => {
          if (url === 'https://plugins.example.com/plugin/asyncPlugin/token') {
            return Promise.resolve({
              headers: {
                'x-refreshed-jwt-token': 'synced-plugin-jwt'
              }
            });
          }
          return Promise.resolve({ data: { accepted: true }, headers: {} });
        });

        const result = await logHandler.createCallLog({
          platform: 'testCRM',
          userId: 'test-user-id',
          incomingData: mockIncomingData,
          hashedAccountId: 'hashed-123',
          isFromSSCL: false
        });
        const cache = await CacheModel.findOne({
          where: {
            cacheKey: 'asyncPluginTask-asyncPlugin'
          }
        });
        const pluginCall = axios.post.mock.calls.find(([url]) => url === 'https://plugins.example.com/plugin/asyncPlugin');

        return {
          result,
          cache,
          pluginCall
        };
      } finally {
        if (originalAppServer) {
          process.env.APP_SERVER = originalAppServer;
        } else {
          delete process.env.APP_SERVER;
        }
      }
    }

    test('should return warning when call log already exists for session', async () => {
      // Arrange
      await CallLogModel.create({
        id: 'existing-log',
        sessionId: 'session-123',
        platform: 'testCRM',
        thirdPartyLogId: 'third-party-123',
        userId: 'test-user-id'
      });

      // Act
      const result = await logHandler.createCallLog({
        platform: 'testCRM',
        userId: 'test-user-id',
        incomingData: mockIncomingData,
        hashedAccountId: 'hashed-123',
        isFromSSCL: false
      });

      // Assert
      expect(result.successful).toBe(false);
      expect(result.returnMessage.messageType).toBe('warning');
      expect(result.returnMessage.message).toContain('Existing log for session');
    });

    test('should allow same session when extensionNumber is different', async () => {
      // Arrange
      await UserModel.create(mockUser);
      await CallLogModel.create({
        id: 'tel-session-123',
        sessionId: 'session-123',
        extensionNumber: '101',
        platform: 'testCRM',
        thirdPartyLogId: 'third-party-101',
        userId: 'test-user-id'
      });

      const mockConnector = {
        getAuthType: jest.fn().mockResolvedValue('apiKey'),
        getBasicAuth: jest.fn().mockReturnValue('base64-encoded'),
        getLogFormatType: jest.fn().mockReturnValue('text/plain'),
        createCallLog: jest.fn().mockResolvedValue({
          logId: 'new-log-102',
          returnMessage: { message: 'Call logged', messageType: 'success', ttl: 2000 }
        })
      };
      connectorRegistry.getConnector.mockReturnValue(mockConnector);
      composeCallLog.mockReturnValue('Composed log details');

      const incomingData = {
        ...mockIncomingData,
        logInfo: {
          ...mockIncomingData.logInfo,
          extensionNumber: '102'
        }
      };

      // Act
      const result = await logHandler.createCallLog({
        platform: 'testCRM',
        userId: 'test-user-id',
        incomingData,
        hashedAccountId: 'hashed-123',
        isFromSSCL: false
      });

      // Assert
      expect(result.successful).toBe(true);
      const savedLog = await CallLogModel.findOne({
        where: {
          sessionId: 'session-123',
          extensionNumber: '102'
        }
      });
      expect(savedLog).not.toBeNull();
      expect(savedLog.thirdPartyLogId).toBe('new-log-102');
    });

    test('should block duplicate client log when SSCL already logged same hashed extension', async () => {
      // Arrange
      const hashedExtensionId = getHashValue('rc-ext-1', 'test-hash-key');
      await CallLogModel.create({
        id: 'tel-session-123',
        sessionId: 'session-123',
        extensionNumber: '',
        hashedExtensionId,
        platform: 'testCRM',
        thirdPartyLogId: 'sscl-log',
        userId: 'test-user-id'
      });

      const incomingData = {
        ...mockIncomingData,
        extensionNumber: '101',
        hashedExtensionId
      };

      // Act
      const result = await logHandler.createCallLog({
        platform: 'testCRM',
        userId: 'test-user-id',
        incomingData,
        hashedAccountId: 'hashed-123',
        isFromSSCL: false
      });

      // Assert
      expect(result.successful).toBe(false);
      expect(result.returnMessage.message).toContain('Existing log for session');
    });

    test('should derive hashed extension id from SSCL raw rcExtensionId when saving', async () => {
      // Arrange
      process.env.HASH_KEY = 'test-hash-key';
      await UserModel.create(mockUser);

      const mockConnector = {
        getAuthType: jest.fn().mockResolvedValue('apiKey'),
        getBasicAuth: jest.fn().mockReturnValue('base64-encoded'),
        getLogFormatType: jest.fn().mockReturnValue('text/plain'),
        createCallLog: jest.fn().mockResolvedValue({
          logId: 'new-sscl-log',
          returnMessage: { message: 'Call logged', messageType: 'success', ttl: 2000 }
        })
      };
      connectorRegistry.getConnector.mockReturnValue(mockConnector);
      composeCallLog.mockReturnValue('Composed log details');

      const incomingData = {
        ...mockIncomingData,
        rcExtensionId: 'rc-ext-1'
      };

      // Act
      const result = await logHandler.createCallLog({
        platform: 'testCRM',
        userId: 'test-user-id',
        incomingData,
        hashedAccountId: 'hashed-123',
        isFromSSCL: true
      });

      // Assert
      expect(result.successful).toBe(true);
      const savedLog = await CallLogModel.findOne({
        where: {
          sessionId: 'session-123',
          hashedExtensionId: getHashValue('rc-ext-1', 'test-hash-key')
        }
      });
      expect(savedLog).not.toBeNull();
      expect(savedLog.thirdPartyLogId).toBe('new-sscl-log');
    });

    test('should return warning when user not found', async () => {
      // Act
      const result = await logHandler.createCallLog({
        platform: 'testCRM',
        userId: 'non-existent-user',
        incomingData: mockIncomingData,
        hashedAccountId: 'hashed-123',
        isFromSSCL: false
      });

      // Assert
      expect(result.successful).toBe(false);
      expect(result.returnMessage.message).toBe('User not found');
    });

    test('should return warning when user has no access token', async () => {
      // Arrange
      await UserModel.create({
        id: 'test-user-id',
        platform: 'testCRM',
        accessToken: null
      });

      // Act
      const result = await logHandler.createCallLog({
        platform: 'testCRM',
        userId: 'test-user-id',
        incomingData: mockIncomingData,
        hashedAccountId: 'hashed-123',
        isFromSSCL: false
      });

      // Assert
      expect(result.successful).toBe(false);
      expect(result.returnMessage.message).toBe('User not found');
    });

    test('should return warning when contact not found', async () => {
      // Arrange
      await UserModel.create(mockUser);

      const mockConnector = {
        getAuthType: jest.fn().mockResolvedValue('apiKey'),
        getBasicAuth: jest.fn().mockReturnValue('base64-encoded'),
        getLogFormatType: jest.fn().mockReturnValue('text/plain'),
        createCallLog: jest.fn()
      };
      connectorRegistry.getConnector.mockReturnValue(mockConnector);
      composeCallLog.mockReturnValue('Composed log details');

      const incomingDataNoContact = {
        ...mockIncomingData,
        contactId: null
      };

      // Act
      const result = await logHandler.createCallLog({
        platform: 'testCRM',
        userId: 'test-user-id',
        incomingData: incomingDataNoContact,
        hashedAccountId: 'hashed-123',
        isFromSSCL: false
      });

      // Assert
      expect(result.successful).toBe(false);
      expect(result.returnMessage.message).toContain('Contact not found for number');
    });

    test('should successfully create call log with apiKey auth', async () => {
      // Arrange
      await UserModel.create(mockUser);

      const mockConnector = {
        getAuthType: jest.fn().mockResolvedValue('apiKey'),
        getBasicAuth: jest.fn().mockReturnValue('base64-encoded'),
        getLogFormatType: jest.fn().mockReturnValue('text/plain'),
        createCallLog: jest.fn().mockResolvedValue({
          logId: 'new-log-123',
          returnMessage: { message: 'Call logged', messageType: 'success', ttl: 2000 }
        })
      };
      connectorRegistry.getConnector.mockReturnValue(mockConnector);
      composeCallLog.mockReturnValue('Composed log details');

      // Act
      const result = await logHandler.createCallLog({
        platform: 'testCRM',
        userId: 'test-user-id',
        incomingData: mockIncomingData,
        hashedAccountId: 'hashed-123',
        isFromSSCL: false
      });

      // Assert
      expect(result.successful).toBe(true);
      expect(result.logId).toBe('new-log-123');
      expect(mockConnector.getBasicAuth).toHaveBeenCalledWith({ apiKey: 'test-access-token' });
      expect(mockConnector.createCallLog).toHaveBeenCalled();

      // Verify call log was saved to database
      const savedLog = await CallLogModel.findOne({ where: { sessionId: 'session-123' } });
      expect(savedLog).not.toBeNull();
      expect(savedLog.thirdPartyLogId).toBe('new-log-123');
    });

    test('should call plugin with Bearer auth and without query jwt token', async () => {
      await UserModel.create(mockUser);
      await AccountDataModel.create({
        rcAccountId: mockUser.rcAccountId,
        platformName: 'testPlugin',
        dataKey: 'pluginData',
        data: {
          name: 'plugin.sample',
          supportedLogTypes: ['call'],
          isAsync: false,
          endpointUrl: 'https://plugins.example.com/plugin/testPlugin',
          jwtToken: 'plugin-jwt-token'
        }
      });

      const mockConnector = {
        getAuthType: jest.fn().mockResolvedValue('apiKey'),
        getBasicAuth: jest.fn().mockReturnValue('base64-encoded'),
        getLogFormatType: jest.fn().mockReturnValue('text/plain'),
        createCallLog: jest.fn().mockResolvedValue({
          logId: 'new-log-123',
          returnMessage: { message: 'Call logged', messageType: 'success', ttl: 2000 }
        })
      };
      connectorRegistry.getConnector.mockReturnValue(mockConnector);
      composeCallLog.mockReturnValue('Composed log details');

      axios.post.mockResolvedValue({
        data: {
          ...mockIncomingData,
          note: 'updated by plugin'
        },
        headers: {
          'x-refreshed-jwt-token': 'refreshed-plugin-jwt'
        }
      });

      const result = await logHandler.createCallLog({
        platform: 'testCRM',
        userId: 'test-user-id',
        incomingData: mockIncomingData,
        hashedAccountId: 'hashed-123',
        isFromSSCL: false
      });

      expect(result.successful).toBe(true);
      expect(axios.post).toHaveBeenCalledWith(
        'https://plugins.example.com/plugin/testPlugin',
        { data: mockIncomingData, config: null, hashedExtensionId: null },
        {
          headers: {
            Authorization: 'Bearer plugin-jwt-token'
          }
        }
      );
    });

    test('should create pending async task cache after async call plugin log creation', async () => {
      const { result, cache } = await runAsyncCallPluginLog();

      expect(result.successful).toBe(true);
      expect(cache).not.toBeNull();
      expect(cache.status).toBe('pending');
      expect(cache.userId).toBe('test-user-id');
      expect(cache.data.pluginId).toBe('asyncPlugin');
      expect(cache.data.sessionId).toBe('session-123');
      expect(cache.data.thirdPartyLogId).toBe('new-log-async');
      expect(cache.expiry.getTime() - Date.now()).toBeGreaterThan(6 * 24 * 60 * 60 * 1000);
    });

    test('should pass async task callback details and refreshed token to call plugin', async () => {
      const { cache, pluginCall } = await runAsyncCallPluginLog();

      expect(pluginCall).toBeTruthy();
      expect(pluginCall[1]).toEqual({
        data: mockIncomingData,
        config: null,
        asyncTaskId: cache.id,
        callbackUrl: `https://app.example.com/plugin/async-callback/${cache.id}`,
        hashedExtensionId: null
      });
      expect(pluginCall[2]).toEqual({
        headers: {
          Authorization: 'Bearer synced-plugin-jwt'
        }
      });
    });

    test('should mark async plugin task failed when token sync URL is missing', async () => {
      await UserModel.create(mockUser);
      await AccountDataModel.create({
        rcAccountId: mockUser.rcAccountId,
        platformName: 'asyncPlugin',
        dataKey: 'pluginData',
        data: {
          name: 'plugin.async',
          supportedLogTypes: ['call'],
          isAsync: true,
          endpointUrl: 'https://plugins.example.com/plugin/asyncPlugin',
          jwtToken: 'plugin-jwt-token'
        }
      });

      const mockConnector = {
        getAuthType: jest.fn().mockResolvedValue('apiKey'),
        getBasicAuth: jest.fn().mockReturnValue('base64-encoded'),
        getLogFormatType: jest.fn().mockReturnValue('text/plain'),
        createCallLog: jest.fn().mockResolvedValue({
          logId: 'new-log-async-failed',
          returnMessage: { message: 'Call logged', messageType: 'success', ttl: 2000 }
        })
      };
      connectorRegistry.getConnector.mockReturnValue(mockConnector);
      composeCallLog.mockReturnValue('Composed log details');

      const result = await logHandler.createCallLog({
        platform: 'testCRM',
        userId: 'test-user-id',
        incomingData: mockIncomingData,
        hashedAccountId: 'hashed-123',
        isFromSSCL: false
      });

      expect(result.successful).toBe(true);
      const cache = await CacheModel.findOne({
        where: {
          cacheKey: 'asyncPluginTask-asyncPlugin'
        }
      });
      expect(cache).not.toBeNull();
      expect(cache.status).toBe('failed');
      expect(cache.data.message).toBe('Plugin token sync URL is not set');
      expect(axios.post).not.toHaveBeenCalled();
    });

    test('should successfully create call log with oauth auth', async () => {
      // Arrange
      const oauthUser = { ...mockUser };
      await UserModel.create(oauthUser);

      const mockConnector = {
        getAuthType: jest.fn().mockResolvedValue('oauth'),
        getOauthInfo: jest.fn().mockResolvedValue({
          clientId: 'client-id',
          clientSecret: 'client-secret',
          accessTokenUri: 'https://token.url',
          authorizationUri: 'https://auth.url'
        }),
        getLogFormatType: jest.fn().mockReturnValue('text/plain'),
        createCallLog: jest.fn().mockResolvedValue({
          logId: 'oauth-log-123',
          returnMessage: { message: 'Call logged', messageType: 'success', ttl: 2000 }
        })
      };
      connectorRegistry.getConnector.mockReturnValue(mockConnector);

      const mockOAuthApp = {};
      oauth.getOAuthApp.mockReturnValue(mockOAuthApp);
      oauth.checkAndRefreshAccessToken.mockResolvedValue({
        ...oauthUser,
        accessToken: 'refreshed-token'
      });
      composeCallLog.mockReturnValue('Composed log details');

      // Act
      const result = await logHandler.createCallLog({
        platform: 'testCRM',
        userId: 'test-user-id',
        incomingData: mockIncomingData,
        hashedAccountId: 'hashed-123',
        isFromSSCL: false
      });

      // Assert
      expect(result.successful).toBe(true);
      expect(result.logId).toBe('oauth-log-123');
      expect(oauth.checkAndRefreshAccessToken).toHaveBeenCalled();
    });

    test('should use cached note when USE_CACHE is enabled and isFromSSCL', async () => {
      // Arrange
      process.env.USE_CACHE = 'true';
      await UserModel.create(mockUser);

      NoteCache.get.mockResolvedValue({ note: 'Cached note' });

      const mockConnector = {
        getAuthType: jest.fn().mockResolvedValue('apiKey'),
        getBasicAuth: jest.fn().mockReturnValue('base64-encoded'),
        getLogFormatType: jest.fn().mockReturnValue('text/plain'),
        createCallLog: jest.fn().mockResolvedValue({
          logId: 'cached-log-123',
          returnMessage: { message: 'Call logged', messageType: 'success', ttl: 2000 }
        })
      };
      connectorRegistry.getConnector.mockReturnValue(mockConnector);
      composeCallLog.mockReturnValue('Composed log details');

      // Act
      const result = await logHandler.createCallLog({
        platform: 'testCRM',
        userId: 'test-user-id',
        incomingData: mockIncomingData,
        hashedAccountId: 'hashed-123',
        isFromSSCL: true
      });

      // Assert
      expect(result.successful).toBe(true);
      expect(NoteCache.get).toHaveBeenCalledWith({ sessionId: 'session-123' });

      // Clean up
      delete process.env.USE_CACHE;
    });
  });

  describe('getCallLog', () => {
    test('should return error when user not found', async () => {
      // Act
      const result = await logHandler.getCallLog({
        userId: 'non-existent-user',
        sessionIds: 'session-1,session-2',
        platform: 'testCRM',
        requireDetails: false
      });

      // Assert
      expect(result.successful).toBe(false);
      expect(result.message).toBe('Contact not found');
    });

    test('should return error when no session IDs provided', async () => {
      // Arrange
      await UserModel.create({
        id: 'test-user-id',
        platform: 'testCRM',
        accessToken: 'test-token'
      });

      // Act
      const result = await logHandler.getCallLog({
        userId: 'test-user-id',
        sessionIds: null,
        platform: 'testCRM',
        requireDetails: false
      });

      // Assert
      expect(result.successful).toBe(false);
      expect(result.message).toBe('No session IDs provided');
    });

    test('should return matched logs without details', async () => {
      // Arrange
      await UserModel.create({
        id: 'test-user-id',
        platform: 'testCRM',
        accessToken: 'test-token'
      });

      await CallLogModel.create({
        id: 'call-1',
        sessionId: 'session-1',
        platform: 'testCRM',
        thirdPartyLogId: 'log-1',
        userId: 'test-user-id'
      });

      // Act
      const result = await logHandler.getCallLog({
        userId: 'test-user-id',
        sessionIds: 'session-1,session-2',
        platform: 'testCRM',
        requireDetails: false
      });

      // Assert
      expect(result.successful).toBe(true);
      expect(result.logs).toHaveLength(2);
      expect(result.logs[0]).toEqual({
        sessionId: 'session-1',
        matched: true,
        logId: 'log-1'
      });
      expect(result.logs[1]).toEqual({
        sessionId: 'session-2',
        matched: false
      });
    });

    test('should filter matched logs by extensionNumber when provided', async () => {
      // Arrange
      await UserModel.create({
        id: 'test-user-id',
        platform: 'testCRM',
        accessToken: 'test-token'
      });

      await CallLogModel.create({
        id: 'call-1',
        sessionId: 'session-1',
        extensionNumber: '101',
        platform: 'testCRM',
        thirdPartyLogId: 'log-101',
        userId: 'test-user-id'
      });
      await CallLogModel.create({
        id: 'call-1',
        sessionId: 'session-1',
        extensionNumber: '102',
        platform: 'testCRM',
        thirdPartyLogId: 'log-102',
        userId: 'test-user-id'
      });

      // Act
      const result = await logHandler.getCallLog({
        userId: 'test-user-id',
        sessionIds: 'session-1',
        extensionNumber: '102',
        platform: 'testCRM',
        requireDetails: false
      });

      // Assert
      expect(result.successful).toBe(true);
      expect(result.logs).toEqual([{
        sessionId: 'session-1',
        matched: true,
        logId: 'log-102'
      }]);
    });

    test('should match SSCL log by hashedExtensionId when extensionNumber differs', async () => {
      // Arrange
      await UserModel.create({
        id: 'test-user-id',
        platform: 'testCRM',
        accessToken: 'test-token'
      });

      await CallLogModel.create({
        id: 'call-1',
        sessionId: 'session-1',
        extensionNumber: '',
        hashedExtensionId: 'hashed-ext-1',
        platform: 'testCRM',
        thirdPartyLogId: 'sscl-log',
        userId: 'test-user-id'
      });

      // Act
      const result = await logHandler.getCallLog({
        userId: 'test-user-id',
        sessionIds: 'session-1',
        extensionNumber: '101',
        hashedExtensionId: 'hashed-ext-1',
        platform: 'testCRM',
        requireDetails: false
      });

      // Assert
      expect(result.successful).toBe(true);
      expect(result.logs).toEqual([{
        sessionId: 'session-1',
        matched: true,
        logId: 'sscl-log'
      }]);
    });

    test('should keep session-only lookup backward compatible when extensionNumber is empty', async () => {
      // Arrange
      await UserModel.create({
        id: 'test-user-id',
        platform: 'testCRM',
        accessToken: 'test-token'
      });

      await CallLogModel.create({
        id: 'call-1',
        sessionId: 'session-1',
        extensionNumber: '',
        platform: 'testCRM',
        thirdPartyLogId: 'legacy-log',
        userId: 'test-user-id'
      });
      await CallLogModel.create({
        id: 'call-1',
        sessionId: 'session-1',
        extensionNumber: '102',
        platform: 'testCRM',
        thirdPartyLogId: 'extension-log',
        userId: 'test-user-id'
      });

      // Act
      const result = await logHandler.getCallLog({
        userId: 'test-user-id',
        sessionIds: 'session-1',
        platform: 'testCRM',
        requireDetails: false
      });

      // Assert
      expect(result.successful).toBe(true);
      expect(result.logs).toEqual([{
        sessionId: 'session-1',
        matched: true,
        logId: 'legacy-log'
      }]);
    });

    test('should return matched logs with details when requireDetails is true', async () => {
      // Arrange
      await UserModel.create({
        id: 'test-user-id',
        platform: 'testCRM',
        accessToken: 'test-token',
        platformAdditionalInfo: {}
      });

      await CallLogModel.create({
        id: 'call-1',
        sessionId: 'session-1',
        platform: 'testCRM',
        thirdPartyLogId: 'log-1',
        userId: 'test-user-id',
        contactId: 'contact-1'
      });

      const mockConnector = {
        getAuthType: jest.fn().mockResolvedValue('apiKey'),
        getBasicAuth: jest.fn().mockReturnValue('base64-encoded'),
        getCallLog: jest.fn().mockResolvedValue({
          callLogInfo: { subject: 'Test Call', note: 'Test note' },
          returnMessage: { message: 'Success', messageType: 'success' }
        })
      };
      connectorRegistry.getConnector.mockReturnValue(mockConnector);

      // Act
      const result = await logHandler.getCallLog({
        userId: 'test-user-id',
        sessionIds: 'session-1',
        platform: 'testCRM',
        requireDetails: true
      });

      // Assert
      expect(result.successful).toBe(true);
      expect(result.logs).toHaveLength(1);
      expect(result.logs[0].matched).toBe(true);
      expect(result.logs[0].logData).toEqual({ subject: 'Test Call', note: 'Test note' });
      expect(mockConnector.getCallLog).toHaveBeenCalled();
    });

    test('should limit session IDs to 5', async () => {
      // Arrange
      await UserModel.create({
        id: 'test-user-id',
        platform: 'testCRM',
        accessToken: 'test-token'
      });

      const sessionIds = 'session-1,session-2,session-3,session-4,session-5,session-6,session-7';

      // Act
      const result = await logHandler.getCallLog({
        userId: 'test-user-id',
        sessionIds,
        platform: 'testCRM',
        requireDetails: false
      });

      // Assert
      expect(result.successful).toBe(true);
      expect(result.logs).toHaveLength(5);
    });

    test('should skip session ID 0', async () => {
      // Arrange
      await UserModel.create({
        id: 'test-user-id',
        platform: 'testCRM',
        accessToken: 'test-token',
        platformAdditionalInfo: {}
      });

      const mockConnector = {
        getAuthType: jest.fn().mockResolvedValue('apiKey'),
        getBasicAuth: jest.fn().mockReturnValue('base64-encoded'),
        getCallLog: jest.fn()
      };
      connectorRegistry.getConnector.mockReturnValue(mockConnector);

      // Act
      const result = await logHandler.getCallLog({
        userId: 'test-user-id',
        sessionIds: '0,session-1',
        platform: 'testCRM',
        requireDetails: true
      });

      // Assert
      expect(result.successful).toBe(true);
      expect(result.logs[0]).toEqual({ sessionId: '0', matched: false });
    });
  });

  describe('updateCallLog', () => {
    test('should return unsuccessful when no existing call log found', async () => {
      // Act
      const result = await logHandler.updateCallLog({
        platform: 'testCRM',
        userId: 'test-user-id',
        incomingData: { sessionId: 'non-existent-session' },
        hashedAccountId: 'hashed-123',
        isFromSSCL: false
      });

      // Assert
      expect(result.successful).toBe(false);
    });

    test('should return error when user not found for update', async () => {
      // Arrange
      await CallLogModel.create({
        id: 'call-1',
        sessionId: 'session-1',
        platform: 'testCRM',
        thirdPartyLogId: 'log-1',
        userId: 'test-user-id'
      });

      // Act
      const result = await logHandler.updateCallLog({
        platform: 'testCRM',
        userId: 'non-existent-user',
        incomingData: { sessionId: 'session-1' },
        hashedAccountId: 'hashed-123',
        isFromSSCL: false
      });

      // Assert
      expect(result.successful).toBe(false);
      expect(result.message).toBe('Contact not found');
    });

    test('should successfully update call log', async () => {
      // Arrange
      await UserModel.create({
        id: 'test-user-id',
        platform: 'testCRM',
        accessToken: 'test-token',
        platformAdditionalInfo: {}
      });

      await CallLogModel.create({
        id: 'call-1',
        sessionId: 'session-1',
        platform: 'testCRM',
        thirdPartyLogId: 'log-1',
        userId: 'test-user-id',
        contactId: 'contact-1'
      });

      const mockConnector = {
        getAuthType: jest.fn().mockResolvedValue('apiKey'),
        getBasicAuth: jest.fn().mockReturnValue('base64-encoded'),
        getLogFormatType: jest.fn().mockReturnValue('text/plain'),
        getCallLog: jest.fn().mockResolvedValue({
          callLogInfo: { fullBody: 'Existing body', note: 'Existing note' }
        }),
        updateCallLog: jest.fn().mockResolvedValue({
          updatedNote: 'Updated note',
          returnMessage: { message: 'Updated', messageType: 'success', ttl: 2000 }
        })
      };
      connectorRegistry.getConnector.mockReturnValue(mockConnector);
      composeCallLog.mockReturnValue('Updated composed log');

      const incomingData = {
        sessionId: 'session-1',
        note: 'Updated note',
        subject: 'Updated subject',
        startTime: new Date().toISOString(),
        duration: 180,
        result: 'Completed'
      };

      // Act
      const result = await logHandler.updateCallLog({
        platform: 'testCRM',
        userId: 'test-user-id',
        incomingData,
        hashedAccountId: 'hashed-123',
        isFromSSCL: false
      });

      // Assert
      expect(result.successful).toBe(true);
      expect(result.logId).toBe('log-1');
      expect(result.updatedNote).toBe('Updated note');
      expect(mockConnector.updateCallLog).toHaveBeenCalled();
    });
  });

  describe('call logging data matrix', () => {
    function buildCallConnector(overrides = {}) {
      return {
        getAuthType: jest.fn().mockResolvedValue('apiKey'),
        getBasicAuth: jest.fn().mockReturnValue('encoded-call-key'),
        getOauthInfo: jest.fn().mockResolvedValue({ tokenUrl: 'https://auth.example.test/token' }),
        getLogFormatType: jest.fn().mockReturnValue('text/plain'),
        createCallLog: jest.fn().mockResolvedValue({
          logId: 'provider-created-call-log',
          returnMessage: { message: 'Call logged', messageType: 'success', ttl: 3000 },
          extraDataTracking: {},
        }),
        getCallLog: jest.fn().mockResolvedValue({
          callLogInfo: {
            note: 'Existing provider note',
            fullLogResponse: { id: 'provider-call-log' },
          },
          returnMessage: { message: 'Call fetched', messageType: 'success', ttl: 3000 },
          extraDataTracking: {},
        }),
        updateCallLog: jest.fn().mockResolvedValue({
          updatedNote: 'Updated provider note',
          returnMessage: { message: 'Call updated', messageType: 'success', ttl: 3000 },
          extraDataTracking: {},
        }),
        ...overrides,
      };
    }

    async function seedCallLog({ sessionId, userId, extensionNumber = '101' }) {
      return CallLogModel.create({
        id: `telephony-${sessionId}`,
        sessionId,
        extensionNumber,
        platform: 'testCRM',
        thirdPartyLogId: `provider-${sessionId}`,
        userId,
        contactId: 'call-log-contact',
      });
    }

    test.each<[any]>(rcCallLogRecordCases as [any][])(
      'Create preserves the RingCentral $view payload for $label',
      async ({ record, expectedContactNumber, expectedHasRecording }) => {
        const suffix = String(record.id).replace(/\W+/g, '-').toLowerCase();
        const contactNumber = expectedContactNumber
          || (record.direction === 'Inbound' ? record.from.phoneNumber : record.to.phoneNumber);
        const hasRecording = expectedHasRecording ?? !!record.recording;
        const user = buildCallLogUser({ id: `rc-call-user-${suffix}` });
        const providerLogId = `provider-${record.id}`;
        await UserModel.create(user);

        const connector = buildCallConnector({
          createCallLog: jest.fn().mockResolvedValue({
            logId: providerLogId,
            returnMessage: { message: 'Call logged', messageType: 'success', ttl: 3000 },
            extraDataTracking: {},
          }),
        });
        connectorRegistry.getConnector.mockReturnValue(connector);
        composeCallLog.mockReturnValue(`Composed ${record.id}`);

        const incomingData = buildCallLogIncomingData({ logInfo: record });
        const result = await logHandler.createCallLog({
          platform: 'testCRM',
          userId: user.id,
          incomingData,
          hashedAccountId: 'hashed-account',
          isFromSSCL: false,
        });

        expect(result).toMatchObject({ successful: true, logId: providerLogId });
        expect(connector.createCallLog).toHaveBeenCalledWith(expect.objectContaining({
          callLog: incomingData.logInfo,
          contactInfo: expect.objectContaining({ phoneNumber: contactNumber }),
        }));
        expect(composeCallLog).toHaveBeenCalledWith(expect.objectContaining({
          callLog: incomingData.logInfo,
          recordingLink: hasRecording ? record.recording.contentUri : undefined,
        }));

        const persisted = await CallLogModel.findByPk(record.telephonySessionId || record.id);
        expect(persisted).toMatchObject({
          sessionId: record.sessionId,
          thirdPartyLogId: providerLogId,
        });
      },
    );

    test.each<[any]>(rcCallLogResultCases as [any][])(
      'Create forwards RingCentral result fields for $label',
      async ({ record, direction, result: callResult, duration }) => {
        const suffix = String(record.id).replace(/\W+/g, '-').toLowerCase();
        const user = buildCallLogUser({ id: `rc-result-user-${suffix}` });
        await UserModel.create(user);

        const connector = buildCallConnector({
          createCallLog: jest.fn().mockResolvedValue({
            logId: `provider-${record.id}`,
            returnMessage: { message: 'Call logged', messageType: 'success', ttl: 3000 },
            extraDataTracking: {},
          }),
        });
        connectorRegistry.getConnector.mockReturnValue(connector);
        composeCallLog.mockReturnValue(`Composed ${record.id}`);

        const incomingData = buildCallLogIncomingData({ logInfo: record });
        const response = await logHandler.createCallLog({
          platform: 'testCRM',
          userId: user.id,
          incomingData,
          hashedAccountId: 'hashed-account',
          isFromSSCL: false,
        });

        expect(response.successful).toBe(true);
        expect(connector.createCallLog).toHaveBeenCalledWith(expect.objectContaining({
          callLog: expect.objectContaining({
            direction,
            result: callResult,
            duration,
          }),
        }));
      },
    );

    test.each<[any]>(callLogAuthCases as [any][])(
      '$label returns a revoke result when OAuth refresh fails',
      async ({ operation, sessionId }) => {
        const user = buildCallLogUser({ id: `user-${operation}` });
        await UserModel.create(user);

        if (operation !== 'createCallLog') {
          await seedCallLog({ sessionId, userId: user.id });
        }

        const connector = buildCallConnector({
          getAuthType: jest.fn().mockResolvedValue('oauth'),
        });
        connectorRegistry.getConnector.mockReturnValue(connector);
        oauth.getOAuthApp.mockReturnValue({ id: 'oauth-app' });
        oauth.checkAndRefreshAccessToken.mockResolvedValue(null);

        let result;
        if (operation === 'createCallLog') {
          result = await logHandler.createCallLog({
            platform: 'testCRM',
            userId: user.id,
            incomingData: buildCallLogIncomingData({
              logInfo: { sessionId, telephonySessionId: `telephony-${sessionId}` },
            }),
            hashedAccountId: 'hashed-account',
            isFromSSCL: false,
          });
        } else if (operation === 'getCallLog') {
          result = await logHandler.getCallLog({
            platform: 'testCRM',
            userId: user.id,
            sessionIds: sessionId,
            requireDetails: true,
          });
        } else {
          result = await logHandler.updateCallLog({
            platform: 'testCRM',
            userId: user.id,
            incomingData: buildCallLogUpdateData({ sessionId }),
            hashedAccountId: 'hashed-account',
            isFromSSCL: false,
          });
        }

        expect(result).toMatchObject({
          successful: false,
          isRevokeUserSession: true,
          returnMessage: {
            message: 'User session expired. Please connect again.',
            messageType: 'warning',
          },
        });
        expect(connector[operation]).not.toHaveBeenCalled();
      },
    );

    test.each<[any]>(callLogAuthCases as [any][])(
      '$label forwards proxy configuration through authentication and the connector operation',
      async ({ operation, sessionId, proxyId }) => {
        const user = buildCallLogUser({
          id: `proxy-user-${operation}`,
          platformAdditionalInfo: { proxyId },
        });
        await UserModel.create(user);

        if (operation !== 'createCallLog') {
          await seedCallLog({ sessionId, userId: user.id });
        }

        const proxyConfig = { id: proxyId, name: `Config for ${operation}` };
        Connector.getProxyConfig.mockResolvedValue(proxyConfig);
        const connector = buildCallConnector();
        connectorRegistry.getConnector.mockReturnValue(connector);
        composeCallLog.mockReturnValue('Composed proxy call log');

        if (operation === 'createCallLog') {
          await logHandler.createCallLog({
            platform: 'testCRM',
            userId: user.id,
            incomingData: buildCallLogIncomingData({
              logInfo: { sessionId, telephonySessionId: `telephony-${sessionId}` },
            }),
            hashedAccountId: 'hashed-account',
            isFromSSCL: false,
          });
        } else if (operation === 'getCallLog') {
          await logHandler.getCallLog({
            platform: 'testCRM',
            userId: user.id,
            sessionIds: sessionId,
            requireDetails: true,
          });
        } else {
          await logHandler.updateCallLog({
            platform: 'testCRM',
            userId: user.id,
            incomingData: buildCallLogUpdateData({ sessionId }),
            hashedAccountId: 'hashed-account',
            isFromSSCL: false,
          });
        }

        expect(Connector.getProxyConfig).toHaveBeenCalledWith(proxyId);
        expect(connector.getAuthType).toHaveBeenCalledWith({ proxyId, proxyConfig });
        expect(connector[operation]).toHaveBeenCalledWith(expect.objectContaining({
          proxyConfig,
        }));
      },
    );

    test.each<[any]>(callLogDatabaseFailureCases as [any][])(
      '$label returns a stable failure result',
      async ({ operation, modelMethod }) => {
        const sessionId = `database-${operation}-${modelMethod}`;
        const user = buildCallLogUser({ id: `database-user-${operation}-${modelMethod}` });

        if (operation === 'getCallLog' || modelMethod === 'create') {
          await UserModel.create(user);
        }

        const connector = buildCallConnector();
        connectorRegistry.getConnector.mockReturnValue(connector);
        composeCallLog.mockReturnValue('Composed database call log');
        jest.spyOn(CallLogModel, modelMethod).mockRejectedValueOnce(new Error(`Database ${modelMethod} failed`));

        let result;
        if (operation === 'createCallLog') {
          result = await logHandler.createCallLog({
            platform: 'testCRM',
            userId: user.id,
            incomingData: buildCallLogIncomingData({
              logInfo: { sessionId, telephonySessionId: `telephony-${sessionId}` },
            }),
            hashedAccountId: 'hashed-account',
            isFromSSCL: false,
          });
        } else if (operation === 'getCallLog') {
          result = await logHandler.getCallLog({
            platform: 'testCRM',
            userId: user.id,
            sessionIds: sessionId,
            requireDetails: false,
          });
        } else {
          result = await logHandler.updateCallLog({
            platform: 'testCRM',
            userId: user.id,
            incomingData: buildCallLogUpdateData({ sessionId }),
            hashedAccountId: 'hashed-account',
            isFromSSCL: false,
          });
        }

        expect(result.successful).toBe(false);
        expect(result.returnMessage).toEqual(expect.objectContaining({
          messageType: 'warning',
        }));
      },
    );

    test.each<[any]>(callLogResultCases as [any][])(
      'Create handles $label',
      async ({ connectorResult, expectedSuccessful, expectedLogId, expectedPersistedLogId }) => {
        const user = buildCallLogUser({ id: `result-user-${String(expectedLogId)}` });
        const sessionId = `result-session-${String(expectedLogId)}`;
        await UserModel.create(user);

        const connector = buildCallConnector({
          createCallLog: jest.fn().mockResolvedValue(connectorResult),
        });
        connectorRegistry.getConnector.mockReturnValue(connector);
        composeCallLog.mockReturnValue('Composed result call log');

        const result = await logHandler.createCallLog({
          platform: 'testCRM',
          userId: user.id,
          incomingData: buildCallLogIncomingData({
            logInfo: { sessionId, telephonySessionId: `telephony-${sessionId}` },
          }),
          hashedAccountId: 'hashed-account',
          isFromSSCL: false,
        });

        expect(result.successful).toBe(expectedSuccessful);
        expect(result.logId).toBe(expectedLogId);
        const persisted = await CallLogModel.findOne({ where: { sessionId } });
        if (expectedPersistedLogId === null) {
          expect(persisted).toBeNull();
        } else {
          expect(persisted.thirdPartyLogId).toBe(expectedPersistedLogId);
        }
      },
    );

    test.each<[any]>(callLogUpdateInputCases as [any][])(
      'Update $label',
      async ({
        label,
        logFormat,
        getResult,
        getError,
        expectedExistingBody,
        expectedExistingDetails,
        expectDetailLookup = true,
      }) => {
        const suffix = label.replace(/\W+/g, '-').toLowerCase();
        const sessionId = `update-input-${suffix}`;
        const user = buildCallLogUser({ id: `update-input-user-${suffix}` });
        await UserModel.create(user);
        await seedCallLog({ sessionId, userId: user.id });

        const getCallLog = getError
          ? jest.fn().mockRejectedValue(new Error(getError))
          : jest.fn().mockResolvedValue(getResult);
        const connector = buildCallConnector({
          getLogFormatType: jest.fn().mockReturnValue(logFormat),
          getCallLog,
        });
        connectorRegistry.getConnector.mockReturnValue(connector);
        composeCallLog.mockReturnValue(`Composed ${suffix}`);

        const incomingData = buildCallLogUpdateData({ sessionId });
        const result = await logHandler.updateCallLog({
          platform: 'testCRM',
          userId: user.id,
          incomingData,
          hashedAccountId: 'hashed-account',
          isFromSSCL: true,
        });

        expect(result.successful).toBe(true);
        if (expectDetailLookup) {
          expect(getCallLog).toHaveBeenCalledTimes(1);
          expect(composeCallLog).toHaveBeenCalledWith(expect.objectContaining({
            existingBody: expectedExistingBody,
            note: incomingData.note,
            ringSenseSummary: incomingData.ringSenseSummary,
          }));
        } else {
          expect(getCallLog).not.toHaveBeenCalled();
          expect(composeCallLog).not.toHaveBeenCalled();
        }
        expect(connector.updateCallLog).toHaveBeenCalledWith(expect.objectContaining({
          recordingLink: incomingData.recordingLink,
          recordingDownloadLink: incomingData.recordingDownloadLink,
          aiNote: incomingData.aiNote,
          transcript: incomingData.transcript,
          legs: incomingData.legs,
          ringSenseTranscript: incomingData.ringSenseTranscript,
          ringSenseSummary: incomingData.ringSenseSummary,
          ringSenseAIScore: incomingData.ringSenseAIScore,
          ringSenseBulletedSummary: incomingData.ringSenseBulletedSummary,
          ringSenseLink: incomingData.ringSenseLink,
          additionalSubmission: incomingData.additionalSubmission,
          existingCallLogDetails: expectedExistingDetails,
          composedLogDetails: expectDetailLookup ? `Composed ${suffix}` : '',
          hashedAccountId: 'hashed-account',
          isFromSSCL: true,
        }));
      },
    );
  });

  describe('createMessageLog', () => {
    test('should return warning when no messages to log', async () => {
      // Act
      const result = await logHandler.createMessageLog({
        platform: 'testCRM',
        userId: 'test-user-id',
        incomingData: {
          logInfo: { messages: [] }
        }
      });

      // Assert
      expect(result.successful).toBe(false);
      expect(result.returnMessage.message).toBe('No message to log.');
    });

    test('should return warning when user not found', async () => {
      // Act
      const result = await logHandler.createMessageLog({
        platform: 'testCRM',
        userId: 'non-existent-user',
        incomingData: {
          logInfo: {
            messages: [{ id: 'msg-1', subject: 'Test', creationTime: new Date() }],
            correspondents: [{ phoneNumber: '+1234567890' }]
          }
        }
      });

      // Assert
      expect(result.successful).toBe(false);
      expect(result.returnMessage.message).toBe('Contact not found');
    });

    test('should return warning when contact not found', async () => {
      // Arrange
      await UserModel.create({
        id: 'test-user-id',
        platform: 'testCRM',
        accessToken: 'test-token',
        platformAdditionalInfo: {}
      });

      const mockConnector = {
        getAuthType: jest.fn().mockResolvedValue('apiKey'),
        getBasicAuth: jest.fn().mockReturnValue('base64-encoded')
      };
      connectorRegistry.getConnector.mockReturnValue(mockConnector);

      // Act
      const result = await logHandler.createMessageLog({
        platform: 'testCRM',
        userId: 'test-user-id',
        incomingData: {
          logInfo: {
            messages: [{ id: 'msg-1', subject: 'Test', creationTime: new Date() }],
            correspondents: [{ phoneNumber: '+1234567890' }]
          },
          contactId: null
        }
      });

      // Assert
      expect(result.successful).toBe(false);
      expect(result.returnMessage.message).toContain('Contact not found for number');
    });

    test('should successfully create message log', async () => {
      // Arrange
      await UserModel.create({
        id: 'test-user-id',
        platform: 'testCRM',
        accessToken: 'test-token',
        platformAdditionalInfo: {}
      });

      const mockConnector = {
        getAuthType: jest.fn().mockResolvedValue('apiKey'),
        getBasicAuth: jest.fn().mockReturnValue('base64-encoded'),
        createMessageLog: jest.fn().mockResolvedValue({
          logId: 'msg-log-123',
          returnMessage: { message: 'Message logged', messageType: 'success', ttl: 2000 }
        }),
        updateMessageLog: jest.fn()
      };
      connectorRegistry.getConnector.mockReturnValue(mockConnector);

      const incomingData = {
        logInfo: {
          messages: [{ id: 'msg-1', subject: 'Test SMS', direction: 'Outbound', creationTime: new Date() }],
          correspondents: [{ phoneNumber: '+1234567890' }],
          conversationId: 'conv-123',
          conversationLogId: 'conv-log-123'
        },
        contactId: 'contact-123',
        contactType: 'Contact',
        contactName: 'Test Contact',
        additionalSubmission: {}
      };

      // Act
      const result = await logHandler.createMessageLog({
        platform: 'testCRM',
        userId: 'test-user-id',
        incomingData
      });

      // Assert
      expect(result.successful).toBe(true);
      expect(result.logIds).toContain('msg-1');
      expect(mockConnector.createMessageLog).toHaveBeenCalled();

      // Verify message log was saved
      const savedLog = await MessageLogModel.findOne({ where: { id: 'msg-1' } });
      expect(savedLog).not.toBeNull();
      expect(savedLog.thirdPartyLogId).toBe('msg-log-123');
    });

    test('should skip already logged messages', async () => {
      // Arrange
      await UserModel.create({
        id: 'test-user-id',
        platform: 'testCRM',
        accessToken: 'test-token',
        platformAdditionalInfo: {}
      });

      // Create existing message log with same conversationLogId
      await MessageLogModel.create({
        id: 'msg-1',
        platform: 'testCRM',
        conversationId: 'conv-123',
        conversationLogId: 'conv-log-123',
        thirdPartyLogId: 'existing-log',
        userId: 'test-user-id'
      });

      const mockConnector = {
        getAuthType: jest.fn().mockResolvedValue('apiKey'),
        getBasicAuth: jest.fn().mockReturnValue('base64-encoded'),
        createMessageLog: jest.fn().mockResolvedValue({
          logId: 'msg-log-new',
          returnMessage: { message: 'Message logged', messageType: 'success', ttl: 2000 }
        }),
        updateMessageLog: jest.fn().mockResolvedValue({
          returnMessage: { message: 'Message updated', messageType: 'success', ttl: 2000 }
        })
      };
      connectorRegistry.getConnector.mockReturnValue(mockConnector);

      const incomingData = {
        logInfo: {
          messages: [
            { id: 'msg-1', subject: 'Already logged', direction: 'Outbound', creationTime: new Date() },
            { id: 'msg-2', subject: 'New message', direction: 'Outbound', creationTime: new Date() }
          ],
          correspondents: [{ phoneNumber: '+1234567890' }],
          conversationId: 'conv-123',
          conversationLogId: 'conv-log-123'  // Same conversationLogId as existing record
        },
        contactId: 'contact-123',
        contactType: 'Contact',
        additionalSubmission: {}
      };

      // Act
      const result = await logHandler.createMessageLog({
        platform: 'testCRM',
        userId: 'test-user-id',
        incomingData
      });

      // Assert
      expect(result.successful).toBe(true);
      // msg-1 is skipped (already logged), msg-2 uses updateMessageLog because same conversationLogId exists
      expect(mockConnector.createMessageLog).toHaveBeenCalledTimes(0);
      expect(mockConnector.updateMessageLog).toHaveBeenCalledTimes(1);
    });

    test('should return a schema-valid no-op result when every message is already logged', async () => {
      await UserModel.create({
        id: 'test-user-id',
        platform: 'testCRM',
        accessToken: 'test-token',
        platformAdditionalInfo: {},
      });
      await MessageLogModel.create({
        id: 'msg-1',
        platform: 'testCRM',
        conversationId: 'conv-123',
        conversationLogId: 'conv-log-123',
        thirdPartyLogId: 'existing-log',
        userId: 'test-user-id',
      });

      const mockConnector = {
        getAuthType: jest.fn().mockResolvedValue('apiKey'),
        getBasicAuth: jest.fn().mockReturnValue('base64-encoded'),
        createMessageLog: jest.fn(),
        updateMessageLog: jest.fn(),
      };
      connectorRegistry.getConnector.mockReturnValue(mockConnector);

      const result = await logHandler.createMessageLog({
        platform: 'testCRM',
        userId: 'test-user-id',
        incomingData: {
          logInfo: {
            messages: [
              {
                id: 'msg-1',
                subject: 'Already logged',
                direction: 'Outbound',
                creationTime: new Date(),
              },
            ],
            correspondents: [{ phoneNumber: '+1234567890' }],
            conversationId: 'conv-123',
            conversationLogId: 'conv-log-123',
          },
          contactId: 'contact-123',
          contactType: 'Contact',
          additionalSubmission: {},
        },
      });

      expect(result).toEqual(expect.objectContaining({
        successful: true,
        logIds: [],
        returnMessage: null,
      }));
      expect(() => MessageLogResponseSchema.parse(result)).not.toThrow();
      expect(mockConnector.createMessageLog).not.toHaveBeenCalled();
      expect(mockConnector.updateMessageLog).not.toHaveBeenCalled();
    });

    test('should handle group SMS with contactId suffix for message IDs', async () => {
      // Arrange - group SMS has multiple correspondents
      await UserModel.create({
        id: 'test-user-id',
        platform: 'testCRM',
        accessToken: 'test-token',
        rcAccountId: 'rc-account-123',
        platformAdditionalInfo: {}
      });

      const mockConnector = {
        getAuthType: jest.fn().mockResolvedValue('apiKey'),
        getBasicAuth: jest.fn().mockReturnValue('base64-encoded'),
        createMessageLog: jest.fn().mockResolvedValue({
          logId: 'msg-log-group-123',
          returnMessage: { message: 'Message logged', messageType: 'success', ttl: 2000 }
        }),
        updateMessageLog: jest.fn()
      };
      connectorRegistry.getConnector.mockReturnValue(mockConnector);

      const incomingData = {
        logInfo: {
          messages: [{ id: 'msg-group-1', subject: 'Group SMS', direction: 'Outbound', creationTime: new Date() }],
          correspondents: [
            { phoneNumber: '+1234567890' },
            { phoneNumber: '+0987654321' }
          ],
          conversationId: 'conv-group-123',
          conversationLogId: 'conv-log-group-123'
        },
        contactId: 'contact-456',
        contactType: 'Contact',
        contactName: 'Primary Contact',
        additionalSubmission: {}
      };

      // Act
      const result = await logHandler.createMessageLog({
        platform: 'testCRM',
        userId: 'test-user-id',
        incomingData
      });

      // Assert
      expect(result.successful).toBe(true);
      expect(result.logIds).toContain('msg-group-1-contact-456');
      const savedLog = await MessageLogModel.findOne({ where: { id: 'msg-group-1-contact-456' } });
      expect(savedLog).not.toBeNull();
      expect(savedLog.thirdPartyLogId).toBe('msg-log-group-123');
    });

    test('should pass correspondents to createMessageLog when group SMS has different contact names', async () => {
      // Arrange - correspondent in cache with different name
      await UserModel.create({
        id: 'test-user-id',
        platform: 'testCRM',
        accessToken: 'test-token',
        rcAccountId: 'rc-account-123',
        platformAdditionalInfo: {}
      });

      await AccountDataModel.create({
        rcAccountId: 'rc-account-123',
        platformName: 'testCRM',
        dataKey: 'contact-+0987654321',
        data: [{ name: 'Other Contact', id: 'contact-789' }]
      });

      const mockConnector = {
        getAuthType: jest.fn().mockResolvedValue('apiKey'),
        getBasicAuth: jest.fn().mockReturnValue('base64-encoded'),
        createMessageLog: jest.fn().mockResolvedValue({
          logId: 'msg-log-correspondents',
          returnMessage: { message: 'Message logged', messageType: 'success', ttl: 2000 }
        }),
        updateMessageLog: jest.fn()
      };
      connectorRegistry.getConnector.mockReturnValue(mockConnector);

      const incomingData = {
        logInfo: {
          messages: [{ id: 'msg-correspondents', subject: 'Group SMS', direction: 'Outbound', creationTime: new Date() }],
          correspondents: [
            { phoneNumber: '+1234567890' },
            { phoneNumber: '+0987654321' }
          ],
          conversationId: 'conv-correspondents',
          conversationLogId: 'conv-log-correspondents'
        },
        contactId: 'contact-456',
        contactType: 'Contact',
        contactName: 'Primary Contact',
        additionalSubmission: {}
      };

      // Act
      await logHandler.createMessageLog({
        platform: 'testCRM',
        userId: 'test-user-id',
        incomingData
      });

      // Assert - createMessageLog should receive correspondents with different name
      expect(mockConnector.createMessageLog).toHaveBeenCalledWith(
        expect.objectContaining({
          correspondents: [[{ name: 'Other Contact', id: 'contact-789' }]]
        })
      );
    });

    test('should not add correspondent when name matches contactName in group SMS', async () => {
      // Arrange - correspondent in cache with same name as contactName
      await UserModel.create({
        id: 'test-user-id',
        platform: 'testCRM',
        accessToken: 'test-token',
        rcAccountId: 'rc-account-123',
        platformAdditionalInfo: {}
      });

      await AccountDataModel.create({
        rcAccountId: 'rc-account-123',
        platformName: 'testCRM',
        dataKey: 'contact-+0987654321',
        data: [{ name: 'Primary Contact', id: 'contact-789' }]
      });

      const mockConnector = {
        getAuthType: jest.fn().mockResolvedValue('apiKey'),
        getBasicAuth: jest.fn().mockReturnValue('base64-encoded'),
        createMessageLog: jest.fn().mockResolvedValue({
          logId: 'msg-log-same-name',
          returnMessage: { message: 'Message logged', messageType: 'success', ttl: 2000 }
        }),
        updateMessageLog: jest.fn()
      };
      connectorRegistry.getConnector.mockReturnValue(mockConnector);

      const incomingData = {
        logInfo: {
          messages: [{ id: 'msg-same-name', subject: 'Group SMS', direction: 'Outbound', creationTime: new Date() }],
          correspondents: [
            { phoneNumber: '+1234567890' },
            { phoneNumber: '+0987654321' }
          ],
          conversationId: 'conv-same-name',
          conversationLogId: 'conv-log-same-name'
        },
        contactId: 'contact-456',
        contactType: 'Contact',
        contactName: 'Primary Contact',
        additionalSubmission: {}
      };

      // Act
      await logHandler.createMessageLog({
        platform: 'testCRM',
        userId: 'test-user-id',
        incomingData
      });

      // Assert - correspondents should be empty when names match
      expect(mockConnector.createMessageLog).toHaveBeenCalledWith(
        expect.objectContaining({
          correspondents: []
        })
      );
    });

    test('should use suffixed conversationLogId and conversationId for group SMS', async () => {
      // Arrange
      await UserModel.create({
        id: 'test-user-id',
        platform: 'testCRM',
        accessToken: 'test-token',
        rcAccountId: 'rc-account-123',
        platformAdditionalInfo: {}
      });

      const mockConnector = {
        getAuthType: jest.fn().mockResolvedValue('apiKey'),
        getBasicAuth: jest.fn().mockReturnValue('base64-encoded'),
        createMessageLog: jest.fn().mockResolvedValue({
          logId: 'msg-log-suffix',
          returnMessage: { message: 'Message logged', messageType: 'success', ttl: 2000 }
        }),
        updateMessageLog: jest.fn()
      };
      connectorRegistry.getConnector.mockReturnValue(mockConnector);

      const incomingData = {
        logInfo: {
          messages: [{ id: 'msg-suffix', subject: 'Group SMS', direction: 'Outbound', creationTime: new Date() }],
          correspondents: [
            { phoneNumber: '+1234567890' },
            { phoneNumber: '+0987654321' }
          ],
          conversationId: 'conv-original',
          conversationLogId: 'conv-log-original'
        },
        contactId: 'contact-999',
        contactType: 'Contact',
        contactName: 'Test Contact',
        additionalSubmission: {}
      };

      // Act
      const result = await logHandler.createMessageLog({
        platform: 'testCRM',
        userId: 'test-user-id',
        incomingData
      });

      // Assert - message log saved with suffixed conversationLogId
      expect(result.successful).toBe(true);
      const savedLog = await MessageLogModel.findOne({ where: { id: 'msg-suffix-contact-999' } });
      expect(savedLog).not.toBeNull();
      expect(savedLog.conversationLogId).toBe('conv-log-original-contact-999');
      expect(savedLog.conversationId).toBe('conv-original-contact-999');
    });

    test('should revoke session when oauth message logging cannot refresh the user', async () => {
      await UserModel.create({
        id: 'test-user-id',
        platform: 'testCRM',
        accessToken: 'expired-token',
        rcAccountId: 'rc-account-123',
        platformAdditionalInfo: {}
      });

      const mockConnector = {
        getAuthType: jest.fn().mockResolvedValue('oauth'),
        getOauthInfo: jest.fn().mockResolvedValue({
          clientId: 'client-id',
          clientSecret: 'client-secret'
        }),
        createMessageLog: jest.fn()
      };
      connectorRegistry.getConnector.mockReturnValue(mockConnector);
      oauth.getOAuthApp.mockReturnValue({});
      oauth.checkAndRefreshAccessToken.mockResolvedValue(null);

      const result = await logHandler.createMessageLog({
        platform: 'testCRM',
        userId: 'test-user-id',
        incomingData: {
          logInfo: {
            messages: [{ id: 'msg-oauth-expired', type: 'SMS', creationTime: new Date() }],
            correspondents: [{ phoneNumber: '+15550000001' }],
            conversationId: 'conv-oauth-expired',
            conversationLogId: 'conv-log-oauth-expired'
          },
          contactId: 'contact-oauth',
          contactName: 'OAuth Contact',
          additionalSubmission: {}
        }
      });

      expect(result).toEqual({
        successful: false,
        returnMessage: {
          message: 'User session expired. Please connect again.',
          messageType: 'warning',
          ttl: 5000
        },
        isRevokeUserSession: true
      });
      expect(mockConnector.createMessageLog).not.toHaveBeenCalled();
    });

    test('should sync async message plugin tokens and persist refreshed plugin credentials', async () => {
      await UserModel.create({
        id: 'test-user-id',
        platform: 'testCRM',
        accessToken: 'test-token',
        rcAccountId: 'rc-account-123',
        userSettings: {
          plugin_smsPlugin: {
            value: {
              config: {
                ignoredLetters: ['x']
              }
            }
          }
        },
        platformAdditionalInfo: {}
      });
      await AccountDataModel.create({
        rcAccountId: 'rc-account-123',
        platformName: 'smsPlugin',
        dataKey: 'pluginData',
        data: {
          name: 'plugin.sms',
          supportedLogTypes: ['sms'],
          isAsync: true,
          endpointUrl: 'https://plugins.example.com/sms',
          tokenSyncUrl: 'https://plugins.example.com/sms/token',
          jwtToken: 'old-plugin-jwt'
        }
      });

      const mockConnector = {
        getAuthType: jest.fn().mockResolvedValue('apiKey'),
        getBasicAuth: jest.fn().mockReturnValue('base64-encoded'),
        createMessageLog: jest.fn().mockResolvedValue({
          logId: 'msg-log-async-plugin',
          returnMessage: { message: 'Message logged', messageType: 'success', ttl: 2000 }
        }),
        updateMessageLog: jest.fn()
      };
      connectorRegistry.getConnector.mockReturnValue(mockConnector);
      axios.post.mockImplementation((url) => {
        if (url === 'https://plugins.example.com/sms/token') {
          return Promise.resolve({
            headers: {
              'x-refreshed-jwt-token': 'new-plugin-jwt'
            }
          });
        }
        return Promise.resolve({ data: { accepted: true }, headers: {} });
      });

      const result = await logHandler.createMessageLog({
        platform: 'testCRM',
        userId: 'test-user-id',
        incomingData: {
          logInfo: {
            messages: [{ id: 'msg-async-plugin', type: 'SMS', subject: 'SMS', direction: 'Outbound', creationTime: new Date() }],
            correspondents: [{ phoneNumber: '+15550000001' }],
            conversationId: 'conv-async-plugin',
            conversationLogId: 'conv-log-async-plugin'
          },
          contactId: 'contact-async-plugin',
          contactName: 'Plugin Contact',
          additionalSubmission: {}
        }
      });

      expect(result.successful).toBe(true);
      expect(axios.post).toHaveBeenCalledWith(
        'https://plugins.example.com/sms/token',
        {},
        {
          headers: {
            Authorization: 'Bearer old-plugin-jwt'
          }
        }
      );
      expect(axios.post).toHaveBeenCalledWith(
        'https://plugins.example.com/sms',
        {
          data: {
            logInfo: expect.objectContaining({
              logInfo: expect.objectContaining({
                messages: expect.any(Array)
              }),
              contactId: 'contact-async-plugin',
              contactName: 'Plugin Contact',
              additionalSubmission: {}
            }),
          },
          config: {
            ignoredLetters: ['x']
          }
        },
        {
          headers: {
            Authorization: 'Bearer new-plugin-jwt'
          }
        }
      );

      const pluginRecord = await AccountDataModel.findOne({
        where: {
          rcAccountId: 'rc-account-123',
          platformName: 'smsPlugin',
          dataKey: 'pluginData'
        }
      });
      expect(pluginRecord.data.jwtToken).toBe('new-plugin-jwt');
    });

    test('should apply sync message plugin logInfo responses before creating the CRM message log', async () => {
      await UserModel.create({
        id: 'test-user-id',
        platform: 'testCRM',
        accessToken: 'test-token',
        rcAccountId: 'rc-account-123',
        platformAdditionalInfo: {}
      });
      await AccountDataModel.create({
        rcAccountId: 'rc-account-123',
        platformName: 'syncSmsPlugin',
        dataKey: 'pluginData',
        data: {
          name: 'plugin.syncSms',
          supportedLogTypes: ['sms'],
          isAsync: false,
          endpointUrl: 'https://plugins.example.com/sync-sms',
          jwtToken: 'sync-plugin-jwt'
        }
      });

      const mockConnector = {
        getAuthType: jest.fn().mockResolvedValue('apiKey'),
        getBasicAuth: jest.fn().mockReturnValue('base64-encoded'),
        createMessageLog: jest.fn().mockResolvedValue({
          logId: 'msg-log-sync-plugin',
          returnMessage: { message: 'Message logged', messageType: 'success', ttl: 2000 }
        }),
        updateMessageLog: jest.fn()
      };
      connectorRegistry.getConnector.mockReturnValue(mockConnector);
      axios.post.mockResolvedValue({
        data: {
          logInfo: {
            messages: [{ id: 'msg-sync-plugin-updated', type: 'SMS', subject: 'Updated', direction: 'Outbound', creationTime: new Date() }],
            correspondents: [{ phoneNumber: '+15550000001' }],
            conversationId: 'conv-sync-plugin',
            conversationLogId: 'conv-log-sync-plugin'
          },
          contactId: 'contact-sync-plugin',
          contactName: 'Updated Contact',
          additionalSubmission: { source: 'plugin' }
        },
        headers: {
          'x-refreshed-jwt-token': 'refreshed-sync-plugin-jwt'
        }
      });

      const result = await logHandler.createMessageLog({
        platform: 'testCRM',
        userId: 'test-user-id',
        incomingData: {
          logInfo: {
            messages: [{ id: 'msg-sync-plugin-original', type: 'SMS', subject: 'Original', direction: 'Outbound', creationTime: new Date() }],
            correspondents: [{ phoneNumber: '+15550000001' }],
            conversationId: 'conv-original',
            conversationLogId: 'conv-log-original'
          },
          contactId: 'contact-original',
          contactName: 'Original Contact',
          additionalSubmission: {}
        }
      });

      expect(result.successful).toBe(true);
      expect(mockConnector.createMessageLog).toHaveBeenCalledWith(expect.objectContaining({
        contactInfo: expect.objectContaining({
          id: 'contact-original',
          name: 'Original Contact'
        }),
        additionalSubmission: {},
        message: expect.objectContaining({
          id: 'msg-sync-plugin-updated'
        })
      }));

      const pluginRecord = await AccountDataModel.findOne({
        where: {
          rcAccountId: 'rc-account-123',
          platformName: 'syncSmsPlugin',
          dataKey: 'pluginData'
        }
      });
      expect(pluginRecord.data.jwtToken).toBe('refreshed-sync-plugin-jwt');
    });

    test('should update an existing shared SMS conversation log', async () => {
      await UserModel.create({
        id: 'test-user-id',
        platform: 'testCRM',
        accessToken: 'test-token',
        rcAccountId: 'rc-account-123',
        timezoneOffset: '+00:00',
        platformAdditionalInfo: {}
      });
      await MessageLogModel.create({
        id: 'shared-conversation-log',
        platform: 'testCRM',
        conversationId: 'shared-conversation',
        thirdPartyLogId: 'existing-crm-log',
        userId: 'test-user-id',
        conversationLogId: 'shared-conversation-log'
      });

      const mockConnector = {
        getAuthType: jest.fn().mockResolvedValue('apiKey'),
        getBasicAuth: jest.fn().mockReturnValue('base64-encoded'),
        getLogFormatType: jest.fn().mockReturnValue('text/plain'),
        createMessageLog: jest.fn(),
        updateMessageLog: jest.fn().mockResolvedValue({
          returnMessage: { message: 'Conversation updated', messageType: 'success', ttl: 2000 },
          extraDataTracking: { updated: true }
        })
      };
      connectorRegistry.getConnector.mockReturnValue(mockConnector);

      const result = await logHandler.createMessageLog({
        platform: 'testCRM',
        userId: 'test-user-id',
        incomingData: {
          logInfo: {
            messages: [{ id: 'shared-message-1', type: 'SMS', lastModifiedTime: '2026-06-12T10:05:00.000Z' }],
            entities: [
              {
                recordType: 'AliveMessage',
                direction: 'Inbound',
                from: { name: 'Agent One' },
                creationTime: '2026-06-12T10:00:00.000Z',
                lastModifiedTime: '2026-06-12T10:05:00.000Z',
                subject: 'Hello',
              }
            ],
            correspondents: [{ phoneNumber: '+15550000001' }],
            conversationId: 'shared-conversation',
            conversationLogId: 'shared-conversation-log',
            creationTime: '2026-06-12T10:00:00.000Z',
            owner: { name: 'Owner Agent' }
          },
          contactId: 'contact-shared',
          contactName: 'Shared Contact',
          additionalSubmission: {}
        }
      });

      expect(result.successful).toBe(true);
      expect(result.logIds).toEqual([]);
      expect(mockConnector.updateMessageLog).toHaveBeenCalledWith(expect.objectContaining({
        existingMessageLog: expect.objectContaining({
          thirdPartyLogId: 'existing-crm-log'
        }),
        sharedSMSLogContent: expect.objectContaining({
          subject: 'SMS conversation with Shared Contact',
          body: expect.stringContaining('Conversation summary')
        })
      }));
      expect(mockConnector.createMessageLog).not.toHaveBeenCalled();
    });

    test.each<[any]>(rcMessageMediaCases as [any][])(
      '$label',
      async ({ label, rawMessage, acMessage, logInfoOverrides, expectedDerivedMediaFields }) => {
        const suffix = label.replace(/\W+/g, '-').toLowerCase();
        const userId = `rc-media-user-${suffix}`;
        await UserModel.create({
          id: userId,
          platform: 'testCRM',
          accessToken: 'test-token',
          rcAccountId: 'rc-account-123',
          platformAdditionalInfo: {},
        });

        const mockConnector = {
          getAuthType: jest.fn().mockResolvedValue('apiKey'),
          getBasicAuth: jest.fn().mockReturnValue('base64-encoded'),
          createMessageLog: jest.fn().mockResolvedValue({
            logId: `provider-${suffix}`,
            returnMessage: { message: 'Message logged', messageType: 'success', ttl: 2000 },
            extraDataTracking: {},
          }),
          updateMessageLog: jest.fn(),
        };
        connectorRegistry.getConnector.mockReturnValue(mockConnector);

        const contactParty = acMessage.direction === 'Inbound' ? acMessage.from : acMessage.to[0];
        const result = await logHandler.createMessageLog({
          platform: 'testCRM',
          userId,
          incomingData: buildMessageIncomingData({
            contactId: `rc-media-contact-${suffix}`,
            contactName: contactParty.name || 'Media Contact',
            logInfo: {
              conversationId: acMessage.conversationId || `rc-media-conversation-${suffix}`,
              conversationLogId: `rc-media-conversation-log-${suffix}`,
              correspondents: [{
                phoneNumber: contactParty.phoneNumber,
                name: contactParty.name,
              }],
              messages: [acMessage],
              ...logInfoOverrides,
            },
          }),
        });

        expect(result.successful).toBe(true);
        expect(rawMessage.attachments.every((attachment) => attachment.link === undefined)).toBe(true);
        expect(mockConnector.createMessageLog).toHaveBeenCalledWith(expect.objectContaining({
          message: acMessage,
          ...expectedDerivedMediaFields,
        }));
      },
    );
  });

  describe('message logging data matrix', () => {
    function buildMessageConnector(overrides = {}) {
      return {
        getAuthType: jest.fn().mockResolvedValue('apiKey'),
        getBasicAuth: jest.fn().mockReturnValue('encoded-message-key'),
        getOauthInfo: jest.fn().mockResolvedValue({ tokenUrl: 'https://auth.example.test/token' }),
        getLogFormatType: jest.fn().mockReturnValue('text/plain'),
        createMessageLog: jest.fn().mockResolvedValue({
          logId: 'provider-message-log',
          returnMessage: { message: 'Message logged', messageType: 'success', ttl: 3000 },
          extraDataTracking: {},
        }),
        updateMessageLog: jest.fn().mockResolvedValue({
          returnMessage: { message: 'Message updated', messageType: 'success', ttl: 3000 },
          extraDataTracking: {},
        }),
        ...overrides,
      };
    }

    function buildRcMessageIncomingData(message, label) {
      const suffix = label.replace(/\W+/g, '-').toLowerCase();
      const contactId = `rc-message-contact-${suffix}`;
      const correspondentParties = message.direction === 'Inbound'
        ? [message.from]
        : message.to;
      const correspondents = correspondentParties.map((party) => ({
        phoneNumber: party.phoneNumber,
        name: party.name,
      }));

      return {
        contactId,
        isGroup: correspondents.length > 1,
        incomingData: buildMessageIncomingData({
          contactId,
          logInfo: {
            conversationId: message.conversationId || message.conversation?.id,
            conversationLogId: `rc-message-conversation-${suffix}`,
            correspondents,
            messages: [message],
            rcAccessToken: 'rc-message-access-token',
          },
        }),
      };
    }

    test.each<[any]>(rcMessageFormatCases as [any][])(
      'Create preserves the RingCentral Message Store payload for $label',
      async ({ label, message }) => {
        const suffix = label.replace(/\W+/g, '-').toLowerCase();
        const user = buildMessageLogUser({ id: `rc-message-user-${suffix}` });
        const rawMessage = cloneRingCentralMessageRecord(message);
        const { contactId, isGroup, incomingData } = buildRcMessageIncomingData(rawMessage, label);
        const expectedMessage = cloneRingCentralMessageRecord(rawMessage);
        if (isGroup) {
          expectedMessage.id = `${expectedMessage.id}-${contactId}`;
        }
        await UserModel.create(user);

        const connector = buildMessageConnector({
          createMessageLog: jest.fn().mockResolvedValue({
            logId: `provider-${suffix}`,
            returnMessage: { message: 'Message logged', messageType: 'success', ttl: 3000 },
            extraDataTracking: {},
          }),
        });
        connectorRegistry.getConnector.mockReturnValue(connector);

        const result = await logHandler.createMessageLog({
          platform: 'testCRM',
          userId: user.id,
          incomingData,
        });

        expect(result).toMatchObject({
          successful: true,
          logIds: [String(expectedMessage.id)],
        });
        const createParams = connector.createMessageLog.mock.calls[0][0];
        expect(createParams.message).toEqual(expectedMessage);
        expect(message).toEqual(rawMessage);

        const imageAttachment = rawMessage.attachments?.find(
          (attachment) => attachment.type === 'MmsAttachment'
            && attachment.contentType.startsWith('image/'),
        );
        const videoAttachment = rawMessage.attachments?.find(
          (attachment) => attachment.type === 'MmsAttachment'
            && attachment.contentType.startsWith('video/'),
        );
        if (imageAttachment) {
          expect(createParams).toMatchObject({
            imageLink: expect.stringContaining(encodeURIComponent(imageAttachment.uri)),
            imageDownloadLink: `${imageAttachment.uri}?access_token=rc-message-access-token`,
            imageContentType: imageAttachment.contentType,
          });
        }
        if (videoAttachment) {
          expect(createParams.videoLink).toEqual(
            expect.stringContaining(encodeURIComponent(videoAttachment.uri)),
          );
        }
      },
    );

    test.each<[any]>(rcMessageStatusCases as [any][])(
      'Create forwards RingCentral message status $label',
      async ({ label, message }) => {
        const suffix = label.replace(/\W+/g, '-').toLowerCase();
        const user = buildMessageLogUser({ id: `rc-status-user-${suffix}` });
        const { incomingData } = buildRcMessageIncomingData(message, `status-${label}`);
        await UserModel.create(user);

        const connector = buildMessageConnector({
          createMessageLog: jest.fn().mockResolvedValue({
            logId: `provider-status-${suffix}`,
            returnMessage: { message: 'Message logged', messageType: 'success', ttl: 3000 },
            extraDataTracking: {},
          }),
        });
        connectorRegistry.getConnector.mockReturnValue(connector);

        const result = await logHandler.createMessageLog({
          platform: 'testCRM',
          userId: user.id,
          incomingData,
        });

        expect(result.successful).toBe(true);
        expect(connector.createMessageLog).toHaveBeenCalledWith(expect.objectContaining({
          message: expect.objectContaining({
            direction: message.direction,
            messageStatus: message.messageStatus,
          }),
        }));
      },
    );

    test.each<[any]>(messageLogLifecycleCases as [any][])(
      '$label',
      async ({
        incomingOverrides,
        seedLogs,
        expectedOperation,
        expectedLogIds,
        expectedPersistedId,
        providerLogId,
        isShared,
      }) => {
        const user = buildMessageLogUser();
        await UserModel.create(user);
        if (seedLogs.length) {
          await MessageLogModel.bulkCreate(seedLogs);
        }

        const connector = buildMessageConnector({
          createMessageLog: jest.fn().mockResolvedValue({
            logId: providerLogId,
            returnMessage: { message: 'Message logged', messageType: 'success', ttl: 3000 },
            extraDataTracking: {},
          }),
        });
        connectorRegistry.getConnector.mockReturnValue(connector);

        const result = await logHandler.createMessageLog({
          platform: 'testCRM',
          userId: user.id,
          incomingData: buildMessageIncomingData(incomingOverrides),
        });

        expect(result).toMatchObject({
          successful: true,
          logIds: expectedLogIds,
        });
        if (expectedOperation === 'create') {
          expect(connector.createMessageLog).toHaveBeenCalledTimes(1);
          expect(connector.updateMessageLog).not.toHaveBeenCalled();
        } else if (expectedOperation === 'update') {
          expect(connector.createMessageLog).not.toHaveBeenCalled();
          expect(connector.updateMessageLog).toHaveBeenCalledTimes(1);
        } else {
          expect(connector.createMessageLog).not.toHaveBeenCalled();
          expect(connector.updateMessageLog).not.toHaveBeenCalled();
        }

        const persisted = await MessageLogModel.findByPk(expectedPersistedId);
        expect(persisted).not.toBeNull();
        expect(persisted.thirdPartyLogId).toBe(providerLogId);
        if (isShared) {
          expect(connector.createMessageLog).toHaveBeenCalledWith(expect.objectContaining({
            sharedSMSLogContent: expect.objectContaining({
              subject: 'SMS conversation with Message Contact',
            }),
          }));
        }
      },
    );

    test.each<[any]>(messageLogAuthCases as [any][])(
      '$label',
      async ({ proxyId, refreshedAccessToken, incomingOverrides }) => {
        const user = buildMessageLogUser({
          platformAdditionalInfo: {
            proxyId,
            tokenUrl: 'https://auth.example.test/token',
          },
        });
        await UserModel.create(user);

        const proxyConfig = { id: proxyId, name: 'Message proxy config' };
        Connector.getProxyConfig.mockResolvedValue(proxyConfig);
        const connector = buildMessageConnector({
          getAuthType: jest.fn().mockResolvedValue('oauth'),
        });
        connectorRegistry.getConnector.mockReturnValue(connector);
        oauth.getOAuthApp.mockReturnValue({ id: 'message-oauth-app' });
        oauth.checkAndRefreshAccessToken.mockResolvedValue({
          ...user,
          accessToken: refreshedAccessToken,
        });

        const result = await logHandler.createMessageLog({
          platform: 'testCRM',
          userId: user.id,
          incomingData: buildMessageIncomingData(incomingOverrides),
        });

        expect(result.successful).toBe(true);
        expect(Connector.getProxyConfig).toHaveBeenCalledWith(proxyId);
        expect(connector.getAuthType).toHaveBeenCalledWith({ proxyId, proxyConfig });
        expect(connector.getOauthInfo).toHaveBeenCalledWith(expect.objectContaining({
          proxyId,
          proxyConfig,
          tokenUrl: 'https://auth.example.test/token',
        }));
        expect(connector.createMessageLog).toHaveBeenCalledWith(expect.objectContaining({
          authHeader: `Bearer ${refreshedAccessToken}`,
          proxyConfig,
        }));
      },
    );

    test.each<[any]>(messageLogDatabaseFailureCases as [any][])(
      '$label returns a stable failure result',
      async ({ target }) => {
        const user = buildMessageLogUser({ id: `database-message-user-${target}` });
        if (target !== 'userLookup') {
          await UserModel.create(user);
        }

        const connector = buildMessageConnector();
        connectorRegistry.getConnector.mockReturnValue(connector);
        if (target === 'userLookup') {
          jest.spyOn(UserModel, 'findByPk').mockRejectedValueOnce(new Error('User lookup failed'));
        } else if (target === 'messageLookup') {
          jest.spyOn(MessageLogModel, 'findAll').mockRejectedValueOnce(new Error('Message lookup failed'));
        } else if (target === 'conversationLookup') {
          jest.spyOn(MessageLogModel, 'findOne').mockRejectedValueOnce(new Error('Conversation lookup failed'));
        } else {
          jest.spyOn(MessageLogModel, 'create').mockRejectedValueOnce(new Error('Message persistence failed'));
        }

        const result = await logHandler.createMessageLog({
          platform: 'testCRM',
          userId: user.id,
          incomingData: buildMessageIncomingData({
            logInfo: {
              conversationId: `database-conversation-${target}`,
              conversationLogId: `database-conversation-log-${target}`,
              messages: [{ id: `database-message-${target}` }],
            },
          }),
        });

        expect(result.successful).toBe(false);
        expect(result.returnMessage).toEqual(expect.objectContaining({
          messageType: 'warning',
        }));
      },
    );

    test.each<[any]>(messageLogResultCases as [any][])(
      'Create handles $label',
      async ({ connectorResult, expectedSuccessful, expectedLogIds }) => {
        const user = buildMessageLogUser({ id: 'message-result-user' });
        await UserModel.create(user);
        const connector = buildMessageConnector({
          createMessageLog: jest.fn().mockResolvedValue(connectorResult),
        });
        connectorRegistry.getConnector.mockReturnValue(connector);

        const result = await logHandler.createMessageLog({
          platform: 'testCRM',
          userId: user.id,
          incomingData: buildMessageIncomingData({
            logInfo: {
              conversationId: 'message-result-conversation',
              conversationLogId: 'message-result-conversation-log',
              messages: [{ id: 'message-result-message' }],
            },
          }),
        });

        expect(result.successful).toBe(expectedSuccessful);
        expect(result.logIds).toEqual(expectedLogIds);
        await expect(MessageLogModel.findByPk('message-result-message')).resolves.toBeNull();
      },
    );

    test(oldestFirstMessageCase.label, async () => {
      const user = buildMessageLogUser({ id: 'ordered-message-user' });
      await UserModel.create(user);
      const connector = buildMessageConnector({
        createMessageLog: jest.fn().mockResolvedValue({
          logId: 'provider-ordered-message-log',
          returnMessage: { message: 'Message logged', messageType: 'success', ttl: 3000 },
          extraDataTracking: {},
        }),
      });
      connectorRegistry.getConnector.mockReturnValue(connector);

      const result = await logHandler.createMessageLog({
        platform: 'testCRM',
        userId: user.id,
        incomingData: buildMessageIncomingData(oldestFirstMessageCase.incomingOverrides),
      });

      expect(result.logIds).toEqual(oldestFirstMessageCase.expectedProviderOrder);
      expect(connector.createMessageLog).toHaveBeenCalledWith(expect.objectContaining({
        message: expect.objectContaining({ id: oldestFirstMessageCase.expectedProviderOrder[0] }),
      }));
      expect(connector.updateMessageLog.mock.calls.map(([params]) => params.message.id)).toEqual(
        oldestFirstMessageCase.expectedProviderOrder.slice(1),
      );
    });
  });

  describe('saveNoteCache', () => {
    test('should successfully save note cache', async () => {
      // Arrange
      NoteCache.create.mockResolvedValue({ sessionId: 'session-123', note: 'Test note' });

      // Act
      const result = await logHandler.saveNoteCache({
        sessionId: 'session-123',
        note: 'Test note'
      });

      // Assert
      expect(result.successful).toBe(true);
      expect(result.returnMessage).toBe('Note cache saved');
      expect(NoteCache.create).toHaveBeenCalled();
    });

    test('should handle errors when saving note cache', async () => {
      // Arrange
      NoteCache.create.mockRejectedValue(new Error('DynamoDB error'));

      // Act
      const result = await logHandler.saveNoteCache({
        sessionId: 'session-123',
        note: 'Test note'
      });

      // Assert
      expect(result.successful).toBe(false);
      expect(result.returnMessage.message).toBe('Error performing saveNoteCache');
      expect(result.returnMessage.messageType).toBe('warning');
    });
  });

  describe('handleAsyncPluginCallback', () => {
    test('should return not found when callback task cache is missing', async () => {
      const result = await logHandler.handleAsyncPluginCallback({
        taskId: 'missing-task',
        body: {
          successful: true,
          note: 'Callback note'
        }
      });

      expect(result).toEqual({
        statusCode: 404,
        body: { successful: false, message: 'Async task not found' }
      });
    });

    test('should append callback note to call log and remove task cache on success', async () => {
      await UserModel.create({
        id: 'test-user-id',
        platform: 'testCRM',
        accessToken: 'test-token',
        platformAdditionalInfo: {}
      });
      await CallLogModel.create({
        id: 'call-1',
        sessionId: 'session-1',
        extensionNumber: '',
        platform: 'testCRM',
        thirdPartyLogId: 'log-1',
        userId: 'test-user-id',
        contactId: 'contact-1'
      });
      await CacheModel.create({
        id: 'task-1',
        status: 'pending',
        userId: 'test-user-id',
        cacheKey: 'asyncPluginTask-testPlugin',
        expiry: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        data: {
          pluginId: 'testPlugin',
          platform: 'testCRM',
          userId: 'test-user-id',
          sessionId: 'session-1',
          extensionNumber: '',
          incomingData: {
            logInfo: {
              sessionId: 'session-1',
              startTime: '2026-06-12T10:00:00.000Z',
              duration: 120,
              result: 'Completed',
              direction: 'Outbound',
              from: { phoneNumber: '+1234567890' },
              to: { phoneNumber: '+1987654321' }
            },
            note: 'Original note'
          },
          hashedAccountId: 'hashed-123',
          isFromSSCL: false
        }
      });

      const mockConnector = {
        getAuthType: jest.fn().mockResolvedValue('apiKey'),
        getBasicAuth: jest.fn().mockReturnValue('base64-encoded'),
        getLogFormatType: jest.fn().mockReturnValue('text/plain'),
        getCallLog: jest.fn().mockResolvedValue({
          callLogInfo: {
            fullBody: '- Note: Existing note\n- Summary: Existing summary',
            note: 'Existing note',
            fullLogResponse: { id: 'log-1' }
          }
        }),
        updateCallLog: jest.fn().mockResolvedValue({
          updatedNote: 'Existing note\n\nCallback note'
        })
      };
      connectorRegistry.getConnector.mockReturnValue(mockConnector);
      composeCallLog.mockReturnValue('Updated composed log');

      const result = await logHandler.handleAsyncPluginCallback({
        taskId: 'task-1',
        body: {
          successful: true,
          message: 'Done',
          note: 'Callback note'
        }
      });

      expect(result).toEqual({
        statusCode: 200,
        body: { successful: true }
      });
      expect(composeCallLog).toHaveBeenCalledWith(expect.objectContaining({
        existingBody: '- Note: Existing note\n- Summary: Existing summary',
        note: 'Existing note\n\nCallback note'
      }));
      expect(mockConnector.updateCallLog).toHaveBeenCalledWith(expect.objectContaining({
        note: 'Existing note\n\nCallback note',
        composedLogDetails: 'Updated composed log',
        existingCallLogDetails: { id: 'log-1' }
      }));
      expect(await CacheModel.findByPk('task-1')).toBeNull();
    });

    test('should mark task cache failed when callback reports failure', async () => {
      await CacheModel.create({
        id: 'task-failed',
        status: 'pending',
        userId: 'test-user-id',
        cacheKey: 'asyncPluginTask-testPlugin',
        expiry: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        data: {
          pluginId: 'testPlugin',
          platform: 'testCRM',
          userId: 'test-user-id',
          sessionId: 'session-1'
        }
      });

      const result = await logHandler.handleAsyncPluginCallback({
        taskId: 'task-failed',
        body: {
          successful: false,
          message: 'Plugin failed',
          note: 'Ignored note'
        }
      });

      expect(result).toEqual({
        statusCode: 200,
        body: { successful: true }
      });
      const cache = await CacheModel.findByPk('task-failed');
      expect(cache.status).toBe('failed');
      expect(cache.data.message).toBe('Plugin failed');
    });

    test('should destroy expired task cache and return not found', async () => {
      await CacheModel.create({
        id: 'task-expired',
        status: 'pending',
        userId: 'test-user-id',
        cacheKey: 'asyncPluginTask-testPlugin',
        expiry: new Date(Date.now() - 1000),
        data: {
          pluginId: 'testPlugin',
          platform: 'testCRM',
          userId: 'test-user-id',
          sessionId: 'session-1'
        }
      });

      const result = await logHandler.handleAsyncPluginCallback({
        taskId: 'task-expired',
        body: {
          successful: true,
          note: 'Late callback note'
        }
      });

      expect(result).toEqual({
        statusCode: 404,
        body: { successful: false, message: 'Async task not found' }
      });
      expect(await CacheModel.findByPk('task-expired')).toBeNull();
      expect(connectorRegistry.getConnector).not.toHaveBeenCalled();
    });

    test('should mark task failed when callback cannot find the original call log', async () => {
      await CacheModel.create({
        id: 'task-missing-log',
        status: 'pending',
        userId: 'test-user-id',
        cacheKey: 'asyncPluginTask-testPlugin',
        expiry: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        data: {
          pluginId: 'testPlugin',
          platform: 'testCRM',
          userId: 'test-user-id',
          sessionId: 'missing-session',
          extensionNumber: '',
          incomingData: {
            logInfo: {
              sessionId: 'missing-session'
            }
          }
        }
      });

      const result = await logHandler.handleAsyncPluginCallback({
        taskId: 'task-missing-log',
        body: {
          successful: true,
          note: 'Callback note'
        }
      });

      expect(result).toEqual({
        statusCode: 500,
        body: { successful: false, message: 'Call log not found for async plugin task' }
      });
      const cache = await CacheModel.findByPk('task-missing-log');
      expect(cache.status).toBe('failed');
      expect(cache.data.message).toBe('Call log not found for async plugin task');
      expect(connectorRegistry.getConnector).not.toHaveBeenCalled();
    });

    test('should mark task failed when callback note cannot be written to CRM', async () => {
      await UserModel.create({
        id: 'test-user-id',
        platform: 'testCRM',
        accessToken: 'test-token',
        platformAdditionalInfo: {}
      });
      await CallLogModel.create({
        id: 'call-1',
        sessionId: 'session-1',
        extensionNumber: '',
        platform: 'testCRM',
        thirdPartyLogId: 'log-1',
        userId: 'test-user-id',
        contactId: 'contact-1'
      });
      await CacheModel.create({
        id: 'task-update-failed',
        status: 'pending',
        userId: 'test-user-id',
        cacheKey: 'asyncPluginTask-testPlugin',
        expiry: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        data: {
          pluginId: 'testPlugin',
          platform: 'testCRM',
          userId: 'test-user-id',
          sessionId: 'session-1',
          extensionNumber: '',
          incomingData: {
            logInfo: {
              sessionId: 'session-1',
              startTime: '2026-06-12T10:00:00.000Z',
              duration: 120,
              result: 'Completed',
              direction: 'Outbound',
              from: { phoneNumber: '+1234567890' },
              to: { phoneNumber: '+1987654321' }
            },
            note: 'Original note'
          },
          hashedAccountId: 'hashed-123',
          isFromSSCL: false
        }
      });
      const mockConnector = {
        getAuthType: jest.fn().mockResolvedValue('apiKey'),
        getBasicAuth: jest.fn().mockReturnValue('base64-encoded'),
        getLogFormatType: jest.fn().mockReturnValue('text/plain'),
        getCallLog: jest.fn().mockResolvedValue({
          callLogInfo: {
            fullBody: 'Existing body',
            note: 'Existing note',
            fullLogResponse: { id: 'log-1' }
          }
        }),
        updateCallLog: jest.fn().mockRejectedValue(new Error('CRM update failed'))
      };
      connectorRegistry.getConnector.mockReturnValue(mockConnector);
      composeCallLog.mockReturnValue('Updated composed log');

      const result = await logHandler.handleAsyncPluginCallback({
        taskId: 'task-update-failed',
        body: {
          successful: true,
          note: 'Callback note'
        }
      });

      expect(result).toEqual({
        statusCode: 500,
        body: { successful: false, message: 'CRM update failed' }
      });
      const cache = await CacheModel.findByPk('task-update-failed');
      expect(cache).not.toBeNull();
      expect(cache.status).toBe('failed');
      expect(cache.data.message).toBe('CRM update failed');
      expect(mockConnector.updateCallLog).toHaveBeenCalled();
    });
    test('should reject callback without successful boolean', async () => {
      const result = await logHandler.handleAsyncPluginCallback({
        taskId: 'task-1',
        body: {
          message: 'Missing status'
        }
      });

      expect(result).toEqual({
        statusCode: 400,
        body: { successful: false, message: 'successful is required' }
      });
    });
  });

  describe('Error Handling', () => {
    test('should handle 429 rate limit error in createCallLog', async () => {
      // Arrange
      await UserModel.create({
        id: 'test-user-id',
        platform: 'testCRM',
        accessToken: 'test-token',
        platformAdditionalInfo: {}
      });

      const mockConnector = {
        getAuthType: jest.fn().mockResolvedValue('apiKey'),
        getBasicAuth: jest.fn().mockReturnValue('base64-encoded'),
        getLogFormatType: jest.fn().mockReturnValue('text/plain'),
        createCallLog: jest.fn().mockRejectedValue({
          response: { status: 429 }
        })
      };
      connectorRegistry.getConnector.mockReturnValue(mockConnector);
      composeCallLog.mockReturnValue('Composed log');

      const incomingData = {
        logInfo: {
          sessionId: 'session-rate-limit',
          telephonySessionId: 'tel-session',
          direction: 'Outbound',
          from: { phoneNumber: '+1234567890' },
          to: { phoneNumber: '+0987654321' }
        },
        contactId: 'contact-123',
        note: 'Test'
      };

      // Act
      const result = await logHandler.createCallLog({
        platform: 'testCRM',
        userId: 'test-user-id',
        incomingData,
        hashedAccountId: 'hashed-123',
        isFromSSCL: false
      });

      // Assert
      expect(result.successful).toBe(false);
      expect(result.returnMessage.messageType).toBe('warning');
    });

    test('should handle 401 authorization error in createCallLog', async () => {
      // Arrange
      await UserModel.create({
        id: 'test-user-id',
        platform: 'testCRM',
        accessToken: 'test-token',
        platformAdditionalInfo: {}
      });

      const mockConnector = {
        getAuthType: jest.fn().mockResolvedValue('apiKey'),
        getBasicAuth: jest.fn().mockReturnValue('base64-encoded'),
        getLogFormatType: jest.fn().mockReturnValue('text/plain'),
        createCallLog: jest.fn().mockRejectedValue({
          response: { status: 401 }
        })
      };
      connectorRegistry.getConnector.mockReturnValue(mockConnector);
      composeCallLog.mockReturnValue('Composed log');

      const incomingData = {
        logInfo: {
          sessionId: 'session-auth-error',
          telephonySessionId: 'tel-session',
          direction: 'Outbound',
          from: { phoneNumber: '+1234567890' },
          to: { phoneNumber: '+0987654321' }
        },
        contactId: 'contact-123',
        note: 'Test'
      };

      // Act
      const result = await logHandler.createCallLog({
        platform: 'testCRM',
        userId: 'test-user-id',
        incomingData,
        hashedAccountId: 'hashed-123',
        isFromSSCL: false
      });

      // Assert
      expect(result.successful).toBe(false);
      expect(result.extraDataTracking.statusCode).toBe(401);
    });
  });
});

export {};
