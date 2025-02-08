const { checkAndRefreshAccessToken } = require('../src/lib/oauth');
const { UserModel } = require('../src/models/userModel');
const { CacheModel } = require('../src/models/cacheModel');
const oauth = require('../src/lib/oauth');
const e = require('cors');

// create test data
const userId = 'userId';
const accessToken = 'accessToken';
const refreshToken = 'refreshToken';
const newAccessToken = 'newAccessToken';
const newRefreshToken = 'newRefreshToken';

// Add this line to reset the mock before each test
beforeEach(async () => {
    jest.clearAllMocks();
    await CacheModel.destroy({
        where: {
            id: `${userId}-tokenLock`
        }
    });
});

// clear test data in db
afterEach(async () => {
    await UserModel.destroy({
        where: {
            id: userId
        }
    })
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
            })

            // Act
            const returnedUser = await checkAndRefreshAccessToken({}, user);

            // Assert
            expect(returnedUser.accessToken).toBe(accessToken);
            expect(returnedUser.refreshToken).toBe(refreshToken);
        });
        test('expired, no lock - refresh, create lock then update', async () => {
            // Arrange
            const user = await UserModel.create({
                id: userId,
                accessToken,
                refreshToken,
                tokenExpiry: '2025-01-01T00:00:00.000Z'
            })
            // Mock oauthApp
            const oauthApp = {
                createToken: (accessToken, refreshToken) => {
                    return {
                        refresh: () => {
                            return {
                                accessToken: newAccessToken,
                                refreshToken: newRefreshToken,
                                expires: '2035-01-01T00:00:00.000Z'
                            }
                        }
                    }
                }
            };

            // Act
            const returnedUser = await checkAndRefreshAccessToken(oauthApp, user);

            // Assert
            expect(returnedUser.accessToken).toBe(newAccessToken);
            expect(returnedUser.refreshToken).toBe(newRefreshToken);
            const updatedLock = await CacheModel.findByPk(`${user.id}-tokenLock`);
            expect(updatedLock.status).toBe('unlocked');
        });
        test('expired, cache but unlock status - refresh, create lock then update', async () => {
            // Arrange
            const user = await UserModel.create({
                id: userId,
                accessToken,
                refreshToken,
                tokenExpiry: '2025-01-01T00:00:00.000Z'
            })
            const lock = await CacheModel.create({
                id: `${user.id}-tokenLock`,
                status: 'unlocked',
                expiry: '2035-01-01T00:00:00.000Z'
            });

            // Mock oauthApp
            const oauthApp = {
                createToken: (accessToken, refreshToken) => {
                    return {
                        refresh: () => {
                            return {
                                accessToken: newAccessToken,
                                refreshToken: newRefreshToken,
                                expires: '2035-01-01T00:00:00.000Z'
                            }
                        }
                    }
                }
            };

            // Act
            const returnedUser = await checkAndRefreshAccessToken(oauthApp, user);

            // Assert
            expect(returnedUser.accessToken).toBe(newAccessToken);
            expect(returnedUser.refreshToken).toBe(newRefreshToken);
            const updatedLock = await CacheModel.findByPk(`${user.id}-tokenLock`);
            expect(updatedLock.status).toBe('unlocked');
        });
        test('expired, locked - timeout', async () => {
            // Arrange
            const user = await UserModel.create({
                id: userId,
                accessToken,
                refreshToken,
                tokenExpiry: '2025-01-01T00:00:00.000Z'
            });
            const lock = await CacheModel.create({
                id: `${user.id}-tokenLock`,
                status: 'locked',
                expiry: '2035-01-01T00:00:00.000Z'
            });

            // Act
            try {
                const returnedUser = await checkAndRefreshAccessToken({}, user, 0.5);
            }
            catch (e) {
                // Assert
                expect(e.message).toBe('Token lock timeout');
            }
        })
        test('expired, locked then cleared - use refreshed tokens', async () => {
            // Arrange
            const user = await UserModel.create({
                id: userId,
                accessToken,
                refreshToken,
                tokenExpiry: '2025-01-01T00:00:00.000Z'
            });
            const lock = await CacheModel.create({
                id: `${user.id}-tokenLock`,
                status: 'locked',
                expiry: '2035-01-01T00:00:00.000Z'
            });

            // Act
            setTimeout(async () => {
                await user.update({
                    accessToken: newAccessToken,
                    refreshToken: newRefreshToken,
                    tokenExpiry: '2035-01-01T00:00:00.000Z'
                })
                await CacheModel.destroy({
                    where: {
                        id: `${user.id}-tokenLock`
                    }
                });
            }, 1000);
            const returnedUser = await checkAndRefreshAccessToken({}, user, 3);

            // Assert
            expect(returnedUser.accessToken).toBe(newAccessToken);
            expect(returnedUser.refreshToken).toBe(newRefreshToken);
        });
        test('expired, lock expired as well - use refreshed tokens', async () => {
            // Arrange
            const user = await UserModel.create({
                id: userId,
                accessToken,
                refreshToken,
                tokenExpiry: '2025-01-01T00:00:00.000Z'
            });
            const lock = await CacheModel.create({
                id: `${user.id}-tokenLock`,
                status: 'locked',
                expiry: '2025-01-01T00:00:00.000Z'
            });
            // Mock oauthApp
            const oauthApp = {
                createToken: (accessToken, refreshToken) => {
                    return {
                        refresh: () => {
                            return {
                                accessToken: newAccessToken,
                                refreshToken: newRefreshToken,
                                expires: '2035-01-01T00:00:00.000Z'
                            }
                        }
                    }
                }
            };

            // Act
            const returnedUser = await checkAndRefreshAccessToken(oauthApp, user);

            // Assert
            expect(returnedUser.accessToken).toBe(newAccessToken);
            expect(returnedUser.refreshToken).toBe(newRefreshToken);
        });
    })
})