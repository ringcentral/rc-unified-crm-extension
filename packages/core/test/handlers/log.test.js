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

const logHandler = require('../../handlers/log');
const { CallLogModel } = require('../../models/callLogModel');
const { MessageLogModel } = require('../../models/messageLogModel');
const { UserModel } = require('../../models/userModel');
const connectorRegistry = require('../../connector/registry');
const oauth = require('../../lib/oauth');
const { composeCallLog } = require('../../lib/callLogComposer');
const { NoteCache } = require('../../models/dynamo/noteCacheSchema');
const { sequelize } = require('../../models/sequelize');

describe('Log Handler', () => {
  beforeAll(async () => {
    await CallLogModel.sync({ force: true });
    await MessageLogModel.sync({ force: true });
    await UserModel.sync({ force: true });
  });

  afterEach(async () => {
    await CallLogModel.destroy({ where: {} });
    await MessageLogModel.destroy({ where: {} });
    await UserModel.destroy({ where: {} });
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

      await MessageLogModel.create({
        id: 'msg-1',
        platform: 'testCRM',
        conversationId: 'conv-123',
        thirdPartyLogId: 'existing-log',
        userId: 'test-user-id'
      });

      const mockConnector = {
        getAuthType: jest.fn().mockResolvedValue('apiKey'),
        getBasicAuth: jest.fn().mockReturnValue('base64-encoded'),
        createMessageLog: jest.fn().mockResolvedValue({
          logId: 'msg-log-new',
          returnMessage: { message: 'Message logged', messageType: 'success', ttl: 2000 }
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
          conversationLogId: 'new-conv-log-123'
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
      // Only the new message should be logged
      expect(mockConnector.createMessageLog).toHaveBeenCalledTimes(1);
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
      expect(result.returnMessage).toBe('Error saving note cache');
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

