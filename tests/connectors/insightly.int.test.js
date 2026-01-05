/* eslint-disable no-undef */
/**
 * Comprehensive integration tests for Insightly connector
 * Tests all exported functions with success and error scenarios
 */

const nock = require('nock');
const insightly = require('../../src/connectors/insightly');
const { createMockUser, createMockContact, createMockCallLog, createMockMessage, createMockExistingCallLog, createMockExistingMessageLog } = require('../fixtures/connectorMocks');

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

describe('Insightly Connector', () => {
    const apiUrl = 'https://api.insightly.com';
    const authHeader = 'Basic dGVzdC1hcGkta2V5Og==';
    
    let mockUser;

    beforeEach(() => {
        nock.cleanAll();
        nock.disableNetConnect();
        jest.clearAllMocks();
        
        process.env.INSIGHTLY_API_VERSION = 'v3.1';
        
        mockUser = createMockUser({
            id: '12345-insightly',
            hostname: 'api.insightly.com',
            platform: 'insightly',
            timezoneOffset: 0,
            userSettings: {},
            platformAdditionalInfo: {
                apiUrl: apiUrl
            }
        });
    });

    afterEach(() => {
        nock.cleanAll();
        nock.enableNetConnect();
    });

    // ==================== getAuthType ====================
    describe('getAuthType', () => {
        it('should return apiKey', () => {
            expect(insightly.getAuthType()).toBe('apiKey');
        });
    });

    // ==================== getLogFormatType ====================
    describe('getLogFormatType', () => {
        it('should return PLAIN_TEXT format type', () => {
            const result = insightly.getLogFormatType();
            expect(result).toBe('text/plain');
        });
    });

    // ==================== getBasicAuth ====================
    describe('getBasicAuth', () => {
        it('should encode API key in base64', () => {
            const result = insightly.getBasicAuth({ apiKey: 'test-api-key' });
            const decoded = Buffer.from(result, 'base64').toString();
            expect(decoded).toBe('test-api-key:');
        });
    });

    // ==================== getUserInfo ====================
    describe('getUserInfo', () => {
        it('should return user info on successful API call', async () => {
            nock(apiUrl)
                .get('/v3.1/users/me')
                .reply(200, {
                    USER_ID: 12345,
                    FIRST_NAME: 'Test',
                    LAST_NAME: 'User',
                    TIMEZONE_ID: 'Eastern Standard Time'
                });

            const result = await insightly.getUserInfo({
                authHeader,
                additionalInfo: { apiUrl }
            });

            expect(result.successful).toBe(true);
            expect(result.platformUserInfo.id).toBe('12345-insightly');
            expect(result.platformUserInfo.name).toBe('Test User');
            expect(result.returnMessage.messageType).toBe('success');
        });

        it('should strip version from apiUrl if present', async () => {
            nock(apiUrl)
                .get('/v3.1/users/me')
                .reply(200, {
                    USER_ID: 12345,
                    FIRST_NAME: 'Test',
                    LAST_NAME: 'User',
                    TIMEZONE_ID: 'UTC'
                });

            const result = await insightly.getUserInfo({
                authHeader,
                additionalInfo: { apiUrl: `${apiUrl}/v3.1` }
            });

            expect(result.successful).toBe(true);
        });

        it('should return error on API failure', async () => {
            nock(apiUrl)
                .get('/v3.1/users/me')
                .reply(401, { error: 'Unauthorized' });

            const result = await insightly.getUserInfo({
                authHeader,
                additionalInfo: { apiUrl }
            });

            expect(result.successful).toBe(false);
            expect(result.returnMessage.messageType).toBe('warning');
        });

        it('should convert Windows timezone to IANA', async () => {
            nock(apiUrl)
                .get('/v3.1/users/me')
                .reply(200, {
                    USER_ID: 12345,
                    FIRST_NAME: 'Test',
                    LAST_NAME: 'User',
                    TIMEZONE_ID: 'Pacific Standard Time'
                });

            const result = await insightly.getUserInfo({
                authHeader,
                additionalInfo: { apiUrl }
            });

            expect(result.successful).toBe(true);
            // Timezone offset should be calculated based on Pacific time
            expect(result.platformUserInfo.timezoneOffset).toBeDefined();
        });
    });

    // ==================== unAuthorize ====================
    describe('unAuthorize', () => {
        it('should clear user credentials', async () => {
            const user = createMockUser({
                id: '12345-insightly',
                accessToken: 'test-api-key',
                refreshToken: ''
            });

            const result = await insightly.unAuthorize({ user });

            expect(result.returnMessage.messageType).toBe('success');
            expect(result.returnMessage.message).toBe('Logged out of Insightly');
            expect(user.save).toHaveBeenCalled();
        });
    });

    // ==================== findContact ====================
    describe('findContact', () => {
        it('should return empty array for extension numbers', async () => {
            const result = await insightly.findContact({
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
            // Use wildcard interceptor for all search requests
            nock(apiUrl)
                .persist()
                .get(/.*/)
                .reply(200, function(uri) {
                    // Return contact for PHONE search
                    if (uri.includes('contacts/search') && uri.includes('field_name=PHONE') && !uri.includes('PHONE_MOBILE')) {
                        return [{
                            CONTACT_ID: 101,
                            FIRST_NAME: 'John',
                            LAST_NAME: 'Doe',
                            PHONE: '+14155551234',
                            TITLE: 'Engineer',
                            LAST_ACTIVITY_DATE_UTC: '2024-01-15T10:00:00Z',
                            DATE_UPDATED_UTC: '2024-01-15T10:00:00Z',
                            LINKS: []
                        }];
                    }
                    return [];
                });

            // Use E.164 format without space ('+1 ' causes issues with the connector's replace logic)
            const result = await insightly.findContact({
                user: mockUser,
                authHeader,
                phoneNumber: '+14155551234',
                overridingFormat: '',
                isExtension: 'false'
            });

            expect(result.successful).toBe(true);
            expect(result.matchedContactInfo.length).toBeGreaterThan(0);
            expect(result.matchedContactInfo[0].name).toBe('John Doe');
            expect(result.matchedContactInfo[0].type).toBe('Contact');
        });

        it('should find leads by phone number', async () => {
            // Use wildcard interceptor for all search requests
            nock(apiUrl)
                .persist()
                .get(/.*/)
                .reply(200, function(uri) {
                    // Return lead for leads/search PHONE
                    if (uri.includes('leads/search') && uri.includes('field_name=PHONE') && !uri.includes('MOBILE')) {
                        return [{
                            LEAD_ID: 102,
                            FIRST_NAME: 'Jane',
                            LAST_NAME: 'Smith',
                            PHONE: '+14155551234',
                            TITLE: 'Manager',
                            LAST_ACTIVITY_DATE_UTC: '2024-01-15T10:00:00Z',
                            DATE_UPDATED_UTC: '2024-01-15T10:00:00Z',
                            LINKS: []
                        }];
                    }
                    return [];
                });

            const result = await insightly.findContact({
                user: mockUser,
                authHeader,
                phoneNumber: '+14155551234',
                overridingFormat: '',
                isExtension: 'false'
            });

            expect(result.successful).toBe(true);
            const leadContact = result.matchedContactInfo.find(c => c.type === 'Lead');
            expect(leadContact).toBeDefined();
            expect(leadContact.name).toBe('Jane Smith');
        });

        it('should fetch related organisations and opportunities', async () => {
            // Use wildcard interceptor for all requests
            nock(apiUrl)
                .persist()
                .get(/.*/)
                .reply(200, function(uri) {
                    // Contact search returns contact with links
                    if (uri.includes('contacts/search') && uri.includes('field_name=PHONE') && !uri.includes('PHONE_MOBILE')) {
                        return [{
                            CONTACT_ID: 101,
                            FIRST_NAME: 'John',
                            LAST_NAME: 'Doe',
                            PHONE: '+14155551234',
                            LINKS: [
                                { LINK_OBJECT_NAME: 'Organisation', LINK_OBJECT_ID: 201 },
                                { LINK_OBJECT_NAME: 'Opportunity', LINK_OBJECT_ID: 301 }
                            ]
                        }];
                    }
                    // Organisation lookup
                    if (uri.includes('organisations/201')) {
                        return { ORGANISATION_ID: 201, ORGANISATION_NAME: 'Test Corp' };
                    }
                    // Opportunity lookup
                    if (uri.includes('opportunities/301')) {
                        return { OPPORTUNITY_ID: 301, OPPORTUNITY_NAME: 'Big Deal' };
                    }
                    return [];
                });

            const result = await insightly.findContact({
                user: mockUser,
                authHeader,
                phoneNumber: '+14155551234',
                overridingFormat: '',
                isExtension: 'false'
            });

            expect(result.successful).toBe(true);
            expect(result.matchedContactInfo[0].additionalInfo.organisation).toBeDefined();
            expect(result.matchedContactInfo[0].additionalInfo.opportunity).toBeDefined();
        });

        it('should include create new contact option', async () => {
            // Use wildcard interceptor returning empty arrays
            nock(apiUrl)
                .persist()
                .get(/.*/)
                .reply(200, []);

            const result = await insightly.findContact({
                user: mockUser,
                authHeader,
                phoneNumber: '+14155551234',
                overridingFormat: '',
                isExtension: 'false'
            });

            const createNewOption = result.matchedContactInfo.find(c => c.id === 'createNewContact');
            expect(createNewOption).toBeDefined();
            expect(createNewOption.isNewContact).toBe(true);
        });

        it('should handle extra phone fields from user settings', async () => {
            const userWithExtraFields = createMockUser({
                ...mockUser,
                userSettings: {
                    insightlyExtraPhoneFieldNameForContact: { value: 'CUSTOM_PHONE_FIELD' }
                },
                platformAdditionalInfo: { apiUrl }
            });

            // Use wildcard interceptor
            nock(apiUrl)
                .persist()
                .get(/.*/)
                .reply(200, function(uri) {
                    // Return contact for custom phone field search
                    if (uri.includes('CUSTOM_PHONE_FIELD')) {
                        return [{
                            CONTACT_ID: 103,
                            FIRST_NAME: 'Custom',
                            LAST_NAME: 'Field',
                            CUSTOMFIELDS: [{ FIELD_NAME: 'CUSTOM_PHONE_FIELD', FIELD_VALUE: '+14155551234' }],
                            LINKS: []
                        }];
                    }
                    return [];
                });

            const result = await insightly.findContact({
                user: userWithExtraFields,
                authHeader,
                phoneNumber: '+14155551234',
                overridingFormat: '',
                isExtension: 'false'
            });

            expect(result.successful).toBe(true);
        });
    });

    // ==================== findContactWithName ====================
    describe('findContactWithName', () => {
        it('should find contacts by first name', async () => {
            nock(apiUrl)
                .get('/v3.1/contacts/search')
                .query({ field_name: 'FIRST_NAME', field_value: 'John', brief: 'false' })
                .reply(200, [{
                    CONTACT_ID: 101,
                    FIRST_NAME: 'John',
                    LAST_NAME: 'Doe',
                    PHONE: '+14155551234',
                    LINKS: []
                }]);

            nock(apiUrl)
                .get('/v3.1/leads/search')
                .query({ field_name: 'FIRST_NAME', field_value: 'John', brief: 'false' })
                .reply(200, []);

            const result = await insightly.findContactWithName({
                user: mockUser,
                authHeader,
                name: 'John'
            });

            expect(result.successful).toBe(true);
            expect(result.matchedContactInfo.length).toBe(1);
            expect(result.matchedContactInfo[0].name).toBe('John Doe');
        });

        it('should find contacts by full name', async () => {
            nock(apiUrl)
                .get('/v3.1/contacts/search')
                .query({ field_name: 'FIRST_NAME', field_value: 'John', brief: 'false' })
                .reply(200, [{
                    CONTACT_ID: 101,
                    FIRST_NAME: 'John',
                    LAST_NAME: 'Doe',
                    PHONE: '+14155551234',
                    LINKS: []
                }]);

            nock(apiUrl)
                .get('/v3.1/contacts/search')
                .query({ field_name: 'LAST_NAME', field_value: 'Doe', brief: 'false' })
                .reply(200, [{
                    CONTACT_ID: 101,
                    FIRST_NAME: 'John',
                    LAST_NAME: 'Doe',
                    PHONE: '+14155551234',
                    LINKS: []
                }]);

            nock(apiUrl)
                .get('/v3.1/leads/search')
                .query({ field_name: 'FIRST_NAME', field_value: 'John Doe', brief: 'false' })
                .reply(200, []);

            nock(apiUrl)
                .get('/v3.1/leads/search')
                .query({ field_name: 'LAST_NAME', field_value: 'Doe', brief: 'false' })
                .reply(200, []);

            const result = await insightly.findContactWithName({
                user: mockUser,
                authHeader,
                name: 'John Doe'
            });

            expect(result.successful).toBe(true);
            // Should deduplicate contacts
            expect(result.matchedContactInfo.length).toBe(1);
        });
    });

    // ==================== createContact ====================
    describe('createContact', () => {
        it('should create a new contact', async () => {
            nock(apiUrl)
                .post('/v3.1/contacts', {
                    PHONE: '+14155551234',
                    FIRST_NAME: 'John',
                    LAST_NAME: 'Doe'
                })
                .reply(201, {
                    CONTACT_ID: 102,
                    FIRST_NAME: 'John',
                    LAST_NAME: 'Doe'
                });

            const result = await insightly.createContact({
                user: mockUser,
                authHeader,
                phoneNumber: '+14155551234',
                newContactName: 'John Doe',
                newContactType: 'contact'
            });

            expect(result.contactInfo.id).toBe(102);
            expect(result.contactInfo.name).toBe('John Doe');
            expect(result.returnMessage.messageType).toBe('success');
        });

        it('should create a new lead', async () => {
            nock(apiUrl)
                .post('/v3.1/leads', {
                    PHONE: '+14155551234',
                    FIRST_NAME: 'Jane',
                    LAST_NAME: 'Lead'
                })
                .reply(201, {
                    LEAD_ID: 103,
                    FIRST_NAME: 'Jane',
                    LAST_NAME: 'Lead'
                });

            const result = await insightly.createContact({
                user: mockUser,
                authHeader,
                phoneNumber: '+14155551234',
                newContactName: 'Jane',
                newContactType: 'lead'
            });

            expect(result.contactInfo.id).toBe(103);
            expect(result.returnMessage.messageType).toBe('success');
        });

        it('should return null for empty contact type', async () => {
            const result = await insightly.createContact({
                user: mockUser,
                authHeader,
                phoneNumber: '+14155551234',
                newContactName: 'John Doe',
                newContactType: ''
            });

            expect(result).toBeNull();
        });
    });

    // ==================== getUserList ====================
    describe('getUserList', () => {
        it('should return list of users', async () => {
            nock(apiUrl)
                .get('/v3.1/users')
                .reply(200, [
                    { USER_ID: 1, FIRST_NAME: 'User', LAST_NAME: 'One', EMAIL_ADDRESS: 'user1@example.com' },
                    { USER_ID: 2, FIRST_NAME: 'User', LAST_NAME: 'Two', EMAIL_ADDRESS: 'user2@example.com' }
                ]);

            const result = await insightly.getUserList({
                user: mockUser,
                authHeader
            });

            expect(result.length).toBe(2);
            expect(result[0].id).toBe(1);
            expect(result[0].name).toBe('User One');
            expect(result[0].email).toBe('user1@example.com');
        });

        it('should return empty array when no users', async () => {
            nock(apiUrl)
                .get('/v3.1/users')
                .reply(200, []);

            const result = await insightly.getUserList({
                user: mockUser,
                authHeader
            });

            expect(result).toEqual([]);
        });
    });

    // ==================== createCallLog ====================
    describe('createCallLog', () => {
        const mockContact = createMockContact({ id: 101, name: 'John Doe', type: 'Contact' });
        const mockCallLogData = createMockCallLog();

        it('should create a call log event', async () => {
            nock(apiUrl)
                .post('/v3.1/events')
                .reply(201, { EVENT_ID: 201 });

            nock(apiUrl)
                .post('/v3.1/events/201/links')
                .reply(201, {});

            const result = await insightly.createCallLog({
                user: mockUser,
                contactInfo: mockContact,
                authHeader,
                callLog: mockCallLogData,
                note: 'Test note',
                additionalSubmission: null,
                aiNote: 'AI note',
                transcript: 'Transcript',
                composedLogDetails: 'Call details',
                hashedAccountId: 'hash-123'
            });

            expect(result.logId).toBe(201);
            expect(result.returnMessage.messageType).toBe('success');
        });

        it('should link organization and opportunity when provided', async () => {
            nock(apiUrl)
                .post('/v3.1/events')
                .reply(201, { EVENT_ID: 202 });

            nock(apiUrl)
                .post('/v3.1/events/202/links')
                .times(3)
                .reply(201, {});

            const result = await insightly.createCallLog({
                user: mockUser,
                contactInfo: mockContact,
                authHeader,
                callLog: mockCallLogData,
                note: 'Test note',
                additionalSubmission: {
                    organization: 301,
                    opportunity: 401
                },
                aiNote: null,
                transcript: null,
                composedLogDetails: 'Call details',
                hashedAccountId: 'hash-123'
            });

            expect(result.logId).toBe(202);
        });

        it('should create call log for lead type contact', async () => {
            const leadContact = { ...mockContact, type: 'Lead', id: 102 };

            nock(apiUrl)
                .post('/v3.1/events')
                .reply(201, { EVENT_ID: 203 });

            nock(apiUrl)
                .post('/v3.1/events/203/links', {
                    LINK_OBJECT_NAME: 'lead',
                    LINK_OBJECT_ID: 102
                })
                .reply(201, {});

            const result = await insightly.createCallLog({
                user: mockUser,
                contactInfo: leadContact,
                authHeader,
                callLog: mockCallLogData,
                note: 'Test note',
                additionalSubmission: null,
                aiNote: null,
                transcript: null,
                composedLogDetails: 'Call details',
                hashedAccountId: 'hash-123'
            });

            expect(result.logId).toBe(203);
        });

        it('should handle admin assigned user', async () => {
            UserModel.findByPk.mockResolvedValue({
                platformAdditionalInfo: { id: 999 }
            });

            nock(apiUrl)
                .post('/v3.1/events', body => body.OWNER_USER_ID === 999)
                .reply(201, { EVENT_ID: 204 });

            nock(apiUrl)
                .post('/v3.1/events/204/links')
                .reply(201, {});

            const result = await insightly.createCallLog({
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

            expect(result.logId).toBe(204);
        });
    });

    // ==================== updateCallLog ====================
    describe('updateCallLog', () => {
        const existingCallLog = createMockExistingCallLog({ thirdPartyLogId: '201' });

        it('should update an existing call log', async () => {
            // Mock GET request for fetching existing log (when existingCallLogDetails is null)
            nock(apiUrl)
                .get('/v3.1/events/201')
                .reply(200, { EVENT_ID: 201, TITLE: 'Existing Call' });

            nock(apiUrl)
                .put('/v3.1/events')
                .reply(200, { EVENT_ID: 201 });

            const result = await insightly.updateCallLog({
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
            const existingCallLogDetails = {
                EVENT_ID: 201,
                TITLE: 'Existing Title'
            };

            nock(apiUrl)
                .put('/v3.1/events')
                .reply(200, { EVENT_ID: 201 });

            const result = await insightly.updateCallLog({
                user: mockUser,
                existingCallLog,
                authHeader,
                recordingLink: null,
                subject: null,
                note: null,
                startTime: Date.now(),
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
                .get('/v3.1/events/201')
                .reply(200, { EVENT_ID: 201, TITLE: 'Existing Title' });

            nock(apiUrl)
                .put('/v3.1/events')
                .reply(200, { EVENT_ID: 201 });

            const result = await insightly.updateCallLog({
                user: mockUser,
                existingCallLog,
                authHeader,
                recordingLink: null,
                subject: null,
                note: null,
                startTime: Date.now(),
                duration: 300,
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
        const existingCallLog = createMockExistingCallLog({ thirdPartyLogId: '201' });

        it('should update disposition with organisation', async () => {
            nock(apiUrl)
                .get('/v3.1/events/201')
                .reply(200, { EVENT_ID: 201, LINKS: [] });

            nock(apiUrl)
                .post('/v3.1/events/201/links')
                .reply(201, {});

            const result = await insightly.upsertCallDisposition({
                user: mockUser,
                existingCallLog,
                authHeader,
                dispositions: { organisation: 301 }
            });

            expect(result.logId).toBe('201');
        });

        it('should delete existing link and create new one when different', async () => {
            nock(apiUrl)
                .get('/v3.1/events/201')
                .reply(200, {
                    EVENT_ID: 201,
                    LINKS: [{ LINK_ID: 1, LINK_OBJECT_NAME: 'Organisation', LINK_OBJECT_ID: 300 }]
                });

            nock(apiUrl)
                .delete('/v3.1/events/201/links/1')
                .reply(200, {});

            nock(apiUrl)
                .post('/v3.1/events/201/links')
                .reply(201, {});

            const result = await insightly.upsertCallDisposition({
                user: mockUser,
                existingCallLog,
                authHeader,
                dispositions: { organisation: 301 }
            });

            expect(result.logId).toBe('201');
        });

        it('should return null logId when no dispositions provided', async () => {
            const result = await insightly.upsertCallDisposition({
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
            // DETAILS must have proper format: "- Agent notes: <note>\n- <Key>: <value>" for regex to work
            nock(apiUrl)
                .get('/v3.1/events/201')
                .reply(200, {
                    EVENT_ID: 201,
                    TITLE: 'Test Call',
                    DETAILS: '- Agent notes: Test note\n- Call result: Connected',
                    LINKS: [{ LINK_OBJECT_NAME: 'contact', LINK_OBJECT_ID: 101 }]
                });

            nock(apiUrl)
                .get('/v3.1/contacts/101')
                .reply(200, { FIRST_NAME: 'John', LAST_NAME: 'Doe' });

            const result = await insightly.getCallLog({
                user: mockUser,
                callLogId: '201',
                authHeader
            });

            expect(result.callLogInfo.subject).toBe('Test Call');
            expect(result.callLogInfo.note).toBe('Test note');
            expect(result.callLogInfo.contactName).toBe('John Doe');
        });
    });

    // ==================== createMessageLog ====================
    describe('createMessageLog', () => {
        const mockContact = createMockContact({ id: 101, name: 'John Doe', phoneNumber: '+14155551234', type: 'Contact' });
        const mockMessageData = createMockMessage();

        beforeEach(() => {
            nock(apiUrl)
                .get('/v3.1/users/me')
                .reply(200, {
                    USER_ID: 12345,
                    FIRST_NAME: 'Test',
                    LAST_NAME: 'User'
                });
        });

        it('should create an SMS message log', async () => {
            nock(apiUrl)
                .post('/v3.1/events')
                .reply(201, { EVENT_ID: 301 });

            nock(apiUrl)
                .post('/v3.1/events/301/links')
                .reply(201, {});

            const result = await insightly.createMessageLog({
                user: mockUser,
                contactInfo: mockContact,
                authHeader,
                message: mockMessageData,
                additionalSubmission: null,
                recordingLink: null,
                faxDocLink: null
            });

            expect(result.logId).toBe(301);
            expect(result.returnMessage.message).toBe('Message logged');
        });

        it('should create a voicemail message log', async () => {
            nock(apiUrl)
                .post('/v3.1/events')
                .reply(201, { EVENT_ID: 302 });

            nock(apiUrl)
                .post('/v3.1/events/302/links')
                .reply(201, {});

            const result = await insightly.createMessageLog({
                user: mockUser,
                contactInfo: mockContact,
                authHeader,
                message: mockMessageData,
                additionalSubmission: null,
                recordingLink: 'https://recording.example.com/voicemail.mp3',
                faxDocLink: null
            });

            expect(result.logId).toBe(302);
        });

        it('should create a fax message log', async () => {
            nock(apiUrl)
                .post('/v3.1/events')
                .reply(201, { EVENT_ID: 303 });

            nock(apiUrl)
                .post('/v3.1/events/303/links')
                .reply(201, {});

            const result = await insightly.createMessageLog({
                user: mockUser,
                contactInfo: mockContact,
                authHeader,
                message: mockMessageData,
                additionalSubmission: null,
                recordingLink: null,
                faxDocLink: 'https://fax.example.com/document.pdf'
            });

            expect(result.logId).toBe(303);
        });

        it('should link lead when contact type is lead', async () => {
            const leadContact = { ...mockContact, type: 'Lead', id: 102 };

            nock(apiUrl)
                .post('/v3.1/events')
                .reply(201, { EVENT_ID: 304 });

            nock(apiUrl)
                .post('/v3.1/events/304/links', {
                    LINK_OBJECT_NAME: 'lead',
                    LINK_OBJECT_ID: 102
                })
                .reply(201, {});

            const result = await insightly.createMessageLog({
                user: mockUser,
                contactInfo: leadContact,
                authHeader,
                message: mockMessageData,
                additionalSubmission: null,
                recordingLink: null,
                faxDocLink: null
            });

            expect(result.logId).toBe(304);
        });
    });

    // ==================== updateMessageLog ====================
    describe('updateMessageLog', () => {
        const mockContact = createMockContact({ id: 101, name: 'John Doe', phoneNumber: '+14155551234' });
        const mockMessageData = createMockMessage();
        const existingMessageLog = createMockExistingMessageLog({ thirdPartyLogId: '301' });

        it('should update an existing message log', async () => {
            nock(apiUrl)
                .get('/v3.1/events/301')
                .reply(200, {
                    EVENT_ID: 301,
                    DETAILS: '\nConversation(1 messages)\nBEGIN\n------------\nFirst message\n------------\nEND\n'
                });

            nock(apiUrl)
                .get('/v3.1/users/me')
                .reply(200, {
                    USER_ID: 12345,
                    FIRST_NAME: 'Test',
                    LAST_NAME: 'User'
                });

            nock(apiUrl)
                .put('/v3.1/events')
                .reply(200, { EVENT_ID: 301 });

            await insightly.updateMessageLog({
                user: mockUser,
                contactInfo: mockContact,
                existingMessageLog,
                message: { ...mockMessageData, subject: 'Second message' },
                authHeader
            });

            // No return value to check, but no error means success
        });
    });

    // ==================== Error Scenarios ====================
    describe('Error Scenarios', () => {
        it('should handle 401 unauthorized errors', async () => {
            // Mock all requests with 401 error using persist
            nock(apiUrl)
                .persist()
                .get(/.*/)
                .reply(401, { error: 'Unauthorized' });

            await expect(insightly.findContact({
                user: mockUser,
                authHeader,
                phoneNumber: '+14155551234',
                overridingFormat: '',
                isExtension: 'false'
            })).rejects.toThrow();
        });

        it('should handle 500 server errors', async () => {
            nock(apiUrl)
                .post('/v3.1/events')
                .reply(500, { error: 'Internal server error' });

            const mockContact = createMockContact({ id: 101, type: 'Contact' });
            const mockCallLogData = createMockCallLog();

            await expect(insightly.createCallLog({
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
            // Mock all requests with network error using persist
            nock(apiUrl)
                .persist()
                .get(/.*/)
                .replyWithError('Network error');

            await expect(insightly.findContact({
                user: mockUser,
                authHeader,
                phoneNumber: '+14155551234',
                overridingFormat: '',
                isExtension: 'false'
            })).rejects.toThrow();
        });
    });
});

