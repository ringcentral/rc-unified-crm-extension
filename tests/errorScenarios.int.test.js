/**
 * Error Scenarios Integration Tests
 * 
 * These tests cover various HTTP error responses from CRM APIs (401, 403, 500)
 * to ensure proper error handling and recovery.
 */
const request = require('supertest');
const nock = require('nock');
const { getServer } = require('../src/index');
const jwt = require('@app-connect/core/lib/jwt');
const platforms = require('./platformInfo.json');
const { UserModel } = require('@app-connect/core/models/userModel');
const { CallLogModel } = require('@app-connect/core/models/callLogModel');

// Test data
const userId = 'errorTestUserId';
const rcUserNumber = '+123456789';
const accessToken = 'testAccessToken';
const phoneNumber = '+17206789819';
const contactId = 'errorTestContactId';
const sessionId = 'errorTestSessionId';
const thirdPartyLogId = 'errorTestThirdPartyLogId';

// Filter to pipedrive-style platforms for these tests
const pipedriveStylePlatforms = platforms.filter(p => p.name !== 'bullhorn');

beforeAll(async () => {
    for (const platform of pipedriveStylePlatforms) {
        await UserModel.create({
            id: userId,
            hostname: platform.hostname,
            platform: platform.name,
            rcUserNumber,
            accessToken,
            refreshToken: 'testRefreshToken',
            timezoneOffset: '+08:00'
        });
    }
});

afterAll(async () => {
    for (const platform of pipedriveStylePlatforms) {
        await UserModel.destroy({
            where: {
                id: userId,
                platform: platform.name
            }
        });
    }
});

beforeEach(() => {
    nock.cleanAll();
});

