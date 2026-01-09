/* eslint-disable no-undef */
/**
 * Comprehensive integration tests for Pipedrive connector
 * Tests all exported functions with success and error scenarios
 */

const nock = require('nock');
const pipedrive = require('../../src/connectors/pipedrive');
const { mockRateLimitHeaders, createMockUser, createMockContact, createMockCallLog, createMockMessage, createMockExistingCallLog, createMockExistingMessageLog } = require('../fixtures/connectorMocks');

// Mock dependencies
jest.mock('@app-connect/core/lib/jwt', () => ({
    decodeJwt: jest.fn().mockReturnValue({ id: 'decoded-user-id' })
}));

jest.mock('@app-connect/core/models/userModel', () => ({
    UserModel: {
        findByPk: jest.fn()
    }
}));

jest.mock('@app-connect/core/models/adminConfigModel', () => ({
    AdminConfigModel: {
        findByPk: jest.fn()
    }
}));

const { UserModel } = require('@app-connect/core/models/userModel');
const { AdminConfigModel } = require('@app-connect/core/models/adminConfigModel');

describe('Pipedrive Connector', () => {
    const hostname = 'testcompany.pipedrive.com';
    const authHeader = 'Bearer test-access-token';
    
    let mockUser;

    beforeEach(() => {
        nock.cleanAll();
        jest.clearAllMocks();
        
        mockUser = createMockUser({
            id: '12345-pipedrive',
            hostname,
            platform: 'pipedrive',
            timezoneOffset: '-05:00',
            userSettings: {}
        });
    });

    afterEach(() => {
        nock.cleanAll();
    });

    // ==================== getAuthType ====================
    describe('getAuthType', () => {
        it('should return oauth', () => {
            expect(pipedrive.getAuthType()).toBe('oauth');
        });
    });

    // ==================== getLogFormatType ====================
    describe('getLogFormatType', () => {
        it('should return HTML format type', () => {
            const result = pipedrive.getLogFormatType();
            expect(result).toBe('text/html');
        });
    });

    // ==================== getOauthInfo ====================
    describe('getOauthInfo', () => {
        it('should return OAuth configuration from environment variables', async () => {
            process.env.PIPEDRIVE_CLIENT_ID = 'test-client-id';
            process.env.PIPEDRIVE_CLIENT_SECRET = 'test-client-secret';
            process.env.PIPEDRIVE_ACCESS_TOKEN_URI = 'https://oauth.pipedrive.com/oauth/token';
            process.env.PIPEDRIVE_REDIRECT_URI = 'https://example.com/callback';

            const result = await pipedrive.getOauthInfo();

            expect(result).toEqual({
                clientId: 'test-client-id',
                clientSecret: 'test-client-secret',
                accessTokenUri: 'https://oauth.pipedrive.com/oauth/token',
                redirectUri: 'https://example.com/callback'
            });
        });
    });

    // ==================== getUserInfo ====================
    describe('getUserInfo', () => {
        it('should return user info on successful API call', async () => {
            nock('https://api.pipedrive.com')
                .get('/v1/users/me')
                .reply(200, {
                    data: {
                        id: 12345,
                        name: 'Test User',
                        timezone_name: 'America/New_York',
                        timezone_offset: '-05:00',
                        company_id: 1,
                        company_name: 'Test Company',
                        company_domain: 'testcompany'
                    }
                }, mockRateLimitHeaders);

            const result = await pipedrive.getUserInfo({ authHeader, hostname });

            expect(result.successful).toBe(true);
            expect(result.platformUserInfo.id).toBe('12345-pipedrive');
            expect(result.platformUserInfo.name).toBe('Test User');
            expect(result.platformUserInfo.timezoneName).toBe('America/New_York');
            expect(result.returnMessage.messageType).toBe('success');
        });

        it('should override hostname when hostname is temp', async () => {
            nock('https://api.pipedrive.com')
                .get('/v1/users/me')
                .reply(200, {
                    data: {
                        id: 12345,
                        name: 'Test User',
                        timezone_name: 'America/New_York',
                        timezone_offset: '-05:00',
                        company_id: 1,
                        company_name: 'Test Company',
                        company_domain: 'testcompany'
                    }
                }, mockRateLimitHeaders);

            const result = await pipedrive.getUserInfo({ authHeader, hostname: 'temp' });

            expect(result.successful).toBe(true);
            expect(result.platformUserInfo.overridingHostname).toBe('testcompany.pipedrive.com');
        });

        it('should return error on API failure', async () => {
            nock('https://api.pipedrive.com')
                .get('/v1/users/me')
                .reply(401, { error: 'Unauthorized' });

            const result = await pipedrive.getUserInfo({ authHeader, hostname });

            expect(result.successful).toBe(false);
            expect(result.returnMessage.messageType).toBe('warning');
            expect(result.returnMessage.message).toContain('Could not load user information');
        });
    });

    // ==================== unAuthorize ====================
    describe('unAuthorize', () => {
        it('should revoke tokens and clear user credentials', async () => {
            process.env.PIPEDRIVE_CLIENT_ID = 'test-client-id';
            process.env.PIPEDRIVE_CLIENT_SECRET = 'test-client-secret';
            const basicAuth = Buffer.from('test-client-id:test-client-secret').toString('base64');

            nock('https://oauth.pipedrive.com')
                .post('/oauth/revoke')
                .reply(200, {});

            nock('https://oauth.pipedrive.com')
                .post('/oauth/revoke')
                .reply(200, {});

            const user = createMockUser({
                id: '12345-pipedrive',
                accessToken: 'test-access-token',
                refreshToken: 'test-refresh-token'
            });

            const result = await pipedrive.unAuthorize({ user });

            expect(result.returnMessage.messageType).toBe('success');
            expect(result.returnMessage.message).toBe('Logged out of Pipedrive');
            expect(user.save).toHaveBeenCalled();
        });
    });

    // ==================== findContact ====================
    describe('findContact', () => {
        it('should return empty array for extension numbers', async () => {
            const result = await pipedrive.findContact({
                user: mockUser,
                authHeader,
                phoneNumber: '1234',
                overridingFormat: '',
                isExtension: 'true'
            });

            expect(result.successful).toBe(false);
            expect(result.matchedContactInfo).toEqual([]);
        });

        it('should return warning for internal extension numbers without +', async () => {
            const result = await pipedrive.findContact({
                user: mockUser,
                authHeader,
                phoneNumber: '1234',
                overridingFormat: '',
                isExtension: 'false'
            });

            expect(result.matchedContactInfo).toBeNull();
            expect(result.returnMessage.messageType).toBe('warning');
            expect(result.returnMessage.message).toContain('internal extension');
        });

        it('should find contacts by phone number', async () => {
            nock(`https://${hostname}`)
                .get('/api/v2/persons/search')
                .query(true)
                .reply(200, {
                    data: {
                        items: [{
                            item: {
                                id: 101,
                                name: 'John Doe',
                                phone: '+14155551234',
                                organization: { name: 'Test Org' },
                                update_time: '2024-01-15T10:00:00Z'
                            }
                        }]
                    }
                }, mockRateLimitHeaders);

            nock(`https://${hostname}`)
                .get('/api/v2/deals')
                .query({ person_id: 101, status: 'open' })
                .reply(200, {
                    data: [{ id: 201, title: 'Test Deal' }]
                }, mockRateLimitHeaders);

            nock(`https://${hostname}`)
                .get('/v1/leads')
                .query({ person_id: 101 })
                .reply(200, {
                    data: [{ id: 301, title: 'Test Lead' }]
                }, mockRateLimitHeaders);

            const result = await pipedrive.findContact({
                user: mockUser,
                authHeader,
                phoneNumber: '+1 4155551234',
                overridingFormat: '',
                isExtension: 'false'
            });

            expect(result.successful).toBe(true);
            expect(result.matchedContactInfo.length).toBeGreaterThan(0);
            expect(result.matchedContactInfo[0].name).toBe('John Doe');
            expect(result.matchedContactInfo[0].additionalInfo.deals).toBeDefined();
            expect(result.matchedContactInfo[0].additionalInfo.leads).toBeDefined();
        });

        it('should include create new contact option', async () => {
            nock(`https://${hostname}`)
                .get('/api/v2/persons/search')
                .query(true)
                .reply(200, { data: { items: [] } }, mockRateLimitHeaders);

            const result = await pipedrive.findContact({
                user: mockUser,
                authHeader,
                phoneNumber: '+1 4155551234',
                overridingFormat: '',
                isExtension: 'false'
            });

            expect(result.successful).toBe(true);
            const createNewOption = result.matchedContactInfo.find(c => c.id === 'createNewContact');
            expect(createNewOption).toBeDefined();
            expect(createNewOption.isNewContact).toBe(true);
        });

        it('should handle leads API failure gracefully', async () => {
            nock(`https://${hostname}`)
                .get('/api/v2/persons/search')
                .query(true)
                .reply(200, {
                    data: {
                        items: [{
                            item: {
                                id: 101,
                                name: 'John Doe',
                                phone: '+14155551234',
                                update_time: '2024-01-15T10:00:00Z'
                            }
                        }]
                    }
                }, mockRateLimitHeaders);

            nock(`https://${hostname}`)
                .get('/api/v2/deals')
                .query({ person_id: 101, status: 'open' })
                .reply(200, { data: [] }, mockRateLimitHeaders);

            nock(`https://${hostname}`)
                .get('/v1/leads')
                .query({ person_id: 101 })
                .reply(500, { error: 'Internal Server Error' });

            const result = await pipedrive.findContact({
                user: mockUser,
                authHeader,
                phoneNumber: '+1 4155551234',
                overridingFormat: '',
                isExtension: 'false'
            });

            expect(result.successful).toBe(true);
            expect(result.matchedContactInfo.length).toBeGreaterThan(0);
        });
    });

    // ==================== findContactWithName ====================
    describe('findContactWithName', () => {
        it('should find contacts by name', async () => {
            nock(`https://${hostname}`)
                .get('/api/v2/persons/search')
                .query({ term: 'John Doe', fields: 'name' })
                .reply(200, {
                    data: {
                        items: [{
                            item: {
                                id: 101,
                                name: 'John Doe',
                                phone: '+14155551234',
                                update_time: '2024-01-15T10:00:00Z'
                            }
                        }]
                    }
                }, mockRateLimitHeaders);

            nock(`https://${hostname}`)
                .get('/api/v2/deals')
                .query({ person_id: 101, status: 'open' })
                .reply(200, { data: [] }, mockRateLimitHeaders);

            nock(`https://${hostname}`)
                .get('/v1/leads')
                .query({ person_id: 101 })
                .reply(200, { data: [] }, mockRateLimitHeaders);

            const result = await pipedrive.findContactWithName({
                user: mockUser,
                authHeader,
                name: 'John Doe'
            });

            expect(result.successful).toBe(true);
            expect(result.matchedContactInfo.length).toBe(1);
            expect(result.matchedContactInfo[0].name).toBe('John Doe');
        });

        it('should return empty array when no contacts found', async () => {
            nock(`https://${hostname}`)
                .get('/api/v2/persons/search')
                .query({ term: 'Nobody', fields: 'name' })
                .reply(200, { data: { items: [] } }, mockRateLimitHeaders);

            const result = await pipedrive.findContactWithName({
                user: mockUser,
                authHeader,
                name: 'Nobody'
            });

            expect(result.successful).toBe(true);
            expect(result.matchedContactInfo).toEqual([]);
        });
    });

    // ==================== createContact ====================
    describe('createContact', () => {
        it('should create a new contact', async () => {
            nock(`https://${hostname}`)
                .post('/v1/persons', {
                    name: 'John Doe',
                    phone: '+14155551234'
                })
                .reply(201, {
                    data: {
                        id: 102,
                        name: 'John Doe'
                    }
                }, mockRateLimitHeaders);

            const result = await pipedrive.createContact({
                user: mockUser,
                authHeader,
                phoneNumber: '+14155551234',
                newContactName: 'John Doe'
            });

            expect(result.contactInfo.id).toBe(102);
            expect(result.contactInfo.name).toBe('John Doe');
            expect(result.returnMessage.messageType).toBe('success');
        });
    });

    // ==================== getUserList ====================
    describe('getUserList', () => {
        it('should return list of non-deleted users', async () => {
            nock(`https://${hostname}`)
                .get('/api/v1/users')
                .reply(200, {
                    data: [
                        { id: 1, name: 'User One', email: 'user1@example.com', is_deleted: false },
                        { id: 2, name: 'User Two', email: 'user2@example.com', is_deleted: false },
                        { id: 3, name: 'Deleted User', email: 'deleted@example.com', is_deleted: true }
                    ]
                }, mockRateLimitHeaders);

            const result = await pipedrive.getUserList({
                user: mockUser,
                authHeader
            });

            expect(result.length).toBe(2);
            expect(result[0].id).toBe(1);
            expect(result[0].name).toBe('User One');
            expect(result[1].id).toBe(2);
        });
    });

    // ==================== createCallLog ====================
    describe('createCallLog', () => {
        const mockContact = createMockContact({ id: 101, name: 'John Doe', phone: '+14155551234' });
        const mockCallLogData = createMockCallLog();

        beforeEach(() => {
            nock(`https://${hostname}`)
                .get('/api/v2/persons/101')
                .reply(200, { data: { org_id: 201 } }, mockRateLimitHeaders);
        });

        it('should create a call log with all fields', async () => {
            nock(`https://${hostname}`)
                .post('/api/v2/activities')
                .reply(201, {
                    data: { id: 401 }
                }, mockRateLimitHeaders);

            const result = await pipedrive.createCallLog({
                user: mockUser,
                contactInfo: mockContact,
                authHeader,
                callLog: mockCallLogData,
                note: 'Test note',
                additionalSubmission: { deals: 201 },
                aiNote: 'AI generated note',
                transcript: 'Call transcript',
                composedLogDetails: '<b>Call details</b>',
                hashedAccountId: 'hash-123'
            });

            expect(result.logId).toBe(401);
            expect(result.returnMessage.messageType).toBe('success');
            expect(result.extraDataTracking).toBeDefined();
        });

        it('should create call log with lead when no deal selected', async () => {
            nock(`https://${hostname}`)
                .post('/api/v2/activities', body => {
                    return body.lead_id === 301 && !body.deal_id;
                })
                .reply(201, {
                    data: { id: 402 }
                }, mockRateLimitHeaders);

            const result = await pipedrive.createCallLog({
                user: mockUser,
                contactInfo: mockContact,
                authHeader,
                callLog: mockCallLogData,
                note: 'Test note',
                additionalSubmission: { leads: 301 },
                aiNote: null,
                transcript: null,
                composedLogDetails: 'Call details',
                hashedAccountId: 'hash-123'
            });

            expect(result.logId).toBe(402);
        });

        it('should handle admin assigned user', async () => {
            UserModel.findByPk.mockResolvedValue({
                platformAdditionalInfo: { id: 999 }
            });

            nock(`https://${hostname}`)
                .post('/api/v2/activities', body => {
                    return body.owner_id === 999;
                })
                .reply(201, {
                    data: { id: 403 }
                }, mockRateLimitHeaders);

            const result = await pipedrive.createCallLog({
                user: mockUser,
                contactInfo: mockContact,
                authHeader,
                callLog: mockCallLogData,
                note: 'Test note',
                additionalSubmission: {
                    isAssignedToUser: true,
                    adminAssignedUserToken: 'valid-jwt-token'
                },
                aiNote: null,
                transcript: null,
                composedLogDetails: 'Call details',
                hashedAccountId: 'hash-123'
            });

            expect(result.logId).toBe(403);
        });

        it('should use custom subject when provided', async () => {
            nock(`https://${hostname}`)
                .post('/api/v2/activities', body => {
                    return body.subject === 'Custom Subject';
                })
                .reply(201, {
                    data: { id: 404 }
                }, mockRateLimitHeaders);

            const callLogWithCustomSubject = { ...mockCallLogData, customSubject: 'Custom Subject' };

            const result = await pipedrive.createCallLog({
                user: mockUser,
                contactInfo: mockContact,
                authHeader,
                callLog: callLogWithCustomSubject,
                note: 'Test note',
                additionalSubmission: null,
                aiNote: null,
                transcript: null,
                composedLogDetails: 'Call details',
                hashedAccountId: 'hash-123'
            });

            expect(result.logId).toBe(404);
        });
    });

    // ==================== updateCallLog ====================
    describe('updateCallLog', () => {
        const existingCallLog = createMockExistingCallLog({ thirdPartyLogId: '401' });

        it('should update an existing call log', async () => {
            nock(`https://${hostname}`)
                .get('/api/v2/activities/401')
                .reply(200, {
                    data: { id: 401, note: 'Existing note' }
                }, mockRateLimitHeaders);

            nock(`https://${hostname}`)
                .patch('/api/v2/activities/401')
                .reply(200, {
                    data: { id: 401 }
                }, mockRateLimitHeaders);

            const result = await pipedrive.updateCallLog({
                user: mockUser,
                existingCallLog,
                authHeader,
                recordingLink: 'https://recording.example.com/123',
                subject: 'Updated Subject',
                note: 'Updated note',
                startTime: Date.now(),
                duration: 600,
                result: 'Connected',
                aiNote: 'AI note',
                transcript: 'Transcript',
                additionalSubmission: null,
                composedLogDetails: 'Updated details',
                existingCallLogDetails: null,
                hashedAccountId: 'hash-123'
            });

            expect(result.returnMessage.messageType).toBe('success');
            expect(result.updatedNote).toBe('Updated details');
        });

        it('should use existing call log details when provided', async () => {
            nock(`https://${hostname}`)
                .patch('/api/v2/activities/401')
                .reply(200, {
                    data: { id: 401 }
                }, mockRateLimitHeaders);

            const existingCallLogDetails = {
                id: 401,
                note: 'Existing note'
            };

            const result = await pipedrive.updateCallLog({
                user: mockUser,
                existingCallLog,
                authHeader,
                recordingLink: null,
                subject: null,
                note: null,
                startTime: null,
                duration: 300,
                result: null,
                aiNote: null,
                transcript: null,
                additionalSubmission: null,
                composedLogDetails: 'New details',
                existingCallLogDetails,
                hashedAccountId: 'hash-123'
            });

            expect(result.returnMessage.messageType).toBe('success');
        });

        it('should fetch existing log when details not provided', async () => {
            nock(`https://${hostname}`)
                .get('/api/v2/activities/401')
                .reply(200, {
                    data: { id: 401, note: 'Existing note' }
                }, mockRateLimitHeaders);

            nock(`https://${hostname}`)
                .patch('/api/v2/activities/401')
                .reply(200, {
                    data: { id: 401 }
                }, mockRateLimitHeaders);

            const result = await pipedrive.updateCallLog({
                user: mockUser,
                existingCallLog,
                authHeader,
                recordingLink: null,
                subject: null,
                note: null,
                startTime: null,
                duration: null,
                result: null,
                aiNote: null,
                transcript: null,
                additionalSubmission: null,
                composedLogDetails: 'New details',
                existingCallLogDetails: null,
                hashedAccountId: 'hash-123'
            });

            expect(result.returnMessage.messageType).toBe('success');
        });
    });

    // ==================== upsertCallDisposition ====================
    describe('upsertCallDisposition', () => {
        const existingCallLog = createMockExistingCallLog({ thirdPartyLogId: '401' });

        it('should update disposition with deal', async () => {
            nock(`https://${hostname}`)
                .patch('/api/v2/activities/401', body => {
                    return body.deal_id === 201 && body.lead_id === null;
                })
                .reply(200, {
                    data: { id: 401 }
                }, mockRateLimitHeaders);

            const result = await pipedrive.upsertCallDisposition({
                user: mockUser,
                existingCallLog,
                authHeader,
                dispositions: { deals: 201 }
            });

            expect(result.logId).toBe('401');
        });

        it('should update disposition with lead when no deal', async () => {
            nock(`https://${hostname}`)
                .patch('/api/v2/activities/401', body => {
                    return body.lead_id === 301 && body.deal_id === null;
                })
                .reply(200, {
                    data: { id: 401 }
                }, mockRateLimitHeaders);

            const result = await pipedrive.upsertCallDisposition({
                user: mockUser,
                existingCallLog,
                authHeader,
                dispositions: { leads: 301 }
            });

            expect(result.logId).toBe('401');
        });

        it('should return null logId when no dispositions provided', async () => {
            const result = await pipedrive.upsertCallDisposition({
                user: mockUser,
                existingCallLog,
                authHeader,
                dispositions: {}
            });

            expect(result.logId).toBeNull();
        });
    });

    // ==================== getCallLog ====================
    describe('getCallLog', () => {
        it('should retrieve call log details', async () => {
            nock(`https://${hostname}`)
                .get('/api/v2/activities/401')
                .reply(200, {
                    data: {
                        id: 401,
                        subject: 'Test Call',
                        note: '<b>Agent notes</b>Test note<b>Call details</b>',
                        deal_id: 201,
                        lead_id: null
                    },
                    related_objects: {
                        person: {
                            '101': { name: 'John Doe' }
                        }
                    }
                }, mockRateLimitHeaders);

            const result = await pipedrive.getCallLog({
                user: mockUser,
                callLogId: '401',
                authHeader
            });

            expect(result.callLogInfo.subject).toBe('Test Call');
            expect(result.callLogInfo.note).toBe('Test note');
            expect(result.callLogInfo.contactName).toBe('John Doe');
            expect(result.callLogInfo.dispositions.deals).toBe(201);
        });

        it('should handle missing contact in related objects', async () => {
            nock(`https://${hostname}`)
                .get('/api/v2/activities/401')
                .reply(200, {
                    data: {
                        id: 401,
                        subject: 'Test Call',
                        note: 'Simple note',
                        deal_id: null,
                        lead_id: null
                    },
                    related_objects: {}
                }, mockRateLimitHeaders);

            const result = await pipedrive.getCallLog({
                user: mockUser,
                callLogId: '401',
                authHeader
            });

            expect(result.callLogInfo.subject).toBe('Test Call');
            expect(result.callLogInfo.contactName).toBe('Unknown');
        });
    });

    // ==================== createMessageLog ====================
    describe('createMessageLog', () => {
        const mockContact = createMockContact({ id: 101, name: 'John Doe', phoneNumber: '+14155551234' });
        const mockMessageData = createMockMessage();

        beforeEach(() => {
            nock(`https://${hostname}`)
                .get('/v1/users/me')
                .reply(200, {
                    data: { name: 'Test User' }
                }, mockRateLimitHeaders);

            nock(`https://${hostname}`)
                .get('/api/v2/persons/101')
                .reply(200, { data: { org_id: 201 } }, mockRateLimitHeaders);

            nock(`https://${hostname}`)
                .get('/v1/activityTypes')
                .reply(200, {
                    data: [
                        { name: 'SMS', key_string: 'sms', active_flag: true },
                        { name: 'Call', key_string: 'call', active_flag: true }
                    ]
                }, mockRateLimitHeaders);
        });

        it('should create an SMS message log', async () => {
            nock(`https://${hostname}`)
                .post('/api/v2/activities')
                .reply(201, {
                    data: { id: 501 }
                }, mockRateLimitHeaders);

            const result = await pipedrive.createMessageLog({
                user: mockUser,
                contactInfo: mockContact,
                authHeader,
                message: mockMessageData,
                additionalSubmission: { deals: 201 },
                recordingLink: null,
                faxDocLink: null
            });

            expect(result.logId).toBe(501);
            expect(result.returnMessage.message).toBe('Message logged');
        });

        it('should create a voicemail message log', async () => {
            nock(`https://${hostname}`)
                .post('/api/v2/activities')
                .reply(201, {
                    data: { id: 502 }
                }, mockRateLimitHeaders);

            const result = await pipedrive.createMessageLog({
                user: mockUser,
                contactInfo: mockContact,
                authHeader,
                message: mockMessageData,
                additionalSubmission: null,
                recordingLink: 'https://recording.example.com/voicemail.mp3',
                faxDocLink: null
            });

            expect(result.logId).toBe(502);
        });

        it('should create a fax message log', async () => {
            nock(`https://${hostname}`)
                .post('/api/v2/activities')
                .reply(201, {
                    data: { id: 503 }
                }, mockRateLimitHeaders);

            const result = await pipedrive.createMessageLog({
                user: mockUser,
                contactInfo: mockContact,
                authHeader,
                message: mockMessageData,
                additionalSubmission: null,
                recordingLink: null,
                faxDocLink: 'https://fax.example.com/document.pdf'
            });

            expect(result.logId).toBe(503);
        });

        it('should use lead when no deal selected', async () => {
            nock(`https://${hostname}`)
                .post('/api/v2/activities', body => {
                    return body.lead_id === 301;
                })
                .reply(201, {
                    data: { id: 504 }
                }, mockRateLimitHeaders);

            const result = await pipedrive.createMessageLog({
                user: mockUser,
                contactInfo: mockContact,
                authHeader,
                message: mockMessageData,
                additionalSubmission: { leads: 301 },
                recordingLink: null,
                faxDocLink: null
            });

            expect(result.logId).toBe(504);
        });
    });

    // ==================== updateMessageLog ====================
    describe('updateMessageLog', () => {
        const mockContact = createMockContact({ id: 101, name: 'John Doe', phoneNumber: '+14155551234' });
        const mockMessageData = createMockMessage();
        const existingMessageLog = createMockExistingMessageLog({ thirdPartyLogId: '501' });

        it('should update an existing message log', async () => {
            nock('https://api.pipedrive.com')
                .get('/v1/users/me')
                .reply(200, {
                    data: { name: 'Test User' }
                });

            nock(`https://${hostname}`)
                .get('/api/v2/activities/501')
                .reply(200, {
                    data: {
                        id: 501,
                        note: '<br>Conversation(1 messages)<br>BEGIN<br>------------<br><ul><li>John Doe 10:00 AM<br><b>First message</b></li></ul>------------<br>END<br>'
                    }
                }, mockRateLimitHeaders);

            nock(`https://${hostname}`)
                .patch('/api/v2/activities/501')
                .reply(200, {
                    data: { id: 501 }
                }, mockRateLimitHeaders);

            const result = await pipedrive.updateMessageLog({
                user: mockUser,
                contactInfo: mockContact,
                existingMessageLog,
                message: { ...mockMessageData, subject: 'Second message' },
                authHeader,
                additionalSubmission: null
            });

            expect(result.extraDataTracking).toBeDefined();
        });
    });

    // ==================== Error Scenarios ====================
    describe('Error Scenarios', () => {
        it('should handle 429 rate limit errors', async () => {
            nock(`https://${hostname}`)
                .get('/api/v2/persons/search')
                .query(true)
                .reply(429, { error: 'Rate limit exceeded' }, {
                    'x-ratelimit-remaining': '0',
                    'x-ratelimit-limit': '1000',
                    'x-ratelimit-reset': '60'
                });

            await expect(pipedrive.findContact({
                user: mockUser,
                authHeader,
                phoneNumber: '+1 4155551234',
                overridingFormat: '',
                isExtension: 'false'
            })).rejects.toThrow();
        });

        it('should handle 500 server errors', async () => {
            nock(`https://${hostname}`)
                .post('/api/v2/activities')
                .reply(500, { error: 'Internal server error' });

            nock(`https://${hostname}`)
                .get('/api/v2/persons/101')
                .reply(200, { data: { org_id: 201 } }, mockRateLimitHeaders);

            const mockContact = createMockContact({ id: 101 });
            const mockCallLogData = createMockCallLog();

            await expect(pipedrive.createCallLog({
                user: mockUser,
                contactInfo: mockContact,
                authHeader,
                callLog: mockCallLogData,
                note: 'Test',
                additionalSubmission: null,
                aiNote: null,
                transcript: null,
                composedLogDetails: 'Details',
                hashedAccountId: 'hash-123'
            })).rejects.toThrow();
        });

        it('should handle network errors', async () => {
            nock(`https://${hostname}`)
                .get('/api/v2/persons/search')
                .query(true)
                .replyWithError('Network error');

            await expect(pipedrive.findContact({
                user: mockUser,
                authHeader,
                phoneNumber: '+1 4155551234',
                overridingFormat: '',
                isExtension: 'false'
            })).rejects.toThrow();
        });
    });

    // ==================== Duration Formatting ====================
    describe('Duration Formatting', () => {
        it('should format duration correctly for various values', async () => {
            nock(`https://${hostname}`)
                .get('/api/v2/persons/101')
                .reply(200, { data: { org_id: 201 } }, mockRateLimitHeaders);

            // Test with 5 minutes (300 seconds) - should be 00:06 (5 minutes + 1)
            nock(`https://${hostname}`)
                .post('/api/v2/activities', body => {
                    return body.duration === '00:06';
                })
                .reply(201, { data: { id: 405 } }, mockRateLimitHeaders);

            const mockContact = createMockContact({ id: 101 });
            const callLog = createMockCallLog({ duration: 300 });

            const result = await pipedrive.createCallLog({
                user: mockUser,
                contactInfo: mockContact,
                authHeader,
                callLog,
                note: 'Test',
                additionalSubmission: null,
                aiNote: null,
                transcript: null,
                composedLogDetails: 'Details',
                hashedAccountId: 'hash-123'
            });

            expect(result.logId).toBe(405);
        });

        it('should handle duration over an hour', async () => {
            nock(`https://${hostname}`)
                .get('/api/v2/persons/101')
                .reply(200, { data: { org_id: 201 } }, mockRateLimitHeaders);

            // Test with 75 minutes (4500 seconds)
            nock(`https://${hostname}`)
                .post('/api/v2/activities', body => {
                    return body.duration === '01:16'; // 1 hour, 15 min + 1
                })
                .reply(201, { data: { id: 406 } }, mockRateLimitHeaders);

            const mockContact = createMockContact({ id: 101 });
            const callLog = createMockCallLog({ duration: 4500 });

            const result = await pipedrive.createCallLog({
                user: mockUser,
                contactInfo: mockContact,
                authHeader,
                callLog,
                note: 'Test',
                additionalSubmission: null,
                aiNote: null,
                transcript: null,
                composedLogDetails: 'Details',
                hashedAccountId: 'hash-123'
            });

            expect(result.logId).toBe(406);
        });

        it('should handle non-number duration', async () => {
            nock(`https://${hostname}`)
                .get('/api/v2/persons/101')
                .reply(200, { data: { org_id: 201 } }, mockRateLimitHeaders);

            nock(`https://${hostname}`)
                .post('/api/v2/activities', body => {
                    return body.duration === '00:00';
                })
                .reply(201, { data: { id: 407 } }, mockRateLimitHeaders);

            const mockContact = createMockContact({ id: 101 });
            const callLog = createMockCallLog({ duration: 'pending' });

            const result = await pipedrive.createCallLog({
                user: mockUser,
                contactInfo: mockContact,
                authHeader,
                callLog,
                note: 'Test',
                additionalSubmission: null,
                aiNote: null,
                transcript: null,
                composedLogDetails: 'Details',
                hashedAccountId: 'hash-123'
            });

            expect(result.logId).toBe(407);
        });
    });
});

