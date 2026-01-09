const authHandler = require('../../handlers/auth');
const connectorRegistry = require('../../connector/registry');

// Mock the connector registry
jest.mock('../../connector/registry');
jest.mock('../../lib/oauth');
jest.mock('../../models/dynamo/connectorSchema', () => ({
  Connector: {
    getProxyConfig: jest.fn()
  }
}));
jest.mock('../../lib/ringcentral', () => ({
  RingCentral: jest.fn().mockImplementation(() => ({
    generateToken: jest.fn()
  }))
}));
jest.mock('../../handlers/admin', () => ({
  updateAdminRcTokens: jest.fn()
}));

const oauth = require('../../lib/oauth');
const { Connector } = require('../../models/dynamo/connectorSchema');
const { RingCentral } = require('../../lib/ringcentral');
const adminCore = require('../../handlers/admin');

describe('Auth Handler', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    global.testUtils.resetConnectorRegistry();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
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

      const mockConnector = global.testUtils.createMockConnector({
        getBasicAuth: jest.fn().mockReturnValue('dGVzdC1hcGkta2V5Og=='),
        getUserInfo: jest.fn().mockResolvedValue(mockUserInfo)
      });
      
      connectorRegistry.getConnector.mockReturnValue(mockConnector);

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
      expect(mockConnector.getBasicAuth).toHaveBeenCalledWith({ apiKey: 'test-api-key' });
      expect(mockConnector.getUserInfo).toHaveBeenCalledWith({
        authHeader: 'Basic dGVzdC1hcGkta2V5Og==',
        hostname: 'test.example.com',
        additionalInfo: {},
        apiKey: 'test-api-key',
        platform: 'testCRM',
        proxyId: undefined
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

      const mockConnector = global.testUtils.createMockConnector({
        getBasicAuth: jest.fn().mockReturnValue('dGVzdC1hcGkta2V5Og=='),
        getUserInfo: jest.fn().mockResolvedValue(mockUserInfo)
      });
      
      connectorRegistry.getConnector.mockReturnValue(mockConnector);

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

    test('should throw error when connector not found', async () => {
      // Arrange
      connectorRegistry.getConnector.mockImplementation(() => {
        throw new Error('Connector not found for platform: testCRM');
      });

      const requestData = {
        platform: 'testCRM',
        hostname: 'test.example.com',
        apiKey: 'test-api-key',
        additionalInfo: {}
      };

      // Act & Assert
      await expect(authHandler.onApiKeyLogin(requestData))
        .rejects.toThrow('Connector not found for platform: testCRM');
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

      const mockConnector = global.testUtils.createMockConnector({
        getOauthInfo: jest.fn().mockResolvedValue({}),
        authValidation: jest.fn().mockResolvedValue(mockValidationResponse)
      });
      
      connectorRegistry.getConnector.mockReturnValue(mockConnector);

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
      expect(mockConnector.authValidation).toHaveBeenCalledWith({ user: mockUser });
    });

    test('should handle user not found in database', async () => {
      // Arrange
      const mockConnector = global.testUtils.createMockConnector();
      connectorRegistry.getConnector.mockReturnValue(mockConnector);

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

      const mockConnector = global.testUtils.createMockConnector({
        getOauthInfo: jest.fn().mockResolvedValue({}),
        authValidation: jest.fn().mockResolvedValue(mockValidationResponse)
      });
      
      connectorRegistry.getConnector.mockReturnValue(mockConnector);

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

  describe('onOAuthCallback', () => {
    const mockOAuthApp = {
      code: {
        getToken: jest.fn()
      }
    };

    beforeEach(() => {
      oauth.getOAuthApp.mockReturnValue(mockOAuthApp);
    });

    test('should handle successful OAuth callback', async () => {
      // Arrange
      const mockUserInfo = {
        successful: true,
        platformUserInfo: {
          id: 'oauth-user-id',
          name: 'OAuth User',
          timezoneName: 'America/New_York',
          timezoneOffset: -300,
          platformAdditionalInfo: {}
        },
        returnMessage: {
          messageType: 'success',
          message: 'Connected successfully'
        }
      };

      const mockConnector = global.testUtils.createMockConnector({
        getOauthInfo: jest.fn().mockResolvedValue({
          clientId: 'client-id',
          clientSecret: 'client-secret',
          accessTokenUri: 'https://api.example.com/oauth/token',
          authorizationUri: 'https://api.example.com/oauth/authorize'
        }),
        getUserInfo: jest.fn().mockResolvedValue(mockUserInfo)
      });

      connectorRegistry.getConnector.mockReturnValue(mockConnector);

      mockOAuthApp.code.getToken.mockResolvedValue({
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
        expires: new Date()
      });

      const requestData = {
        platform: 'testCRM',
        hostname: 'api.example.com',
        tokenUrl: 'https://api.example.com/oauth/token',
        query: {
          callbackUri: 'https://app.example.com/callback?code=auth-code-123',
          rcAccountId: 'rc-account-123'
        }
      };

      // Act
      const result = await authHandler.onOAuthCallback(requestData);

      // Assert
      expect(result.userInfo).toBeDefined();
      expect(result.userInfo.id).toBe('oauth-user-id');
      expect(oauth.getOAuthApp).toHaveBeenCalled();
      expect(mockOAuthApp.code.getToken).toHaveBeenCalled();
    });

    test('should return fail message when oauthInfo has error', async () => {
      // Arrange
      const mockConnector = global.testUtils.createMockConnector({
        getOauthInfo: jest.fn().mockResolvedValue({
          failMessage: 'OAuth configuration not found'
        })
      });

      connectorRegistry.getConnector.mockReturnValue(mockConnector);

      const requestData = {
        platform: 'testCRM',
        hostname: 'api.example.com',
        tokenUrl: '',
        query: { callbackUri: 'https://app.example.com/callback', rcAccountId: 'rc-123' }
      };

      // Act
      const result = await authHandler.onOAuthCallback(requestData);

      // Assert
      expect(result.userInfo).toBeNull();
      expect(result.returnMessage.messageType).toBe('danger');
      expect(result.returnMessage.message).toBe('OAuth configuration not found');
    });

    test('should handle failed user info retrieval', async () => {
      // Arrange
      const mockConnector = global.testUtils.createMockConnector({
        getOauthInfo: jest.fn().mockResolvedValue({ clientId: 'id', clientSecret: 'secret' }),
        getUserInfo: jest.fn().mockResolvedValue({
          successful: false,
          returnMessage: { messageType: 'error', message: 'User not authorized' }
        })
      });

      connectorRegistry.getConnector.mockReturnValue(mockConnector);

      mockOAuthApp.code.getToken.mockResolvedValue({
        accessToken: 'token',
        refreshToken: 'refresh',
        expires: new Date()
      });

      const requestData = {
        platform: 'testCRM',
        hostname: 'api.example.com',
        tokenUrl: '',
        query: { callbackUri: 'https://app.example.com/callback', rcAccountId: 'rc-123' }
      };

      // Act
      const result = await authHandler.onOAuthCallback(requestData);

      // Assert
      expect(result.userInfo).toBeNull();
      expect(result.returnMessage.message).toBe('User not authorized');
    });

    test('should handle proxyId in OAuth callback', async () => {
      // Arrange
      const proxyConfig = { name: 'Proxy Config', settings: {} };
      Connector.getProxyConfig.mockResolvedValue(proxyConfig);

      const mockConnector = global.testUtils.createMockConnector({
        getOauthInfo: jest.fn().mockResolvedValue({ clientId: 'id', clientSecret: 'secret' }),
        getUserInfo: jest.fn().mockResolvedValue({
          successful: true,
          platformUserInfo: { id: 'proxy-user', name: 'Proxy User' },
          returnMessage: { messageType: 'success', message: 'OK' }
        })
      });

      connectorRegistry.getConnector.mockReturnValue(mockConnector);

      mockOAuthApp.code.getToken.mockResolvedValue({
        accessToken: 'token',
        refreshToken: 'refresh',
        expires: new Date()
      });

      const requestData = {
        platform: 'testCRM',
        hostname: 'api.example.com',
        tokenUrl: '',
        query: {
          callbackUri: 'https://app.example.com/callback',
          proxyId: 'proxy-123',
          rcAccountId: 'rc-123'
        }
      };

      // Act
      await authHandler.onOAuthCallback(requestData);

      // Assert
      expect(Connector.getProxyConfig).toHaveBeenCalledWith('proxy-123');
    });

    test('should call postSaveUserInfo if platform implements it', async () => {
      // Arrange
      const postSaveResult = { id: 'user-id', name: 'User', extra: 'data' };
      const mockConnector = global.testUtils.createMockConnector({
        getOauthInfo: jest.fn().mockResolvedValue({ clientId: 'id', clientSecret: 'secret' }),
        getUserInfo: jest.fn().mockResolvedValue({
          successful: true,
          platformUserInfo: { id: 'user-id', name: 'User' },
          returnMessage: { messageType: 'success', message: 'OK' }
        }),
        postSaveUserInfo: jest.fn().mockResolvedValue(postSaveResult)
      });

      connectorRegistry.getConnector.mockReturnValue(mockConnector);

      mockOAuthApp.code.getToken.mockResolvedValue({
        accessToken: 'token',
        refreshToken: 'refresh',
        expires: new Date()
      });

      const requestData = {
        platform: 'testCRM',
        hostname: 'api.example.com',
        tokenUrl: '',
        query: { callbackUri: 'https://app.example.com/callback', rcAccountId: 'rc-123' }
      };

      // Act
      const result = await authHandler.onOAuthCallback(requestData);

      // Assert
      expect(mockConnector.postSaveUserInfo).toHaveBeenCalled();
      expect(result.userInfo).toEqual(postSaveResult);
    });

    test('should use overriding OAuth option if provided', async () => {
      // Arrange
      const overridingOption = { redirect_uri: 'custom-redirect' };
      const mockConnector = global.testUtils.createMockConnector({
        getOauthInfo: jest.fn().mockResolvedValue({ clientId: 'id', clientSecret: 'secret' }),
        getOverridingOAuthOption: jest.fn().mockReturnValue(overridingOption),
        getUserInfo: jest.fn().mockResolvedValue({
          successful: true,
          platformUserInfo: { id: 'user-id', name: 'User' },
          returnMessage: { messageType: 'success', message: 'OK' }
        })
      });

      connectorRegistry.getConnector.mockReturnValue(mockConnector);

      mockOAuthApp.code.getToken.mockResolvedValue({
        accessToken: 'token',
        refreshToken: 'refresh',
        expires: new Date()
      });

      const requestData = {
        platform: 'testCRM',
        hostname: 'api.example.com',
        tokenUrl: '',
        query: { callbackUri: 'https://app.example.com/callback?code=code123', rcAccountId: 'rc-123' }
      };

      // Act
      await authHandler.onOAuthCallback(requestData);

      // Assert
      expect(mockConnector.getOverridingOAuthOption).toHaveBeenCalledWith({ code: 'code123' });
      expect(mockOAuthApp.code.getToken).toHaveBeenCalledWith(
        expect.any(String),
        overridingOption
      );
    });
  });

  describe('getLicenseStatus', () => {
    test('should return license status from platform module', async () => {
      // Arrange
      const mockLicenseStatus = {
        isValid: true,
        expiresAt: '2025-12-31',
        features: ['call_logging', 'sms_logging']
      };

      const mockConnector = global.testUtils.createMockConnector({
        getLicenseStatus: jest.fn().mockResolvedValue(mockLicenseStatus)
      });

      connectorRegistry.getConnector.mockReturnValue(mockConnector);

      // Act
      const result = await authHandler.getLicenseStatus({
        userId: 'user-123',
        platform: 'testCRM'
      });

      // Assert
      expect(result).toEqual(mockLicenseStatus);
      expect(mockConnector.getLicenseStatus).toHaveBeenCalledWith({
        userId: 'user-123',
        platform: 'testCRM'
      });
    });
  });

  describe('onRingcentralOAuthCallback', () => {
    beforeEach(() => {
      process.env.RINGCENTRAL_SERVER = 'https://platform.ringcentral.com';
      process.env.RINGCENTRAL_CLIENT_ID = 'rc-client-id';
      process.env.RINGCENTRAL_CLIENT_SECRET = 'rc-client-secret';
      process.env.APP_SERVER = 'https://app.example.com';
    });

    test('should handle successful RingCentral OAuth callback', async () => {
      // Arrange
      const mockGenerateToken = jest.fn().mockResolvedValue({
        access_token: 'rc-access-token',
        refresh_token: 'rc-refresh-token',
        expire_time: Date.now() + 3600000
      });

      RingCentral.mockImplementation(() => ({
        generateToken: mockGenerateToken
      }));

      // Act
      await authHandler.onRingcentralOAuthCallback({
        code: 'rc-auth-code',
        rcAccountId: 'hashed-rc-account-id'
      });

      // Assert
      expect(RingCentral).toHaveBeenCalledWith({
        server: 'https://platform.ringcentral.com',
        clientId: 'rc-client-id',
        clientSecret: 'rc-client-secret',
        redirectUri: 'https://app.example.com/ringcentral/oauth/callback'
      });
      expect(mockGenerateToken).toHaveBeenCalledWith({ code: 'rc-auth-code' });
      expect(adminCore.updateAdminRcTokens).toHaveBeenCalledWith({
        hashedRcAccountId: 'hashed-rc-account-id',
        adminAccessToken: 'rc-access-token',
        adminRefreshToken: 'rc-refresh-token',
        adminTokenExpiry: expect.any(Number)
      });
    });

    test('should return early if environment variables are not set', async () => {
      // Arrange
      delete process.env.RINGCENTRAL_SERVER;

      // Act
      const result = await authHandler.onRingcentralOAuthCallback({
        code: 'rc-auth-code',
        rcAccountId: 'hashed-rc-account-id'
      });

      // Assert
      expect(result).toBeUndefined();
      expect(RingCentral).not.toHaveBeenCalled();
    });
  });
}); 