describe('CRM API Error Scenarios', () => {
    describe('401 Unauthorized Responses', () => {
        test('contact search - 401 should return unsuccessful with auth error message', async () => {
            for (const platform of pipedriveStylePlatforms) {
                const jwtToken = jwt.generateJwt({
                    id: userId,
                    rcUserNumber,
                    platform: platform.name
                });
                
                const platformScope = nock(platform.domain)
                    .get(`${platform.contactPath}/search`)
                    .query(true)
                    .reply(401, {
                        error: 'Unauthorized',
                        message: 'Invalid or expired access token'
                    });
                
                const res = await request(getServer())
                    .get(`/contact?jwtToken=${jwtToken}&phoneNumber=${phoneNumber}`);
                
                expect(res.status).toEqual(200);
                expect(res.body.successful).toEqual(false);
                
                nock.cleanAll();
            }
        });

        test('call log creation - 401 should return unsuccessful', async () => {
            for (const platform of pipedriveStylePlatforms) {
                const jwtToken = jwt.generateJwt({
                    id: userId,
                    rcUserNumber,
                    platform: platform.name
                });
                
                const platformFindContactScope = nock(platform.domain)
                    .get(`${platform.contactPath}/${contactId}`)
                    .reply(200, { data: { id: contactId, name: 'Test Contact' } });
                
                const platformCreateLogScope = nock(platform.domain)
                    .post(platform.callLogPath)
                    .reply(401, {
                        error: 'Unauthorized',
                        message: 'Access token expired'
                    });
                
                const postBody = {
                    logInfo: {
                        id: 'newCallId401',
                        sessionId: 'newSessionId401',
                        telephonySessionId: 'newTelSessionId401',
                        direction: 'Inbound',
                        from: { name: '', phoneNumber },
                        to: { name: '', phoneNumber },
                        duration: 120,
                        result: 'Completed',
                        note: 'Test call',
                        startTime: Date.now()
                    },
                    contactId
                };
                
                const res = await request(getServer())
                    .post(`/callLog?jwtToken=${jwtToken}`)
                    .send(postBody);
                
                expect(res.status).toEqual(200);
                expect(res.body.successful).toEqual(false);
                
                nock.cleanAll();
            }
        });
    });

    describe('403 Forbidden Responses', () => {
        test('contact search - 403 should return unsuccessful with permission error', async () => {
            for (const platform of pipedriveStylePlatforms) {
                const jwtToken = jwt.generateJwt({
                    id: userId,
                    rcUserNumber,
                    platform: platform.name
                });
                
                const platformScope = nock(platform.domain)
                    .get(`${platform.contactPath}/search`)
                    .query(true)
                    .reply(403, {
                        error: 'Forbidden',
                        message: 'Insufficient permissions to access this resource'
                    });
                
                const res = await request(getServer())
                    .get(`/contact?jwtToken=${jwtToken}&phoneNumber=${phoneNumber}`);
                
                expect(res.status).toEqual(200);
                expect(res.body.successful).toEqual(false);
                
                nock.cleanAll();
            }
        });

        test('contact creation - 403 should return unsuccessful', async () => {
            for (const platform of pipedriveStylePlatforms) {
                const jwtToken = jwt.generateJwt({
                    id: userId,
                    rcUserNumber,
                    platform: platform.name
                });
                
                const platformScope = nock(platform.domain)
                    .post(platform.oldContactPath)
                    .reply(403, {
                        error: 'Forbidden',
                        message: 'User does not have permission to create contacts'
                    });
                
                const res = await request(getServer())
                    .post(`/contact?jwtToken=${jwtToken}&phoneNumber=${phoneNumber}`)
                    .send({ newContactName: 'Test Contact' });
                
                expect(res.status).toEqual(200);
                expect(res.body.successful).toEqual(false);
                
                nock.cleanAll();
            }
        });

        test('call log update - 403 should return unsuccessful with permission message', async () => {
            for (const platform of pipedriveStylePlatforms) {
                // Create a call log for testing
                await CallLogModel.create({
                    id: 'callId403',
                    sessionId: 'sessionId403',
                    platform: platform.name,
                    thirdPartyLogId: 'thirdPartyLogId403',
                    userId: userId
                });
                
                const jwtToken = jwt.generateJwt({
                    id: userId,
                    rcUserNumber,
                    platform: platform.name
                });
                
                const platformGetLogScope = nock(platform.domain)
                    .get(`${platform.callLogPath}/thirdPartyLogId403`)
                    .reply(200, { data: { note: 'Original note' } });
                
                const platformPatchLogScope = nock(platform.domain)
                    .patch(`${platform.callLogPath}/thirdPartyLogId403`)
                    .reply(403, {
                        error: 'Forbidden',
                        message: 'User cannot modify this activity'
                    });
                
                const patchBody = {
                    sessionId: 'sessionId403',
                    note: 'Updated note'
                };
                
                const res = await request(getServer())
                    .patch(`/callLog?jwtToken=${jwtToken}`)
                    .send(patchBody);
                
                expect(res.status).toEqual(200);
                expect(res.body.successful).toEqual(false);
                
                // Clean up
                await CallLogModel.destroy({ where: { id: 'callId403' } });
                nock.cleanAll();
            }
        });
    });

    describe('500 Internal Server Error Responses', () => {
        test('contact search - 500 should return unsuccessful', async () => {
            for (const platform of pipedriveStylePlatforms) {
                const jwtToken = jwt.generateJwt({
                    id: userId,
                    rcUserNumber,
                    platform: platform.name
                });
                
                const platformScope = nock(platform.domain)
                    .get(`${platform.contactPath}/search`)
                    .query(true)
                    .reply(500, {
                        error: 'Internal Server Error',
                        message: 'An unexpected error occurred'
                    });
                
                const res = await request(getServer())
                    .get(`/contact?jwtToken=${jwtToken}&phoneNumber=${phoneNumber}`);
                
                expect(res.status).toEqual(200);
                expect(res.body.successful).toEqual(false);
                
                nock.cleanAll();
            }
        });

        test('call log creation - 500 should return unsuccessful', async () => {
            for (const platform of pipedriveStylePlatforms) {
                const jwtToken = jwt.generateJwt({
                    id: userId,
                    rcUserNumber,
                    platform: platform.name
                });
                
                const platformFindContactScope = nock(platform.domain)
                    .get(`${platform.contactPath}/${contactId}`)
                    .reply(200, { data: { id: contactId, name: 'Test Contact' } });
                
                const platformCreateLogScope = nock(platform.domain)
                    .post(platform.callLogPath)
                    .reply(500, {
                        error: 'Internal Server Error',
                        message: 'Database connection failed'
                    });
                
                const postBody = {
                    logInfo: {
                        id: 'newCallId500',
                        sessionId: 'newSessionId500',
                        telephonySessionId: 'newTelSessionId500',
                        direction: 'Outbound',
                        from: { name: '', phoneNumber },
                        to: { name: '', phoneNumber },
                        duration: 60,
                        result: 'Completed',
                        note: 'Test call',
                        startTime: Date.now()
                    },
                    contactId
                };
                
                const res = await request(getServer())
                    .post(`/callLog?jwtToken=${jwtToken}`)
                    .send(postBody);
                
                expect(res.status).toEqual(200);
                expect(res.body.successful).toEqual(false);
                
                nock.cleanAll();
            }
        });

        test('call log update - 500 should return unsuccessful', async () => {
            for (const platform of pipedriveStylePlatforms) {
                // Create a call log for testing
                await CallLogModel.create({
                    id: 'callId500',
                    sessionId: 'sessionId500',
                    platform: platform.name,
                    thirdPartyLogId: 'thirdPartyLogId500',
                    userId: userId
                });
                
                const jwtToken = jwt.generateJwt({
                    id: userId,
                    rcUserNumber,
                    platform: platform.name
                });
                
                const platformGetLogScope = nock(platform.domain)
                    .get(`${platform.callLogPath}/thirdPartyLogId500`)
                    .reply(200, { data: { note: 'Original note' } });
                
                const platformPatchLogScope = nock(platform.domain)
                    .patch(`${platform.callLogPath}/thirdPartyLogId500`)
                    .reply(500, {
                        error: 'Internal Server Error',
                        message: 'Service temporarily unavailable'
                    });
                
                const patchBody = {
                    sessionId: 'sessionId500',
                    recordingLink: 'https://recording.link'
                };
                
                const res = await request(getServer())
                    .patch(`/callLog?jwtToken=${jwtToken}`)
                    .send(patchBody);
                
                expect(res.status).toEqual(200);
                expect(res.body.successful).toEqual(false);
                
                // Clean up
                await CallLogModel.destroy({ where: { id: 'callId500' } });
                nock.cleanAll();
            }
        });
    });

    describe('Network/Timeout Error Scenarios', () => {
        test('contact search - network error should return unsuccessful', async () => {
            for (const platform of pipedriveStylePlatforms) {
                const jwtToken = jwt.generateJwt({
                    id: userId,
                    rcUserNumber,
                    platform: platform.name
                });
                
                const platformScope = nock(platform.domain)
                    .get(`${platform.contactPath}/search`)
                    .query(true)
                    .replyWithError('Network connection failed');
                
                const res = await request(getServer())
                    .get(`/contact?jwtToken=${jwtToken}&phoneNumber=${phoneNumber}`);
                
                expect(res.status).toEqual(200);
                expect(res.body.successful).toEqual(false);
                
                nock.cleanAll();
            }
        });
    });

    describe('502 Bad Gateway Responses', () => {
        test('contact search - 502 should return unsuccessful', async () => {
            for (const platform of pipedriveStylePlatforms) {
                const jwtToken = jwt.generateJwt({
                    id: userId,
                    rcUserNumber,
                    platform: platform.name
                });
                
                const platformScope = nock(platform.domain)
                    .get(`${platform.contactPath}/search`)
                    .query(true)
                    .reply(502, 'Bad Gateway');
                
                const res = await request(getServer())
                    .get(`/contact?jwtToken=${jwtToken}&phoneNumber=${phoneNumber}`);
                
                expect(res.status).toEqual(200);
                expect(res.body.successful).toEqual(false);
                
                nock.cleanAll();
            }
        });
    });

    describe('503 Service Unavailable Responses', () => {
        test('call log creation - 503 should return unsuccessful', async () => {
            for (const platform of pipedriveStylePlatforms) {
                const jwtToken = jwt.generateJwt({
                    id: userId,
                    rcUserNumber,
                    platform: platform.name
                });
                
                const platformFindContactScope = nock(platform.domain)
                    .get(`${platform.contactPath}/${contactId}`)
                    .reply(200, { data: { id: contactId, name: 'Test Contact' } });
                
                const platformCreateLogScope = nock(platform.domain)
                    .post(platform.callLogPath)
                    .reply(503, {
                        error: 'Service Unavailable',
                        message: 'Service is temporarily under maintenance'
                    });
                
                const postBody = {
                    logInfo: {
                        id: 'newCallId503',
                        sessionId: 'newSessionId503',
                        telephonySessionId: 'newTelSessionId503',
                        direction: 'Inbound',
                        from: { name: '', phoneNumber },
                        to: { name: '', phoneNumber },
                        duration: 90,
                        result: 'Completed',
                        note: 'Test call',
                        startTime: Date.now()
                    },
                    contactId
                };
                
                const res = await request(getServer())
                    .post(`/callLog?jwtToken=${jwtToken}`)
                    .send(postBody);
                
                expect(res.status).toEqual(200);
                expect(res.body.successful).toEqual(false);
                
                nock.cleanAll();
            }
        });
    });

    describe('Empty/Invalid Response Bodies', () => {
        test('contact search - empty response should be handled gracefully', async () => {
            for (const platform of pipedriveStylePlatforms) {
                const jwtToken = jwt.generateJwt({
                    id: userId,
                    rcUserNumber,
                    platform: platform.name
                });
                
                const platformScope = nock(platform.domain)
                    .get(`${platform.contactPath}/search`)
                    .query(true)
                    .reply(200, null);
                
                const res = await request(getServer())
                    .get(`/contact?jwtToken=${jwtToken}&phoneNumber=${phoneNumber}`);
                
                // Should not crash, might return unsuccessful or empty results
                expect(res.status).not.toEqual(500);
                
                nock.cleanAll();
            }
        });

        test('contact search - malformed JSON should be handled gracefully', async () => {
            for (const platform of pipedriveStylePlatforms) {
                const jwtToken = jwt.generateJwt({
                    id: userId,
                    rcUserNumber,
                    platform: platform.name
                });
                
                const platformScope = nock(platform.domain)
                    .get(`${platform.contactPath}/search`)
                    .query(true)
                    .reply(200, 'not valid json', { 'Content-Type': 'text/plain' });
                
                const res = await request(getServer())
                    .get(`/contact?jwtToken=${jwtToken}&phoneNumber=${phoneNumber}`);
                
                // Should not crash
                expect(res.status).not.toEqual(500);
                
                nock.cleanAll();
            }
        });
    });
});

