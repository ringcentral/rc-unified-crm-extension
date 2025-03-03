const request = require('supertest');
const nock = require('nock');
const platforms = require('./platformInfo.json');
const { getServer } = require('../src/index');
const jwt = require('../src/lib/jwt');
const { UserModel } = require('../src/models/userModel');
const oauth = require('../src/lib/oauth');

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
        await UserModel.destroy({
            where: {
                id: userId,
                platform: platform.name
            }
        })
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
                    expect(res.error.text).toEqual('Missing callbackUri');
                })
                test('no platform - error', async () => {
                    // Act
                    const res = await request(getServer()).get(`/oauth-callback?callbackUri=https://callback?state=platformName=platformName`)

                    // Assert
                    expect(res.status).toEqual(400);
                    expect(res.error.text).toEqual('Missing platform name');
                })
                test('oauth callback - successful', async () => {
                    for (const platform of platforms) {
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
                                    id: userId,
                                    name: 'userName',
                                    timezone_name: 'timezone_name',
                                    timezone_offset: 0
                                }
                            });
                        const jwtToken = jwt.generateJwt({
                            id: userId,
                            platform: platform.name
                        });

                        // Act
                        const res = await request(getServer()).get(`/oauth-callback?${requestQuery}`)

                        // Assert
                        expect(res.status).toEqual(200);
                        expect(res.body.jwtToken).toEqual(jwtToken);
                        expect(res.body.name).toEqual('userName');

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
                expect(res.error.text).toEqual('Please go to Settings and authorize CRM platform');
            });
        });
        describe('logout', () => {
            test('unknown user - unsuccessful', async () => {
                for (const platform of platforms) {
                    // Arrange
                    const jwtToken = jwt.generateJwt({
                        id: unknownUserId,
                        rcUserNumber: unknownPhoneNumber,
                        platform: platform.name
                    });
                    // Act
                    const res = await request(getServer()).post(`/unAuthorize?jwtToken=${jwtToken}`)

                    // Assert
                    expect(res.status).toEqual(400);
                    expect(res.error.text).toEqual('Unknown user');
                }
            });
            test('known user - successful', async () => {
                for (const platform of platforms) {
                    // Arrange
                    const jwtToken = jwt.generateJwt({
                        id: userId,
                        rcUserNumber: rcUserNumber,
                        platform: platform.name
                    });
                    await UserModel.create({
                        id: userId,
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
                    const userCheck = await UserModel.findByPk(`${userId}-pipedrive`);
                    expect(userCheck).toBeNull();

                    // Clean up
                    revokeTokenScope.done();
                }
            });
        });
    });
});