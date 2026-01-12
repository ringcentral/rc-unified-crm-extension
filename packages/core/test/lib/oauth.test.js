const moment = require('moment');

// Mock dependencies before requiring the module
jest.mock('client-oauth2');
jest.mock('../../models/userModel');
jest.mock('../../connector/registry');
jest.mock('../../models/dynamo/lockSchema', () => ({
  Lock: {
    create: jest.fn(),
    get: jest.fn()
  }
}));

const ClientOAuth2 = require('client-oauth2');
const { UserModel } = require('../../models/userModel');
const connectorRegistry = require('../../connector/registry');
const { getOAuthApp, checkAndRefreshAccessToken } = require('../../lib/oauth');

describe('oauth', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    delete process.env.USE_TOKEN_REFRESH_LOCK_PLATFORMS;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('getOAuthApp', () => {
    test('should create OAuth app with provided configuration', () => {
      const config = {
        clientId: 'test-client-id',
        clientSecret: 'test-client-secret',
        accessTokenUri: 'https://api.example.com/oauth/token',
        authorizationUri: 'https://api.example.com/oauth/authorize',
        redirectUri: 'https://app.example.com/callback',
        scopes: ['read', 'write']
      };

      const mockOAuthApp = { code: { getToken: jest.fn() } };
      ClientOAuth2.mockReturnValue(mockOAuthApp);

      const result = getOAuthApp(config);

      expect(ClientOAuth2).toHaveBeenCalledWith({
        clientId: config.clientId,
        clientSecret: config.clientSecret,
        accessTokenUri: config.accessTokenUri,
        authorizationUri: config.authorizationUri,
        redirectUri: config.redirectUri,
        scopes: config.scopes
      });
      expect(result).toBe(mockOAuthApp);
    });

    test('should handle missing optional parameters', () => {
      const config = {
        clientId: 'client-id',
        clientSecret: 'client-secret'
      };

      ClientOAuth2.mockReturnValue({});

      getOAuthApp(config);

      expect(ClientOAuth2).toHaveBeenCalledWith({
        clientId: 'client-id',
        clientSecret: 'client-secret',
        accessTokenUri: undefined,
        authorizationUri: undefined,
        redirectUri: undefined,
        scopes: undefined
      });
    });
  });

  describe('checkAndRefreshAccessToken', () => {
    const mockOAuthApp = {
      createToken: jest.fn()
    };

    const createMockUser = (overrides = {}) => ({
      id: 'user-123',
      platform: 'testPlatform',
      accessToken: 'old-access-token',
      refreshToken: 'old-refresh-token',
      tokenExpiry: moment().subtract(1, 'minute').toDate(), // Expired
      save: jest.fn().mockResolvedValue(true),
      ...overrides
    });

    test('should return user unchanged if token is not expired', async () => {
      const user = createMockUser({
        tokenExpiry: moment().add(10, 'minutes').toDate() // Not expired
      });

      connectorRegistry.getConnector.mockReturnValue({});

      const result = await checkAndRefreshAccessToken(mockOAuthApp, user);

      expect(result).toBe(user);
      expect(mockOAuthApp.createToken).not.toHaveBeenCalled();
    });

    test('should refresh token when expired', async () => {
      const user = createMockUser();
      const newExpiry = moment().add(1, 'hour').toDate();

      connectorRegistry.getConnector.mockReturnValue({});

      const mockToken = {
        refresh: jest.fn().mockResolvedValue({
          accessToken: 'new-access-token',
          refreshToken: 'new-refresh-token',
          expires: newExpiry
        })
      };
      mockOAuthApp.createToken.mockReturnValue(mockToken);

      const result = await checkAndRefreshAccessToken(mockOAuthApp, user);

      expect(mockOAuthApp.createToken).toHaveBeenCalledWith(
        'old-access-token',
        'old-refresh-token'
      );
      expect(mockToken.refresh).toHaveBeenCalled();
      expect(user.accessToken).toBe('new-access-token');
      expect(user.refreshToken).toBe('new-refresh-token');
      expect(user.save).toHaveBeenCalled();
    });

    test('should delegate to platform-specific refresh if available', async () => {
      const user = createMockUser({
        platform: 'bullhorn'
      });
      const platformRefreshedUser = { ...user, accessToken: 'bullhorn-token' };

      connectorRegistry.getConnector.mockReturnValue({
        checkAndRefreshAccessToken: jest.fn().mockResolvedValue(platformRefreshedUser)
      });

      const result = await checkAndRefreshAccessToken(mockOAuthApp, user);

      expect(result).toBe(platformRefreshedUser);
      expect(mockOAuthApp.createToken).not.toHaveBeenCalled();
    });

    test('should refresh token even if within buffer time (2 minutes)', async () => {
      const user = createMockUser({
        tokenExpiry: moment().add(1.5, 'minutes').toDate() // Within buffer
      });

      connectorRegistry.getConnector.mockReturnValue({});

      const mockToken = {
        refresh: jest.fn().mockResolvedValue({
          accessToken: 'new-token',
          refreshToken: 'new-refresh',
          expires: moment().add(1, 'hour').toDate()
        })
      };
      mockOAuthApp.createToken.mockReturnValue(mockToken);

      await checkAndRefreshAccessToken(mockOAuthApp, user);

      expect(mockToken.refresh).toHaveBeenCalled();
    });

    test('should not refresh if missing required tokens', async () => {
      const user = createMockUser({
        accessToken: null,
        refreshToken: null,
        tokenExpiry: moment().subtract(1, 'minute').toDate()
      });

      connectorRegistry.getConnector.mockReturnValue({});

      const result = await checkAndRefreshAccessToken(mockOAuthApp, user);

      expect(result).toBe(user);
      expect(mockOAuthApp.createToken).not.toHaveBeenCalled();
    });

    describe('with token refresh lock', () => {
      beforeEach(() => {
        process.env.USE_TOKEN_REFRESH_LOCK_PLATFORMS = 'testPlatform,otherPlatform';
      });

      test('should create lock and refresh token successfully', async () => {
        const { Lock } = require('../../models/dynamo/lockSchema');
        const user = createMockUser();
        const newExpiry = moment().add(1, 'hour').toDate();

        const mockLock = { delete: jest.fn().mockResolvedValue(true) };
        Lock.create.mockResolvedValue(mockLock);

        connectorRegistry.getConnector.mockReturnValue({});

        const mockToken = {
          refresh: jest.fn().mockResolvedValue({
            accessToken: 'new-token',
            refreshToken: 'new-refresh',
            expires: newExpiry
          })
        };
        mockOAuthApp.createToken.mockReturnValue(mockToken);

        await checkAndRefreshAccessToken(mockOAuthApp, user);

        expect(Lock.create).toHaveBeenCalledWith(
          expect.objectContaining({
            userId: 'user-123',
            ttl: expect.any(Number)
          }),
          { overwrite: false }
        );
        expect(mockToken.refresh).toHaveBeenCalled();
        expect(mockLock.delete).toHaveBeenCalled();
      });

      test('should wait for existing lock and fetch user from DB after lock released', async () => {
        jest.resetModules();
        const { Lock } = require('../../models/dynamo/lockSchema');
        const user = createMockUser();

        // Simulate lock already exists
        const conditionalError = new Error('Lock exists');
        conditionalError.name = 'ConditionalCheckFailedException';
        Lock.create.mockReset();
        Lock.get.mockReset();
        Lock.create.mockRejectedValue(conditionalError);

        // Lock exists but not expired (ttl > now), then gets released
        const existingLock = { 
          ttl: moment().add(30, 'seconds').unix(),
          delete: jest.fn().mockResolvedValue(true)
        };
        Lock.get.mockResolvedValueOnce(existingLock)
            .mockResolvedValueOnce(null); // Lock released

        const refreshedUser = { ...user, accessToken: 'refreshed-by-other-process' };
        UserModel.findByPk.mockResolvedValue(refreshedUser);

        connectorRegistry.getConnector.mockReturnValue({});

        const result = await checkAndRefreshAccessToken(mockOAuthApp, user, 5);

        // Verify the lock polling was performed
        expect(Lock.get).toHaveBeenCalled();
        // The result should have the user data (refreshed by another process)
        expect(result).toBeDefined();
        expect(result.id).toBe(user.id);
      });

      test('should handle expired lock by deleting and creating new one', async () => {
        const { Lock } = require('../../models/dynamo/lockSchema');
        const user = createMockUser();
        const newExpiry = moment().add(1, 'hour').toDate();

        // First create fails with conditional exception
        const conditionalError = new Error('Lock exists');
        conditionalError.name = 'ConditionalCheckFailedException';
        
        // Existing lock is expired (ttl < now)
        const expiredLock = {
          ttl: moment().subtract(10, 'seconds').unix(),
          delete: jest.fn().mockResolvedValue(true)
        };
        
        // Second create succeeds after deleting expired lock
        const newLock = { delete: jest.fn().mockResolvedValue(true) };
        
        Lock.create
          .mockRejectedValueOnce(conditionalError)
          .mockResolvedValueOnce(newLock);
        Lock.get.mockResolvedValue(expiredLock);

        connectorRegistry.getConnector.mockReturnValue({});

        const mockToken = {
          refresh: jest.fn().mockResolvedValue({
            accessToken: 'new-token',
            refreshToken: 'new-refresh',
            expires: newExpiry
          })
        };
        mockOAuthApp.createToken.mockReturnValue(mockToken);

        await checkAndRefreshAccessToken(mockOAuthApp, user);

        expect(expiredLock.delete).toHaveBeenCalled();
        expect(newLock.delete).toHaveBeenCalled();
      });

      test('should delete lock if refresh fails', async () => {
        jest.resetModules();
        const { Lock } = require('../../models/dynamo/lockSchema');
        const user = createMockUser();

        const mockLock = { delete: jest.fn().mockResolvedValue(true) };
        Lock.create.mockReset();
        Lock.get.mockReset();
        Lock.create.mockResolvedValue(mockLock);

        connectorRegistry.getConnector.mockReturnValue({});

        const mockToken = {
          refresh: jest.fn().mockRejectedValue(new Error('Refresh failed'))
        };
        mockOAuthApp.createToken.mockReturnValue(mockToken);

        await checkAndRefreshAccessToken(mockOAuthApp, user);

        expect(mockLock.delete).toHaveBeenCalled();
      });

      test('should throw on lock timeout', async () => {
        jest.resetModules();
        const { Lock } = require('../../models/dynamo/lockSchema');
        const user = createMockUser();

        const conditionalError = new Error('Lock exists');
        conditionalError.name = 'ConditionalCheckFailedException';
        Lock.create.mockReset();
        Lock.get.mockReset();
        Lock.create.mockRejectedValue(conditionalError);

        // Lock never gets released (ttl is in the future, not expired)
        const permanentLock = { 
          ttl: moment().add(1, 'hour').unix(),
          delete: jest.fn().mockResolvedValue(true)
        };
        Lock.get.mockResolvedValue(permanentLock);

        connectorRegistry.getConnector.mockReturnValue({});

        await expect(
          checkAndRefreshAccessToken(mockOAuthApp, user, 1) // 1 second timeout
        ).rejects.toThrow('Token lock timeout');
      }, 10000);

      test('should rethrow non-conditional errors', async () => {
        const { Lock } = require('../../models/dynamo/lockSchema');
        const user = createMockUser();

        const randomError = new Error('Database connection failed');
        Lock.create.mockRejectedValue(randomError);

        connectorRegistry.getConnector.mockReturnValue({});

        await expect(
          checkAndRefreshAccessToken(mockOAuthApp, user)
        ).rejects.toThrow('Database connection failed');
      });
    });
  });
});

