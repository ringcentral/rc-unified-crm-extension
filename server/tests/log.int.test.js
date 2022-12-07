const request = require('supertest');
const nock = require('nock');
const { server } = require('../src/index');
const jwt = require('../src/lib/jwt');
const platforms = require('./platformInfo.json');
const { CallLogModel } = require('../src/models/callLogModel');
const { MessageLogModel } = require('../src/models/messageLogModel');
const { UserModel } = require('../src/models/userModel');

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
beforeAll(async () => {
    for (const platform of platforms) {
        await CallLogModel.create({
            id: `${callId}-${platform.name}`,
            sessionId: sessionId,
            platform: platform.name,
            thirdPartyLogId,
            userId: `${userId}-${platform.name}`
        });
        await MessageLogModel.create({
            id: `${messageLogId}-${platform.name}`,
            platform: platform.name,
            conversationId,
            thirdPartyLogId,
            userId
        });
        await UserModel.create({
            id: `${userId}-${platform.name}`,
            name: 'userName',
            hostname: platform.hostname,
            platform: platform.name,
            rcUserNumber,
            accessToken,
            timezoneOffset: '+08:00'
        });
    }
});

// clear test data in db
afterAll(async () => {
    for (const platform of platforms) {
        await CallLogModel.destroy({
            where: {
                id: `${callId}-${platform.name}`
            }
        });
        await MessageLogModel.destroy({
            where: {
                id: `${messageLogId}-${platform.name}`
            }
        })
        await UserModel.destroy({
            where: {
                id: `${userId}-${platform.name}`
            }
        })
    }
});

