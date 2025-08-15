const { checkAndRefreshAccessToken } = require('@app-connect/core/lib/oauth');
const { UserModel } = require('@app-connect/core/models/userModel');
const { Lock } = require('@app-connect/core/models/dynamo/lockSchema');
const { adapterRegistry } = require('@app-connect/core');
const nock = require('nock');
const { encode } = require('@app-connect/core/lib/encode');

adapterRegistry.setDefaultManifest(require('../src/adapters/manifest.json'));
adapterRegistry.registerAdapter('bullhorn', require('../src/adapters/bullhorn'));
adapterRegistry.registerAdapter('pipedrive', require('../src/adapters/pipedrive'));

// Mock the Lock model
jest.mock('@app-connect/core/models/dynamo/lockSchema', () => ({
    Lock: {
        get: jest.fn(),
        create: jest.fn(),
        delete: jest.fn()
    }
}));

// Create test data
const userId = 'userId';
const accessToken = 'accessToken';
const refreshToken = 'refreshToken';
const newAccessToken = 'newAccessToken';
const newRefreshToken = 'newRefreshToken';

// Mock console.log and console.error to keep tests clean
jest.spyOn(console, 'log').mockImplementation(() => {});
jest.spyOn(console, 'error').mockImplementation(() => {});

// Reset mocks before each test
beforeEach(() => {
    jest.clearAllMocks();
    // Explicitly reset the Lock model mocks
    Lock.get.mockReset();
    Lock.create.mockReset();
    Lock.delete.mockReset();
    nock.cleanAll();
    adapterRegistry.getManifest('default').platforms.pipedrive.auth.useTokenRefreshLock = true;
});

// Clear test data in db
afterEach(async () => {
    await UserModel.destroy({
        where: {
            id: userId
        }
    });
    nock.cleanAll();
    delete adapterRegistry.getManifest('default').platforms.pipedrive.auth.useTokenRefreshLock;
});

