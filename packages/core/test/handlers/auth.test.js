const authHandler = require('../../handlers/auth');
const adapterRegistry = require('../../adapter/registry');

// Mock the adapter registry
jest.mock('../../adapter/registry');

describe('Auth Handler', () => {
  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    global.testUtils.resetAdapterRegistry();
  });

  describe('onApiKeyLogin', () => {
    test('should handle successful API key login', async () => {
      // Arrange
      const mockUserInfo = {
        successful: true,
        platformUserInfo: {
          id: 'test-user-id',
          name: 'Test User',
          timezoneName: 'America/Los_Angeles',
          timezoneOffset: 0,
          platformAdditionalInfo: {}
        },
        returnMessage: {
          messageType: 'success',
          message: 'Login successful',
          ttl: 1000
        }
      };

      const mockAdapter = global.testUtils.createMockAdapter({
        getBasicAuth: jest.fn().mockReturnValue('dGVzdC1hcGkta2V5Og=='),
        getUserInfo: jest.fn().mockResolvedValue(mockUserInfo)
      });
      
      adapterRegistry.getAdapter.mockReturnValue(mockAdapter);

      const requestData = {
        platform: 'testCRM',
        hostname: 'test.example.com',
        apiKey: 'test-api-key',
        additionalInfo: {}
      };

      // Act
      const result = await authHandler.onApiKeyLogin(requestData);

      // Assert
      expect(result.userInfo).toBeDefined();
      expect(result.userInfo.id).toBe('test-user-id');
      expect(result.userInfo.name).toBe('Test User');
      expect(result.returnMessage).toEqual(mockUserInfo.returnMessage);
      expect(mockAdapter.getBasicAuth).toHaveBeenCalledWith({ apiKey: 'test-api-key' });
      expect(mockAdapter.getUserInfo).toHaveBeenCalledWith({
        authHeader: 'Basic dGVzdC1hcGkta2V5Og==',
        hostname: 'test.example.com',
        additionalInfo: {},
        apiKey: 'test-api-key'
      });
    });

    test('should handle failed API key login', async () => {
      // Arrange
      const mockUserInfo = {
        successful: false,
        platformUserInfo: null,
        returnMessage: {
          messageType: 'error',
          message: 'Invalid API key',
          ttl: 3000
        }
      };

      const mockAdapter = global.testUtils.createMockAdapter({
        getBasicAuth: jest.fn().mockReturnValue('dGVzdC1hcGkta2V5Og=='),
        getUserInfo: jest.fn().mockResolvedValue(mockUserInfo)
      });
      
      adapterRegistry.getAdapter.mockReturnValue(mockAdapter);

      const requestData = {
        platform: 'testCRM',
        hostname: 'test.example.com',
        apiKey: 'invalid-api-key',
        additionalInfo: {}
      };

      // Act
      const result = await authHandler.onApiKeyLogin(requestData);

      // Assert
      expect(result.userInfo).toBeNull();
      expect(result.returnMessage).toEqual(mockUserInfo.returnMessage);
    });

    test('should throw error when adapter not found', async () => {
      // Arrange
      adapterRegistry.getAdapter.mockImplementation(() => {
        throw new Error('Adapter not found for platform: testCRM');
      });

      const requestData = {
        platform: 'testCRM',
        hostname: 'test.example.com',
        apiKey: 'test-api-key',
        additionalInfo: {}
      };

      // Act & Assert
      await expect(authHandler.onApiKeyLogin(requestData))
        .rejects.toThrow('Adapter not found for platform: testCRM');
    });
  });

  describe('authValidation', () => {
    test('should validate user authentication successfully', async () => {
      // Arrange
      const mockUser = global.testUtils.createMockUser();
      const mockValidationResponse = {
        successful: true,
        returnMessage: {
          messageType: 'success',
          message: 'Authentication valid',
          ttl: 1000
        },
        status: 200
      };

      const mockAdapter = global.testUtils.createMockAdapter({
        getOauthInfo: jest.fn().mockResolvedValue({}),
        authValidation: jest.fn().mockResolvedValue(mockValidationResponse)
      });
      
      adapterRegistry.getAdapter.mockReturnValue(mockAdapter);

      // Mock UserModel.findOne to return a user
      const { UserModel } = require('../../models/userModel');
      jest.spyOn(UserModel, 'findOne').mockResolvedValue(mockUser);

      // Mock oauth.checkAndRefreshAccessToken
      const oauth = require('../../lib/oauth');
      jest.spyOn(oauth, 'checkAndRefreshAccessToken').mockResolvedValue(mockUser);

      const requestData = {
        platform: 'testCRM',
        userId: 'test-user-id'
      };

      // Act
      const result = await authHandler.authValidation(requestData);

      // Assert
      expect(result).toEqual({
        ...mockValidationResponse,
        failReason: ''
      });
      expect(mockAdapter.authValidation).toHaveBeenCalledWith({ user: mockUser });
    });

    test('should handle user not found in database', async () => {
      // Arrange
      const mockAdapter = global.testUtils.createMockAdapter();
      adapterRegistry.getAdapter.mockReturnValue(mockAdapter);

      // Mock UserModel.findOne to return null (user not found)
      const { UserModel } = require('../../models/userModel');
      jest.spyOn(UserModel, 'findOne').mockResolvedValue(null);

      const requestData = {
        platform: 'testCRM',
        userId: 'non-existent-user'
      };

      // Act
      const result = await authHandler.authValidation(requestData);

      // Assert
      expect(result).toEqual({
        successful: false,
        status: 404,
        failReason: 'App Connect. User not found in database'
      });
    });

    test('should handle validation failure', async () => {
      // Arrange
      const mockUser = global.testUtils.createMockUser();
      const mockValidationResponse = {
        successful: false,
        returnMessage: {
          messageType: 'error',
          message: 'Authentication failed',
          ttl: 3000
        },
        status: 401
      };

      const mockAdapter = global.testUtils.createMockAdapter({
        getOauthInfo: jest.fn().mockResolvedValue({}),
        authValidation: jest.fn().mockResolvedValue(mockValidationResponse)
      });
      
      adapterRegistry.getAdapter.mockReturnValue(mockAdapter);

      // Mock UserModel.findOne to return a user
      const { UserModel } = require('../../models/userModel');
      jest.spyOn(UserModel, 'findOne').mockResolvedValue(mockUser);

      // Mock oauth.checkAndRefreshAccessToken
      const oauth = require('../../lib/oauth');
      jest.spyOn(oauth, 'checkAndRefreshAccessToken').mockResolvedValue(mockUser);

      const requestData = {
        platform: 'testCRM',
        userId: 'test-user-id'
      };

      // Act
      const result = await authHandler.authValidation(requestData);

      // Assert
      expect(result).toEqual({
        ...mockValidationResponse,
        failReason: 'CRM. API failed'
      });
      expect(result.successful).toBe(false);
    });
  });
}); 