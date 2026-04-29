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
const { AccountDataModel } = require('../../models/accountDataModel');
const { encode } = require('../../lib/encode');
const { getHashValue } = require('../../lib/util');

describe('Auth Handler', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    global.testUtils.resetConnectorRegistry();
    process.env = { ...originalEnv };
    process.env.APP_SERVER_SECRET_KEY = 'test-app-server-secret-key-123456';
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('onApiKeyLogin', () => {
    afterEach(async () => {
      await AccountDataModel.destroy({ where: {} });
    });

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
        additionalInfo: { apiKey: 'test-api-key' },
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

    test('should mark managed auth auto-login failure so the next attempt can fall back to manual auth', async () => {
      connectorRegistry.getManifest.mockReturnValue({
        platforms: {
          testCRM: {
            auth: {
              type: 'apiKey',
              apiKey: {
                page: {
                  content: [
                    { const: 'tenantId', required: true, managed: true, managedScope: 'account' },
                    { const: 'apiKey', required: true, managed: true, managedScope: 'user' }
                  ]
                }
              }
            }
          }
        }
      });

      await AccountDataModel.create({
        rcAccountId: 'rc-account-fail',
        platformName: 'testCRM',
        dataKey: 'managed-auth-org',
        data: {
          fields: {
            tenantId: { version: 1, encrypted: true, value: encode(JSON.stringify('tenant-1')) }
          }
        }
      });
      await AccountDataModel.create({
        rcAccountId: 'rc-account-fail',
        platformName: 'testCRM',
        dataKey: 'managed-auth-user:101',
        data: {
          rcExtensionId: '101',
          rcUserName: 'Agent 101',
          fields: {
            apiKey: { version: 1, encrypted: true, value: encode(JSON.stringify('bad-stored-key')) }
          }
        }
      });

      const mockConnector = global.testUtils.createMockConnector({
        getBasicAuth: jest.fn().mockReturnValue('encoded-bad-key'),
        getUserInfo: jest.fn().mockResolvedValue({
          successful: false,
          platformUserInfo: null,
          returnMessage: {
            messageType: 'error',
            message: 'Invalid API key',
            ttl: 3000
          }
        })
      });
      connectorRegistry.getConnector.mockReturnValue(mockConnector);

      const result = await authHandler.onApiKeyLogin({
        platform: 'testCRM',
        hostname: 'test.example.com',
        rcAccountId: 'rc-account-fail',
        rcExtensionId: '101',
        additionalInfo: {}
      });

      expect(result.userInfo).toBeNull();
      const failureRecord = await AccountDataModel.findOne({
        where: {
          rcAccountId: 'rc-account-fail',
          platformName: 'testCRM',
          dataKey: 'managed-auth-login-failure:101'
        }
      });
      expect(failureRecord).not.toBeNull();
    });

    test('should merge stored org managed auth values into additionalInfo', async () => {
      connectorRegistry.getManifest.mockReturnValue({
        platforms: {
          testCRM: {
            auth: {
              type: 'apiKey',
              apiKey: {
                page: {
                  content: [
                    { const: 'apiKey', required: true, managed: true, managedScope: 'account' },
                    { const: 'tenantId', required: true, managed: true, managedScope: 'account' },
                    { const: 'userToken', required: true }
                  ]
                }
              }
            }
          }
        }
      });
      await AccountDataModel.create({
        rcAccountId: 'rc-account-1',
        platformName: 'testCRM',
        dataKey: 'managed-auth-org',
        data: {
          fields: {
            apiKey: { version: 1, encrypted: true, value: encode(JSON.stringify('stored-api-key')) },
            tenantId: { version: 1, encrypted: true, value: encode(JSON.stringify('tenant-1')) }
          }
        }
      });

      const mockUserInfo = {
        successful: true,
        platformUserInfo: {
          id: 'test-user-id',
          name: 'Test User',
          platformAdditionalInfo: {}
        },
        returnMessage: { messageType: 'success', message: 'ok' }
      };
      const mockConnector = global.testUtils.createMockConnector({
        getBasicAuth: jest.fn().mockReturnValue('encoded-shared'),
        getUserInfo: jest.fn().mockResolvedValue(mockUserInfo)
      });
      connectorRegistry.getConnector.mockReturnValue(mockConnector);

      await authHandler.onApiKeyLogin({
        platform: 'testCRM',
        hostname: 'test.example.com',
        rcAccountId: 'rc-account-1',
        additionalInfo: { userToken: 'user-token-1' }
      });

      expect(mockConnector.getBasicAuth).toHaveBeenCalledWith({ apiKey: 'stored-api-key' });
      expect(mockConnector.getUserInfo).toHaveBeenCalledWith(expect.objectContaining({
        additionalInfo: expect.objectContaining({
          apiKey: 'stored-api-key',
          tenantId: 'tenant-1',
          userToken: 'user-token-1'
        })
      }));
    });

    test('should allow submitted shared fields to satisfy missing required managed auth values', async () => {
      connectorRegistry.getManifest.mockReturnValue({
        platforms: {
          testCRM: {
            auth: {
              type: 'apiKey',
              apiKey: {
                page: {
                  content: [
                    { const: 'companyId', required: true, managed: true, managedScope: 'account' },
                    { const: 'userToken', required: true }
                  ]
                }
              }
            }
          }
        }
      });

      const mockConnector = global.testUtils.createMockConnector({
        getBasicAuth: jest.fn(),
        getUserInfo: jest.fn().mockResolvedValue({
          successful: true,
          platformUserInfo: {
            id: 'test-user-id',
            name: 'Test User',
            platformAdditionalInfo: {}
          },
          returnMessage: { messageType: 'success', message: 'ok' }
        })
      });
      connectorRegistry.getConnector.mockReturnValue(mockConnector);

      const result = await authHandler.onApiKeyLogin({
        platform: 'testCRM',
        hostname: 'test.example.com',
        rcAccountId: 'rc-account-2',
        additionalInfo: {
          companyId: 'company-123',
          userToken: 'user-token-1'
        }
      });

      expect(result.userInfo).not.toBeNull();
      expect(mockConnector.getUserInfo).toHaveBeenCalledWith(expect.objectContaining({
        additionalInfo: expect.objectContaining({
          companyId: 'company-123',
          userToken: 'user-token-1'
        })
      }));
    });

    test('should not persist submitted managed auth values from end users', async () => {
      connectorRegistry.getManifest.mockReturnValue({
        platforms: {
          testCRM: {
            auth: {
              type: 'apiKey',
              apiKey: {
                page: {
                  content: [
                    { const: 'companyId', required: false, managed: true, managedScope: 'account' },
                    { const: 'userToken', required: true }
                  ]
                }
              }
            }
          }
        }
      });

      const mockUserInfo = {
        successful: true,
        platformUserInfo: {
          id: 'test-user-id',
          name: 'Test User',
          platformAdditionalInfo: {}
        },
        returnMessage: { messageType: 'success', message: 'ok' }
      };
      const mockConnector = global.testUtils.createMockConnector({
        getBasicAuth: jest.fn().mockReturnValue('encoded'),
        getUserInfo: jest.fn().mockResolvedValue(mockUserInfo)
      });
      connectorRegistry.getConnector.mockReturnValue(mockConnector);

      await authHandler.onApiKeyLogin({
        platform: 'testCRM',
        hostname: 'test.example.com',
        rcAccountId: 'rc-account-2',
        additionalInfo: {
          companyId: 'company-123',
          userToken: 'user-token-1'
        }
      });

      expect(mockConnector.getUserInfo).toHaveBeenCalledWith(expect.objectContaining({
        additionalInfo: expect.objectContaining({
          companyId: 'company-123',
          userToken: 'user-token-1'
        })
      }));

      const stored = await AccountDataModel.findOne({
        where: {
          rcAccountId: 'rc-account-2',
          platformName: 'testCRM',
          dataKey: 'managed-auth-org'
        }
      });
      expect(stored).toBeNull();
    });

    test('should allow manual fallback values to override stored managed credentials and clear failure state after success', async () => {
      connectorRegistry.getManifest.mockReturnValue({
        platforms: {
          testCRM: {
            auth: {
              type: 'apiKey',
              apiKey: {
                page: {
                  content: [
                    { const: 'apiKey', required: true, managed: true, managedScope: 'user' },
                    { const: 'tenantId', required: true, managed: true, managedScope: 'account' }
                  ]
                }
              }
            }
          }
        }
      });

      await AccountDataModel.create({
        rcAccountId: 'rc-account-recover',
        platformName: 'testCRM',
        dataKey: 'managed-auth-org',
        data: {
          fields: {
            tenantId: { version: 1, encrypted: true, value: encode(JSON.stringify('stored-tenant')) }
          }
        }
      });
      await AccountDataModel.create({
        rcAccountId: 'rc-account-recover',
        platformName: 'testCRM',
        dataKey: 'managed-auth-user:202',
        data: {
          rcExtensionId: '202',
          rcUserName: 'Agent 202',
          fields: {
            apiKey: { version: 1, encrypted: true, value: encode(JSON.stringify('stored-bad-key')) }
          }
        }
      });
      await AccountDataModel.create({
        rcAccountId: 'rc-account-recover',
        platformName: 'testCRM',
        dataKey: 'managed-auth-login-failure:202',
        data: {
          failedAt: '2026-04-07T00:00:00.000Z'
        }
      });

      const mockConnector = global.testUtils.createMockConnector({
        getBasicAuth: jest.fn().mockReturnValue('encoded-manual-key'),
        getUserInfo: jest.fn().mockResolvedValue({
          successful: true,
          platformUserInfo: {
            id: 'test-user-id',
            name: 'Recovered User',
            platformAdditionalInfo: {}
          },
          returnMessage: { messageType: 'success', message: 'ok' }
        })
      });
      connectorRegistry.getConnector.mockReturnValue(mockConnector);

      const result = await authHandler.onApiKeyLogin({
        platform: 'testCRM',
        hostname: 'test.example.com',
        rcAccountId: 'rc-account-recover',
        rcExtensionId: '202',
        additionalInfo: {
          apiKey: 'manual-good-key',
          tenantId: 'manual-tenant'
        }
      });

      expect(result.userInfo).not.toBeNull();
      expect(mockConnector.getBasicAuth).toHaveBeenCalledWith({ apiKey: 'manual-good-key' });
      expect(mockConnector.getUserInfo).toHaveBeenCalledWith(expect.objectContaining({
        additionalInfo: {
          apiKey: 'manual-good-key',
          tenantId: 'manual-tenant'
        }
      }));

      const failureRecord = await AccountDataModel.findOne({
        where: {
          rcAccountId: 'rc-account-recover',
          platformName: 'testCRM',
          dataKey: 'managed-auth-login-failure:202'
        }
      });
      expect(failureRecord).toBeNull();
    });

    test('should return warning when required auth fields are missing', async () => {
      connectorRegistry.getManifest.mockReturnValue({
        platforms: {
          testCRM: {
            auth: {
              type: 'apiKey',
              apiKey: {
                page: {
                  content: [
                    { const: 'tenantId', required: true, managed: true, managedScope: 'account' },
                    { const: 'userToken', required: true }
                  ]
                }
              }
            }
          }
        }
      });

      const mockConnector = global.testUtils.createMockConnector({
        getBasicAuth: jest.fn(),
        getUserInfo: jest.fn()
      });
      connectorRegistry.getConnector.mockReturnValue(mockConnector);

      const result = await authHandler.onApiKeyLogin({
        platform: 'testCRM',
        hostname: 'test.example.com',
        rcAccountId: 'rc-account-4',
        additionalInfo: {}
      });

      expect(result.userInfo).toBeNull();
      expect(result.returnMessage).toEqual({
        messageType: 'warning',
        message: 'Missing required authentication fields.',
        ttl: 3000,
        missingRequiredFieldConsts: ['tenantId', 'userToken']
      });
      expect(mockConnector.getBasicAuth).not.toHaveBeenCalled();
      expect(mockConnector.getUserInfo).not.toHaveBeenCalled();
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
      const mockUser = global.testUtils.createMockUser({ id: 'user-123' });
      const mockLicenseStatus = {
        isValid: true,
        expiresAt: '2025-12-31',
        features: ['call_logging', 'sms_logging']
      };

      const mockConnector = global.testUtils.createMockConnector({
        getLicenseStatus: jest.fn().mockResolvedValue(mockLicenseStatus)
      });

      connectorRegistry.getConnector.mockReturnValue(mockConnector);

      const { UserModel } = require('../../models/userModel');
      jest.spyOn(UserModel, 'findByPk').mockResolvedValue(mockUser);

      // Act
      const result = await authHandler.getLicenseStatus({
        userId: 'user-123',
        platform: 'testCRM'
      });

      // Assert
      expect(result).toEqual(mockLicenseStatus);
      expect(mockConnector.getLicenseStatus).toHaveBeenCalledWith({
        userId: 'user-123',
        platform: 'testCRM',
        user: mockUser
      });
    });

    test('should return invalid license status when user not found', async () => {
      // Arrange
      const mockConnector = global.testUtils.createMockConnector({
        getLicenseStatus: jest.fn()
      });
      connectorRegistry.getConnector.mockReturnValue(mockConnector);

      const { UserModel } = require('../../models/userModel');
      jest.spyOn(UserModel, 'findByPk').mockResolvedValue(null);

      // Act
      const result = await authHandler.getLicenseStatus({
        userId: 'missing-user',
        platform: 'testCRM'
      });

      // Assert
      expect(result).toEqual({
        isLicenseValid: false,
        licenseStatus: 'Invalid (User not found)',
        licenseStatusDescription: ''
      });
      expect(connectorRegistry.getConnector).not.toHaveBeenCalled();
      expect(mockConnector.getLicenseStatus).not.toHaveBeenCalled();
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
      process.env.HASH_KEY = 'test-hash-key';
      const rcAccountId = 'rc-account-id';
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
        rcAccountId
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
        hashedRcAccountId: getHashValue(rcAccountId, 'test-hash-key'),
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

