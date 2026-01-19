const updateCallLog = require('../../../mcp/tools/updateCallLog');
const jwt = require('../../../lib/jwt');
const connectorRegistry = require('../../../connector/registry');
const logCore = require('../../../handlers/log');
const util = require('../../../lib/util');

// Mock dependencies
jest.mock('../../../lib/jwt');
jest.mock('../../../connector/registry');
jest.mock('../../../handlers/log');
jest.mock('../../../lib/util');

describe('MCP Tool: updateCallLog', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.HASH_KEY = 'test-hash-key';
  });

  describe('tool definition', () => {
    test('should have correct tool definition', () => {
      expect(updateCallLog.definition).toBeDefined();
      expect(updateCallLog.definition.name).toBe('updateCallLog');
      expect(updateCallLog.definition.description).toContain('REQUIRES AUTHENTICATION');
      expect(updateCallLog.definition.inputSchema).toBeDefined();
    });

    test('should require jwtToken and incomingData parameters', () => {
      expect(updateCallLog.definition.inputSchema.required).toContain('jwtToken');
      expect(updateCallLog.definition.inputSchema.required).toContain('incomingData');
    });

    test('should require sessionId in incomingData', () => {
      const incomingDataSchema = updateCallLog.definition.inputSchema.properties.incomingData;
      expect(incomingDataSchema.required).toContain('sessionId');
    });
  });

  describe('execute', () => {
    test('should update call log successfully', async () => {
      // Arrange
      const mockIncomingData = {
        sessionId: 'session-123',
        note: 'Updated call note',
        accountId: 'rc-account-123'
      };

      jwt.decodeJwt.mockReturnValue({
        id: 'user-123',
        platform: 'testCRM'
      });

      const mockConnector = {
        updateCallLog: jest.fn()
      };
      connectorRegistry.getConnector.mockReturnValue(mockConnector);

      util.getHashValue.mockReturnValue('hashed-account-id');

      logCore.updateCallLog.mockResolvedValue({
        successful: true,
        logId: 'crm-log-123',
        updatedNote: 'Updated call note',
        returnMessage: { message: 'Call log updated successfully' }
      });

      // Act
      const result = await updateCallLog.execute({
        jwtToken: 'mock-jwt-token',
        incomingData: mockIncomingData
      });

      // Assert
      expect(result).toEqual({
        success: true,
        data: {
          logId: 'crm-log-123',
          updatedNote: 'Updated call note',
          message: 'Call log updated successfully'
        }
      });
      expect(jwt.decodeJwt).toHaveBeenCalledWith('mock-jwt-token');
      expect(util.getHashValue).toHaveBeenCalledWith('rc-account-123', 'test-hash-key');
      expect(logCore.updateCallLog).toHaveBeenCalledWith({
        platform: 'testCRM',
        userId: 'user-123',
        incomingData: mockIncomingData,
        hashedAccountId: 'hashed-account-id',
        isFromSSCL: false
      });
    });

    test('should update call log with additional submission', async () => {
      // Arrange
      const mockIncomingData = {
        sessionId: 'session-456',
        note: 'Updated note with additional data',
        additionalSubmission: {
          dealId: 'deal-123',
          customField: 'custom-value'
        }
      };

      jwt.decodeJwt.mockReturnValue({
        id: 'user-123',
        platform: 'testCRM'
      });

      const mockConnector = {
        updateCallLog: jest.fn()
      };
      connectorRegistry.getConnector.mockReturnValue(mockConnector);

      logCore.updateCallLog.mockResolvedValue({
        successful: true,
        logId: 'crm-log-456',
        updatedNote: 'Updated note with additional data'
      });

      // Act
      const result = await updateCallLog.execute({
        jwtToken: 'mock-jwt-token',
        incomingData: mockIncomingData
      });

      // Assert
      expect(result.success).toBe(true);
      expect(result.data.logId).toBe('crm-log-456');
    });

    test('should update call log without accountId', async () => {
      // Arrange
      const mockIncomingData = {
        sessionId: 'session-789',
        note: 'Simple update'
      };

      jwt.decodeJwt.mockReturnValue({
        id: 'user-123',
        platform: 'testCRM'
      });

      const mockConnector = {
        updateCallLog: jest.fn()
      };
      connectorRegistry.getConnector.mockReturnValue(mockConnector);

      logCore.updateCallLog.mockResolvedValue({
        successful: true,
        logId: 'crm-log-789',
        updatedNote: 'Simple update'
      });

      // Act
      const result = await updateCallLog.execute({
        jwtToken: 'mock-jwt-token',
        incomingData: mockIncomingData
      });

      // Assert
      expect(result.success).toBe(true);
      expect(util.getHashValue).not.toHaveBeenCalled();
      expect(logCore.updateCallLog).toHaveBeenCalledWith({
        platform: 'testCRM',
        userId: 'user-123',
        incomingData: mockIncomingData,
        hashedAccountId: undefined,
        isFromSSCL: false
      });
    });

    test('should return error when JWT is invalid', async () => {
      // Arrange
      const mockIncomingData = {
        sessionId: 'session-123',
        note: 'Test note'
      };

      jwt.decodeJwt.mockReturnValue({
        platform: 'testCRM'
        // id is missing
      });

      // Act
      const result = await updateCallLog.execute({
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
        sessionId: 'session-123',
        note: 'Test note'
      };

      jwt.decodeJwt.mockReturnValue({
        id: 'user-123',
        platform: 'unknownCRM'
      });

      connectorRegistry.getConnector.mockReturnValue(null);

      // Act
      const result = await updateCallLog.execute({
        jwtToken: 'mock-jwt-token',
        incomingData: mockIncomingData
      });

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toContain('Platform connector not found');
    });

    test('should return error when updateCallLog is not implemented', async () => {
      // Arrange
      const mockIncomingData = {
        sessionId: 'session-123',
        note: 'Test note'
      };

      jwt.decodeJwt.mockReturnValue({
        id: 'user-123',
        platform: 'testCRM'
      });

      const mockConnector = {}; // No updateCallLog method
      connectorRegistry.getConnector.mockReturnValue(mockConnector);

      // Act
      const result = await updateCallLog.execute({
        jwtToken: 'mock-jwt-token',
        incomingData: mockIncomingData
      });

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toContain('not implemented');
    });

    test('should return error when update fails', async () => {
      // Arrange
      const mockIncomingData = {
        sessionId: 'session-999',
        note: 'Test note'
      };

      jwt.decodeJwt.mockReturnValue({
        id: 'user-123',
        platform: 'testCRM'
      });

      const mockConnector = {
        updateCallLog: jest.fn()
      };
      connectorRegistry.getConnector.mockReturnValue(mockConnector);

      logCore.updateCallLog.mockResolvedValue({
        successful: false,
        returnMessage: { message: 'Log not found in CRM' }
      });

      // Act
      const result = await updateCallLog.execute({
        jwtToken: 'mock-jwt-token',
        incomingData: mockIncomingData
      });

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBe('Log not found in CRM');
    });

    test('should handle unexpected errors gracefully', async () => {
      // Arrange
      const mockIncomingData = {
        sessionId: 'session-error',
        note: 'Test note'
      };

      jwt.decodeJwt.mockReturnValue({
        id: 'user-123',
        platform: 'testCRM'
      });

      const mockConnector = {
        updateCallLog: jest.fn()
      };
      connectorRegistry.getConnector.mockReturnValue(mockConnector);

      logCore.updateCallLog.mockRejectedValue(
        new Error('API timeout')
      );

      // Act
      const result = await updateCallLog.execute({
        jwtToken: 'mock-jwt-token',
        incomingData: mockIncomingData
      });

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBe('API timeout');
      expect(result.errorDetails).toBeDefined();
    });

    test('should update call log with empty note', async () => {
      // Arrange
      const mockIncomingData = {
        sessionId: 'session-empty-note',
        note: ''
      };

      jwt.decodeJwt.mockReturnValue({
        id: 'user-123',
        platform: 'testCRM'
      });

      const mockConnector = {
        updateCallLog: jest.fn()
      };
      connectorRegistry.getConnector.mockReturnValue(mockConnector);

      logCore.updateCallLog.mockResolvedValue({
        successful: true,
        logId: 'crm-log-empty',
        updatedNote: ''
      });

      // Act
      const result = await updateCallLog.execute({
        jwtToken: 'mock-jwt-token',
        incomingData: mockIncomingData
      });

      // Assert
      expect(result.success).toBe(true);
      expect(result.data.updatedNote).toBe('');
    });
  });
});

