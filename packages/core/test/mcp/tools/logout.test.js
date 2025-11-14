const logout = require('../../../mcp/tools/logout');
const jwt = require('../../../lib/jwt');
const { UserModel } = require('../../../models/userModel');
const connectorRegistry = require('../../../connector/registry');

// Mock dependencies
jest.mock('../../../lib/jwt');
jest.mock('../../../models/userModel');
jest.mock('../../../connector/registry');

describe('MCP Tool: logout', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('tool definition', () => {
    test('should have correct tool definition', () => {
      expect(logout.definition).toBeDefined();
      expect(logout.definition.name).toBe('logout');
      expect(logout.definition.description).toContain('Logout');
      expect(logout.definition.inputSchema).toBeDefined();
    });

    test('should have jwtToken property', () => {
      expect(logout.definition.inputSchema.properties).toHaveProperty('jwtToken');
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

    test('should handle logout errors gracefully', async () => {
      // Arrange
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

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBe('Logout API failed');
      expect(result.errorDetails).toBeDefined();
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

    test('should handle missing platform connector', async () => {
      // Arrange
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

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
});