describe('call&message log tests', () => {

    describe('call log', () => {
        describe('get jwt validation', () => {
            test('bad jwt - 400', async () => {
                // Act
                const res = await request(server).get(`/callLog?jwtToken=${unknownJwt}&sessionId=${sessionId}`)

                // Assert
                expect(res.status).toEqual(400);
            });
            test('no jwt - 400', async () => {
                // Act
                const res = await request(server).get(`/callLog?sessionId=${sessionId}`)

                // Assert
                expect(res.status).toEqual(400);
                console.log(res);
                expect(res.error.text).toEqual('Please go to Settings and authorize CRM platform');
            });
        });
        describe('post jwt validation', () => {
            test('bad jwt - 400', async () => {
                // Act
                const res = await request(server).post(`/callLog?jwtToken=${unknownJwt}&sessionId=${sessionId}`)

                // Assert
                expect(res.status).toEqual(400);
            });
            test('no jwt - 400', async () => {
                // Act
                const res = await request(server).post(`/callLog?sessionId=${sessionId}`)

                // Assert
                expect(res.status).toEqual(400);
                console.log(res);
                expect(res.error.text).toEqual('Please go to Settings and authorize CRM platform');
            });
        });
        describe('get call log', () => {
            test('existing call log - successful', async () => {
                for (const platform of platforms) {
                    // Arrange
                    const jwtToken = jwt.generateJwt({
                        id: `${userId}-${platform.name}`,
                        rcUserNumber,
                        platform: platform.name
                    });

                    // Act
                    const res = await request(server).get(`/callLog?jwtToken=${jwtToken}&sessionId=${sessionId}`)

                    // Assert
                    expect(res.status).toEqual(200);
                    expect(res.body.successful).toEqual(true);
                }
            });
            test('unknown call log - unsuccessful', async () => {
                for (const platform of platforms) {
                    // Arrange
                    const jwtToken = jwt.generateJwt({
                        id: `${userId}-${platform.name}`,
                        rcUserNumber,
                        platform: platform.name
                    });

                    // Act
                    const res = await request(server).get(`/callLog?jwtToken=${jwtToken}&sessionId=${unknownSessionId}`)

                    // Assert
                    expect(res.status).toEqual(200);
                    expect(res.body.successful).toEqual(false);
                }
            });
        });
        describe('add call log', () => {
            test('existing call log - unsuccessful', async () => {
                for (const platform of platforms) {
                    // Arrange
                    const jwtToken = jwt.generateJwt({
                        id: `${userId}-${platform.name}`,
                        rcUserNumber,
                        platform: platform.name
                    });
                    const postBody = {
                        logInfo: {
                            id: `${callId}-${platform.name}`,
                            sessionId
                        }
                    };

                    // Act
                    const res = await request(server).post(`/callLog?jwtToken=${jwtToken}`).send(postBody);

                    // Assert
                    expect(res.status).toEqual(200);
                    expect(res.body.successful).toEqual(false);
                    expect(res.body.message).toEqual(`existing log for session ${sessionId}`);
                }
            });
            test('cannot find user - unsuccessful', async () => {
                for (const platform of platforms) {
                    // Arrange
                    const jwtToken = jwt.generateJwt({
                        id: unknownUserId,
                        rcUserNumber,
                        platform: platform.name
                    });
                    const postBody = {
                        logInfo: {
                            id: `${unknownCallId}-${platform.name}`,
                            sessionId: unknownSessionId
                        }
                    };

                    // Act
                    const res = await request(server).post(`/callLog?jwtToken=${jwtToken}`).send(postBody);

                    // Assert
                    expect(res.status).toEqual(400);
                    expect(res.error.text).toEqual(`Cannot find user with id: ${unknownUserId}`);
                }
            });
            test('unknown contact - unsuccessful', async () => {
                for (const platform of platforms) {
                    // Arrange
                    const jwtToken = jwt.generateJwt({
                        id: `${userId}-${platform.name}`,
                        rcUserNumber,
                        platform: platform.name
                    });
                    const postBody = {
                        logInfo: {
                            id: `${unknownCallId}-${platform}`,
                            sessionId: unknownSessionId,
                            platform: platform.name,
                            direction: 'Inbound',
                            from: {
                                phoneNumber: unknownPhoneNumber
                            }
                        }
                    };
                    const platformGetContactScope = nock(platform.domain)
                        .get(`${platform.contactPath}/search?term=${unknownPhoneNumber}&fields=phone&limit=1`)
                        .once()
                        .reply(200, {
                            data: {
                                items: []
                            }
                        });

                    // Act
                    const res = await request(server).post(`/callLog?jwtToken=${jwtToken}`).send(postBody);

                    // Assert
                    expect(res.status).toEqual(400);
                    expect(res.error.text).toEqual(`Contact not found for number ${unknownPhoneNumber}`);

                    // Clean up
                    platformGetContactScope.done();
                }
            });
            test('new call log - successful', async () => {
                for (const platform of platforms) {
                    // Arrange
                    const jwtToken = jwt.generateJwt({
                        id: `${userId}-${platform.name}`,
                        rcUserNumber,
                        platform: platform.name
                    });
                    const postBody = {
                        logInfo: {
                            id: `${unknownCallId}-${platform}`,
                            sessionId: unknownSessionId,
                            platform: platform.name,
                            direction: 'Inbound',
                            from: {
                                name: '',
                                phoneNumber
                            },
                            to: {
                                name: '',
                                phoneNumber
                            },
                            duration: 0,
                            result: '',
                            note: '',
                            startTime: 1667263961801

                        }
                    };
                    const platformGetContactScope = nock(platform.domain)
                        .get(`${platform.contactPath}/search?term=${phoneNumber}&fields=phone&limit=1`)
                        .once()
                        .reply(200, {
                            data: {
                                items: [
                                    {
                                        item: {
                                            id: contactId
                                        }
                                    }
                                ]
                            }
                        });
                    const platformGetDealScope = nock(platform.domain)
                        .get(`${platform.contactPath}/${contactId}/deals?status=open`)
                        .once()
                        .reply(200, {});
                    const platformAddCallLogScope = nock(platform.domain)
                        .post(platform.callLogPath)
                        .once()
                        .reply(200, {
                            data: {
                                id: unknownThirdPartyLogId
                            }
                        });

                    // Act
                    const res = await request(server).post(`/callLog?jwtToken=${jwtToken}`).send(postBody);

                    // Assert
                    expect(res.status).toEqual(200);
                    expect(res.body.successful).toEqual(true);
                    expect(res.body.logId).toEqual(unknownThirdPartyLogId);
                    const newLog = await CallLogModel.findByPk(`${unknownCallId}-${platform}`);
                    expect(newLog).not.toBeNull();

                    // Clean up
                    platformGetContactScope.done();
                    platformGetDealScope.done();
                    platformAddCallLogScope.done();
                    await newLog.destroy();
                }
            });
        });
    });
    describe('message log', () => {
        describe('post jwt validation', () => {
            test('bad jwt - 400', async () => {
                // Act
                const res = await request(server).post(`/messageLog?jwtToken=${unknownJwt}`)

                // Assert
                expect(res.status).toEqual(400);
            });
            test('no jwt - 400', async () => {
                // Act
                const res = await request(server).post(`/messageLog`)

                // Assert
                expect(res.status).toEqual(400);
                console.log(res);
                expect(res.error.text).toEqual('Please go to Settings and authorize CRM platform');
            });
        });

        describe('add message logs', () => {
            test('no message item in list - unsuccessful', async () => {
                for (const platform of platforms) {
                    // Arrange
                    const jwtToken = jwt.generateJwt({
                        id: `${userId}-${platform.name}`,
                        rcUserNumber,
                        platform: platform.name
                    });
                    const postBody = {
                        logInfo: {
                            messages: []
                        }
                    };

                    // Act
                    const res = await request(server).post(`/messageLog?jwtToken=${jwtToken}`).send(postBody);

                    // Assert
                    expect(res.status).toEqual(200);
                    expect(res.body.successful).toEqual(false);
                    expect(res.body.message).toEqual('no message to log.');
                }
            });
            test('cannot find user - unsuccessful', async () => {
                for (const platform of platforms) {
                    // Arrange
                    const jwtToken = jwt.generateJwt({
                        id: unknownUserId,
                        rcUserNumber,
                        platform: platform.name
                    });
                    const postBody = {
                        logInfo: {
                            messages: [
                                {
                                    id: messageLogId
                                },
                                {
                                    id: unknownMessageLogId
                                }],
                            correspondents: [
                                {
                                    phoneNumber
                                }
                            ]
                        }
                    };

                    // Act
                    const res = await request(server).post(`/messageLog?jwtToken=${jwtToken}`).send(postBody);

                    // Assert
                    expect(res.status).toEqual(400);
                    expect(res.error.text).toEqual(`Cannot find user with id: ${unknownUserId}`);
                }
            });
            test('unknown contact - unsuccessful', async () => {
                for (const platform of platforms) {
                    // Arrange
                    const jwtToken = jwt.generateJwt({
                        id: `${userId}-${platform.name}`,
                        rcUserNumber,
                        platform: platform.name
                    });

                    const postBody = {
                        logInfo: {
                            messages: [
                                {
                                    id: messageLogId
                                },
                                {
                                    id: unknownMessageLogId
                                }],
                            correspondents: [
                                {
                                    phoneNumber: unknownPhoneNumber
                                }
                            ]
                        }
                    };

                    const platformGetContactScope = nock(platform.domain)
                        .get(`${platform.contactPath}/search?term=${unknownPhoneNumber}&fields=phone&limit=1`)
                        .once()
                        .reply(200, {
                            data: {
                                items: []
                            }
                        });

                    // Act
                    const res = await request(server).post(`/messageLog?jwtToken=${jwtToken}`).send(postBody);

                    // Assert
                    expect(res.status).toEqual(400);
                    expect(res.error.text).toEqual(`Contact not found for number ${unknownPhoneNumber}`);

                    // Clean up
                    platformGetContactScope.done();
                }
            });
            test('1 known message & 1 unknown message - successful, unknown message logged', async () => {
                for (const platform of platforms) {
                    // Arrange
                    const jwtToken = jwt.generateJwt({
                        id: `${userId}-${platform.name}`,
                        rcUserNumber,
                        platform: platform.name
                    });
                    const postBody = {
                        logInfo: {
                            messages: [
                                {
                                    id: `${messageLogId}-${platform.name}`
                                },
                                {
                                    id: `${unknownMessageLogId}-${platform.name}`,
                                    direction: '',
                                    from: {
                                        phoneNumber
                                    },
                                    to: [{
                                        phoneNumber
                                    }]
                                }],
                            correspondents: [
                                {
                                    phoneNumber
                                }
                            ]
                        }
                    };
                    const platformGetContactScope = nock(platform.domain)
                        .get(`${platform.contactPath}/search?term=${phoneNumber}&fields=phone&limit=1`)
                        .once()
                        .reply(200, {
                            data: {
                                items: [
                                    {
                                        item: {
                                            id: contactId
                                        }
                                    }
                                ]
                            }
                        });
                    const platformGetDealScope = nock(platform.domain)
                        .get(`${platform.contactPath}/${contactId}/deals?status=open`)
                        .once()
                        .reply(200, {});
                    const platformAddMessageLogScope = nock(platform.domain)
                        .post(platform.messageLogPath)
                        .once()
                        .reply(200, {
                            data: {
                                id: unknownThirdPartyLogId
                            }
                        });

                    // Act
                    const res = await request(server).post(`/messageLog?jwtToken=${jwtToken}`).send(postBody);

                    // Assert
                    expect(res.status).toEqual(200);
                    expect(res.body.successful).toEqual(true);
                    expect(res.body.logIds).toEqual([unknownThirdPartyLogId]);
                    const newLog = await MessageLogModel.findByPk(`${unknownMessageLogId}-${platform.name}`);
                    expect(newLog).not.toBeNull();

                    // Clean up
                    await newLog.destroy();
                    platformGetContactScope.done();
                    platformGetDealScope.done();
                    platformAddMessageLogScope.done();
                }
            });
        })
    });
});