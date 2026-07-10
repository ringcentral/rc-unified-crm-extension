const logout = require('../../../mcp/tools/logout');
const jwt = require('../../../lib/jwt');
const { UserModel } = require('../../../models/userModel');
const { LlmSessionModel } = require('../../../models/llmSessionModel');
const { CacheModel } = require('../../../models/cacheModel');
const connectorRegistry = require('../../../connector/registry');

// Mock dependencies
jest.mock('../../../lib/jwt');
jest.mock('../../../models/userModel');
jest.mock('../../../models/llmSessionModel');
jest.mock('../../../models/cacheModel');
jest.mock('../../../connector/registry');

describe('MCP Tool: logout', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    LlmSessionModel.destroy.mockResolvedValue(1);
    CacheModel.destroy.mockResolvedValue(1);
  });

  describe('tool definition', () => {
    test('should have correct tool definition', () => {
      expect(logout.definition).toBeDefined();
      expect(logout.definition.name).toBe('logout');
      expect(logout.definition.description).toContain('Logout');
      expect(logout.definition.inputSchema).toBeDefined();
    });

    test('should have empty properties (jwtToken is server-injected, not in schema)', () => {
      expect(logout.definition.inputSchema.properties).toEqual({});
    });
  });

  describe('execute', () => {
    test('should logout user successfully', async () => {
      // Arrange
      const mockUser = {
        id: 'test-user-id',
        platform: 'testCRM',
        accessToken: 'test-access-token'
      };

      const mockConnector = {
        unAuthorize: jest.fn().mockResolvedValue({
          returnMessage: {
            messageType: 'success',
            message: 'Logged out successfully'
          }
        })
      };

      jwt.decodeJwt.mockReturnValue({
        id: 'test-user-id',
        platform: 'testCRM'
      });

      UserModel.findByPk.mockResolvedValue(mockUser);
      connectorRegistry.getConnector.mockReturnValue(mockConnector);

      // Act
      const result = await logout.execute({
        jwtToken: 'mock-jwt-token'
      });

      // Assert
      expect(result).toEqual({
        success: true,
        data: {
          message: expect.stringContaining('IMPORTANT')
        }
      });
      expect(jwt.decodeJwt).toHaveBeenCalledWith('mock-jwt-token');
      expect(LlmSessionModel.destroy).toHaveBeenCalledWith({ where: { id: 'test-user-id' } });
      expect(UserModel.findByPk).toHaveBeenCalledWith('test-user-id');
      expect(connectorRegistry.getConnector).toHaveBeenCalledWith('testCRM');
      expect(mockConnector.unAuthorize).toHaveBeenCalledWith({
        user: mockUser
      });
    });

    test('should return error when user not found', async () => {
      // Arrange
      jwt.decodeJwt.mockReturnValue({
        id: 'non-existent-user',
        platform: 'testCRM'
      });

      UserModel.findByPk.mockResolvedValue(null);

      // Act
      const result = await logout.execute({
        jwtToken: 'mock-jwt-token'
      });

      // Assert
      expect(result).toEqual({
        success: false,
        error: 'User not found',
        errorDetails: 'User not found'
      });
    });

    test('should treat CRM unAuthorize failure as non-fatal and still succeed', async () => {
      // Arrange
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const mockUser = {
        id: 'test-user-id',
        platform: 'testCRM'
      };

      const mockConnector = {
        unAuthorize: jest.fn().mockRejectedValue(
          new Error('Logout API failed')
        )
      };

      jwt.decodeJwt.mockReturnValue({
        id: 'test-user-id',
        platform: 'testCRM'
      });

      UserModel.findByPk.mockResolvedValue(mockUser);
      connectorRegistry.getConnector.mockReturnValue(mockConnector);

      // Act
      const result = await logout.execute({
        jwtToken: 'mock-jwt-token'
      });

      // Assert — local session is cleared; CRM revoke errors are logged only
      expect(result.success).toBe(true);
      expect(result.data.message).toContain('IMPORTANT');
      expect(mockConnector.unAuthorize).toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    test('should handle invalid JWT token', async () => {
      // Arrange
      jwt.decodeJwt.mockReturnValue(null);

      // Act
      const result = await logout.execute({
        jwtToken: 'invalid-token'
      });

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    test.each([
      [{ id: 'test-user-id' }],
      [{ platform: 'testCRM' }]
    ])('should reject incomplete JWT payloads', async (payload) => {
      jwt.decodeJwt.mockReturnValue(payload);

      await expect(logout.execute({
        jwtToken: 'invalid-token'
      })).resolves.toMatchObject({
        success: false,
        error: 'Invalid JWT token'
      });
    });

    test('should succeed when platform connector is missing (unAuthorize skipped)', async () => {
      // Arrange
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const mockUser = {
        id: 'test-user-id',
        platform: 'unknownCRM'
      };

      jwt.decodeJwt.mockReturnValue({
        id: 'test-user-id',
        platform: 'unknownCRM'
      });

      UserModel.findByPk.mockResolvedValue(mockUser);
      connectorRegistry.getConnector.mockReturnValue(null);

      // Act
      const result = await logout.execute({
        jwtToken: 'mock-jwt-token'
      });

      // Assert — null connector throws on unAuthorize; error is caught, logout still succeeds locally
      expect(result.success).toBe(true);
      expect(result.data.message).toContain('IMPORTANT');
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    test('should clear both CRM user and RC extension session rows when rcExtensionId is provided', async () => {
      const mockUser = {
        id: 'test-user-id',
        platform: 'testCRM'
      };

      jwt.decodeJwt.mockReturnValue({
        id: 'test-user-id',
        platform: 'testCRM'
      });
      UserModel.findByPk.mockResolvedValue(mockUser);
      connectorRegistry.getConnector.mockReturnValue({
        unAuthorize: jest.fn().mockResolvedValue({})
      });

      const result = await logout.execute({
        jwtToken: 'mock-jwt-token',
        rcExtensionId: 'rc-ext-123'
      });

      expect(result.success).toBe(true);
      expect(LlmSessionModel.destroy).toHaveBeenNthCalledWith(1, { where: { id: 'test-user-id' } });
      expect(LlmSessionModel.destroy).toHaveBeenNthCalledWith(2, { where: { id: 'rc-ext-123' } });
    });

    test('should not clear the RC extension session twice when it matches the user id', async () => {
      const mockUser = {
        id: 'test-user-id',
        platform: 'testCRM'
      };

      jwt.decodeJwt.mockReturnValue({
        id: 'test-user-id',
        platform: 'testCRM'
      });
      UserModel.findByPk.mockResolvedValue(mockUser);
      connectorRegistry.getConnector.mockReturnValue({
        unAuthorize: jest.fn().mockResolvedValue({})
      });

      const result = await logout.execute({
        jwtToken: 'mock-jwt-token',
        rcExtensionId: 'test-user-id'
      });

      expect(result.success).toBe(true);
      expect(LlmSessionModel.destroy).toHaveBeenCalledTimes(1);
      expect(CacheModel.destroy).not.toHaveBeenCalled();
    });

    test('should clear the resolved rcExtension cache for the current OpenAI session on logout', async () => {
      const mockUser = {
        id: 'test-user-id',
        platform: 'testCRM'
      };

      jwt.decodeJwt.mockReturnValue({
        id: 'test-user-id',
        platform: 'testCRM'
      });
      UserModel.findByPk.mockResolvedValue(mockUser);
      connectorRegistry.getConnector.mockReturnValue({
        unAuthorize: jest.fn().mockResolvedValue({})
      });

      const result = await logout.execute({
        jwtToken: 'mock-jwt-token',
        openaiSessionId: 'oa-session-123'
      });

      expect(result.success).toBe(true);
      expect(CacheModel.destroy).toHaveBeenCalledWith({
        where: { id: 'oa-session-123-rcExtensionId' }
      });
    });

    test('should ignore missing llmSessions table errors while logging out', async () => {
      const mockUser = {
        id: 'test-user-id',
        platform: 'testCRM'
      };

      LlmSessionModel.destroy.mockRejectedValueOnce(
        new Error('SQLITE_ERROR: no such table: llmSessions')
      );
      jwt.decodeJwt.mockReturnValue({
        id: 'test-user-id',
        platform: 'testCRM'
      });
      UserModel.findByPk.mockResolvedValue(mockUser);
      connectorRegistry.getConnector.mockReturnValue({
        unAuthorize: jest.fn().mockResolvedValue({})
      });

      await expect(logout.execute({
        jwtToken: 'mock-jwt-token'
      })).resolves.toMatchObject({
        success: true
      });
    });

    test('should return an error when session cleanup fails for other reasons', async () => {
      LlmSessionModel.destroy.mockRejectedValueOnce(new Error('database is locked'));
      jwt.decodeJwt.mockReturnValue({
        id: 'test-user-id',
        platform: 'testCRM'
      });

      await expect(logout.execute({
        jwtToken: 'mock-jwt-token'
      })).resolves.toMatchObject({
        success: false,
        error: 'database is locked'
      });
    });

    test('should log connector unsuccessful responses and still complete local logout', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const mockUser = {
        id: 'test-user-id',
        platform: 'testCRM'
      };
      const mockConnector = {
        unAuthorize: jest.fn().mockResolvedValue({
          successful: false,
          returnMessage: { message: 'Remote logout failed' }
        })
      };

      jwt.decodeJwt.mockReturnValue({
        id: 'test-user-id',
        platform: 'testCRM'
      });
      UserModel.findByPk.mockResolvedValue(mockUser);
      connectorRegistry.getConnector.mockReturnValue(mockConnector);

      await expect(logout.execute({
        jwtToken: 'mock-jwt-token'
      })).resolves.toMatchObject({
        success: true
      });
      expect(consoleSpy).toHaveBeenCalledWith(expect.any(Error));
      consoleSpy.mockRestore();
    });
  });
});


export {};
