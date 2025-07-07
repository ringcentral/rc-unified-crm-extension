const { checkAndRefreshAccessToken } = require('../src/lib/oauth');
const { UserModel } = require('../src/models/userModel');
const { Lock } = require('../src/models/dynamo/lockSchema');
const nock = require('nock');

// Mock the Lock model
jest.mock('../src/models/dynamo/lockSchema', () => ({
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
    nock.cleanAll();
    // Reset environment variable
    delete process.env.USE_TOKEN_REFRESH_LOCK;
});

// Clear test data in db
afterEach(async () => {
    await UserModel.destroy({
        where: {
            id: userId
        }
    });
    nock.cleanAll();
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
            process.env.USE_TOKEN_REFRESH_LOCK = 'true';
            const user = await UserModel.create({
                id: userId,
                accessToken,
                refreshToken,
                tokenExpiry: '2025-01-01T00:00:00.000Z'
            });

            // Mock Lock model
            Lock.get.mockResolvedValue(null); // No existing lock
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
            expect(Lock.get).toHaveBeenCalledWith({ userId: user.id });
            expect(Lock.create).toHaveBeenCalledWith({ userId: user.id });
            expect(mockLock.delete).toHaveBeenCalled();
        });

        test('expired, with lock mechanism, existing valid lock - wait and timeout', async () => {
            // Arrange
            process.env.USE_TOKEN_REFRESH_LOCK = 'true';
            const user = await UserModel.create({
                id: userId,
                accessToken,
                refreshToken,
                tokenExpiry: '2025-01-01T00:00:00.000Z'
            });

            // Mock Lock model - always return existing lock
            const mockLock = {
                ttl: Date.now() + 100000 // Valid lock
            };
            Lock.get.mockResolvedValue(mockLock);

            // Act & Assert
            await expect(checkAndRefreshAccessToken({}, user, 0.5)).rejects.toThrow('Token lock timeout');
            expect(Lock.get).toHaveBeenCalledWith({ userId: user.id });
        });

        test('expired, with lock mechanism, expired lock - refresh after removing expired lock', async () => {
            // Arrange
            process.env.USE_TOKEN_REFRESH_LOCK = 'true';
            const user = await UserModel.create({
                id: userId,
                accessToken,
                refreshToken,
                tokenExpiry: '2025-01-01T00:00:00.000Z'
            });

            // Mock Lock model - expired lock
            const mockExpiredLock = {
                ttl: Date.now() - 1000, // Expired lock
                delete: jest.fn().mockResolvedValue(true)
            };
            
            Lock.get.mockResolvedValueOnce(mockExpiredLock) // First call returns expired lock
                    .mockResolvedValueOnce(null); // Second call returns no lock

            const mockNewLock = {
                delete: jest.fn().mockResolvedValue(true)
            };
            Lock.create.mockResolvedValue(mockNewLock);

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
            expect(mockExpiredLock.delete).toHaveBeenCalled();
            expect(Lock.create).toHaveBeenCalledWith({ userId: user.id });
            expect(mockNewLock.delete).toHaveBeenCalled();
        });

        test('expired, with lock mechanism, no existing lock - create lock and refresh', async () => {
            // Arrange
            process.env.USE_TOKEN_REFRESH_LOCK = 'true';
            const user = await UserModel.create({
                id: userId,
                accessToken,
                refreshToken,
                tokenExpiry: '2025-01-01T00:00:00.000Z'
            });

            // Mock Lock model - no existing lock, so it creates a new one and refreshes
            Lock.get.mockResolvedValue(null); // No existing lock
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
            expect(Lock.get).toHaveBeenCalledWith({ userId: user.id });
            expect(Lock.create).toHaveBeenCalledWith({ userId: user.id });
            expect(mockLock.delete).toHaveBeenCalled();
        });

        test('expired, concurrent requests with locking - both get updated tokens', async () => {
            // Arrange
            process.env.USE_TOKEN_REFRESH_LOCK = 'true';
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

            // Mock Lock model for concurrent scenario
            Lock.get.mockResolvedValueOnce(null); // First request gets no lock
            const mockLock = {
                delete: jest.fn().mockResolvedValue(true)
            };
            Lock.create.mockResolvedValue(mockLock);

            // Mock UserModel.findByPk for second request
            const updatedUser = {
                id: userId,
                accessToken: newAccessToken,
                refreshToken: newRefreshToken,
                tokenExpiry: '2035-01-01T00:00:00.000Z',
                save: jest.fn().mockResolvedValue(true)
            };
            jest.spyOn(UserModel, 'findByPk').mockResolvedValue(updatedUser);

            let returnedUser1, returnedUser2;
            
            // Setup for second request (simulating concurrent access)
            const mockLockForSecond = {
                ttl: Date.now() + 1000
            };
            Lock.get.mockResolvedValueOnce(mockLockForSecond) // Second request finds lock
                    .mockResolvedValueOnce(null); // Then lock is cleared

            const request1 = async () => {
                returnedUser1 = await checkAndRefreshAccessToken(oauthApp, user);
            };
            const request2 = async () => {
                await new Promise(resolve => setTimeout(resolve, 100));
                returnedUser2 = await checkAndRefreshAccessToken(oauthApp, user);
            };

            // Act
            await Promise.all([request1(), request2()]);

            // Assert
            expect(returnedUser1.accessToken).toBe(newAccessToken);
            expect(returnedUser1.refreshToken).toBe(newRefreshToken);
            expect(returnedUser2.accessToken).toBe(newAccessToken);
            expect(returnedUser2.refreshToken).toBe(newRefreshToken);
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

            // Mock platform module for password auth
            jest.doMock('../src/adapters/bullhorn', () => ({
                getServerLoggingSettings: jest.fn().mockResolvedValue({
                    apiUsername: 'testuser',
                    apiPassword: 'testpass'
                })
            }));

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

            // Mock platform module for password auth
            jest.doMock('../src/adapters/bullhorn', () => ({
                getServerLoggingSettings: jest.fn().mockResolvedValue({
                    apiUsername: 'testuser',
                    apiPassword: 'testpass'
                })
            }));

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

            // Mock platform module for password auth
            jest.doMock('../src/adapters/bullhorn', () => ({
                getServerLoggingSettings: jest.fn().mockResolvedValue({
                    apiUsername: 'testuser',
                    apiPassword: 'testpass'
                })
            }));

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

            // Mock platform module with no credentials
            jest.doMock('../src/adapters/bullhorn', () => ({
                getServerLoggingSettings: jest.fn().mockResolvedValue({
                    // No apiUsername or apiPassword
                })
            }));

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
            process.env.USE_TOKEN_REFRESH_LOCK = 'true';
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
        test('very short timeout - immediate timeout', async () => {
            // Arrange
            process.env.USE_TOKEN_REFRESH_LOCK = 'true';
            const user = await UserModel.create({
                id: userId,
                accessToken,
                refreshToken,
                tokenExpiry: '2025-01-01T00:00:00.000Z'
            });

            // Reset mocks for this test
            jest.clearAllMocks();
            
            // Mock existing valid lock that doesn't expire
            const mockLock = {
                ttl: Date.now() + 100000 // Valid lock that won't expire
            };
            Lock.get.mockResolvedValue(mockLock);

            // Mock oauthApp (shouldn't be called due to timeout)
            const oauthApp = {
                createToken: jest.fn()
            };

            // Act & Assert
            await expect(checkAndRefreshAccessToken(oauthApp, user, 0)).rejects.toThrow('Token lock timeout');
        });

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