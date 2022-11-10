const request = require('supertest');
const nock = require('nock');
const { server } = require('../src/index');
const jwt = require('../src/lib/jwt');
const platforms = require('./platformInfo.json');
const { CallLogModel } = require('../src/models/callLogModel');
const { MessageLogModel } = require('../src/models/messageLogModel');
const { UserModel } = require('../src/models/userModel');
const oauth = require('../src/lib/oauth');

// create test data
const userId = 'userId';
const unknownUserId = 'unknownUserId';
const contactId = 'contactId';
const unknownJwt = 'unknownJwt;'
const rcUserNumber = '+123456789';
const callId = 'callId';
const unknownCallId = 'unknownCallId';
const thirdPartyLogId = 'thirdPartyLogId';
const unknownThirdPartyLogId = 'unknownThirdPartyLogId';
const sessionId = 'sessionId';
const unknownSessionId = 'unknownSessionId';
const accessToken = 'accessToken';
const phoneNumber = 'phoneNumber';
const unknownPhoneNumber = 'unknownPhoneNumber';
const messageLogId = 'messageLogId';
const unknownMessageLogId = 'unknownMessageLogId';
const conversationId = 'conversationId';


describe('oauth tests', () => {
    describe('oauth login', () => {
        test('successful login', async () => {
            for (const platform of platforms) {
                // Arrange
                oauth.getOAuthApp().code.getToken = jest.fn().mockReturnValue({
                    accessToken
                })
                const getUserInfoScope = nock(platform.userInfoDomain)
                    .get(`${platform.userInfoPath}`)
                    .once()
                    .reply(200, {
                        data: {
                            id: unknownUserId,
                            name: '',
                            companyId: '',
                            companyName: '',
                            companyDomain: ''
                        }
                    });

                // Act
                const res = await request(server).get(`/oauth-callback?state=platform=${platform.name}&&callbackUri=&&rcUserNumber=${rcUserNumber}`)

                // Assert
                expect(res.status).toEqual(200);
                const jwtDecoded = jwt.decodeJwt(res.text);
                expect(jwtDecoded.id).toEqual(unknownUserId);
                expect(jwtDecoded.platform).toEqual(platform.name);
                const newUser = await UserModel.findByPk(unknownUserId);
                expect(newUser).not.toBeNull();

                // Clean up
                getUserInfoScope.done();
                await newUser.destroy();
            }
        });
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
                expect(res.error.text).toEqual('missing jwt token');
            });
        });
        describe('logout', () => {
            test('unknown user - unsuccessful', async () => {
                // Arrange
                const jwtToken = jwt.generateJwt({
                    id: unknownUserId,
                    rcUserNumber: unknownPhoneNumber,
                    platform: ''
                });
                // Act
                const res = await request(server).post(`/unAuthorize?jwtToken=${jwtToken}`)

                // Assert
                expect(res.status).toEqual(400);
                expect(res.error.text).toEqual('unknown user');
            });
            test('known user - successful', async () => {
                // Arrange
                const jwtToken = jwt.generateJwt({
                    id: userId,
                    rcUserNumber: rcUserNumber,
                    platform: ''
                });
                await UserModel.create({
                    id: userId,
                    name: '',
                    companyId: '',
                    companyName: '',
                    companyDomain: '',
                    platform: '',
                    accessToken:'',
                    refreshToken:'',
                    tokenExpiry: null,
                    rcUserNumber: rcUserNumber
                });

                // Act
                const res = await request(server).post(`/unAuthorize?jwtToken=${jwtToken}`)

                // Assert
                expect(res.status).toEqual(200);
                const userCheck = await UserModel.findByPk(userId);
                expect(userCheck).toBeNull();
            });
        });
    });
});