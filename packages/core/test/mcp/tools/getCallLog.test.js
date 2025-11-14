const getCallLog = require('../../../mcp/tools/getCallLog');
const jwt = require('../../../lib/jwt');
const connectorRegistry = require('../../../connector/registry');
const logCore = require('../../../handlers/log');

// Mock dependencies
jest.mock('../../../lib/jwt');
jest.mock('../../../connector/registry');
jest.mock('../../../handlers/log');

describe('MCP Tool: getCallLog', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('tool definition', () => {
    test('should have correct tool definition', () => {
      expect(getCallLog.definition).toBeDefined();
      expect(getCallLog.definition.name).toBe('getCallLog');
      expect(getCallLog.definition.description).toContain('REQUIRES AUTHENTICATION');
      expect(getCallLog.definition.inputSchema).toBeDefined();
    });

    test('should require jwtToken and sessionIds parameters', () => {
      expect(getCallLog.definition.inputSchema.required).toContain('jwtToken');
      expect(getCallLog.definition.inputSchema.required).toContain('sessionIds');
    });

    test('should have requireDetails optional parameter', () => {
      expect(getCallLog.definition.inputSchema.properties).toHaveProperty('requireDetails');
    });
  });

  describe('execute', () => {
    test('should get call log successfully', async () => {
      // Arrange
      const mockLogs = [
        {
          id: 'log-123',
          sessionId: 'session-123',
          contactId: 'contact-123',
          phoneNumber: '+1234567890',
          callDirection: 'Inbound',
          callDuration: 120
        }
      ];

      jwt.decodeJwt.mockReturnValue({
        id: 'user-123',
        platform: 'testCRM'
      });

      const mockConnector = {
        getCallLog: jest.fn()
      };
      connectorRegistry.getConnector.mockReturnValue(mockConnector);

      logCore.getCallLog.mockResolvedValue({
        successful: true,
        logs: mockLogs,
        returnMessage: { message: 'Logs retrieved' }
      });

      // Act
      const result = await getCallLog.execute({
        jwtToken: 'mock-jwt-token',
        sessionIds: 'session-123'
      });

      // Assert
      expect(result).toEqual({
        success: true,
        data: mockLogs
      });
      expect(jwt.decodeJwt).toHaveBeenCalledWith('mock-jwt-token');
      expect(connectorRegistry.getConnector).toHaveBeenCalledWith('testCRM');
      expect(logCore.getCallLog).toHaveBeenCalledWith({
        userId: 'user-123',
        sessionIds: 'session-123',
        platform: 'testCRM',
        requireDetails: false
      });
    });

    test('should get call logs with multiple session IDs', async () => {
      // Arrange
      const mockLogs = [
        { sessionId: 'session-123', contactId: 'contact-123' },
        { sessionId: 'session-456', contactId: 'contact-456' }
      ];

      jwt.decodeJwt.mockReturnValue({
        id: 'user-123',
        platform: 'testCRM'
      });

      const mockConnector = {
        getCallLog: jest.fn()
      };
      connectorRegistry.getConnector.mockReturnValue(mockConnector);

      logCore.getCallLog.mockResolvedValue({
        successful: true,
        logs: mockLogs
      });

      // Act
      const result = await getCallLog.execute({
        jwtToken: 'mock-jwt-token',
        sessionIds: 'session-123,session-456'
      });

      // Assert
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2);
      expect(logCore.getCallLog).toHaveBeenCalledWith({
        userId: 'user-123',
        sessionIds: 'session-123,session-456',
        platform: 'testCRM',
        requireDetails: false
      });
    });

    test('should get call logs with detailed information', async () => {
      // Arrange
      const mockLogs = [
        {
          sessionId: 'session-123',
          contactId: 'contact-123',
          detailedInfo: { recording: 'url', transcript: 'text' }
        }
      ];

      jwt.decodeJwt.mockReturnValue({
        id: 'user-123',
        platform: 'testCRM'
      });

      const mockConnector = {
        getCallLog: jest.fn()
      };
      connectorRegistry.getConnector.mockReturnValue(mockConnector);

      logCore.getCallLog.mockResolvedValue({
        successful: true,
        logs: mockLogs
      });

      // Act
      const result = await getCallLog.execute({
        jwtToken: 'mock-jwt-token',
        sessionIds: 'session-123',
        requireDetails: true
      });

      // Assert
      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockLogs);
      expect(logCore.getCallLog).toHaveBeenCalledWith({
        userId: 'user-123',
        sessionIds: 'session-123',
        platform: 'testCRM',
        requireDetails: true
      });
    });

    test('should return error when logs not found', async () => {
      // Arrange
      jwt.decodeJwt.mockReturnValue({
        id: 'user-123',
        platform: 'testCRM'
      });

      const mockConnector = {
        getCallLog: jest.fn()
      };
      connectorRegistry.getConnector.mockReturnValue(mockConnector);

      logCore.getCallLog.mockResolvedValue({
        successful: false,
        logs: [],
        returnMessage: { message: 'Logs not found' }
      });

      // Act
      const result = await getCallLog.execute({
        jwtToken: 'mock-jwt-token',
        sessionIds: 'non-existent-session'
      });

      // Assert
      expect(result).toEqual({
        success: false,
        error: 'Logs not found'
      });
    });

    test('should return error when JWT is invalid', async () => {
      // Arrange
      jwt.decodeJwt.mockReturnValue({
        platform: 'testCRM'
        // id is missing
      });

      // Act
      const result = await getCallLog.execute({
        jwtToken: 'invalid-token',
        sessionIds: 'session-123'
      });

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid JWT token');
    });

    test('should return error when platform connector not found', async () => {
      // Arrange
      jwt.decodeJwt.mockReturnValue({
        id: 'user-123',
        platform: 'unknownCRM'
      });

      connectorRegistry.getConnector.mockReturnValue(null);

      // Act
      const result = await getCallLog.execute({
        jwtToken: 'mock-jwt-token',
        sessionIds: 'session-123'
      });

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toContain('Platform connector not found');
    });

    test('should return error when getCallLog is not implemented', async () => {
      // Arrange
      jwt.decodeJwt.mockReturnValue({
        id: 'user-123',
        platform: 'testCRM'
      });

      const mockConnector = {}; // No getCallLog method
      connectorRegistry.getConnector.mockReturnValue(mockConnector);

      // Act
      const result = await getCallLog.execute({
        jwtToken: 'mock-jwt-token',
        sessionIds: 'session-123'
      });

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toContain('not implemented');
    });

    test('should handle unexpected errors gracefully', async () => {
      // Arrange
      jwt.decodeJwt.mockReturnValue({
        id: 'user-123',
        platform: 'testCRM'
      });

      const mockConnector = {
        getCallLog: jest.fn()
      };
      connectorRegistry.getConnector.mockReturnValue(mockConnector);

      logCore.getCallLog.mockRejectedValue(
        new Error('Database query failed')
      );

      // Act
      const result = await getCallLog.execute({
        jwtToken: 'mock-jwt-token',
        sessionIds: 'session-123'
      });

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBe('Database query failed');
      expect(result.errorDetails).toBeDefined();
    });
  });
});

