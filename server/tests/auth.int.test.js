const request = require('supertest');
const nock = require('nock');
const platforms = require('../tests/platformInfo.json');
const { server } = require('../src/index');
const jwt = require('../src/lib/jwt');
const { UserModel } = require('../src/models/userModel');

// create test data
const userId = 'userId';
const unknownUserId = 'unknownUserId';
const unknownJwt = 'unknownJwt;'
const rcUserNumber = '+123456789';
const unknownPhoneNumber = 'unknownPhoneNumber';

describe('auth tests', () => {
    describe('oauth login', () => {
        describe('validations', () => {
            test('no platform - error', async () => {
                // Act
                const res = await request(server).get(`/oauth-callback`)

                // Assert
                expect(res.status).toEqual(400);
            })
        })
    });
    describe('logout', () => {
        describe('get jwt validation', () => {
            test('bad jwt - 400', async () => {
                // Act
                const res = await request(server).post(`/unAuthorize?jwtToken=${unknownJwt}`)

                // Assert
                expect(res.status).toEqual(400);
            });
            test('no jwt - 400', async () => {
                // Act
                const res = await request(server).post(`/unAuthorize`)

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
                    const res = await request(server).post(`/unAuthorize?jwtToken=${jwtToken}`)

                    // Assert
                    expect(res.status).toEqual(400);
                    expect(res.error.text).toEqual('unknown user');
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
                    const res = await request(server).post(`/unAuthorize?jwtToken=${jwtToken}`)

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