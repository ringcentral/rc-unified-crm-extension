const request = require('supertest');
const nock = require('nock');
const platforms = require('./platformInfo.json');
const { getServer } = require('../src/index');
const jwt = require('@app-connect/core/lib/jwt');
const { UserModel } = require('@app-connect/core/models/userModel');
const oauth = require('@app-connect/core/lib/oauth');

// create test data
const userId = 'userId';
const unknownUserId = 'unknownUserId';
const unknownJwt = 'unknownJwt;'
const rcUserNumber = '+123456789';
const unknownPhoneNumber = 'unknownPhoneNumber';


// Add this line to reset the mock before each test
beforeEach(() => {
    jest.clearAllMocks();
});

// clear test data in db
afterEach(async () => {
    for (const platform of platforms) {
        // Clean up users with both old and new ID formats
        await UserModel.destroy({
            where: {
                id: userId,
                platform: platform.name
            }
        });
        await UserModel.destroy({
            where: {
                id: `${userId}_${platform.name}`,
                platform: platform.name
            }
        });
    }
});

describe('auth tests', () => {
    describe('login', () => {
        describe('oauth login', () => {
            describe('validations', () => {
                test('no callbackUri - error', async () => {
                    // Act
                    const res = await request(getServer()).get(`/oauth-callback`)

                    // Assert
                    expect(res.status).toEqual(400);
                    expect(res.text).toEqual('Missing callbackUri');
                })
                test('no platform - error', async () => {
                    // Act
                    const res = await request(getServer()).get(`/oauth-callback?callbackUri=https://callback?state=platformName=platformName`)

                    // Assert
                    expect(res.status).toEqual(400);
                    expect(res.text).toEqual('Missing platform name');
                })
                test('oauth callback - successful', async () => {
                    for (const platform of platforms) {
                        // Use platform-specific user ID to avoid conflicts
                        const platformUserId = `${userId}_${platform.name}`;
                        
                        // Arrange
                        const requestQuery = `callbackUri=https://callback?code=code&hostname=hostname&state=platform=${platform.name}`;
                        oauth.getOAuthApp = jest.fn().mockReturnValue({
                            code: {
                                getToken: () => {
                                    return {
                                        accessToken: 'accessToken',
                                        refreshToken: 'refreshToken',
                                        expires: 'expires'
                                    }
                                }
                            }
                        });
                        const platformGetUserInfoScope = nock(platform.userInfoDomain)
                            .get(platform.userInfoPath)
                            .once()
                            .reply(200, {
                                data: {
                                    id: platformUserId,
                                    name: 'userName',
                                    timezone_name: 'timezone_name',
                                    timezone_offset: 0
                                }
                            });

                        // Act
                        const res = await request(getServer()).get(`/oauth-callback?${requestQuery}`)

                        // Assert
                        expect(res.status).toEqual(200);
                        expect(res.body.jwtToken).toBeDefined();
                        expect(res.body.name).toEqual('userName');
                        
                        // Verify JWT token contains correct data
                        const decodedToken = jwt.decodeJwt(res.body.jwtToken);
                        expect(decodedToken.id).toEqual(`${platformUserId}-${platform.name}`);
                        expect(decodedToken.platform).toEqual(platform.name);

                        // Clean up
                        platformGetUserInfoScope.done();
                    }
                });
            })
        });
        describe('api key login', () => {
            describe('validations', () => {
                test('no platform - error', async () => {
                    // Act
                    const res = await request(getServer()).post(`/apiKeyLogin`).send({
                        apiKey: 'apiKey'
                    });

                    // Assert
                    expect(res.status).toEqual(400);
                })
                test('no api key - error', async () => {
                    // Act
                    const res = await request(getServer()).post(`/apiKeyLogin`).send({
                        platform: 'platformName'
                    });

                    // Assert
                    expect(res.status).toEqual(400);
                })
            })
        });
    });
    describe('logout', () => {
        describe('get jwt validation', () => {
            test('bad jwt - 400', async () => {
                // Act
                const res = await request(getServer()).post(`/unAuthorize?jwtToken=${unknownJwt}`)

                // Assert
                expect(res.status).toEqual(400);
            });
            test('no jwt - 400', async () => {
                // Act
                const res = await request(getServer()).post(`/unAuthorize`)

                // Assert
                expect(res.status).toEqual(400);
                expect(res.text).toEqual('Please go to Settings and authorize CRM platform');
            });
        });
        describe('logout', () => {
            test('unknown user - unsuccessful', async () => {
                for (const platform of platforms) {
                    // Use platform-specific unknown user ID to avoid conflicts
                    const platformUnknownUserId = `${unknownUserId}_${platform.name}`;
                    
                    // Arrange
                    const jwtToken = jwt.generateJwt({
                        id: platformUnknownUserId,
                        rcUserNumber: unknownPhoneNumber,
                        platform: platform.name
                    });
                    // Act
                    const res = await request(getServer()).post(`/unAuthorize?jwtToken=${jwtToken}`)

                    // Assert
                    expect(res.status).toEqual(400);
                }
            });
            test('known user - successful', async () => {
                for (const platform of platforms) {
                    // Use platform-specific user ID to avoid conflicts
                    const platformUserId = `${userId}_${platform.name}`;
                    
                    // Arrange
                    const jwtToken = jwt.generateJwt({
                        id: platformUserId,
                        rcUserNumber: rcUserNumber,
                        platform: platform.name
                    });
                    await UserModel.create({
                        id: platformUserId,
                        name: '',
                        companyId: '',
                        companyName: '',
                        companyDomain: '',
                        platform: platform.name,
                        accessToken: '',
                        refreshToken: '',
                        tokenExpiry: null,
                        rcUserNumber: rcUserNumber
                    });
                    const revokeTokenScope = nock(platform.oauthDomain)
                        .post(platform.tokenRevokePath)
                        .twice()
                        .reply(200, {
                            data: {}
                        });

                    // Act
                    const res = await request(getServer()).post(`/unAuthorize?jwtToken=${jwtToken}`)

                    // Assert
                    expect(res.status).toEqual(200);
                    const userCheck = await UserModel.findByPk(platformUserId);
                    // For pipedrive, user should still exist but with cleared tokens
                    if (platform.name === 'pipedrive') {
                        expect(userCheck).not.toBeNull();
                        expect(userCheck.accessToken).toBe('');
                        expect(userCheck.refreshToken).toBe('');
                    } else {
                        // Other platforms might delete the user entirely
                        expect(userCheck).toBeNull();
                    }

                    // Clean up
                    revokeTokenScope.done();
                    // For pipedrive, manually clean up the user since unAuthorize doesn't delete it
                    if (platform.name === 'pipedrive') {
                        await UserModel.destroy({
                            where: {
                                id: platformUserId,
                                platform: platform.name
                            }
                        });
                    }
                }
            });
        });
    });
});