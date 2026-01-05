/* eslint-disable no-undef */
/**
 * Comprehensive integration tests for Clio connector
 * Tests all exported functions with success and error scenarios
 */

const nock = require('nock');
const clio = require('../../src/connectors/clio');
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

describe('Clio Connector', () => {
    const apiUrl = 'https://app.clio.com';
    const hostname = 'app.clio.com';
    const authHeader = 'Bearer test-access-token';
    
    let mockUser;

    beforeEach(() => {
        nock.cleanAll();
        jest.clearAllMocks();
        
        process.env.CLIO_CLIENT_ID = 'test-client-id';
        process.env.CLIO_CLIENT_SECRET = 'test-client-secret';
        process.env.CLIO_REDIRECT_URI = 'https://example.com/callback';
        process.env.CLIO_ACCESS_TOKEN_URI = 'https://app.clio.com/oauth/token';
        process.env.CLIO_AU_CLIENT_ID = 'test-au-client-id';
        process.env.CLIO_AU_CLIENT_SECRET = 'test-au-client-secret';
        process.env.CLIO_AU_ACCESS_TOKEN_URI = 'https://au.app.clio.com/oauth/token';
        process.env.CLIO_EU_CLIENT_ID = 'test-eu-client-id';
        process.env.CLIO_EU_CLIENT_SECRET = 'test-eu-client-secret';
        process.env.CLIO_EU_ACCESS_TOKEN_URI = 'https://eu.app.clio.com/oauth/token';
        process.env.CLIO_CA_CLIENT_ID = 'test-ca-client-id';
        process.env.CLIO_CA_CLIENT_SECRET = 'test-ca-client-secret';
        process.env.CLIO_CA_ACCESS_TOKEN_URI = 'https://ca.app.clio.com/oauth/token';
        
        mockUser = createMockUser({
            id: '12345-clio',
            hostname,
            platform: 'clio',
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
            expect(clio.getAuthType()).toBe('oauth');
        });
    });

    // ==================== getLogFormatType ====================
    describe('getLogFormatType', () => {
        it('should return PLAIN_TEXT format type', () => {
            const result = clio.getLogFormatType();
            expect(result).toBe('text/plain');
        });
    });

    // ==================== getOauthInfo ====================
    describe('getOauthInfo', () => {
        it('should return OAuth configuration for US region', async () => {
            const result = await clio.getOauthInfo({ hostname: 'app.clio.com' });

            expect(result.clientId).toBe('test-client-id');
            expect(result.clientSecret).toBe('test-client-secret');
            expect(result.redirectUri).toBe('https://example.com/callback');
            expect(result.accessTokenUri).toBe('https://app.clio.com/oauth/token');
        });

        it('should return OAuth configuration for AU region', async () => {
            const result = await clio.getOauthInfo({ hostname: 'au.app.clio.com' });

            expect(result.clientId).toBe('test-au-client-id');
            expect(result.clientSecret).toBe('test-au-client-secret');
            expect(result.accessTokenUri).toBe('https://au.app.clio.com/oauth/token');
        });

        it('should return OAuth configuration for EU region', async () => {
            const result = await clio.getOauthInfo({ hostname: 'eu.app.clio.com' });

            expect(result.clientId).toBe('test-eu-client-id');
            expect(result.clientSecret).toBe('test-eu-client-secret');
            expect(result.accessTokenUri).toBe('https://eu.app.clio.com/oauth/token');
        });

        it('should return OAuth configuration for CA region', async () => {
            const result = await clio.getOauthInfo({ hostname: 'ca.app.clio.com' });

            expect(result.clientId).toBe('test-ca-client-id');
            expect(result.clientSecret).toBe('test-ca-client-secret');
            expect(result.accessTokenUri).toBe('https://ca.app.clio.com/oauth/token');
        });
    });

    // ==================== getUserInfo ====================
    describe('getUserInfo', () => {
        it('should return user info on successful API call', async () => {
            nock(apiUrl)
                .get('/api/v4/users/who_am_i.json')
                .query({ fields: 'id,name,time_zone' })
                .reply(200, {
                    data: {
                        id: 12345,
                        name: 'Test User',
                        time_zone: 'America/New_York'
                    }
                });

            const result = await clio.getUserInfo({ authHeader, hostname });

            expect(result.successful).toBe(true);
            expect(result.platformUserInfo.id).toBe('12345-clio');
            expect(result.platformUserInfo.name).toBe('Test User');
            expect(result.platformUserInfo.timezoneName).toBe('America/New_York');
            expect(result.returnMessage.messageType).toBe('success');
        });

        it('should return error on API failure', async () => {
            nock(apiUrl)
                .get('/api/v4/users/who_am_i.json')
                .query({ fields: 'id,name,time_zone' })
                .reply(401, { error: 'Unauthorized' });

            const result = await clio.getUserInfo({ authHeader, hostname });

            expect(result.successful).toBe(false);
            expect(result.returnMessage.messageType).toBe('warning');
        });
    });

    // ==================== unAuthorize ====================
    describe('unAuthorize', () => {
        it('should revoke tokens and clear user credentials', async () => {
            nock(apiUrl)
                .post('/oauth/deauthorize', 'token=test-access-token')
                .reply(200, {});

            const user = createMockUser({
                id: '12345-clio',
                hostname,
                accessToken: 'test-access-token',
                refreshToken: 'test-refresh-token'
            });

            const result = await clio.unAuthorize({ user });

            expect(result.returnMessage.messageType).toBe('success');
            expect(result.returnMessage.message).toBe('Logged out of Clio');
            expect(user.save).toHaveBeenCalled();
        });
    });

    // ==================== findContact ====================
    describe('findContact', () => {
        it('should return empty array for extension numbers', async () => {
            const result = await clio.findContact({
                user: mockUser,
                authHeader,
                phoneNumber: '1234',
                overridingFormat: '',
                isExtension: 'true'
            });

            expect(result.successful).toBe(false);
            expect(result.matchedContactInfo).toEqual([]);
        });

        it('should find contacts by phone number', async () => {
            nock(apiUrl)
                .get('/api/v4/contacts.json')
                .query(true)
                .reply(200, {
                    data: [{
                        id: 101,
                        name: 'John Doe',
                        type: 'Person',
                        updated_at: '2024-01-15T10:00:00Z'
                    }]
                }, mockRateLimitHeaders);

            // Get matters for the contact
            nock(apiUrl)
                .get('/api/v4/matters.json')
                .query(true)
                .reply(200, {
                    data: [
                        { id: 201, display_number: 'MAT-001', description: 'Test Matter', status: 'Open' }
                    ]
                }, mockRateLimitHeaders);

            // Get relationships for the contact
            nock(apiUrl)
                .get('/api/v4/relationships.json')
                .query(true)
                .reply(200, {
                    data: [{
                        matter: { id: 202, display_number: 'MAT-002', description: 'Related Matter', status: 'Open' }
                    }]
                }, mockRateLimitHeaders);

            const result = await clio.findContact({
                user: mockUser,
                authHeader,
                phoneNumber: '+1 4155551234',
                overridingFormat: '',
                isExtension: 'false'
            });

            expect(result.successful).toBe(true);
            expect(result.matchedContactInfo.length).toBeGreaterThan(0);
            expect(result.matchedContactInfo[0].name).toBe('John Doe');
            expect(result.matchedContactInfo[0].additionalInfo).toBeDefined();
        });

        it('should include create new contact option', async () => {
            nock(apiUrl)
                .get('/api/v4/contacts.json')
                .query(true)
                .reply(200, { data: [] }, mockRateLimitHeaders);

            const result = await clio.findContact({
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

        it('should handle Company type contacts', async () => {
            nock(apiUrl)
                .get('/api/v4/contacts.json')
                .query(true)
                .reply(200, {
                    data: [{
                        id: 102,
                        name: 'Test Company',
                        type: 'Company',
                        updated_at: '2024-01-15T10:00:00Z'
                    }]
                }, mockRateLimitHeaders);

            nock(apiUrl)
                .get('/api/v4/matters.json')
                .query(true)
                .reply(200, { data: [] }, mockRateLimitHeaders);

            nock(apiUrl)
                .get('/api/v4/relationships.json')
                .query(true)
                .reply(200, { data: [] }, mockRateLimitHeaders);

            const result = await clio.findContact({
                user: mockUser,
                authHeader,
                phoneNumber: '+1 4155551234',
                overridingFormat: '',
                isExtension: 'false'
            });

            expect(result.successful).toBe(true);
            expect(result.matchedContactInfo[0].type).toBe('Company');
        });

        it('should filter out closed and pending matters from relationships', async () => {
            nock(apiUrl)
                .get('/api/v4/contacts.json')
                .query(true)
                .reply(200, {
                    data: [{
                        id: 101,
                        name: 'John Doe',
                        type: 'Person',
                        updated_at: '2024-01-15T10:00:00Z'
                    }]
                }, mockRateLimitHeaders);

            nock(apiUrl)
                .get('/api/v4/matters.json')
                .query(true)
                .reply(200, { data: [] }, mockRateLimitHeaders);

            nock(apiUrl)
                .get('/api/v4/relationships.json')
                .query(true)
                .reply(200, {
                    data: [
                        { matter: { id: 201, status: 'Open' } },
                        { matter: { id: 202, status: 'Closed' } },
                        { matter: { id: 203, status: 'Pending' } }
                    ]
                }, mockRateLimitHeaders);

            const result = await clio.findContact({
                user: mockUser,
                authHeader,
                phoneNumber: '+1 4155551234',
                overridingFormat: '',
                isExtension: 'false'
            });

            expect(result.successful).toBe(true);
        });
    });

    // ==================== findContactWithName ====================
    describe('findContactWithName', () => {
        it('should find contacts by name', async () => {
            nock(apiUrl)
                .get('/api/v4/contacts.json')
                .query({ query: 'John Doe', fields: 'id,name,primary_phone_number' })
                .reply(200, {
                    data: [{
                        id: 101,
                        name: 'John Doe',
                        type: 'Person',
                        primary_phone_number: '+14155551234',
                        updated_at: '2024-01-15T10:00:00Z'
                    }]
                }, mockRateLimitHeaders);

            nock(apiUrl)
                .get('/api/v4/matters.json')
                .query({ client_id: '101', fields: 'id,display_number,description,status' })
                .reply(200, { data: [] }, mockRateLimitHeaders);

            nock(apiUrl)
                .get('/api/v4/relationships.json')
                .query({ contact_id: '101', fields: 'matter{id,display_number,description,status}' })
                .reply(200, { data: [] }, mockRateLimitHeaders);

            const result = await clio.findContactWithName({
                user: mockUser,
                authHeader,
                name: 'John Doe'
            });

            expect(result.successful).toBe(true);
            expect(result.matchedContactInfo.length).toBe(1);
            expect(result.matchedContactInfo[0].name).toBe('John Doe');
        });

        it('should return empty array when no contacts found', async () => {
            nock(apiUrl)
                .get('/api/v4/contacts.json')
                .query({ query: 'Nobody', fields: 'id,name,primary_phone_number' })
                .reply(200, { data: [] }, mockRateLimitHeaders);

            const result = await clio.findContactWithName({
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
        it('should create a new Person contact', async () => {
            nock(apiUrl)
                .post('/api/v4/contacts.json', body => 
                    body.data.name === 'John Doe' && 
                    body.data.type === 'Person' &&
                    body.data.phone_numbers[0].number === '+14155551234'
                )
                .reply(201, {
                    data: {
                        id: 102,
                        name: 'John Doe',
                        type: 'Person'
                    }
                }, mockRateLimitHeaders);

            const result = await clio.createContact({
                user: mockUser,
                authHeader,
                phoneNumber: '+14155551234',
                newContactName: 'John Doe',
                newContactType: 'Person'
            });

            expect(result.contactInfo.id).toBe(102);
            expect(result.contactInfo.name).toBe('John Doe');
            expect(result.returnMessage.messageType).toBe('success');
        });

        it('should create a new Company contact', async () => {
            nock(apiUrl)
                .post('/api/v4/contacts.json', body => 
                    body.data.name === 'Test Corp' && 
                    body.data.type === 'Company'
                )
                .reply(201, {
                    data: {
                        id: 103,
                        name: 'Test Corp',
                        type: 'Company'
                    }
                }, mockRateLimitHeaders);

            const result = await clio.createContact({
                user: mockUser,
                authHeader,
                phoneNumber: '+14155551234',
                newContactName: 'Test Corp',
                newContactType: 'Company'
            });

            expect(result.contactInfo.id).toBe(103);
            expect(result.contactInfo.name).toBe('Test Corp');
        });

        it('should use Person type as default when type is empty', async () => {
            // When empty string is passed, the connector uses the default 'Person' type
            nock(apiUrl)
                .post('/api/v4/contacts.json', body => 
                    body.data.name === 'John Doe' && 
                    body.data.type === ''
                )
                .reply(201, {
                    data: {
                        id: 104,
                        name: 'John Doe',
                        type: 'Person'
                    }
                }, mockRateLimitHeaders);

            const result = await clio.createContact({
                user: mockUser,
                authHeader,
                phoneNumber: '+14155551234',
                newContactName: 'John Doe',
                newContactType: ''
            });

            expect(result.contactInfo.id).toBe(104);
        });
    });

    // ==================== getUserList ====================
    describe('getUserList', () => {
        it('should return list of enabled users', async () => {
            nock(apiUrl)
                .get('/api/v4/users.json')
                .query({ enabled: 'true', 'order': 'name(asc)', fields: 'id,name,email' })
                .reply(200, {
                    data: [
                        { id: 1, name: 'User One', first_name: 'User', last_name: 'One', email: 'user1@example.com' },
                        { id: 2, name: 'User Two', first_name: 'User', last_name: 'Two', email: 'user2@example.com' }
                    ]
                }, mockRateLimitHeaders);

            const result = await clio.getUserList({
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
        const mockContact = createMockContact({ id: 101, name: 'John Doe', phone: '+14155551234', type: 'Person' });
        const mockCallLogData = createMockCallLog();

        it('should create a communication and activity', async () => {
            // Create communication
            nock(apiUrl)
                .post('/api/v4/communications.json')
                .reply(201, {
                    data: { id: 301 }
                }, mockRateLimitHeaders);

            // Create activity (always created after communication)
            nock(apiUrl)
                .post('/api/v4/activities.json')
                .reply(201, {
                    data: { id: 401 }
                }, mockRateLimitHeaders);

            const result = await clio.createCallLog({
                user: mockUser,
                contactInfo: mockContact,
                authHeader,
                callLog: mockCallLogData,
                note: 'Test note',
                additionalSubmission: { matters: 201, nonBillable: false },
                aiNote: 'AI note',
                transcript: 'Transcript',
                composedLogDetails: 'Call details',
                hashedAccountId: 'hash-123'
            });

            expect(result.logId).toBe(301);
            expect(result.returnMessage.messageType).toBe('success');
        });

        it('should create call log without matter but still creates activity', async () => {
            nock(apiUrl)
                .post('/api/v4/communications.json')
                .reply(201, {
                    data: { id: 302 }
                }, mockRateLimitHeaders);

            // Activity is still created even without matter
            nock(apiUrl)
                .post('/api/v4/activities.json')
                .reply(201, {
                    data: { id: 402 }
                }, mockRateLimitHeaders);

            const result = await clio.createCallLog({
                user: mockUser,
                contactInfo: mockContact,
                authHeader,
                callLog: mockCallLogData,
                note: 'Test note',
                additionalSubmission: { nonBillable: false },
                aiNote: null,
                transcript: null,
                composedLogDetails: 'Call details',
                hashedAccountId: 'hash-123'
            });

            expect(result.logId).toBe(302);
        });

        it('should handle admin assigned user', async () => {
            UserModel.findByPk.mockResolvedValue({
                platformAdditionalInfo: { id: 999 }
            });

            nock(apiUrl)
                .post('/api/v4/communications.json', body => body.data.senders[0].id === 999)
                .reply(201, {
                    data: { id: 303 }
                }, mockRateLimitHeaders);

            nock(apiUrl)
                .post('/api/v4/activities.json')
                .reply(201, {
                    data: { id: 403 }
                }, mockRateLimitHeaders);

            const result = await clio.createCallLog({
                user: mockUser,
                contactInfo: mockContact,
                authHeader,
                callLog: mockCallLogData,
                note: 'Test note',
                additionalSubmission: {
                    isAssignedToUser: true,
                    adminAssignedUserToken: 'valid-jwt-token',
                    nonBillable: false
                },
                aiNote: null,
                transcript: null,
                composedLogDetails: 'Call details',
                hashedAccountId: 'hash-123'
            });

            expect(result.logId).toBe(303);
        });

        it('should use custom subject when provided', async () => {
            nock(apiUrl)
                .post('/api/v4/communications.json', body => body.data.subject === 'Custom Subject')
                .reply(201, {
                    data: { id: 304 }
                }, mockRateLimitHeaders);

            nock(apiUrl)
                .post('/api/v4/activities.json')
                .reply(201, {
                    data: { id: 404 }
                }, mockRateLimitHeaders);

            const callLogWithCustomSubject = { ...mockCallLogData, customSubject: 'Custom Subject' };

            const result = await clio.createCallLog({
                user: mockUser,
                contactInfo: mockContact,
                authHeader,
                callLog: callLogWithCustomSubject,
                note: 'Test note',
                additionalSubmission: { nonBillable: false },
                aiNote: null,
                transcript: null,
                composedLogDetails: 'Call details',
                hashedAccountId: 'hash-123'
            });

            expect(result.logId).toBe(304);
        });
    });

    // ==================== updateCallLog ====================
    describe('updateCallLog', () => {
        const existingCallLog = createMockExistingCallLog({ thirdPartyLogId: '301' });

        it('should update an existing communication', async () => {
            // First fetches existing log
            nock(apiUrl)
                .get('/api/v4/communications/301.json')
                .query({ fields: 'body,id' })
                .reply(200, {
                    data: { id: 301, body: 'Existing body' }
                }, mockRateLimitHeaders);

            // Then updates it
            nock(apiUrl)
                .patch('/api/v4/communications/301.json')
                .reply(200, {
                    data: { id: 301 }
                }, mockRateLimitHeaders);

            const result = await clio.updateCallLog({
                user: mockUser,
                existingCallLog,
                authHeader,
                recordingLink: 'https://recording.example.com/123',
                subject: 'Updated Subject',
                note: 'Updated note',
                startTime: Date.now(),
                duration: null,
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

        it('should update associated activity with new duration', async () => {
            // First fetches existing log
            nock(apiUrl)
                .get('/api/v4/communications/301.json')
                .query({ fields: 'body,id' })
                .reply(200, {
                    data: { id: 301, body: 'Existing body' }
                }, mockRateLimitHeaders);

            // Get existing timer
            nock(apiUrl)
                .get('/api/v4/activities')
                .query({ communication_id: '301', fields: 'quantity,id' })
                .reply(200, {
                    data: [{ id: 401, quantity: 300 }]
                }, mockRateLimitHeaders);

            // Update timer
            nock(apiUrl)
                .patch('/api/v4/activities/401.json')
                .reply(200, {
                    data: { id: 401 }
                }, mockRateLimitHeaders);

            // Update communication
            nock(apiUrl)
                .patch('/api/v4/communications/301.json')
                .reply(200, {
                    data: { id: 301 }
                }, mockRateLimitHeaders);

            const result = await clio.updateCallLog({
                user: mockUser,
                existingCallLog,
                authHeader,
                recordingLink: null,
                subject: null,
                note: null,
                startTime: Date.now(),
                duration: 600,
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

        it('should use existing call log details when provided', async () => {
            const existingCallLogDetails = {
                id: 301,
                subject: 'Existing Subject',
                body: 'Existing body'
            };

            // Get existing timer (when duration is provided)
            nock(apiUrl)
                .get('/api/v4/activities')
                .query({ communication_id: '301', fields: 'quantity,id' })
                .reply(200, {
                    data: [{ id: 401, quantity: 300 }]
                }, mockRateLimitHeaders);

            // Update timer
            nock(apiUrl)
                .patch('/api/v4/activities/401.json')
                .reply(200, {
                    data: { id: 401 }
                }, mockRateLimitHeaders);

            // Update communication
            nock(apiUrl)
                .patch('/api/v4/communications/301.json')
                .reply(200, {
                    data: { id: 301 }
                }, mockRateLimitHeaders);

            const result = await clio.updateCallLog({
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
            nock(apiUrl)
                .get('/api/v4/communications/301.json')
                .query({ fields: 'body,id' })
                .reply(200, {
                    data: { id: 301, subject: 'Existing Subject', body: 'Existing body' }
                }, mockRateLimitHeaders);

            nock(apiUrl)
                .patch('/api/v4/communications/301.json')
                .reply(200, {
                    data: { id: 301 }
                }, mockRateLimitHeaders);

            const result = await clio.updateCallLog({
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
        const existingCallLog = createMockExistingCallLog({ thirdPartyLogId: '301' });

        it('should update communication with matter', async () => {
            nock(apiUrl)
                .patch('/api/v4/communications/301.json', body => body.data.matter.id === 201)
                .reply(200, {
                    data: { id: 301 }
                }, mockRateLimitHeaders);

            const result = await clio.upsertCallDisposition({
                user: mockUser,
                existingCallLog,
                authHeader,
                dispositions: { matters: 201 }
            });

            expect(result.logId).toBe('301');
        });

        it('should return null logId when no dispositions provided', async () => {
            const result = await clio.upsertCallDisposition({
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
            nock(apiUrl)
                .get('/api/v4/communications/301.json')
                .query({ fields: 'subject,body,matter,senders,receivers,id' })
                .reply(200, {
                    data: {
                        id: 301,
                        subject: 'Test Call',
                        body: '- Agent notes: Test note\n- Duration: 5 minutes',
                        matter: { id: 201 },
                        senders: [{ id: 101, type: 'Person' }],
                        receivers: [{ id: 12345, type: 'User' }]
                    }
                }, mockRateLimitHeaders);

            nock(apiUrl)
                .get('/api/v4/contacts/101.json')
                .query({ fields: 'name' })
                .reply(200, {
                    data: { name: 'John Doe' }
                }, mockRateLimitHeaders);

            const result = await clio.getCallLog({
                user: mockUser,
                callLogId: '301',
                authHeader
            });

            expect(result.callLogInfo.subject).toBe('Test Call');
            expect(result.callLogInfo.note).toBe('Test note');
            expect(result.callLogInfo.contactName).toBe('John Doe');
            expect(result.callLogInfo.dispositions.matters).toBe(201);
        });

        it('should handle when sender is User type', async () => {
            nock(apiUrl)
                .get('/api/v4/communications/301.json')
                .query({ fields: 'subject,body,matter,senders,receivers,id' })
                .reply(200, {
                    data: {
                        id: 301,
                        subject: 'Test Call',
                        body: 'Simple note',
                        matter: null,
                        senders: [{ id: 12345, type: 'User' }],
                        receivers: [{ id: 101, type: 'Person' }]
                    }
                }, mockRateLimitHeaders);

            // When sender is User, it fetches the receiver (Person type)
            nock(apiUrl)
                .get('/api/v4/contacts/101.json')
                .query({ fields: 'name' })
                .reply(200, {
                    data: { name: 'John Doe' }
                }, mockRateLimitHeaders);

            const result = await clio.getCallLog({
                user: mockUser,
                callLogId: '301',
                authHeader
            });

            expect(result.callLogInfo.subject).toBe('Test Call');
            expect(result.callLogInfo.contactName).toBe('John Doe');
        });
    });

    // ==================== createMessageLog ====================
    describe('createMessageLog', () => {
        const mockContact = createMockContact({ id: 101, name: 'John Doe', phoneNumber: '+14155551234', type: 'Person' });
        const mockMessageData = createMockMessage();

        it('should create an SMS message log', async () => {
            // First fetches user info
            nock(apiUrl)
                .get('/api/v4/users/who_am_i.json')
                .query({ fields: 'name' })
                .reply(200, {
                    data: { name: 'Test User' }
                }, mockRateLimitHeaders);

            nock(apiUrl)
                .post('/api/v4/communications.json')
                .reply(201, {
                    data: { id: 401 }
                }, mockRateLimitHeaders);

            const result = await clio.createMessageLog({
                user: mockUser,
                contactInfo: mockContact,
                authHeader,
                message: mockMessageData,
                additionalSubmission: { matters: 201 },
                recordingLink: null,
                faxDocLink: null
            });

            expect(result.logId).toBe(401);
            expect(result.returnMessage.message).toBe('Message logged');
        });

        it('should create a voicemail message log', async () => {
            // First fetches user info
            nock(apiUrl)
                .get('/api/v4/users/who_am_i.json')
                .query({ fields: 'name' })
                .reply(200, {
                    data: { name: 'Test User' }
                }, mockRateLimitHeaders);

            // Create communication
            nock(apiUrl)
                .post('/api/v4/communications.json')
                .reply(201, {
                    data: { id: 402 }
                }, mockRateLimitHeaders);

            const result = await clio.createMessageLog({
                user: mockUser,
                contactInfo: mockContact,
                authHeader,
                message: mockMessageData,
                additionalSubmission: { matters: 201 },
                recordingLink: 'https://recording.example.com/voicemail.mp3',
                faxDocLink: null
            });

            expect(result.logId).toBe(402);
        });

        it('should create message log without matter', async () => {
            // First fetches user info
            nock(apiUrl)
                .get('/api/v4/users/who_am_i.json')
                .query({ fields: 'name' })
                .reply(200, {
                    data: { name: 'Test User' }
                }, mockRateLimitHeaders);

            nock(apiUrl)
                .post('/api/v4/communications.json')
                .reply(201, {
                    data: { id: 404 }
                }, mockRateLimitHeaders);

            const result = await clio.createMessageLog({
                user: mockUser,
                contactInfo: mockContact,
                authHeader,
                message: mockMessageData,
                additionalSubmission: null,
                recordingLink: null,
                faxDocLink: null
            });

            expect(result.logId).toBe(404);
        });
    });

    // ==================== updateMessageLog ====================
    describe('updateMessageLog', () => {
        const mockContact = createMockContact({ id: 101, name: 'John Doe', phoneNumber: '+14155551234' });
        const mockMessageData = createMockMessage();
        const existingMessageLog = createMockExistingMessageLog({ thirdPartyLogId: '401' });

        it('should update an existing message log', async () => {
            nock(apiUrl)
                .get('/api/v4/communications/401.json')
                .query({ fields: 'body' })
                .reply(200, {
                    data: {
                        id: 401,
                        subject: 'SMS',
                        body: '\nConversation(1 messages)\nBEGIN\n------------\nFirst message\n------------\nEND\n'
                    }
                }, mockRateLimitHeaders);

            // Fetches user info
            nock(apiUrl)
                .get('/api/v4/users/who_am_i.json')
                .query({ fields: 'name' })
                .reply(200, {
                    data: { name: 'Test User' }
                }, mockRateLimitHeaders);

            nock(apiUrl)
                .patch('/api/v4/communications/401.json')
                .reply(200, {
                    data: { id: 401 }
                }, mockRateLimitHeaders);

            await clio.updateMessageLog({
                user: mockUser,
                contactInfo: mockContact,
                existingMessageLog,
                message: { ...mockMessageData, subject: 'Second message' },
                authHeader
            });

            // No return value to check, but no error means success
        });
    });

    // ==================== Additional findContact scenarios ====================
    describe('findContact with overridingFormat', () => {
        it('should search with formatted phone numbers when overridingFormat is provided', async () => {
            // First query with original number
            nock(apiUrl)
                .get('/api/v4/contacts.json')
                .query(true)
                .reply(200, { data: [] }, mockRateLimitHeaders);

            // Second query with formatted number
            nock(apiUrl)
                .get('/api/v4/contacts.json')
                .query(true)
                .reply(200, {
                    data: [{
                        id: 101,
                        name: 'John Doe',
                        type: 'Person',
                        updated_at: '2024-01-15T10:00:00Z'
                    }]
                }, mockRateLimitHeaders);

            nock(apiUrl)
                .get('/api/v4/matters.json')
                .query(true)
                .reply(200, { data: [] }, mockRateLimitHeaders);

            nock(apiUrl)
                .get('/api/v4/relationships.json')
                .query(true)
                .reply(200, { data: [] }, mockRateLimitHeaders);

            const result = await clio.findContact({
                user: mockUser,
                authHeader,
                phoneNumber: '+14155551234',
                overridingFormat: '(***) ***-****',
                isExtension: 'false'
            });

            expect(result.successful).toBe(true);
            expect(result.matchedContactInfo.length).toBeGreaterThan(0);
        });

        it('should skip duplicate contacts in search results', async () => {
            // Same contact returned from multiple queries
            const contactData = {
                id: 101,
                name: 'John Doe',
                type: 'Person',
                updated_at: '2024-01-15T10:00:00Z'
            };

            nock(apiUrl)
                .get('/api/v4/contacts.json')
                .query(true)
                .reply(200, { data: [contactData] }, mockRateLimitHeaders);

            nock(apiUrl)
                .get('/api/v4/matters.json')
                .query(true)
                .reply(200, { data: [] }, mockRateLimitHeaders);

            nock(apiUrl)
                .get('/api/v4/relationships.json')
                .query(true)
                .reply(200, { data: [] }, mockRateLimitHeaders);

            // Second query returns same contact
            nock(apiUrl)
                .get('/api/v4/contacts.json')
                .query(true)
                .reply(200, { data: [contactData] }, mockRateLimitHeaders);

            const result = await clio.findContact({
                user: mockUser,
                authHeader,
                phoneNumber: '+14155551234',
                overridingFormat: '***-***-****',
                isExtension: 'false'
            });

            expect(result.successful).toBe(true);
            // Should only have 2 entries: the contact and "create new contact"
            expect(result.matchedContactInfo.length).toBe(2);
        });

        it('should handle invalid phone number format gracefully', async () => {
            nock(apiUrl)
                .get('/api/v4/contacts.json')
                .query(true)
                .reply(200, { data: [] }, mockRateLimitHeaders);

            const result = await clio.findContact({
                user: mockUser,
                authHeader,
                phoneNumber: 'invalid-number',
                overridingFormat: '(***) ***-****',
                isExtension: 'false'
            });

            expect(result.successful).toBe(true);
            expect(result.matchedContactInfo.find(c => c.isNewContact)).toBeDefined();
        });
    });

    // ==================== Image Message Logging ====================
    describe('createMessageLog - Image Messages', () => {
        const mockContact = createMockContact({ id: 101, name: 'John Doe', phoneNumber: '+14155551234', type: 'Person' });
        const mockMessageData = createMockMessage();

        it('should create an image message log with successful upload', async () => {
            // User info
            nock(apiUrl)
                .get('/api/v4/users/who_am_i.json')
                .query({ fields: 'name' })
                .reply(200, { data: { name: 'Test User' } }, mockRateLimitHeaders);

            // Download image
            nock('https://media.example.com')
                .get('/image.jpg')
                .reply(200, Buffer.from('fake-image-data'));

            // Create document
            nock(apiUrl)
                .post(/\/api\/v4\/documents/)
                .reply(200, {
                    data: {
                        id: 501,
                        latest_document_version: {
                            uuid: 'doc-uuid-123',
                            put_url: 'https://upload.clio.com/upload',
                            put_headers: [
                                { name: 'Content-Type', value: 'image/jpeg' }
                            ]
                        }
                    }
                }, mockRateLimitHeaders);

            // Upload to put_url
            nock('https://upload.clio.com')
                .put('/upload')
                .reply(200);

            // Patch document as fully uploaded
            nock(apiUrl)
                .patch(/\/api\/v4\/documents\/501/)
                .reply(200, {
                    data: {
                        id: 501,
                        latest_document_version: { fully_uploaded: true }
                    }
                }, mockRateLimitHeaders);

            // Create communication
            nock(apiUrl)
                .post('/api/v4/communications.json')
                .reply(201, { data: { id: 601 } }, mockRateLimitHeaders);

            const result = await clio.createMessageLog({
                user: mockUser,
                contactInfo: mockContact,
                authHeader,
                message: mockMessageData,
                additionalSubmission: { matters: 201 },
                recordingLink: null,
                faxDocLink: null,
                faxDownloadLink: null,
                imageLink: 'https://media.example.com/image.jpg',
                imageDownloadLink: 'https://media.example.com/image.jpg',
                imageContentType: 'image/jpeg',
                videoLink: null
            });

            expect(result.logId).toBe(601);
        });

        it('should handle image upload failure gracefully', async () => {
            // User info
            nock(apiUrl)
                .get('/api/v4/users/who_am_i.json')
                .query({ fields: 'name' })
                .reply(200, { data: { name: 'Test User' } }, mockRateLimitHeaders);

            // Download image fails
            nock('https://media.example.com')
                .get('/image.jpg')
                .replyWithError('Network error');

            // Create communication - should still succeed with error message
            nock(apiUrl)
                .post('/api/v4/communications.json')
                .reply(201, { data: { id: 602 } }, mockRateLimitHeaders);

            const result = await clio.createMessageLog({
                user: mockUser,
                contactInfo: mockContact,
                authHeader,
                message: mockMessageData,
                additionalSubmission: null,
                recordingLink: null,
                faxDocLink: null,
                faxDownloadLink: null,
                imageLink: 'https://media.example.com/image.jpg',
                imageDownloadLink: 'https://media.example.com/image.jpg',
                imageContentType: 'image/jpeg',
                videoLink: null
            });

            expect(result.logId).toBe(602);
        });

        it('should handle incomplete image upload', async () => {
            // User info
            nock(apiUrl)
                .get('/api/v4/users/who_am_i.json')
                .query({ fields: 'name' })
                .reply(200, { data: { name: 'Test User' } }, mockRateLimitHeaders);

            // Download image
            nock('https://media.example.com')
                .get('/image.jpg')
                .reply(200, Buffer.from('fake-image-data'));

            // Create document
            nock(apiUrl)
                .post(/\/api\/v4\/documents/)
                .reply(200, {
                    data: {
                        id: 502,
                        latest_document_version: {
                            uuid: 'doc-uuid-456',
                            put_url: 'https://upload.clio.com/upload2',
                            put_headers: []
                        }
                    }
                }, mockRateLimitHeaders);

            // Upload to put_url
            nock('https://upload.clio.com')
                .put('/upload2')
                .reply(200);

            // Patch document - NOT fully uploaded
            nock(apiUrl)
                .patch(/\/api\/v4\/documents\/502/)
                .reply(200, {
                    data: {
                        id: 502,
                        latest_document_version: { fully_uploaded: false }
                    }
                }, mockRateLimitHeaders);

            // Create communication
            nock(apiUrl)
                .post('/api/v4/communications.json')
                .reply(201, { data: { id: 603 } }, mockRateLimitHeaders);

            const result = await clio.createMessageLog({
                user: mockUser,
                contactInfo: mockContact,
                authHeader,
                message: mockMessageData,
                additionalSubmission: null,
                recordingLink: null,
                faxDocLink: null,
                faxDownloadLink: null,
                imageLink: 'https://media.example.com/image.jpg',
                imageDownloadLink: 'https://media.example.com/image.jpg',
                imageContentType: 'image/png',
                videoLink: null
            });

            expect(result.logId).toBe(603);
        });
    });

    // ==================== Fax Message Logging ====================
    describe('createMessageLog - Fax Messages', () => {
        const mockContact = createMockContact({ id: 101, name: 'John Doe', phoneNumber: '+14155551234', type: 'Person' });
        const mockMessageData = createMockMessage({ messageStatus: 'Received', faxPageCount: 3 });

        it('should create a fax message log with successful upload', async () => {
            // User info
            nock(apiUrl)
                .get('/api/v4/users/who_am_i.json')
                .query({ fields: 'name' })
                .reply(200, { data: { name: 'Test User' } }, mockRateLimitHeaders);

            // Download fax
            nock('https://fax.example.com')
                .get('/document.pdf')
                .reply(200, Buffer.from('fake-pdf-data'));

            // Create document
            nock(apiUrl)
                .post(/\/api\/v4\/documents/)
                .reply(200, {
                    data: {
                        id: 503,
                        latest_document_version: {
                            uuid: 'fax-uuid-123',
                            put_url: 'https://upload.clio.com/fax-upload',
                            put_headers: [
                                { name: 'Content-Type', value: 'application/pdf' }
                            ]
                        }
                    }
                }, mockRateLimitHeaders);

            // Upload to put_url
            nock('https://upload.clio.com')
                .put('/fax-upload')
                .reply(200);

            // Patch document as fully uploaded
            nock(apiUrl)
                .patch(/\/api\/v4\/documents\/503/)
                .reply(200, {
                    data: {
                        id: 503,
                        latest_document_version: { fully_uploaded: true }
                    }
                }, mockRateLimitHeaders);

            // Create communication
            nock(apiUrl)
                .post('/api/v4/communications.json')
                .reply(201, { data: { id: 604 } }, mockRateLimitHeaders);

            const result = await clio.createMessageLog({
                user: mockUser,
                contactInfo: mockContact,
                authHeader,
                message: mockMessageData,
                additionalSubmission: { matters: 201 },
                recordingLink: null,
                faxDocLink: 'https://fax.example.com/view/document.pdf',
                faxDownloadLink: 'https://fax.example.com/document.pdf',
                imageLink: null,
                imageDownloadLink: null,
                imageContentType: null,
                videoLink: null
            });

            expect(result.logId).toBe(604);
        });

        it('should handle fax upload failure gracefully', async () => {
            // User info
            nock(apiUrl)
                .get('/api/v4/users/who_am_i.json')
                .query({ fields: 'name' })
                .reply(200, { data: { name: 'Test User' } }, mockRateLimitHeaders);

            // Download fax fails
            nock('https://fax.example.com')
                .get('/document.pdf')
                .replyWithError('Network error');

            // Create communication - should still succeed with error message
            nock(apiUrl)
                .post('/api/v4/communications.json')
                .reply(201, { data: { id: 605 } }, mockRateLimitHeaders);

            const result = await clio.createMessageLog({
                user: mockUser,
                contactInfo: mockContact,
                authHeader,
                message: mockMessageData,
                additionalSubmission: null,
                recordingLink: null,
                faxDocLink: 'https://fax.example.com/view/document.pdf',
                faxDownloadLink: 'https://fax.example.com/document.pdf',
                imageLink: null,
                imageDownloadLink: null,
                imageContentType: null,
                videoLink: null
            });

            expect(result.logId).toBe(605);
        });

        it('should handle incomplete fax upload', async () => {
            // User info
            nock(apiUrl)
                .get('/api/v4/users/who_am_i.json')
                .query({ fields: 'name' })
                .reply(200, { data: { name: 'Test User' } }, mockRateLimitHeaders);

            // Download fax
            nock('https://fax.example.com')
                .get('/document.pdf')
                .reply(200, Buffer.from('fake-pdf-data'));

            // Create document
            nock(apiUrl)
                .post(/\/api\/v4\/documents/)
                .reply(200, {
                    data: {
                        id: 504,
                        latest_document_version: {
                            uuid: 'fax-uuid-456',
                            put_url: 'https://upload.clio.com/fax-upload2',
                            put_headers: []
                        }
                    }
                }, mockRateLimitHeaders);

            // Upload to put_url
            nock('https://upload.clio.com')
                .put('/fax-upload2')
                .reply(200);

            // Patch document - NOT fully uploaded
            nock(apiUrl)
                .patch(/\/api\/v4\/documents\/504/)
                .reply(200, {
                    data: {
                        id: 504,
                        latest_document_version: { fully_uploaded: false }
                    }
                }, mockRateLimitHeaders);

            // Create communication
            nock(apiUrl)
                .post('/api/v4/communications.json')
                .reply(201, { data: { id: 606 } }, mockRateLimitHeaders);

            const result = await clio.createMessageLog({
                user: mockUser,
                contactInfo: mockContact,
                authHeader,
                message: mockMessageData,
                additionalSubmission: null,
                recordingLink: null,
                faxDocLink: 'https://fax.example.com/view/document.pdf',
                faxDownloadLink: 'https://fax.example.com/document.pdf',
                imageLink: null,
                imageDownloadLink: null,
                imageContentType: null,
                videoLink: null
            });

            expect(result.logId).toBe(606);
        });
    });

    // ==================== Video Message Logging ====================
    describe('createMessageLog - Video Messages', () => {
        const mockContact = createMockContact({ id: 101, name: 'John Doe', phoneNumber: '+14155551234', type: 'Person' });
        const mockMessageData = createMockMessage();

        it('should create a video message log', async () => {
            nock(apiUrl)
                .get('/api/v4/users/who_am_i.json')
                .query({ fields: 'name' })
                .reply(200, { data: { name: 'Test User' } }, mockRateLimitHeaders);

            nock(apiUrl)
                .post('/api/v4/communications.json')
                .reply(201, { data: { id: 607 } }, mockRateLimitHeaders);

            const result = await clio.createMessageLog({
                user: mockUser,
                contactInfo: mockContact,
                authHeader,
                message: mockMessageData,
                additionalSubmission: { matters: 201 },
                recordingLink: null,
                faxDocLink: null,
                faxDownloadLink: null,
                imageLink: null,
                imageDownloadLink: null,
                imageContentType: null,
                videoLink: 'https://video.example.com/video.mp4'
            });

            expect(result.logId).toBe(607);
        });
    });

    // ==================== updateMessageLog with Image/Video ====================
    describe('updateMessageLog with media links', () => {
        const mockContact = createMockContact({ id: 101, name: 'John Doe', phoneNumber: '+14155551234' });
        const mockMessageData = createMockMessage();
        const existingMessageLog = createMockExistingMessageLog({ thirdPartyLogId: '401' });

        it('should update message log with image link', async () => {
            nock(apiUrl)
                .get('/api/v4/communications/401.json')
                .query({ fields: 'body' })
                .reply(200, {
                    data: {
                        id: 401,
                        body: '\nConversation(1 messages)\nBEGIN\n------------\nFirst message\n------------\nEND\n'
                    }
                }, mockRateLimitHeaders);

            nock(apiUrl)
                .get('/api/v4/users/who_am_i.json')
                .query({ fields: 'name' })
                .reply(200, { data: { name: 'Test User' } }, mockRateLimitHeaders);

            nock(apiUrl)
                .patch('/api/v4/communications/401.json')
                .reply(200, { data: { id: 401 } }, mockRateLimitHeaders);

            await clio.updateMessageLog({
                user: mockUser,
                contactInfo: mockContact,
                existingMessageLog,
                message: mockMessageData,
                authHeader,
                imageLink: 'https://media.example.com/image.jpg',
                videoLink: null
            });

            // No return value to check, but no error means success
        });

        it('should update message log with video link', async () => {
            nock(apiUrl)
                .get('/api/v4/communications/401.json')
                .query({ fields: 'body' })
                .reply(200, {
                    data: {
                        id: 401,
                        body: '\nConversation(1 messages)\nBEGIN\n------------\nFirst message\n------------\nEND\n'
                    }
                }, mockRateLimitHeaders);

            nock(apiUrl)
                .get('/api/v4/users/who_am_i.json')
                .query({ fields: 'name' })
                .reply(200, { data: { name: 'Test User' } }, mockRateLimitHeaders);

            nock(apiUrl)
                .patch('/api/v4/communications/401.json')
                .reply(200, { data: { id: 401 } }, mockRateLimitHeaders);

            await clio.updateMessageLog({
                user: mockUser,
                contactInfo: mockContact,
                existingMessageLog,
                message: mockMessageData,
                authHeader,
                imageLink: null,
                videoLink: 'https://media.example.com/video.mp4'
            });

            // No return value to check, but no error means success
        });
    });

    // ==================== updateCallLog with admin assignment ====================
    describe('updateCallLog with admin assignment', () => {
        const existingCallLog = createMockExistingCallLog({ thirdPartyLogId: '301' });

        it('should update call log with admin assigned user from mapping', async () => {
            AdminConfigModel.findByPk.mockResolvedValue({
                userMappings: [
                    { rcExtensionId: 'ext-123', crmUserId: 888 }
                ]
            });

            // Existing call log details with sender as User
            const existingCallLogDetails = {
                id: 301,
                body: 'Existing body',
                senders: [{ id: 12345, type: 'User' }],
                receivers: [{ id: 101, type: 'Person' }]
            };

            nock(apiUrl)
                .patch('/api/v4/communications/301.json')
                .reply(200, { data: { id: 301 } }, mockRateLimitHeaders);

            const result = await clio.updateCallLog({
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
                additionalSubmission: {
                    isAssignedToUser: true,
                    adminAssignedUserRcId: 'ext-123'
                },
                composedLogDetails: 'Updated details',
                existingCallLogDetails,
                hashedAccountId: 'hash-123'
            });

            expect(result.returnMessage.messageType).toBe('success');
        });

        it('should update call log with admin assigned user when receiver is User type', async () => {
            AdminConfigModel.findByPk.mockResolvedValue({
                userMappings: [
                    { rcExtensionId: ['ext-456', 'ext-789'], crmUserId: 999 }
                ]
            });

            // Existing call log details with receiver as User
            const existingCallLogDetails = {
                id: 301,
                body: 'Existing body',
                senders: [{ id: 101, type: 'Person' }],
                receivers: [{ id: 12345, type: 'User' }]
            };

            nock(apiUrl)
                .patch('/api/v4/communications/301.json')
                .reply(200, { data: { id: 301 } }, mockRateLimitHeaders);

            const result = await clio.updateCallLog({
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
                additionalSubmission: {
                    isAssignedToUser: true,
                    adminAssignedUserRcId: 'ext-456'
                },
                composedLogDetails: 'Updated details',
                existingCallLogDetails,
                hashedAccountId: 'hash-123'
            });

            expect(result.returnMessage.messageType).toBe('success');
        });
    });

    // ==================== createCallLog with admin assignment from mapping ====================
    describe('createCallLog with admin assignment from mapping', () => {
        const mockContact = createMockContact({ id: 101, name: 'John Doe', phone: '+14155551234', type: 'Person' });
        const mockCallLogData = createMockCallLog();

        it('should use admin mapping when token decode fails', async () => {
            const jwt = require('@app-connect/core/lib/jwt');
            jwt.decodeJwt.mockImplementation(() => { throw new Error('Invalid token'); });

            UserModel.findByPk.mockResolvedValue(null);

            AdminConfigModel.findByPk.mockResolvedValue({
                userMappings: [
                    { rcExtensionId: 'ext-123', crmUserId: 777 }
                ]
            });

            nock(apiUrl)
                .post('/api/v4/communications.json', body => body.data.senders[0].id === 777)
                .reply(201, { data: { id: 307 } }, mockRateLimitHeaders);

            nock(apiUrl)
                .post('/api/v4/activities.json')
                .reply(201, { data: { id: 407 } }, mockRateLimitHeaders);

            const result = await clio.createCallLog({
                user: mockUser,
                contactInfo: mockContact,
                authHeader,
                callLog: mockCallLogData,
                note: 'Test note',
                additionalSubmission: {
                    isAssignedToUser: true,
                    adminAssignedUserToken: 'invalid-token',
                    adminAssignedUserRcId: 'ext-123',
                    nonBillable: false
                },
                aiNote: null,
                transcript: null,
                composedLogDetails: 'Call details',
                hashedAccountId: 'hash-123'
            });

            expect(result.logId).toBe(307);
        });

        it('should use admin mapping with array of extension IDs', async () => {
            UserModel.findByPk.mockResolvedValue(null);

            AdminConfigModel.findByPk.mockResolvedValue({
                userMappings: [
                    { rcExtensionId: ['ext-100', 'ext-200'], crmUserId: 666 }
                ]
            });

            nock(apiUrl)
                .post('/api/v4/communications.json', body => body.data.senders[0].id === 666)
                .reply(201, { data: { id: 308 } }, mockRateLimitHeaders);

            nock(apiUrl)
                .post('/api/v4/activities.json')
                .reply(201, { data: { id: 408 } }, mockRateLimitHeaders);

            const result = await clio.createCallLog({
                user: mockUser,
                contactInfo: mockContact,
                authHeader,
                callLog: mockCallLogData,
                note: 'Test note',
                additionalSubmission: {
                    isAssignedToUser: true,
                    adminAssignedUserRcId: 'ext-200',
                    nonBillable: false
                },
                aiNote: null,
                transcript: null,
                composedLogDetails: 'Call details',
                hashedAccountId: 'hash-123'
            });

            expect(result.logId).toBe(308);
        });

        it('should handle inbound call direction with assigned user', async () => {
            // Reset the jwt.decodeJwt mock to default behavior (not throwing)
            const jwt = require('@app-connect/core/lib/jwt');
            jwt.decodeJwt.mockReturnValue({ id: 'assigned-user-id' });

            UserModel.findByPk.mockResolvedValue({
                platformAdditionalInfo: { id: 555 }
            });

            const inboundCallLog = { ...mockCallLogData, direction: 'Inbound' };

            // For inbound calls, the receiver is the User, so the assigned user ID should be in receivers
            nock(apiUrl)
                .post('/api/v4/communications.json', body => {
                    // Verify that assigned user ID is in receivers array
                    return body.data.receivers[0].id === 555 && body.data.receivers[0].type === 'User';
                })
                .reply(201, { data: { id: 309 } }, mockRateLimitHeaders);

            nock(apiUrl)
                .post('/api/v4/activities.json')
                .reply(201, { data: { id: 409 } }, mockRateLimitHeaders);

            const result = await clio.createCallLog({
                user: mockUser,
                contactInfo: mockContact,
                authHeader,
                callLog: inboundCallLog,
                note: 'Test note',
                additionalSubmission: {
                    isAssignedToUser: true,
                    adminAssignedUserToken: 'valid-jwt-token',
                    nonBillable: false
                },
                aiNote: null,
                transcript: null,
                composedLogDetails: 'Call details',
                hashedAccountId: 'hash-123'
            });

            expect(result.logId).toBe(309);
        });
    });

    // ==================== getUserInfo timezone handling ====================
    describe('getUserInfo timezone handling', () => {
        it('should handle invalid timezone gracefully', async () => {
            nock(apiUrl)
                .get('/api/v4/users/who_am_i.json')
                .query({ fields: 'id,name,time_zone' })
                .reply(200, {
                    data: {
                        id: 12345,
                        name: 'Test User',
                        time_zone: 'Invalid/Timezone'
                    }
                });

            const result = await clio.getUserInfo({ authHeader, hostname });

            expect(result.successful).toBe(true);
            expect(result.platformUserInfo.timezoneOffset).toBe(0);
        });

        it('should handle null timezone', async () => {
            nock(apiUrl)
                .get('/api/v4/users/who_am_i.json')
                .query({ fields: 'id,name,time_zone' })
                .reply(200, {
                    data: {
                        id: 12345,
                        name: 'Test User',
                        time_zone: null
                    }
                });

            const result = await clio.getUserInfo({ authHeader, hostname });

            expect(result.successful).toBe(true);
            expect(result.platformUserInfo.timezoneOffset).toBe(0);
        });
    });

    // ==================== findContactWithName with matters ====================
    describe('findContactWithName with matters', () => {
        it('should include matters in contact info', async () => {
            nock(apiUrl)
                .get('/api/v4/contacts.json')
                .query({ query: 'John Doe', fields: 'id,name,primary_phone_number' })
                .reply(200, {
                    data: [{
                        id: 101,
                        name: 'John Doe',
                        type: 'Person',
                        primary_phone_number: '+14155551234'
                    }]
                }, mockRateLimitHeaders);

            nock(apiUrl)
                .get('/api/v4/matters.json')
                .query({ client_id: '101', fields: 'id,display_number,description,status' })
                .reply(200, {
                    data: [
                        { id: 201, display_number: 'MAT-001', description: 'Open Matter', status: 'Open' },
                        { id: 202, display_number: 'MAT-002', description: 'Closed Matter', status: 'Closed' }
                    ]
                }, mockRateLimitHeaders);

            nock(apiUrl)
                .get('/api/v4/relationships.json')
                .query({ contact_id: '101', fields: 'matter{id,display_number,description,status}' })
                .reply(200, {
                    data: [
                        { matter: { id: 203, display_number: 'MAT-003', description: 'Related Open', status: 'Open' } },
                        { matter: { id: 204, display_number: 'MAT-004', description: 'Related Closed', status: 'Closed' } }
                    ]
                }, mockRateLimitHeaders);

            const result = await clio.findContactWithName({
                user: mockUser,
                authHeader,
                name: 'John Doe'
            });

            expect(result.successful).toBe(true);
            expect(result.matchedContactInfo[0].additionalInfo.matters).toBeDefined();
            // Should filter out closed matters from relationships
            expect(result.matchedContactInfo[0].additionalInfo.matters.length).toBe(2);
        });

        it('should handle user settings for default time entry and non-billable', async () => {
            const userWithSettings = createMockUser({
                ...mockUser,
                userSettings: {
                    clioDefaultTimeEntryTick: false,
                    clioDefaultNonBillableTick: true
                }
            });

            nock(apiUrl)
                .get('/api/v4/contacts.json')
                .query({ query: 'Jane', fields: 'id,name,primary_phone_number' })
                .reply(200, {
                    data: [{
                        id: 102,
                        name: 'Jane Smith',
                        primary_phone_number: '+14155555678'
                    }]
                }, mockRateLimitHeaders);

            nock(apiUrl)
                .get('/api/v4/matters.json')
                .query(true)
                .reply(200, {
                    data: [{ id: 301, display_number: 'MAT-005', status: 'Open' }]
                }, mockRateLimitHeaders);

            nock(apiUrl)
                .get('/api/v4/relationships.json')
                .query(true)
                .reply(200, { data: [] }, mockRateLimitHeaders);

            const result = await clio.findContactWithName({
                user: userWithSettings,
                authHeader,
                name: 'Jane'
            });

            expect(result.successful).toBe(true);
            expect(result.matchedContactInfo[0].additionalInfo.logTimeEntry).toBe(false);
            expect(result.matchedContactInfo[0].additionalInfo.nonBillable).toBe(true);
        });
    });

    // ==================== Error Scenarios ====================
    describe('Error Scenarios', () => {
        it('should handle 401 unauthorized errors', async () => {
            nock(apiUrl)
                .get('/api/v4/contacts.json')
                .query(true)
                .reply(401, { error: 'Unauthorized' });

            await expect(clio.findContact({
                user: mockUser,
                authHeader,
                phoneNumber: '+1 4155551234',
                overridingFormat: '',
                isExtension: 'false'
            })).rejects.toThrow();
        });

        it('should handle 429 rate limit errors', async () => {
            nock(apiUrl)
                .get('/api/v4/contacts.json')
                .query(true)
                .reply(429, { error: 'Rate limit exceeded' }, {
                    'X-RateLimit-Remaining': '0'
                });

            await expect(clio.findContact({
                user: mockUser,
                authHeader,
                phoneNumber: '+1 4155551234',
                overridingFormat: '',
                isExtension: 'false'
            })).rejects.toThrow();
        });

        it('should handle 500 server errors', async () => {
            nock(apiUrl)
                .post('/api/v4/communications.json')
                .reply(500, { error: 'Internal server error' });

            const mockContact = createMockContact({ id: 101, type: 'Person' });
            const mockCallLogData = createMockCallLog();

            await expect(clio.createCallLog({
                user: mockUser,
                contactInfo: mockContact,
                authHeader,
                callLog: mockCallLogData,
                note: 'Test',
                additionalSubmission: { nonBillable: false },
                aiNote: null,
                transcript: null,
                composedLogDetails: 'Details',
                hashedAccountId: 'hash-123'
            })).rejects.toThrow();
        });

        it('should handle network errors', async () => {
            nock(apiUrl)
                .get('/api/v4/contacts.json')
                .query(true)
                .replyWithError('Network error');

            await expect(clio.findContact({
                user: mockUser,
                authHeader,
                phoneNumber: '+1 4155551234',
                overridingFormat: '',
                isExtension: 'false'
            })).rejects.toThrow();
        });
    });

    // ==================== Regional URL Handling ====================
    describe('Regional URL Handling', () => {
        it('should use AU region URL for AU hostname', async () => {
            const auUser = createMockUser({
                ...mockUser,
                hostname: 'au.app.clio.com'
            });

            nock('https://au.app.clio.com')
                .get('/api/v4/contacts.json')
                .query(true)
                .reply(200, { data: [] }, mockRateLimitHeaders);

            const result = await clio.findContact({
                user: auUser,
                authHeader,
                phoneNumber: '+1 4155551234',
                overridingFormat: '',
                isExtension: 'false'
            });

            expect(result.successful).toBe(true);
        });

        it('should use EU region URL for EU hostname', async () => {
            const euUser = createMockUser({
                ...mockUser,
                hostname: 'eu.app.clio.com'
            });

            nock('https://eu.app.clio.com')
                .get('/api/v4/contacts.json')
                .query(true)
                .reply(200, { data: [] }, mockRateLimitHeaders);

            const result = await clio.findContact({
                user: euUser,
                authHeader,
                phoneNumber: '+1 4155551234',
                overridingFormat: '',
                isExtension: 'false'
            });

            expect(result.successful).toBe(true);
        });

        it('should use CA region URL for CA hostname', async () => {
            const caUser = createMockUser({
                ...mockUser,
                hostname: 'ca.app.clio.com'
            });

            nock('https://ca.app.clio.com')
                .get('/api/v4/contacts.json')
                .query(true)
                .reply(200, { data: [] }, mockRateLimitHeaders);

            const result = await clio.findContact({
                user: caUser,
                authHeader,
                phoneNumber: '+1 4155551234',
                overridingFormat: '',
                isExtension: 'false'
            });

            expect(result.successful).toBe(true);
        });
    });
});

