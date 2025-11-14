const doAuth = require('../../../mcp/tools/doAuth');
const authCore = require('../../../handlers/auth');
const jwt = require('../../../lib/jwt');

// Mock dependencies
jest.mock('../../../handlers/auth');
jest.mock('../../../lib/jwt');

describe('MCP Tool: doAuth', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.APP_SERVER_SECRET_KEY = 'test-secret-key';
  });

  describe('tool definition', () => {
    test('should have correct tool definition', () => {
      expect(doAuth.definition).toBeDefined();
      expect(doAuth.definition.name).toBe('doAuth');
      expect(doAuth.definition.description).toContain('Auth flow step.4');
      expect(doAuth.definition.inputSchema).toBeDefined();
    });

    test('should have optional parameters', () => {
      expect(doAuth.definition.inputSchema.properties).toHaveProperty('connectorManifest');
      expect(doAuth.definition.inputSchema.properties).toHaveProperty('connectorName');
      expect(doAuth.definition.inputSchema.properties).toHaveProperty('hostname');
      expect(doAuth.definition.inputSchema.properties).toHaveProperty('apiKey');
      expect(doAuth.definition.inputSchema.properties).toHaveProperty('additionalInfo');
      expect(doAuth.definition.inputSchema.properties).toHaveProperty('callbackUri');
    });
  });

  describe('execute - apiKey authentication', () => {
    test('should authenticate with API key successfully', async () => {
      // Arrange
      const mockManifest = {
        platforms: {
          testCRM: {
            name: 'testCRM',
            auth: { type: 'apiKey' },
            environment: { type: 'fixed' }
          }
        }
      };

      const mockUserInfo = {
        id: 'test-user-123',
        name: 'Test User'
      };

      authCore.onApiKeyLogin.mockResolvedValue({
        userInfo: mockUserInfo
      });

      jwt.generateJwt.mockReturnValue('mock-jwt-token');

      // Act
      const result = await doAuth.execute({
        connectorManifest: mockManifest,
        connectorName: 'testCRM',
        hostname: 'test.crm.com',
        apiKey: 'test-api-key'
      });

      // Assert
      expect(result).toEqual({
        success: true,
        data: {
          jwtToken: 'mock-jwt-token',
          message: expect.stringContaining('IMPORTANT')
        }
      });
      expect(authCore.onApiKeyLogin).toHaveBeenCalledWith({
        platform: 'testCRM',
        hostname: 'test.crm.com',
        apiKey: 'test-api-key',
        additionalInfo: undefined
      });
      expect(jwt.generateJwt).toHaveBeenCalledWith({
        id: 'test-user-123',
        platform: 'testCRM'
      });
    });

    test('should handle apiKey authentication with additional info', async () => {
      // Arrange
      const mockManifest = {
        platforms: {
          testCRM: {
            name: 'testCRM',
            auth: { type: 'apiKey' }
          }
        }
      };

      const additionalInfo = {
        username: 'testuser',
        password: 'testpass',
        apiUrl: 'https://api.test.com'
      };

      const mockUserInfo = {
        id: 'test-user-456',
        name: 'Test User'
      };

      authCore.onApiKeyLogin.mockResolvedValue({
        userInfo: mockUserInfo
      });

      jwt.generateJwt.mockReturnValue('mock-jwt-token-2');

      // Act
      const result = await doAuth.execute({
        connectorManifest: mockManifest,
        connectorName: 'testCRM',
        hostname: 'test.crm.com',
        apiKey: 'test-api-key',
        additionalInfo
      });

      // Assert
      expect(result.success).toBe(true);
      expect(authCore.onApiKeyLogin).toHaveBeenCalledWith({
        platform: 'testCRM',
        hostname: 'test.crm.com',
        apiKey: 'test-api-key',
        additionalInfo
      });
    });

    test('should return error when user info not found', async () => {
      // Arrange
      const mockManifest = {
        platforms: {
          testCRM: {
            name: 'testCRM',
            auth: { type: 'apiKey' }
          }
        }
      };

      authCore.onApiKeyLogin.mockResolvedValue({
        userInfo: null
      });

      // Act
      const result = await doAuth.execute({
        connectorManifest: mockManifest,
        connectorName: 'testCRM',
        hostname: 'test.crm.com',
        apiKey: 'invalid-api-key'
      });

      // Assert
      expect(result).toEqual({
        success: false,
        error: 'Authentication failed',
        errorDetails: 'User info not found'
      });
    });
  });

  describe('execute - OAuth authentication', () => {
    test('should return auth URI when callback not provided', async () => {
      // Arrange
      const mockManifest = {
        platforms: {
          salesforce: {
            name: 'salesforce',
            auth: {
              type: 'oauth',
              oauth: {
                authUrl: 'https://login.salesforce.com/services/oauth2/authorize',
                clientId: 'test-client-id',
                scope: 'api refresh_token',
                customState: ''
              }
            }
          }
        }
      };

      // Act
      const result = await doAuth.execute({
        connectorManifest: mockManifest,
        connectorName: 'salesforce'
      });

      // Assert
      expect(result.success).toBe(true);
      expect(result.data.authUri).toContain('https://login.salesforce.com');
      expect(result.data.authUri).toContain('client_id=test-client-id');
      expect(result.data.authUri).toContain('response_type=code');
      expect(result.data.message).toContain('IMPORTANT');
    });

    test('should handle OAuth callback successfully', async () => {
      // Arrange
      const mockManifest = {
        platforms: {
          salesforce: {
            name: 'salesforce',
            auth: {
              type: 'oauth',
              oauth: {}
            }
          }
        }
      };

      const mockUserInfo = {
        id: 'sf-user-123',
        name: 'SF User'
      };

      authCore.onOAuthCallback.mockResolvedValue({
        userInfo: mockUserInfo
      });

      jwt.generateJwt.mockReturnValue('mock-jwt-token-oauth');

      // Act
      const result = await doAuth.execute({
        connectorManifest: mockManifest,
        connectorName: 'salesforce',
        hostname: 'login.salesforce.com',
        callbackUri: 'https://redirect.com?code=test-code&state=test-state'
      });

      // Assert
      expect(result).toEqual({
        success: true,
        data: {
          jwtToken: 'mock-jwt-token-oauth',
          message: expect.stringContaining('IMPORTANT')
        }
      });
      expect(authCore.onOAuthCallback).toHaveBeenCalledWith({
        platform: 'salesforce',
        hostname: 'login.salesforce.com',
        callbackUri: 'https://redirect.com?code=test-code&state=test-state',
        query: expect.objectContaining({
          hostname: 'login.salesforce.com'
        })
      });
    });

    test('should return error when OAuth callback fails', async () => {
      // Arrange
      const mockManifest = {
        platforms: {
          salesforce: {
            name: 'salesforce',
            auth: {
              type: 'oauth',
              oauth: {}
            }
          }
        }
      };

      authCore.onOAuthCallback.mockResolvedValue({
        userInfo: null
      });

      // Act
      const result = await doAuth.execute({
        connectorManifest: mockManifest,
        connectorName: 'salesforce',
        hostname: 'login.salesforce.com',
        callbackUri: 'https://redirect.com?error=access_denied'
      });

      // Assert
      expect(result).toEqual({
        success: false,
        error: 'Authentication failed',
        errorDetails: 'User info not found'
      });
    });

    test('should include custom state in auth URI', async () => {
      // Arrange
      const mockManifest = {
        platforms: {
          customCRM: {
            name: 'customCRM',
            auth: {
              type: 'oauth',
              oauth: {
                authUrl: 'https://custom.com/oauth',
                clientId: 'custom-client-id',
                scope: '',
                customState: 'custom=state&other=value'
              }
            }
          }
        }
      };

      // Act
      const result = await doAuth.execute({
        connectorManifest: mockManifest,
        connectorName: 'customCRM'
      });

      // Assert
      expect(result.success).toBe(true);
      expect(result.data.authUri).toContain('state=custom=state&other=value');
    });
  });

  describe('error handling', () => {
    test('should handle authentication errors gracefully', async () => {
      // Arrange
      const mockManifest = {
        platforms: {
          testCRM: {
            name: 'testCRM',
            auth: { type: 'apiKey' }
          }
        }
      };

      authCore.onApiKeyLogin.mockRejectedValue(
        new Error('Invalid credentials')
      );

      // Act
      const result = await doAuth.execute({
        connectorManifest: mockManifest,
        connectorName: 'testCRM',
        hostname: 'test.crm.com',
        apiKey: 'bad-key'
      });

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid credentials');
      expect(result.errorDetails).toBeDefined();
    });

    test('should handle missing platform in manifest', async () => {
      // Arrange
      const mockManifest = {
        platforms: {}
      };

      // Act
      const result = await doAuth.execute({
        connectorManifest: mockManifest,
        connectorName: 'nonExistent',
        apiKey: 'test-key'
      });

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
});

