const createCallLog = require('../../../mcp/tools/createCallLog');
const jwt = require('../../../lib/jwt');
const connectorRegistry = require('../../../connector/registry');
const logCore = require('../../../handlers/log');
const util = require('../../../lib/util');
const { CallLogModel } = require('../../../models/callLogModel');

// Mock dependencies
jest.mock('../../../lib/jwt');
jest.mock('../../../connector/registry');
jest.mock('../../../handlers/log');
jest.mock('../../../lib/util');
jest.mock('../../../models/callLogModel');

describe('MCP Tool: createCallLog', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.HASH_KEY = 'test-hash-key';
  });

  describe('tool definition', () => {
    test('should have correct tool definition', () => {
      expect(createCallLog.definition).toBeDefined();
      expect(createCallLog.definition.name).toBe('createCallLog');
      expect(createCallLog.definition.description).toContain('REQUIRES AUTHENTICATION');
      expect(createCallLog.definition.inputSchema).toBeDefined();
    });

    test('should require jwtToken and incomingData parameters', () => {
      expect(createCallLog.definition.inputSchema.required).toContain('jwtToken');
      expect(createCallLog.definition.inputSchema.required).toContain('incomingData');
    });

    test('should have detailed inputSchema for incomingData', () => {
      const incomingDataSchema = createCallLog.definition.inputSchema.properties.incomingData;
      expect(incomingDataSchema.properties).toHaveProperty('logInfo');
      expect(incomingDataSchema.properties).toHaveProperty('contactId');
      expect(incomingDataSchema.properties).toHaveProperty('note');
      expect(incomingDataSchema.required).toContain('logInfo');
      expect(incomingDataSchema.required).toContain('contactId');
    });
  });

  describe('execute', () => {
    test('should create call log successfully', async () => {
      // Arrange
      const mockIncomingData = {
        logInfo: {
          id: 'rc-call-123',
          sessionId: 'session-123',
          direction: 'Inbound',
          startTime: '2024-01-01T10:00:00Z',
          duration: 120,
          from: { phoneNumber: '+1234567890', name: 'John Doe' },
          to: { phoneNumber: '+0987654321', name: 'Company' },
          accountId: 'rc-account-123'
        },
        contactId: 'contact-123',
        contactName: 'John Doe',
        contactType: 'Contact',
        note: 'Test call note'
      };

      jwt.decodeJwt.mockReturnValue({
        id: 'user-123',
        platform: 'testCRM'
      });

      const mockConnector = {
        createCallLog: jest.fn()
      };
      connectorRegistry.getConnector.mockReturnValue(mockConnector);

      CallLogModel.findOne.mockResolvedValue(null); // No existing log

      util.getHashValue.mockReturnValue('hashed-account-id');

      logCore.createCallLog.mockResolvedValue({
        successful: true,
        logId: 'crm-log-123',
        returnMessage: { message: 'Call logged successfully' }
      });

      // Act
      const result = await createCallLog.execute({
        jwtToken: 'mock-jwt-token',
        incomingData: mockIncomingData
      });

      // Assert
      expect(result).toEqual({
        success: true,
        data: {
          logId: 'crm-log-123',
          message: 'Call logged successfully'
        }
      });
      expect(jwt.decodeJwt).toHaveBeenCalledWith('mock-jwt-token');
      expect(CallLogModel.findOne).toHaveBeenCalledWith({
        where: { sessionId: 'session-123' }
      });
      expect(logCore.createCallLog).toHaveBeenCalledWith({
        platform: 'testCRM',
        userId: 'user-123',
        incomingData: mockIncomingData,
        hashedAccountId: 'hashed-account-id',
        isFromSSCL: false
      });
    });

    test('should create call log with AI note and transcript', async () => {
      // Arrange
      const mockIncomingData = {
        logInfo: {
          id: 'rc-call-456',
          sessionId: 'session-456',
          direction: 'Outbound',
          startTime: '2024-01-01T11:00:00Z',
          duration: 300,
          from: { phoneNumber: '+0987654321' },
          to: { phoneNumber: '+1234567890' }
        },
        contactId: 'contact-456',
        aiNote: 'AI generated summary of the call',
        transcript: 'Full call transcript text'
      };

      jwt.decodeJwt.mockReturnValue({
        id: 'user-123',
        platform: 'testCRM'
      });

      const mockConnector = {
        createCallLog: jest.fn()
      };
      connectorRegistry.getConnector.mockReturnValue(mockConnector);

      CallLogModel.findOne.mockResolvedValue(null);

      logCore.createCallLog.mockResolvedValue({
        successful: true,
        logId: 'crm-log-456'
      });

      // Act
      const result = await createCallLog.execute({
        jwtToken: 'mock-jwt-token',
        incomingData: mockIncomingData
      });

      // Assert
      expect(result.success).toBe(true);
      expect(result.data.logId).toBe('crm-log-456');
    });

    test('should create call log with additional submission', async () => {
      // Arrange
      const mockIncomingData = {
        logInfo: {
          id: 'rc-call-789',
          sessionId: 'session-789',
          direction: 'Inbound',
          startTime: '2024-01-01T12:00:00Z',
          duration: 60,
          from: { phoneNumber: '+1234567890' },
          to: { phoneNumber: '+0987654321' }
        },
        contactId: 'contact-789',
        additionalSubmission: {
          isAssignedToUser: true,
          adminAssignedUserToken: 'admin-jwt-token',
          adminAssignedUserRcId: 'rc-ext-101'
        }
      };

      jwt.decodeJwt.mockReturnValue({
        id: 'user-123',
        platform: 'testCRM'
      });

      const mockConnector = {
        createCallLog: jest.fn()
      };
      connectorRegistry.getConnector.mockReturnValue(mockConnector);

      CallLogModel.findOne.mockResolvedValue(null);

      logCore.createCallLog.mockResolvedValue({
        successful: true,
        logId: 'crm-log-789'
      });

      // Act
      const result = await createCallLog.execute({
        jwtToken: 'mock-jwt-token',
        incomingData: mockIncomingData
      });

      // Assert
      expect(result.success).toBe(true);
    });

    test('should return error when call log already exists', async () => {
      // Arrange
      const mockIncomingData = {
        logInfo: {
          sessionId: 'existing-session'
        }
      };

      CallLogModel.findOne.mockResolvedValue({
        id: 'existing-log',
        sessionId: 'existing-session'
      });

      // Act
      const result = await createCallLog.execute({
        jwtToken: 'mock-jwt-token',
        incomingData: mockIncomingData
      });

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toContain('already exists');
    });

    test('should return error when jwtToken is missing', async () => {
      // Act
      const result = await createCallLog.execute({
        incomingData: { logInfo: {} }
      });

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toContain('authorize CRM platform');
    });

    test('should return error when incomingData is missing', async () => {
      // Act
      const result = await createCallLog.execute({
        jwtToken: 'mock-jwt-token'
      });

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toContain('Incoming data must be provided');
    });

    test('should return error when logInfo is missing', async () => {
      // Act
      const result = await createCallLog.execute({
        jwtToken: 'mock-jwt-token',
        incomingData: { contactId: 'contact-123' }
      });

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toContain('logInfo is required');
    });

    test('should return error when JWT is invalid', async () => {
      // Arrange
      const mockIncomingData = {
        logInfo: {
          sessionId: 'session-123'
        }
      };

      CallLogModel.findOne.mockResolvedValue(null);

      jwt.decodeJwt.mockReturnValue({
        platform: 'testCRM'
        // id is missing
      });

      // Act
      const result = await createCallLog.execute({
        jwtToken: 'invalid-token',
        incomingData: mockIncomingData
      });

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid JWT token');
    });

    test('should return error when platform connector not found', async () => {
      // Arrange
      const mockIncomingData = {
        logInfo: {
          sessionId: 'session-123'
        }
      };

      CallLogModel.findOne.mockResolvedValue(null);

      jwt.decodeJwt.mockReturnValue({
        id: 'user-123',
        platform: 'unknownCRM'
      });

      connectorRegistry.getConnector.mockReturnValue(null);

      // Act
      const result = await createCallLog.execute({
        jwtToken: 'mock-jwt-token',
        incomingData: mockIncomingData
      });

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toContain('Platform connector not found');
    });

    test('should return error when createCallLog is not implemented', async () => {
      // Arrange
      const mockIncomingData = {
        logInfo: {
          sessionId: 'session-123'
        }
      };

      CallLogModel.findOne.mockResolvedValue(null);

      jwt.decodeJwt.mockReturnValue({
        id: 'user-123',
        platform: 'testCRM'
      });

      const mockConnector = {}; // No createCallLog method
      connectorRegistry.getConnector.mockReturnValue(mockConnector);

      // Act
      const result = await createCallLog.execute({
        jwtToken: 'mock-jwt-token',
        incomingData: mockIncomingData
      });

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toContain('not implemented');
    });

    test('should return error when creation fails', async () => {
      // Arrange
      const mockIncomingData = {
        logInfo: {
          id: 'rc-call-999',
          sessionId: 'session-999',
          direction: 'Inbound',
          startTime: '2024-01-01T13:00:00Z',
          duration: 45,
          from: { phoneNumber: '+1234567890' },
          to: { phoneNumber: '+0987654321' }
        },
        contactId: 'contact-999'
      };

      jwt.decodeJwt.mockReturnValue({
        id: 'user-123',
        platform: 'testCRM'
      });

      const mockConnector = {
        createCallLog: jest.fn()
      };
      connectorRegistry.getConnector.mockReturnValue(mockConnector);

      CallLogModel.findOne.mockResolvedValue(null);

      logCore.createCallLog.mockResolvedValue({
        successful: false,
        returnMessage: { message: 'Failed to create log in CRM' }
      });

      // Act
      const result = await createCallLog.execute({
        jwtToken: 'mock-jwt-token',
        incomingData: mockIncomingData
      });

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to create log in CRM');
    });

    test('should handle unexpected errors gracefully', async () => {
      // Arrange
      const mockIncomingData = {
        logInfo: {
          sessionId: 'session-error'
        }
      };

      CallLogModel.findOne.mockRejectedValue(
        new Error('Database connection failed')
      );

      // Act
      const result = await createCallLog.execute({
        jwtToken: 'mock-jwt-token',
        incomingData: mockIncomingData
      });

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBe('Database connection failed');
      expect(result.errorDetails).toBeDefined();
    });
  });
});

