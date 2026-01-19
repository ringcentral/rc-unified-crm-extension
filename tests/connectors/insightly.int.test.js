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

    // ==================== Message Log Format Tests ====================
    describe('createMessageLog format', () => {
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

        it('should format SMS message log with plain text (no HTML tags)', async () => {
            let capturedBody;
            nock(apiUrl)
                .post('/v3.1/events', body => {
                    capturedBody = body;
                    return true;
                })
                .reply(201, { EVENT_ID: 401 });

            nock(apiUrl)
                .post('/v3.1/events/401/links')
                .reply(201, {});

            await insightly.createMessageLog({
                user: mockUser,
                contactInfo: mockContact,
                authHeader,
                message: mockMessageData,
                additionalSubmission: null,
                recordingLink: null,
                faxDocLink: null
            });

            // Verify plain text format (no HTML tags)
            expect(capturedBody.DETAILS).not.toContain('<br>');
            expect(capturedBody.DETAILS).not.toContain('<b>');
            expect(capturedBody.DETAILS).not.toContain('<ul>');
            expect(capturedBody.DETAILS).not.toContain('<li>');
            expect(capturedBody.DETAILS).toContain('Conversation summary');
            expect(capturedBody.DETAILS).toContain('Participants');
            expect(capturedBody.DETAILS).toContain('RingCentral App Connect');
        });

        it('should format Voicemail message log with plain text (no HTML tags)', async () => {
            let capturedBody;
            nock(apiUrl)
                .post('/v3.1/events', body => {
                    capturedBody = body;
                    return true;
                })
                .reply(201, { EVENT_ID: 402 });

            nock(apiUrl)
                .post('/v3.1/events/402/links')
                .reply(201, {});

            await insightly.createMessageLog({
                user: mockUser,
                contactInfo: mockContact,
                authHeader,
                message: mockMessageData,
                additionalSubmission: null,
                recordingLink: 'https://recording.example.com/voicemail.mp3',
                faxDocLink: null
            });

            // Verify plain text format (no HTML tags)
            expect(capturedBody.DETAILS).not.toContain('<br>');
            expect(capturedBody.DETAILS).not.toContain('<b>');
            expect(capturedBody.DETAILS).toContain('Voicemail recording link');
            expect(capturedBody.DETAILS).toContain('https://recording.example.com/voicemail.mp3');
            expect(capturedBody.DETAILS).toContain('RingCentral App Connect');
        });

        it('should format Fax message log with plain text (no HTML tags)', async () => {
            let capturedBody;
            nock(apiUrl)
                .post('/v3.1/events', body => {
                    capturedBody = body;
                    return true;
                })
                .reply(201, { EVENT_ID: 403 });

            nock(apiUrl)
                .post('/v3.1/events/403/links')
                .reply(201, {});

            await insightly.createMessageLog({
                user: mockUser,
                contactInfo: mockContact,
                authHeader,
                message: mockMessageData,
                additionalSubmission: null,
                recordingLink: null,
                faxDocLink: 'https://fax.example.com/document.pdf'
            });

            // Verify plain text format (no HTML tags)
            expect(capturedBody.DETAILS).not.toContain('<br>');
            expect(capturedBody.DETAILS).not.toContain('<b>');
            expect(capturedBody.DETAILS).toContain('Fax document link');
            expect(capturedBody.DETAILS).toContain('https://fax.example.com/document.pdf');
            expect(capturedBody.DETAILS).toContain('RingCentral App Connect');
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

    // ==================== Additional Coverage Tests ====================
    describe('getUserInfo - Additional Coverage', () => {
        it('should default to UTC offset when timezone conversion fails', async () => {
            nock(apiUrl)
                .get('/v3.1/users/me')
                .reply(200, {
                    USER_ID: 12345,
                    FIRST_NAME: 'Test',
                    LAST_NAME: 'User',
                    TIMEZONE_ID: 'Invalid/Timezone/That/Does/Not/Exist'
                });

            const result = await insightly.getUserInfo({
                authHeader,
                additionalInfo: { apiUrl }
            });

            expect(result.successful).toBe(true);
            expect(result.platformUserInfo.timezoneOffset).toBe(0);
        });
    });

    describe('findContact - Additional Coverage', () => {
        it('should use overridingFormat when provided', async () => {
            nock(apiUrl)
                .persist()
                .get(/.*/)
                .reply(200, function(uri) {
                    // The formatted number should match the pattern
                    if (uri.includes('contacts/search') && uri.includes('field_name=PHONE') && !uri.includes('PHONE_MOBILE')) {
                        return [{
                            CONTACT_ID: 101,
                            FIRST_NAME: 'John',
                            LAST_NAME: 'Doe',
                            PHONE: '415-555-1234',
                            LINKS: []
                        }];
                    }
                    return [];
                });

            const result = await insightly.findContact({
                user: mockUser,
                authHeader,
                phoneNumber: '+14155551234',
                overridingFormat: '***-***-****',
                isExtension: 'false'
            });

            expect(result.successful).toBe(true);
        });

        it('should handle multiple overriding formats', async () => {
            nock(apiUrl)
                .persist()
                .get(/.*/)
                .reply(200, []);

            const result = await insightly.findContact({
                user: mockUser,
                authHeader,
                phoneNumber: '+14155551234',
                overridingFormat: '(***) ***-****, ***-***-****',
                isExtension: 'false'
            });

            expect(result.successful).toBe(true);
        });

        it('should find contacts by mobile phone', async () => {
            nock(apiUrl)
                .persist()
                .get(/.*/)
                .reply(200, function(uri) {
                    if (uri.includes('contacts/search') && uri.includes('field_name=PHONE_MOBILE')) {
                        return [{
                            CONTACT_ID: 101,
                            FIRST_NAME: 'Mobile',
                            LAST_NAME: 'Contact',
                            PHONE_MOBILE: '+14155551234',
                            TITLE: 'Engineer',
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
            const mobileContact = result.matchedContactInfo.find(c => c.name === 'Mobile Contact');
            expect(mobileContact).toBeDefined();
            expect(mobileContact.type).toBe('Contact');
        });

        it('should find leads by mobile phone', async () => {
            nock(apiUrl)
                .persist()
                .get(/.*/)
                .reply(200, function(uri) {
                    if (uri.includes('leads/search') && uri.includes('field_name=MOBILE')) {
                        return [{
                            LEAD_ID: 102,
                            FIRST_NAME: 'Mobile',
                            LAST_NAME: 'Lead',
                            MOBILE: '+14155551234',
                            TITLE: 'Manager',
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
            const mobileLead = result.matchedContactInfo.find(c => c.name === 'Mobile Lead');
            expect(mobileLead).toBeDefined();
            expect(mobileLead.type).toBe('Lead');
        });

        it('should handle lead extra phone fields', async () => {
            const userWithExtraFields = createMockUser({
                ...mockUser,
                userSettings: {
                    insightlyExtraPhoneFieldNameForLead: { value: 'CUSTOM_LEAD_PHONE' }
                },
                platformAdditionalInfo: { apiUrl }
            });

            nock(apiUrl)
                .persist()
                .get(/.*/)
                .reply(200, function(uri) {
                    if (uri.includes('leads/search') && uri.includes('CUSTOM_LEAD_PHONE')) {
                        return [{
                            LEAD_ID: 103,
                            FIRST_NAME: 'Extra',
                            LAST_NAME: 'Phone Lead',
                            CUSTOMFIELDS: [{ FIELD_NAME: 'CUSTOM_LEAD_PHONE', FIELD_VALUE: '+14155551234' }],
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

        it('should handle extra phone field errors gracefully', async () => {
            const userWithExtraFields = createMockUser({
                ...mockUser,
                userSettings: {
                    insightlyExtraPhoneFieldNameForContact: { value: 'INVALID_FIELD' }
                },
                platformAdditionalInfo: { apiUrl }
            });

            // Set up standard search mocks that return empty arrays
            nock(apiUrl)
                .get('/v3.1/contacts/search')
                .query({ field_name: 'PHONE', field_value: '4155551234', brief: 'false' })
                .reply(200, []);

            nock(apiUrl)
                .get('/v3.1/contacts/search')
                .query({ field_name: 'PHONE_MOBILE', field_value: '4155551234', brief: 'false' })
                .reply(200, []);

            // This is the failing extra phone field request
            nock(apiUrl)
                .get('/v3.1/contacts/search')
                .query({ field_name: 'INVALID_FIELD', field_value: '4155551234', brief: 'false' })
                .reply(400, { error: 'Field not found' });

            nock(apiUrl)
                .get('/v3.1/leads/search')
                .query({ field_name: 'PHONE', field_value: '4155551234', brief: 'false' })
                .reply(200, []);

            nock(apiUrl)
                .get('/v3.1/leads/search')
                .query({ field_name: 'MOBILE', field_value: '4155551234', brief: 'false' })
                .reply(200, []);

            const result = await insightly.findContact({
                user: userWithExtraFields,
                authHeader,
                phoneNumber: '+14155551234',
                overridingFormat: '',
                isExtension: 'false'
            });

            expect(result.successful).toBe(true);
        });

        it('should handle lead extra phone field errors gracefully', async () => {
            const userWithExtraFields = createMockUser({
                ...mockUser,
                userSettings: {
                    insightlyExtraPhoneFieldNameForLead: { value: 'INVALID_LEAD_FIELD' }
                },
                platformAdditionalInfo: { apiUrl }
            });

            // Set up standard search mocks that return empty arrays
            nock(apiUrl)
                .get('/v3.1/contacts/search')
                .query({ field_name: 'PHONE', field_value: '4155551234', brief: 'false' })
                .reply(200, []);

            nock(apiUrl)
                .get('/v3.1/contacts/search')
                .query({ field_name: 'PHONE_MOBILE', field_value: '4155551234', brief: 'false' })
                .reply(200, []);

            nock(apiUrl)
                .get('/v3.1/leads/search')
                .query({ field_name: 'PHONE', field_value: '4155551234', brief: 'false' })
                .reply(200, []);

            nock(apiUrl)
                .get('/v3.1/leads/search')
                .query({ field_name: 'MOBILE', field_value: '4155551234', brief: 'false' })
                .reply(200, []);

            // This is the failing extra phone field request
            nock(apiUrl)
                .get('/v3.1/leads/search')
                .query({ field_name: 'INVALID_LEAD_FIELD', field_value: '4155551234', brief: 'false' })
                .reply(400, { error: 'Field not found' });

            const result = await insightly.findContact({
                user: userWithExtraFields,
                authHeader,
                phoneNumber: '+14155551234',
                overridingFormat: '',
                isExtension: 'false'
            });

            expect(result.successful).toBe(true);
        });

        it('should fetch related projects', async () => {
            nock(apiUrl)
                .persist()
                .get(/.*/)
                .reply(200, function(uri) {
                    if (uri.includes('contacts/search') && uri.includes('field_name=PHONE') && !uri.includes('PHONE_MOBILE')) {
                        return [{
                            CONTACT_ID: 101,
                            FIRST_NAME: 'John',
                            LAST_NAME: 'Doe',
                            PHONE: '+14155551234',
                            LINKS: [
                                { LINK_OBJECT_NAME: 'Project', LINK_OBJECT_ID: 401 }
                            ]
                        }];
                    }
                    if (uri.includes('projects/401')) {
                        return { PROJECT_ID: 401, PROJECT_NAME: 'Test Project' };
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
            expect(result.matchedContactInfo[0].additionalInfo.project).toBeDefined();
            expect(result.matchedContactInfo[0].additionalInfo.project[0].title).toBe('Test Project');
        });
    });

    describe('findContactWithName - Additional Coverage', () => {
        it('should find leads by full name with last name search', async () => {
            nock(apiUrl)
                .get('/v3.1/contacts/search')
                .query({ field_name: 'FIRST_NAME', field_value: 'Jane', brief: 'false' })
                .reply(200, []);

            nock(apiUrl)
                .get('/v3.1/contacts/search')
                .query({ field_name: 'LAST_NAME', field_value: 'Lead', brief: 'false' })
                .reply(200, []);

            nock(apiUrl)
                .get('/v3.1/leads/search')
                .query({ field_name: 'FIRST_NAME', field_value: 'Jane Lead', brief: 'false' })
                .reply(200, []);

            nock(apiUrl)
                .get('/v3.1/leads/search')
                .query({ field_name: 'LAST_NAME', field_value: 'Lead', brief: 'false' })
                .reply(200, [{
                    LEAD_ID: 201,
                    FIRST_NAME: 'Jane',
                    LAST_NAME: 'Lead',
                    PHONE: '+14155551234',
                    LINKS: []
                }]);

            const result = await insightly.findContactWithName({
                user: mockUser,
                authHeader,
                name: 'Jane Lead'
            });

            expect(result.successful).toBe(true);
            const leadResult = result.matchedContactInfo.find(c => c.type === 'Lead');
            expect(leadResult).toBeDefined();
            expect(leadResult.name).toBe('Jane Lead');
        });

        it('should fetch related organisations in findContactWithName', async () => {
            nock(apiUrl)
                .get('/v3.1/contacts/search')
                .query({ field_name: 'FIRST_NAME', field_value: 'John', brief: 'false' })
                .reply(200, [{
                    CONTACT_ID: 101,
                    FIRST_NAME: 'John',
                    LAST_NAME: 'Doe',
                    PHONE: '+14155551234',
                    LINKS: [
                        { LINK_OBJECT_NAME: 'Organisation', LINK_OBJECT_ID: 201 }
                    ]
                }]);

            nock(apiUrl)
                .get('/v3.1/leads/search')
                .query({ field_name: 'FIRST_NAME', field_value: 'John', brief: 'false' })
                .reply(200, []);

            nock(apiUrl)
                .get('/v3.1/organisations/201')
                .reply(200, { ORGANISATION_ID: 201, ORGANISATION_NAME: 'Test Corp' });

            const result = await insightly.findContactWithName({
                user: mockUser,
                authHeader,
                name: 'John'
            });

            expect(result.successful).toBe(true);
            expect(result.matchedContactInfo[0].additionalInfo.organisation).toBeDefined();
            expect(result.matchedContactInfo[0].additionalInfo.organisation[0].title).toBe('Test Corp');
        });

        it('should fetch related opportunities in findContactWithName', async () => {
            nock(apiUrl)
                .get('/v3.1/contacts/search')
                .query({ field_name: 'FIRST_NAME', field_value: 'John', brief: 'false' })
                .reply(200, [{
                    CONTACT_ID: 101,
                    FIRST_NAME: 'John',
                    LAST_NAME: 'Doe',
                    PHONE: '+14155551234',
                    LINKS: [
                        { LINK_OBJECT_NAME: 'Opportunity', LINK_OBJECT_ID: 301 }
                    ]
                }]);

            nock(apiUrl)
                .get('/v3.1/leads/search')
                .query({ field_name: 'FIRST_NAME', field_value: 'John', brief: 'false' })
                .reply(200, []);

            nock(apiUrl)
                .get('/v3.1/opportunities/301')
                .reply(200, { OPPORTUNITY_ID: 301, OPPORTUNITY_NAME: 'Big Deal' });

            const result = await insightly.findContactWithName({
                user: mockUser,
                authHeader,
                name: 'John'
            });

            expect(result.successful).toBe(true);
            expect(result.matchedContactInfo[0].additionalInfo.opportunity).toBeDefined();
            expect(result.matchedContactInfo[0].additionalInfo.opportunity[0].title).toBe('Big Deal');
        });

        it('should fetch related projects in findContactWithName', async () => {
            nock(apiUrl)
                .get('/v3.1/contacts/search')
                .query({ field_name: 'FIRST_NAME', field_value: 'John', brief: 'false' })
                .reply(200, [{
                    CONTACT_ID: 101,
                    FIRST_NAME: 'John',
                    LAST_NAME: 'Doe',
                    PHONE: '+14155551234',
                    LINKS: [
                        { LINK_OBJECT_NAME: 'Project', LINK_OBJECT_ID: 401 }
                    ]
                }]);

            nock(apiUrl)
                .get('/v3.1/leads/search')
                .query({ field_name: 'FIRST_NAME', field_value: 'John', brief: 'false' })
                .reply(200, []);

            nock(apiUrl)
                .get('/v3.1/projects/401')
                .reply(200, { PROJECT_ID: 401, PROJECT_NAME: 'Important Project' });

            const result = await insightly.findContactWithName({
                user: mockUser,
                authHeader,
                name: 'John'
            });

            expect(result.successful).toBe(true);
            expect(result.matchedContactInfo[0].additionalInfo.project).toBeDefined();
            expect(result.matchedContactInfo[0].additionalInfo.project[0].title).toBe('Important Project');
        });
    });

    describe('createCallLog - Additional Coverage', () => {
        const mockContact = createMockContact({ id: 101, name: 'John Doe', type: 'Contact' });
        const mockCallLogData = createMockCallLog();

        it('should fallback to adminConfig for assignee lookup when token decode fails', async () => {
            const jwt = require('@app-connect/core/lib/jwt');
            jwt.decodeJwt.mockImplementationOnce(() => { throw new Error('Invalid token'); });

            AdminConfigModel.findByPk.mockResolvedValue({
                userMappings: [
                    { rcExtensionId: '12345', crmUserId: 888 }
                ]
            });

            nock(apiUrl)
                .post('/v3.1/events', body => body.OWNER_USER_ID === 888)
                .reply(201, { EVENT_ID: 205 });

            nock(apiUrl)
                .post('/v3.1/events/205/links')
                .reply(201, {});

            const result = await insightly.createCallLog({
                user: mockUser,
                contactInfo: mockContact,
                authHeader,
                callLog: mockCallLogData,
                note: 'Test note',
                additionalSubmission: {
                    isAssignedToUser: true,
                    adminAssignedUserToken: 'invalid-token',
                    adminAssignedUserRcId: '12345'
                },
                aiNote: null,
                transcript: null,
                composedLogDetails: 'Call details',
                hashedAccountId: 'hash-123'
            });

            expect(result.logId).toBe(205);
        });

        it('should use adminConfig with array rcExtensionId', async () => {
            UserModel.findByPk.mockResolvedValue(null);

            AdminConfigModel.findByPk.mockResolvedValue({
                userMappings: [
                    { rcExtensionId: ['12345', '67890'], crmUserId: 777 }
                ]
            });

            nock(apiUrl)
                .post('/v3.1/events', body => body.OWNER_USER_ID === 777)
                .reply(201, { EVENT_ID: 206 });

            nock(apiUrl)
                .post('/v3.1/events/206/links')
                .reply(201, {});

            const result = await insightly.createCallLog({
                user: mockUser,
                contactInfo: mockContact,
                authHeader,
                callLog: mockCallLogData,
                note: 'Test note',
                additionalSubmission: {
                    isAssignedToUser: true,
                    adminAssignedUserToken: null,
                    adminAssignedUserRcId: '12345'
                },
                aiNote: null,
                transcript: null,
                composedLogDetails: 'Call details',
                hashedAccountId: 'hash-123'
            });

            expect(result.logId).toBe(206);
        });

        it('should link project when provided in additionalSubmission', async () => {
            nock(apiUrl)
                .post('/v3.1/events')
                .reply(201, { EVENT_ID: 207 });

            nock(apiUrl)
                .post('/v3.1/events/207/links')
                .times(4)
                .reply(201, {});

            const result = await insightly.createCallLog({
                user: mockUser,
                contactInfo: mockContact,
                authHeader,
                callLog: mockCallLogData,
                note: 'Test note',
                additionalSubmission: {
                    organization: 301,
                    opportunity: 401,
                    project: 501
                },
                aiNote: null,
                transcript: null,
                composedLogDetails: 'Call details',
                hashedAccountId: 'hash-123'
            });

            expect(result.logId).toBe(207);
        });
    });

    describe('updateCallLog - Additional Coverage', () => {
        const existingCallLog = createMockExistingCallLog({ thirdPartyLogId: '201' });

        it('should use adminConfig for assignee lookup in updateCallLog', async () => {
            AdminConfigModel.findByPk.mockResolvedValue({
                userMappings: [
                    { rcExtensionId: '12345', crmUserId: 666 }
                ]
            });

            nock(apiUrl)
                .get('/v3.1/events/201')
                .reply(200, { EVENT_ID: 201, TITLE: 'Existing Call' });

            nock(apiUrl)
                .put('/v3.1/events', body => body.OWNER_USER_ID === 666)
                .reply(200, { EVENT_ID: 201 });

            const result = await insightly.updateCallLog({
                user: mockUser,
                existingCallLog,
                authHeader,
                recordingLink: null,
                subject: 'Updated Subject',
                note: 'Updated note',
                startTime: Date.now(),
                duration: 600,
                result: 'Connected',
                aiNote: null,
                transcript: null,
                additionalSubmission: {
                    isAssignedToUser: true,
                    adminAssignedUserRcId: '12345'
                },
                composedLogDetails: 'Updated details',
                existingCallLogDetails: null,
                hashedAccountId: 'hash-123'
            });

            expect(result.returnMessage.messageType).toBe('success');
        });

        it('should handle array rcExtensionId in updateCallLog', async () => {
            AdminConfigModel.findByPk.mockResolvedValue({
                userMappings: [
                    { rcExtensionId: ['12345', '67890'], crmUserId: 555 }
                ]
            });

            nock(apiUrl)
                .get('/v3.1/events/201')
                .reply(200, { EVENT_ID: 201, TITLE: 'Existing Call' });

            nock(apiUrl)
                .put('/v3.1/events', body => body.OWNER_USER_ID === 555)
                .reply(200, { EVENT_ID: 201 });

            const result = await insightly.updateCallLog({
                user: mockUser,
                existingCallLog,
                authHeader,
                recordingLink: null,
                subject: 'Updated Subject',
                note: 'Updated note',
                startTime: Date.now(),
                duration: 600,
                result: 'Connected',
                aiNote: null,
                transcript: null,
                additionalSubmission: {
                    isAssignedToUser: true,
                    adminAssignedUserRcId: '12345'
                },
                composedLogDetails: 'Updated details',
                existingCallLogDetails: null,
                hashedAccountId: 'hash-123'
            });

            expect(result.returnMessage.messageType).toBe('success');
        });
    });

    describe('upsertCallDisposition - Additional Coverage', () => {
        const existingCallLog = createMockExistingCallLog({ thirdPartyLogId: '201' });

        it('should update opportunity disposition', async () => {
            nock(apiUrl)
                .get('/v3.1/events/201')
                .reply(200, { EVENT_ID: 201, LINKS: [] });

            nock(apiUrl)
                .post('/v3.1/events/201/links', {
                    LINK_OBJECT_NAME: 'Opportunity',
                    LINK_OBJECT_ID: 401
                })
                .reply(201, {});

            const result = await insightly.upsertCallDisposition({
                user: mockUser,
                existingCallLog,
                authHeader,
                dispositions: { opportunity: 401 }
            });

            expect(result.logId).toBe('201');
        });

        it('should delete existing opportunity link and create new one when different', async () => {
            nock(apiUrl)
                .get('/v3.1/events/201')
                .reply(200, {
                    EVENT_ID: 201,
                    LINKS: [{ LINK_ID: 2, LINK_OBJECT_NAME: 'Opportunity', LINK_OBJECT_ID: 400 }]
                });

            nock(apiUrl)
                .delete('/v3.1/events/201/links/2')
                .reply(200, {});

            nock(apiUrl)
                .post('/v3.1/events/201/links', {
                    LINK_OBJECT_NAME: 'Opportunity',
                    LINK_OBJECT_ID: 401
                })
                .reply(201, {});

            const result = await insightly.upsertCallDisposition({
                user: mockUser,
                existingCallLog,
                authHeader,
                dispositions: { opportunity: 401 }
            });

            expect(result.logId).toBe('201');
        });

        it('should update project disposition', async () => {
            nock(apiUrl)
                .get('/v3.1/events/201')
                .reply(200, { EVENT_ID: 201, LINKS: [] });

            nock(apiUrl)
                .post('/v3.1/events/201/links', {
                    LINK_OBJECT_NAME: 'Project',
                    LINK_OBJECT_ID: 501
                })
                .reply(201, {});

            const result = await insightly.upsertCallDisposition({
                user: mockUser,
                existingCallLog,
                authHeader,
                dispositions: { project: 501 }
            });

            expect(result.logId).toBe('201');
        });

        it('should delete existing project link and create new one when different', async () => {
            nock(apiUrl)
                .get('/v3.1/events/201')
                .reply(200, {
                    EVENT_ID: 201,
                    LINKS: [{ LINK_ID: 3, LINK_OBJECT_NAME: 'Project', LINK_OBJECT_ID: 500 }]
                });

            nock(apiUrl)
                .delete('/v3.1/events/201/links/3')
                .reply(200, {});

            nock(apiUrl)
                .post('/v3.1/events/201/links', {
                    LINK_OBJECT_NAME: 'Project',
                    LINK_OBJECT_ID: 501
                })
                .reply(201, {});

            const result = await insightly.upsertCallDisposition({
                user: mockUser,
                existingCallLog,
                authHeader,
                dispositions: { project: 501 }
            });

            expect(result.logId).toBe('201');
        });

        it('should handle all disposition types together', async () => {
            nock(apiUrl)
                .get('/v3.1/events/201')
                .reply(200, { EVENT_ID: 201, LINKS: [] });

            nock(apiUrl)
                .post('/v3.1/events/201/links')
                .times(3)
                .reply(201, {});

            const result = await insightly.upsertCallDisposition({
                user: mockUser,
                existingCallLog,
                authHeader,
                dispositions: { 
                    organisation: 301,
                    opportunity: 401,
                    project: 501 
                }
            });

            expect(result.logId).toBe('201');
        });
    });

    describe('getCallLog - Additional Coverage', () => {
        it('should handle disposition links in getCallLog', async () => {
            nock(apiUrl)
                .get('/v3.1/events/201')
                .reply(200, {
                    EVENT_ID: 201,
                    TITLE: 'Test Call',
                    DETAILS: '- Note: Test note\n',
                    LINKS: [
                        { LINK_OBJECT_NAME: 'contact', LINK_OBJECT_ID: 101 },
                        { LINK_OBJECT_NAME: 'Organisation', LINK_OBJECT_ID: 201 },
                        { LINK_OBJECT_NAME: 'Opportunity', LINK_OBJECT_ID: 301 },
                        { LINK_OBJECT_NAME: 'Project', LINK_OBJECT_ID: 401 }
                    ]
                });

            nock(apiUrl)
                .get('/v3.1/contacts/101')
                .reply(200, { FIRST_NAME: 'John', LAST_NAME: 'Doe' });

            const result = await insightly.getCallLog({
                user: mockUser,
                callLogId: '201',
                authHeader
            });

            expect(result.callLogInfo.dispositions).toBeDefined();
            expect(result.callLogInfo.dispositions.organisation).toBe(201);
            expect(result.callLogInfo.dispositions.opportunity).toBe(301);
            expect(result.callLogInfo.dispositions.project).toBe(401);
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