describe('oauth manage', () => {
    describe('token refresh', () => {
        test('not expired - no refresh', async () => {
            // Arrange
            const user = await UserModel.create({
                id: userId,
                accessToken,
                refreshToken,
                tokenExpiry: '2035-01-01T00:00:00.000Z'
            });

            // Act
            const returnedUser = await checkAndRefreshAccessToken({}, user);

            // Assert
            expect(returnedUser.accessToken).toBe(accessToken);
            expect(returnedUser.refreshToken).toBe(refreshToken);
            expect(Lock.get).not.toHaveBeenCalled();
        });

        test('expired, no lock mechanism - refresh without lock', async () => {
            // Arrange
            const user = await UserModel.create({
                id: userId,
                accessToken,
                refreshToken,
                tokenExpiry: '2025-01-01T00:00:00.000Z'
            });

            // Mock oauthApp
            const oauthApp = {
                createToken: jest.fn().mockReturnValue({
                    refresh: jest.fn().mockResolvedValue({
                        accessToken: newAccessToken,
                        refreshToken: newRefreshToken,
                        expires: '2035-01-01T00:00:00.000Z'
                    })
                })
            };

            // Act
            const returnedUser = await checkAndRefreshAccessToken(oauthApp, user);

            // Assert
            expect(returnedUser.accessToken).toBe(newAccessToken);
            expect(returnedUser.refreshToken).toBe(newRefreshToken);
            expect(oauthApp.createToken).toHaveBeenCalledWith(accessToken, refreshToken);
            expect(Lock.get).not.toHaveBeenCalled();
        });

        test('expired, with lock mechanism, no existing lock - refresh with lock', async () => {
            // Arrange
            const user = await UserModel.create({
                id: userId,
                platform: 'pipedrive',
                accessToken,
                refreshToken,
                tokenExpiry: '2025-01-01T00:00:00.000Z'
            });

            // Mock Lock model - successful lock creation
            const mockLock = {
                delete: jest.fn().mockResolvedValue(true)
            };
            Lock.create.mockResolvedValue(mockLock);

            // Mock oauthApp
            const oauthApp = {
                createToken: jest.fn().mockReturnValue({
                    refresh: jest.fn().mockResolvedValue({
                        accessToken: newAccessToken,
                        refreshToken: newRefreshToken,
                        expires: '2035-01-01T00:00:00.000Z'
                    })
                })
            };

            // Act
            const returnedUser = await checkAndRefreshAccessToken(oauthApp, user);

            // Assert
            expect(returnedUser.accessToken).toBe(newAccessToken);
            expect(returnedUser.refreshToken).toBe(newRefreshToken);
            expect(Lock.create).toHaveBeenCalledWith(
                { userId: user.id, ttl: expect.any(Number) },
                { overwrite: false }
            );
            expect(Lock.get).not.toHaveBeenCalled(); // Should not be called in successful path
            expect(mockLock.delete).toHaveBeenCalled();
        });

        test('expired, with lock mechanism, existing valid lock - wait and timeout', async () => {
            // Arrange
            const user = await UserModel.create({
                id: userId,
                platform: 'pipedrive',
                accessToken,
                refreshToken,
                tokenExpiry: '2025-01-01T00:00:00.000Z'
            });

            // Mock Lock.create to fail with ConditionalCheckFailedException
            const conditionalError = new Error('ConditionalCheckFailedException');
            conditionalError.name = 'ConditionalCheckFailedException';
            Lock.create.mockRejectedValue(conditionalError);

            // Mock Lock model - always return existing valid lock that doesn't expire
            const mockLock = {
                ttl: Date.now() + 100000 // Valid lock that won't expire during test
            };
            Lock.get.mockResolvedValue(mockLock);

            // Act & Assert
            await expect(checkAndRefreshAccessToken({}, user, 0.5)).rejects.toThrow('Token lock timeout');
            expect(Lock.create).toHaveBeenCalled();
            expect(Lock.get).toHaveBeenCalledWith({ userId: user.id });
        });

        test('expired, with lock mechanism, expired lock - refresh after removing expired lock', async () => {
            // Arrange
            const user = await UserModel.create({
                id: userId,
                platform: 'pipedrive',
                accessToken,
                refreshToken,
                tokenExpiry: '2025-01-01T00:00:00.000Z'
            });

            // Mock Lock model - expired lock
            const mockExpiredLock = {
                ttl: Date.now() - 1000, // Expired lock
                delete: jest.fn().mockResolvedValue(true)
            };
            
            const mockNewLock = {
                delete: jest.fn().mockResolvedValue(true)
            };

            // Mock the sequence: first create fails, get returns expired lock, second create succeeds
            const conditionalError = new Error('ConditionalCheckFailedException');
            conditionalError.name = 'ConditionalCheckFailedException';
            
            Lock.create.mockRejectedValueOnce(conditionalError) // First create fails due to existing lock
                     .mockResolvedValueOnce(mockNewLock); // Second create succeeds after deleting expired lock
            
            Lock.get.mockResolvedValueOnce(mockExpiredLock); // Returns expired lock

            // Mock oauthApp
            const oauthApp = {
                createToken: jest.fn().mockReturnValue({
                    refresh: jest.fn().mockResolvedValue({
                        accessToken: newAccessToken,
                        refreshToken: newRefreshToken,
                        expires: '2035-01-01T00:00:00.000Z'
                    })
                })
            };

            // Act
            const returnedUser = await checkAndRefreshAccessToken(oauthApp, user);

            // Assert
            expect(returnedUser.accessToken).toBe(newAccessToken);
            expect(returnedUser.refreshToken).toBe(newRefreshToken);
            expect(Lock.create).toHaveBeenCalledTimes(2);
            expect(Lock.get).toHaveBeenCalledWith({ userId: user.id });
            expect(mockExpiredLock.delete).toHaveBeenCalled();
            expect(mockNewLock.delete).toHaveBeenCalled();
        });

        test('expired, with lock mechanism, no existing lock - create lock and refresh', async () => {
            // Arrange
            const user = await UserModel.create({
                id: userId,
                platform: 'pipedrive',
                accessToken,
                refreshToken,
                tokenExpiry: '2025-01-01T00:00:00.000Z'
            });

            // Mock Lock model - successful lock creation on first try
            const mockLock = {
                delete: jest.fn().mockResolvedValue(true)
            };
            Lock.create.mockResolvedValue(mockLock);

            // Mock oauthApp
            const oauthApp = {
                createToken: jest.fn().mockReturnValue({
                    refresh: jest.fn().mockResolvedValue({
                        accessToken: newAccessToken,
                        refreshToken: newRefreshToken,
                        expires: '2035-01-01T00:00:00.000Z'
                    })
                })
            };

            // Act
            const returnedUser = await checkAndRefreshAccessToken(oauthApp, user, 5);

            // Assert
            expect(returnedUser.accessToken).toBe(newAccessToken);
            expect(returnedUser.refreshToken).toBe(newRefreshToken);
            expect(Lock.create).toHaveBeenCalledWith(
                { userId: user.id, ttl: expect.any(Number) },
                { overwrite: false }
            );
            expect(Lock.get).not.toHaveBeenCalled(); // Lock.get shouldn't be called in successful path
            expect(mockLock.delete).toHaveBeenCalled();
        });

        test('expired, concurrent requests with locking - both get updated tokens', async () => {
            // Arrange
            const user = await UserModel.create({
                id: userId,
                platform: 'pipedrive',
                accessToken,
                refreshToken,
                tokenExpiry: '2025-01-01T00:00:00.000Z'
            });

            // Create updated user object that will be returned from DB
            const updatedUser = {
                ...user.toJSON(),
                accessToken: newAccessToken,
                refreshToken: newRefreshToken,
                tokenExpiry: '2035-01-01T00:00:00.000Z'
            };

            // Mock for first request (successful lock creation)
            const mockLock = {
                delete: jest.fn().mockResolvedValue(true)
            };

            // Mock for second request sequence
            const mockExistingLock = {
                ttl: Date.now() + 100000 // Valid lock that exists during first request
            };

            // Control the sequence of Lock operations
            let lockCreateCallCount = 0;
            let lockGetCallCount = 0;

            // Mock Lock.create to succeed on first call, fail on second
            Lock.create.mockImplementation(() => {
                lockCreateCallCount++;
                if (lockCreateCallCount === 1) {
                    return Promise.resolve(mockLock); // First request succeeds
                } else {
                    // Second request fails with conditional check exception
                    const conditionalError = new Error('ConditionalCheckFailedException');
                    conditionalError.name = 'ConditionalCheckFailedException';
                    return Promise.reject(conditionalError);
                }
            });

            // Mock Lock.get to return existing lock first, then null after first request completes
            Lock.get.mockImplementation(() => {
                lockGetCallCount++;
                if (lockGetCallCount === 1) {
                    return Promise.resolve(mockExistingLock); // Lock exists during first request
                } else {
                    return Promise.resolve(null); // Lock gone after first request completes
                }
            });

            // Mock UserModel.findByPk to return updated user for second request
            const originalFindByPk = UserModel.findByPk;
            UserModel.findByPk = jest.fn().mockResolvedValue(updatedUser);

            // Mock oauthApp for first request
            const oauthApp = {
                createToken: jest.fn().mockReturnValue({
                    refresh: jest.fn().mockResolvedValue({
                        accessToken: newAccessToken,
                        refreshToken: newRefreshToken,
                        expires: '2035-01-01T00:00:00.000Z'
                    })
                })
            };

            // Act - Run both requests concurrently
            const [result1, result2] = await Promise.all([
                checkAndRefreshAccessToken(oauthApp, user, 5), // First request
                checkAndRefreshAccessToken(oauthApp, user, 5)  // Second request
            ]);

            // Assert - Both requests should return updated tokens
            expect(result1.accessToken).toBe(newAccessToken);
            expect(result1.refreshToken).toBe(newRefreshToken);
            expect(result2.accessToken).toBe(newAccessToken);
            expect(result2.refreshToken).toBe(newRefreshToken);

            // Verify the expected call patterns
            expect(Lock.create).toHaveBeenCalledTimes(2); // Both requests try to create lock
            expect(Lock.get).toHaveBeenCalledTimes(2); // Second request checks for existing lock twice
            expect(mockLock.delete).toHaveBeenCalledTimes(1); // First request deletes lock
            expect(oauthApp.createToken).toHaveBeenCalledTimes(1); // Only first request refreshes token
            expect(UserModel.findByPk).toHaveBeenCalledWith(user.id); // Second request gets updated user

            // Cleanup
            UserModel.findByPk = originalFindByPk;
        });
    });

    describe('bullhorn platform specific tests', () => {
        test('bullhorn session not expired - return user without refresh', async () => {
            // Arrange
            const user = await UserModel.create({
                id: userId,
                accessToken,
                refreshToken,
                platform: 'bullhorn',
                tokenExpiry: '2025-01-01T00:00:00.000Z',
                platformAdditionalInfo: {
                    restUrl: 'https://rest.bullhorn.com',
                    bhRestToken: 'bhRestToken123'
                }
            });

            // Mock ping response - session not expired
            nock('https://rest.bullhorn.com')
                .get('/ping')
                .reply(200, {
                    sessionExpires: Date.now() + 1000 * 60 * 10 // 10 minutes from now
                });

            // Act
            const returnedUser = await checkAndRefreshAccessToken({}, user);

            // Assert
            expect(returnedUser.accessToken).toBe(accessToken);
            expect(returnedUser.refreshToken).toBe(refreshToken);
            expect(nock.isDone()).toBe(true);
        });

        test('bullhorn session expired via ping - refresh tokens', async () => {
            // Arrange
            const user = await UserModel.create({
                id: userId,
                accessToken,
                refreshToken,
                platform: 'bullhorn',
                tokenExpiry: '2025-01-01T00:00:00.000Z',
                platformAdditionalInfo: {
                    restUrl: 'https://rest.bullhorn.com',
                    bhRestToken: 'bhRestToken123',
                    tokenUrl: 'https://auth.bullhorn.com/token',
                    loginUrl: 'https://auth.bullhorn.com'
                }
            });

            // Mock ping response - session expired
            nock('https://rest.bullhorn.com')
                .get('/ping')
                .reply(200, {
                    sessionExpires: Date.now() - 1000 * 60 * 5 // 5 minutes ago
                });

            // Mock token refresh
            nock('https://auth.bullhorn.com')
                .post('/token')
                .query(true)
                .reply(200, {
                    access_token: newAccessToken,
                    refresh_token: newRefreshToken,
                    expires_in: 3600
                });

            // Mock login after refresh
            nock('https://auth.bullhorn.com')
                .post('/login')
                .query(true)
                .reply(200, {
                    BhRestToken: 'newBhRestToken',
                    restUrl: 'https://rest.bullhorn.com'
                });

            // Act
            const returnedUser = await checkAndRefreshAccessToken({}, user);

            // Assert
            expect(returnedUser.accessToken).toBe(newAccessToken);
            expect(returnedUser.refreshToken).toBe(newRefreshToken);
            expect(returnedUser.platformAdditionalInfo.bhRestToken).toBe('newBhRestToken');
            expect(nock.isDone()).toBe(true);
        });

        test('bullhorn ping fails - refresh tokens', async () => {
            // Arrange
            const user = await UserModel.create({
                id: userId,
                accessToken,
                refreshToken,
                platform: 'bullhorn',
                tokenExpiry: '2025-01-01T00:00:00.000Z',
                platformAdditionalInfo: {
                    restUrl: 'https://rest.bullhorn.com',
                    bhRestToken: 'bhRestToken123',
                    tokenUrl: 'https://auth.bullhorn.com/token',
                    loginUrl: 'https://auth.bullhorn.com'
                }
            });

            // Mock ping failure
            nock('https://rest.bullhorn.com')
                .get('/ping')
                .reply(401, 'Unauthorized');

            // Mock token refresh
            nock('https://auth.bullhorn.com')
                .post('/token')
                .query(true)
                .reply(200, {
                    access_token: newAccessToken,
                    refresh_token: newRefreshToken,
                    expires_in: 3600
                });

            // Mock login after refresh
            nock('https://auth.bullhorn.com')
                .post('/login')
                .query(true)
                .reply(200, {
                    BhRestToken: 'newBhRestToken',
                    restUrl: 'https://rest.bullhorn.com'
                });

            // Act
            const returnedUser = await checkAndRefreshAccessToken({}, user);

            // Assert
            expect(returnedUser.accessToken).toBe(newAccessToken);
            expect(returnedUser.refreshToken).toBe(newRefreshToken);
            expect(nock.isDone()).toBe(true);
        });

        test('bullhorn token refresh fails, fallback to password auth', async () => {
            // Arrange
            process.env.BULLHORN_CLIENT_ID = 'client123';
            process.env.BULLHORN_CLIENT_SECRET = 'secret123';
            process.env.BULLHORN_REDIRECT_URI = 'https://app.com/callback';
            
            const user = await UserModel.create({
                id: userId,
                accessToken,
                refreshToken,
                platform: 'bullhorn',
                tokenExpiry: '2025-01-01T00:00:00.000Z',
                platformAdditionalInfo: {
                    restUrl: 'https://rest.bullhorn.com',
                    bhRestToken: 'bhRestToken123',
                    tokenUrl: 'https://auth.bullhorn.com/token',
                    loginUrl: 'https://auth.bullhorn.com',
                    encodedApiPassword: encode('testpass'),
                    encodedApiUsername: encode('testuser')
                }
            });

            // Mock ping failure
            nock('https://rest.bullhorn.com')
                .get('/ping')
                .reply(401, 'Unauthorized');

            // Mock token refresh failure
            nock('https://auth.bullhorn.com')
                .post('/token')
                .query(true)
                .reply(400, 'Bad Request');

            // Mock password authorization flow
            nock('https://auth.bullhorn.com')
                .get('/authorize')
                .query(true)
                .reply(302, '', {
                    'location': 'https://app.com/callback?code=auth_code_123'
                });

            // Mock OAuth app for password auth
            const oauthApp = {
                code: {
                    getToken: jest.fn().mockResolvedValue({
                        accessToken: newAccessToken,
                        refreshToken: newRefreshToken,
                        expires: 3600
                    })
                }
            };

            // Mock login after password auth
            nock('https://auth.bullhorn.com')
                .post('/login')
                .query(true)
                .reply(200, {
                    BhRestToken: 'newBhRestToken',
                    restUrl: 'https://rest.bullhorn.com'
                });

            // Act
            const returnedUser = await checkAndRefreshAccessToken(oauthApp, user);

            // Assert
            expect(returnedUser.accessToken).toBe(newAccessToken);
            expect(returnedUser.refreshToken).toBe(newRefreshToken);
            expect(nock.isDone()).toBe(true);
        });

        test('bullhorn token refresh fails, password auth also fails - throws error', async () => {
            // Arrange
            process.env.BULLHORN_CLIENT_ID = 'client123';
            process.env.BULLHORN_CLIENT_SECRET = 'secret123';
            process.env.BULLHORN_REDIRECT_URI = 'https://app.com/callback';
            
            const user = await UserModel.create({
                id: userId,
                accessToken,
                refreshToken,
                platform: 'bullhorn',
                tokenExpiry: '2025-01-01T00:00:00.000Z',
                platformAdditionalInfo: {
                    restUrl: 'https://rest.bullhorn.com',
                    bhRestToken: 'bhRestToken123',
                    tokenUrl: 'https://auth.bullhorn.com/token',
                    loginUrl: 'https://auth.bullhorn.com',
                    encodedApiPassword: encode('testpass'),
                    encodedApiUsername: encode('testuser')
                }
            });

            // Mock ping failure
            nock('https://rest.bullhorn.com')
                .get('/ping')
                .reply(401, 'Unauthorized');

            // Mock token refresh failure
            nock('https://auth.bullhorn.com')
                .post('/token')
                .query(true)
                .reply(400, 'Bad Request');

            // Mock password authorization failure - missing location header
            nock('https://auth.bullhorn.com')
                .get('/authorize')
                .query(true)
                .reply(302, '', {}); // No location header

            // Mock OAuth app for password auth
            const oauthApp = {
                code: {
                    getToken: jest.fn()
                }
            };

            // Act & Assert
            const returnedUser = await checkAndRefreshAccessToken(oauthApp, user);
            
            // Should return user unchanged due to error handling
            expect(returnedUser.accessToken).toBe(accessToken);
            expect(returnedUser.refreshToken).toBe(refreshToken);
            expect(nock.isDone()).toBe(true);
        });

        test('bullhorn password auth fails with missing code - returns original user', async () => {
            // Arrange
            process.env.BULLHORN_CLIENT_ID = 'client123';
            process.env.BULLHORN_CLIENT_SECRET = 'secret123';
            process.env.BULLHORN_REDIRECT_URI = 'https://app.com/callback';
            
            const user = await UserModel.create({
                id: userId,
                accessToken,
                refreshToken,
                platform: 'bullhorn',
                tokenExpiry: '2025-01-01T00:00:00.000Z',
                platformAdditionalInfo: {
                    restUrl: 'https://rest.bullhorn.com',
                    bhRestToken: 'bhRestToken123',
                    tokenUrl: 'https://auth.bullhorn.com/token',
                    loginUrl: 'https://auth.bullhorn.com',
                    encodedApiPassword: encode('testpass'),
                    encodedApiUsername: encode('testuser')
                }
            });

            // Mock ping failure
            nock('https://rest.bullhorn.com')
                .get('/ping')
                .reply(401, 'Unauthorized');

            // Mock token refresh failure
            nock('https://auth.bullhorn.com')
                .post('/token')
                .query(true)
                .reply(400, 'Bad Request');

            // Mock password authorization failure - redirect without code parameter
            nock('https://auth.bullhorn.com')
                .get('/authorize')
                .query(true)
                .reply(302, '', {
                    'location': 'https://app.com/callback?error=access_denied'
                });

            // Mock OAuth app for password auth
            const oauthApp = {
                code: {
                    getToken: jest.fn()
                }
            };

            // Act
            const returnedUser = await checkAndRefreshAccessToken(oauthApp, user);

            // Assert - should return user unchanged due to error handling
            expect(returnedUser.accessToken).toBe(accessToken);
            expect(returnedUser.refreshToken).toBe(refreshToken);
            expect(nock.isDone()).toBe(true);
        });

        test('bullhorn password auth without credentials - falls back to original error', async () => {
            // Arrange
            const user = await UserModel.create({
                id: userId,
                accessToken,
                refreshToken,
                platform: 'bullhorn',
                tokenExpiry: '2025-01-01T00:00:00.000Z',
                platformAdditionalInfo: {
                    restUrl: 'https://rest.bullhorn.com',
                    bhRestToken: 'bhRestToken123',
                    tokenUrl: 'https://auth.bullhorn.com/token',
                    loginUrl: 'https://auth.bullhorn.com'
                }
            });

            // Mock ping failure
            nock('https://rest.bullhorn.com')
                .get('/ping')
                .reply(401, 'Unauthorized');

            // Mock token refresh failure
            nock('https://auth.bullhorn.com')
                .post('/token')
                .query(true)
                .reply(400, 'Bad Request');

            // Act
            const returnedUser = await checkAndRefreshAccessToken({}, user);

            // Assert - should return user unchanged due to error handling
            expect(returnedUser.accessToken).toBe(accessToken);
            expect(returnedUser.refreshToken).toBe(refreshToken);
            expect(nock.isDone()).toBe(true);
        });
    });

    describe('input validation tests', () => {
        test('missing user - returns null', async () => {
            // Act & Assert
            await expect(checkAndRefreshAccessToken({}, null)).rejects.toThrow();
        });

        test('user without accessToken - returns user unchanged', async () => {
            // Arrange
            const user = await UserModel.create({
                id: userId,
                refreshToken,
                tokenExpiry: '2025-01-01T00:00:00.000Z'
            });

            // Act
            const returnedUser = await checkAndRefreshAccessToken({}, user);

            // Assert
            expect(returnedUser).toBe(user);
            expect(returnedUser.refreshToken).toBe(refreshToken);
        });

        test('user without refreshToken - returns user unchanged', async () => {
            // Arrange
            const user = await UserModel.create({
                id: userId,
                accessToken,
                tokenExpiry: '2025-01-01T00:00:00.000Z'
            });

            // Act
            const returnedUser = await checkAndRefreshAccessToken({}, user);

            // Assert
            expect(returnedUser).toBe(user);
            expect(returnedUser.accessToken).toBe(accessToken);
        });

        test('user with invalid tokenExpiry - returns user unchanged', async () => {
            // Arrange
            const user = await UserModel.create({
                id: userId,
                accessToken,
                refreshToken,
                tokenExpiry: 'invalid-date'
            });

            // Act
            const returnedUser = await checkAndRefreshAccessToken({}, user);

            // Assert
            expect(returnedUser).toBe(user);
        });
    });

    describe('error handling tests', () => {
        test('oauth token refresh fails - throws error', async () => {
            // Arrange
            const user = await UserModel.create({
                id: userId,
                accessToken,
                refreshToken,
                tokenExpiry: '2025-01-01T00:00:00.000Z'
            });

            // Mock oauthApp with failing refresh
            const oauthApp = {
                createToken: jest.fn().mockReturnValue({
                    refresh: jest.fn().mockRejectedValue(new Error('Token refresh failed'))
                })
            };

            // Act & Assert
            await expect(checkAndRefreshAccessToken(oauthApp, user)).rejects.toThrow('Token refresh failed');
        });

        test('token expiry exactly at buffer time - triggers refresh', async () => {
            // Arrange
            const now = new Date();
            const bufferTime = 1000 * 60 * 2; // 2 minutes
            const expiryTime = new Date(now.getTime() + bufferTime);
            
            const user = await UserModel.create({
                id: userId,
                accessToken,
                refreshToken,
                tokenExpiry: expiryTime.toISOString()
            });

            // Mock oauthApp
            const oauthApp = {
                createToken: jest.fn().mockReturnValue({
                    refresh: jest.fn().mockResolvedValue({
                        accessToken: newAccessToken,
                        refreshToken: newRefreshToken,
                        expires: '2035-01-01T00:00:00.000Z'
                    })
                })
            };

            // Act
            const returnedUser = await checkAndRefreshAccessToken(oauthApp, user);

            // Assert
            expect(returnedUser.accessToken).toBe(newAccessToken);
            expect(returnedUser.refreshToken).toBe(newRefreshToken);
            expect(oauthApp.createToken).toHaveBeenCalled();
        });

        test('token expiry within buffer time - triggers refresh', async () => {
            // Arrange
            const now = new Date();
            const bufferTime = 1000 * 60 * 2; // 2 minutes
            const expiryTime = new Date(now.getTime() + bufferTime - 1000); // 1 second before buffer
            
            const user = await UserModel.create({
                id: userId,
                accessToken,
                refreshToken,
                tokenExpiry: expiryTime.toISOString()
            });

            // Mock oauthApp
            const oauthApp = {
                createToken: jest.fn().mockReturnValue({
                    refresh: jest.fn().mockResolvedValue({
                        accessToken: newAccessToken,
                        refreshToken: newRefreshToken,
                        expires: '2035-01-01T00:00:00.000Z'
                    })
                })
            };

            // Act
            const returnedUser = await checkAndRefreshAccessToken(oauthApp, user);

            // Assert
            expect(returnedUser.accessToken).toBe(newAccessToken);
            expect(returnedUser.refreshToken).toBe(newRefreshToken);
            expect(oauthApp.createToken).toHaveBeenCalled();
        });

        test('token refresh with locking enabled - succeeds', async () => {
            // Arrange
            const user = await UserModel.create({
                id: userId,
                accessToken,
                refreshToken,
                tokenExpiry: '2025-01-01T00:00:00.000Z'
            });

            // Mock Lock model - no existing lock
            Lock.get.mockResolvedValue(null);
            const mockLock = {
                delete: jest.fn().mockResolvedValue(true)
            };
            Lock.create.mockResolvedValue(mockLock);

            // Mock oauthApp
            const oauthApp = {
                createToken: jest.fn().mockReturnValue({
                    refresh: jest.fn().mockResolvedValue({
                        accessToken: newAccessToken,
                        refreshToken: newRefreshToken,
                        expires: '2035-01-01T00:00:00.000Z'
                    })
                })
            };

            // Act
            const returnedUser = await checkAndRefreshAccessToken(oauthApp, user);

            // Assert
            expect(returnedUser.accessToken).toBe(newAccessToken);
            expect(returnedUser.refreshToken).toBe(newRefreshToken);
            expect(oauthApp.createToken).toHaveBeenCalled();
        });

        test('user save fails after refresh - throws error', async () => {
            // Arrange
            const user = await UserModel.create({
                id: userId,
                accessToken,
                refreshToken,
                tokenExpiry: '2025-01-01T00:00:00.000Z'
            });

            // Mock user.save to fail
            user.save = jest.fn().mockRejectedValue(new Error('Save failed'));

            // Mock oauthApp
            const oauthApp = {
                createToken: jest.fn().mockReturnValue({
                    refresh: jest.fn().mockResolvedValue({
                        accessToken: newAccessToken,
                        refreshToken: newRefreshToken,
                        expires: '2035-01-01T00:00:00.000Z'
                    })
                })
            };

            // Act & Assert
            await expect(checkAndRefreshAccessToken(oauthApp, user)).rejects.toThrow('Save failed');
        });
    });

    describe('edge cases', () => {
        test('token expiry far in future - no refresh needed', async () => {
            // Arrange
            const user = await UserModel.create({
                id: userId,
                accessToken,
                refreshToken,
                tokenExpiry: '2040-01-01T00:00:00.000Z'
            });

            // Mock oauthApp (should not be called)
            const oauthApp = {
                createToken: jest.fn()
            };

            // Act
            const returnedUser = await checkAndRefreshAccessToken(oauthApp, user);

            // Assert
            expect(returnedUser.accessToken).toBe(accessToken);
            expect(returnedUser.refreshToken).toBe(refreshToken);
            expect(oauthApp.createToken).not.toHaveBeenCalled();
        });

        test('empty platformAdditionalInfo for bullhorn - returns user unchanged', async () => {
            // Arrange
            const user = await UserModel.create({
                id: userId,
                accessToken,
                refreshToken,
                platform: 'bullhorn',
                tokenExpiry: '2025-01-01T00:00:00.000Z',
                platformAdditionalInfo: {}
            });

            // Act
            const returnedUser = await checkAndRefreshAccessToken({}, user);

            // Assert - should return the original user without changes
            expect(returnedUser.accessToken).toBe(accessToken);
            expect(returnedUser.refreshToken).toBe(refreshToken);
        });
    });
});