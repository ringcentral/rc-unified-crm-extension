/* eslint-disable no-undef */
/**
 * Comprehensive integration tests for Redtail connector
 * Tests all exported functions with success and error scenarios
 */

const nock = require('nock');
const redtail = require('../../src/connectors/redtail');
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

describe('Redtail Connector', () => {
    const apiUrl = 'https://smf.crm3.redtailtechnology.com';
    const hostname = 'smf.crm3.redtailtechnology.com';
    const userKey = 'redtail-user-key-123';
    const apiKey = 'test-api-key';
    
    let mockUser;
    let authHeader;

    beforeEach(() => {
        nock.cleanAll();
        jest.clearAllMocks();
        
        process.env.REDTAIL_API_KEY = apiKey;
        process.env.REDTAIL_API_SERVER = apiUrl;
        
        // Redtail uses a custom auth header with UserKey
        authHeader = 'userkeyauth AccessKey=test-api-key,UserKey=' + userKey;
        
        mockUser = createMockUser({
            id: 'testuser-redtail',
            hostname,
            platform: 'redtail',
            timezoneOffset: 0,
            accessToken: userKey,
            userSettings: {},
            platformAdditionalInfo: {
                userResponse: {
                    user_key: userKey
                }
            }
        });
    });

    afterEach(() => {
        nock.cleanAll();
    });

    // ==================== getAuthType ====================
    describe('getAuthType', () => {
        it('should return apiKey', () => {
            expect(redtail.getAuthType()).toBe('apiKey');
        });
    });

    // ==================== getLogFormatType ====================
    describe('getLogFormatType', () => {
        it('should return HTML format type', () => {
            const result = redtail.getLogFormatType();
            expect(result).toBe('text/html');
        });
    });

    // ==================== getBasicAuth ====================
    describe('getBasicAuth', () => {
        it('should return base64 encoded api key', () => {
            const result = redtail.getBasicAuth({ apiKey });
            const expected = Buffer.from(apiKey).toString('base64');
            expect(result).toBe(expected);
        });

        it('should handle complex api key strings', () => {
            const complexKey = 'api-key:user:pass';
            const result = redtail.getBasicAuth({ apiKey: complexKey });
            const expected = Buffer.from(complexKey).toString('base64');
            expect(result).toBe(expected);
        });
    });

    // ==================== getUserInfo ====================
    describe('getUserInfo', () => {
        it('should return user info on successful API call', async () => {
            nock(apiUrl)
                .get('/authentication')
                .reply(200, {
                    authenticated_user: {
                        user_key: userKey,
                        id: 12345,
                        first_name: 'Test',
                        last_name: 'User'
                    }
                });

            const result = await redtail.getUserInfo({
                apiKey,
                additionalInfo: {
                    username: 'testuser',
                    password: 'testpass'
                }
            });

            expect(result.successful).toBe(true);
            expect(result.platformUserInfo.id).toBe('testuser-redtail');
            expect(result.platformUserInfo.name).toBe('testuser');
            expect(result.platformUserInfo.overridingApiKey).toBe(userKey);
            expect(result.returnMessage.messageType).toBe('success');
        });

        it('should return error on authentication failure', async () => {
            nock(apiUrl)
                .get('/authentication')
                .reply(401, { error: 'Invalid credentials' });

            const result = await redtail.getUserInfo({
                apiKey,
                additionalInfo: {
                    username: 'wronguser',
                    password: 'wrongpass'
                }
            });

            expect(result.successful).toBe(false);
            expect(result.returnMessage.messageType).toBe('warning');
        });

        it('should handle network errors', async () => {
            nock(apiUrl)
                .get('/authentication')
                .replyWithError('Network error');

            const result = await redtail.getUserInfo({
                apiKey,
                additionalInfo: {
                    username: 'testuser',
                    password: 'testpass'
                }
            });

            expect(result.successful).toBe(false);
        });
    });

    // ==================== unAuthorize ====================
    describe('unAuthorize', () => {
        it('should clear user credentials', async () => {
            const user = createMockUser({
                id: '12345-redtail',
                accessToken: userKey,
                refreshToken: ''
            });

            const result = await redtail.unAuthorize({ user });

            expect(result.returnMessage.messageType).toBe('success');
            expect(result.returnMessage.message).toBe('Logged out of Redtail');
            expect(user.save).toHaveBeenCalled();
        });
    });

    // ==================== findContact ====================
    describe('findContact', () => {
        it('should return empty array for extension numbers', async () => {
            const result = await redtail.findContact({
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
                .get('/contacts/search_basic')
                .query(true)
                .reply(200, {
                    contacts: [{
                        id: 101,
                        first_name: 'John',
                        middle_name: '',
                        last_name: 'Doe',
                        full_name: 'John Doe',
                        job_title: 'Engineer',
                        updated_at: '2024-01-15T10:00:00Z'
                    }]
                });

            nock(apiUrl)
                .get('/lists/categories')
                .reply(200, {
                    categories: [
                        { id: 1, name: 'Client', deleted: false },
                        { id: 2, name: 'Prospect', deleted: false }
                    ]
                });

            const result = await redtail.findContact({
                user: mockUser,
                authHeader,
                phoneNumber: '+14155551234',
                overridingFormat: '',
                isExtension: 'false'
            });

            expect(result.successful).toBe(true);
            expect(result.matchedContactInfo.length).toBe(2); // 1 contact + create new
            expect(result.matchedContactInfo[0].name).toBe('John Doe');
            expect(result.matchedContactInfo[0].type).toBe('contact');
        });

        it('should include create new contact option', async () => {
            nock(apiUrl)
                .get('/contacts/search_basic')
                .query(true)
                .reply(200, { contacts: [] });

            nock(apiUrl)
                .get('/lists/categories')
                .reply(200, {
                    categories: [
                        { id: 1, name: 'Client', deleted: false },
                        { id: 2, name: 'Lead', deleted: true } // Should be filtered
                    ]
                });

            const result = await redtail.findContact({
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
            expect(createNewOption.additionalInfo.category.length).toBe(1); // Only active categories
        });

        it('should handle phone number without country code', async () => {
            nock(apiUrl)
                .get('/contacts/search_basic')
                .query({ phone_number: '4155551234' })
                .reply(200, { contacts: [] });

            nock(apiUrl)
                .get('/lists/categories')
                .reply(200, { categories: [] });

            const result = await redtail.findContact({
                user: mockUser,
                authHeader,
                phoneNumber: '4155551234',
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
                .get('/contacts/search_basic')
                .query({ name: 'John Doe' })
                .reply(200, {
                    contacts: [{
                        id: 101,
                        first_name: 'John',
                        middle_name: '',
                        last_name: 'Doe',
                        full_name: 'John Doe',
                        job_title: 'Engineer',
                        updated_at: '2024-01-15T10:00:00Z'
                    }]
                });

            nock(apiUrl)
                .get('/lists/categories')
                .reply(200, {
                    categories: [
                        { id: 1, name: 'Client', deleted: false }
                    ]
                });

            const result = await redtail.findContactWithName({
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
                .get('/contacts/search_basic')
                .query({ name: 'Nobody' })
                .reply(200, { contacts: [] });

            nock(apiUrl)
                .get('/lists/categories')
                .reply(200, { categories: [] });

            const result = await redtail.findContactWithName({
                user: mockUser,
                authHeader,
                name: 'Nobody'
            });

            expect(result.successful).toBe(true);
            expect(result.matchedContactInfo).toEqual([]);
        });

        it('should handle first name search', async () => {
            nock(apiUrl)
                .get('/contacts/search_basic')
                .query({ name: 'John' })
                .reply(200, {
                    contacts: [
                        { id: 101, first_name: 'John', middle_name: '', last_name: 'Doe', updated_at: '2024-01-15' },
                        { id: 102, first_name: 'John', middle_name: '', last_name: 'Smith', updated_at: '2024-01-15' }
                    ]
                });

            nock(apiUrl)
                .get('/lists/categories')
                .reply(200, { categories: [] });

            const result = await redtail.findContactWithName({
                user: mockUser,
                authHeader,
                name: 'John'
            });

            expect(result.successful).toBe(true);
            expect(result.matchedContactInfo.length).toBe(2);
        });
    });

    // ==================== createContact ====================
    describe('createContact', () => {
        it('should create a new contact', async () => {
            nock(apiUrl)
                .post('/contacts', body => 
                    body.first_name === 'John' && 
                    body.last_name === 'Doe' &&
                    body.type === 'Crm::Contact::Individual'
                )
                .reply(201, {
                    contact: {
                        id: 102,
                        first_name: 'John',
                        last_name: 'Doe'
                    }
                });

            const result = await redtail.createContact({
                user: mockUser,
                authHeader,
                phoneNumber: '+1 4155551234',
                newContactName: 'John Doe'
            });

            expect(result.contactInfo.id).toBe(102);
            expect(result.contactInfo.name).toBe('John Doe');
            expect(result.returnMessage.messageType).toBe('success');
        });

        it('should handle single-word name', async () => {
            nock(apiUrl)
                .post('/contacts', body => 
                    body.first_name === '' && 
                    body.last_name === 'Prince'
                )
                .reply(201, {
                    contact: {
                        id: 103,
                        first_name: '',
                        last_name: 'Prince'
                    }
                });

            const result = await redtail.createContact({
                user: mockUser,
                authHeader,
                phoneNumber: '+1 4155551234',
                newContactName: 'Prince'
            });

            expect(result.contactInfo.id).toBe(103);
            expect(result.contactInfo.name).toBe(' Prince');
        });

        it('should include phone number with country code', async () => {
            nock(apiUrl)
                .post('/contacts')
                .reply(201, {
                    contact: {
                        id: 104,
                        first_name: 'Jane',
                        last_name: 'Smith'
                    }
                });

            const result = await redtail.createContact({
                user: mockUser,
                authHeader,
                phoneNumber: '+14155551234',
                newContactName: 'Jane Smith'
            });

            expect(result.contactInfo.id).toBe(104);
        });
    });

    // ==================== getUserList ====================
    describe('getUserList', () => {
        it('should return list of database users', async () => {
            nock(apiUrl)
                .get('/lists/database_users')
                .reply(200, {
                    database_users: [
                        { id: 1, first_name: 'User', last_name: 'One' },
                        { id: 2, first_name: 'User', last_name: 'Two' }
                    ]
                });

            const result = await redtail.getUserList({
                user: mockUser,
                authHeader
            });

            expect(result.length).toBe(2);
            expect(result[0].id).toBe(1);
            expect(result[0].name).toBe('User One');
            expect(result[1].id).toBe(2);
            expect(result[1].name).toBe('User Two');
        });

        it('should return empty array when no users', async () => {
            nock(apiUrl)
                .get('/lists/database_users')
                .reply(200, { database_users: [] });

            const result = await redtail.getUserList({
                user: mockUser,
                authHeader
            });

            expect(result).toEqual([]);
        });
    });

    // ==================== createCallLog ====================
    describe('createCallLog', () => {
        const mockContact = createMockContact({ id: 101, name: 'John Doe' });
        const mockCallLogData = createMockCallLog();

        it('should create a call log activity', async () => {
            // Create activity
            nock(apiUrl)
                .post('/activities')
                .reply(201, {
                    activity: { id: 201 }
                });

            // Complete activity
            nock(apiUrl)
                .put('/activities/201')
                .reply(200, {
                    activity: { id: 201 }
                });

            // Get categories for updateCategoryToUserSetting
            nock(apiUrl)
                .get('/lists/categories')
                .reply(200, {
                    categories: [
                        { id: 1, name: 'Call', deleted: false },
                        { id: 2, name: 'Meeting', deleted: false }
                    ]
                });

            const result = await redtail.createCallLog({
                user: mockUser,
                contactInfo: mockContact,
                authHeader,
                callLog: mockCallLogData,
                note: '',
                additionalSubmission: { category: 1 },
                aiNote: null,
                transcript: null,
                composedLogDetails: 'Details',
                hashedAccountId: 'hash-123'
            });

            expect(result.logId).toBe(201);
            expect(result.returnMessage.message).toBe('Call logged');
        });

        it('should create activity with note when provided', async () => {
            nock(apiUrl)
                .post('/activities')
                .reply(201, { activity: { id: 202 } });

            // Add note to activity
            nock(apiUrl)
                .post('/activities/202/notes')
                .reply(201, { note: { id: 301 } });

            nock(apiUrl)
                .put('/activities/202')
                .reply(200, { activity: { id: 202 } });

            nock(apiUrl)
                .get('/lists/categories')
                .reply(200, { categories: [] });

            const result = await redtail.createCallLog({
                user: mockUser,
                contactInfo: mockContact,
                authHeader,
                callLog: mockCallLogData,
                note: 'Test note content',
                additionalSubmission: { category: 2 },
                aiNote: null,
                transcript: null,
                composedLogDetails: 'Details',
                hashedAccountId: 'hash-123'
            });

            expect(result.logId).toBe(202);
        });

        it('should handle admin assigned user', async () => {
            UserModel.findByPk.mockResolvedValue({
                platformAdditionalInfo: { id: 999 }
            });

            nock(apiUrl)
                .post('/activities', body => {
                    return body.attendees && 
                           body.attendees[0].user_id === 999 &&
                           body.attendees[0].type === 'Crm::Activity::Attendee::User';
                })
                .reply(201, { activity: { id: 203 } });

            nock(apiUrl)
                .put('/activities/203')
                .reply(200, { activity: { id: 203 } });

            nock(apiUrl)
                .get('/lists/categories')
                .reply(200, { categories: [] });

            const result = await redtail.createCallLog({
                user: mockUser,
                contactInfo: mockContact,
                authHeader,
                callLog: mockCallLogData,
                note: '',
                additionalSubmission: {
                    isAssignedToUser: true,
                    adminAssignedUserToken: 'valid-jwt-token'
                },
                aiNote: null,
                transcript: null,
                composedLogDetails: 'Details',
                hashedAccountId: 'hash-123'
            });

            expect(result.logId).toBe(203);
        });

        it('should use custom subject when provided', async () => {
            nock(apiUrl)
                .post('/activities', body => body.subject === 'Custom Subject')
                .reply(201, { activity: { id: 204 } });

            nock(apiUrl)
                .put('/activities/204')
                .reply(200, { activity: { id: 204 } });

            nock(apiUrl)
                .get('/lists/categories')
                .reply(200, { categories: [] });

            const callLogWithCustomSubject = { ...mockCallLogData, customSubject: 'Custom Subject' };

            const result = await redtail.createCallLog({
                user: mockUser,
                contactInfo: mockContact,
                authHeader,
                callLog: callLogWithCustomSubject,
                note: '',
                additionalSubmission: null,
                aiNote: null,
                transcript: null,
                composedLogDetails: 'Details',
                hashedAccountId: 'hash-123'
            });

            expect(result.logId).toBe(204);
        });

        it('should track extra data for AI features', async () => {
            nock(apiUrl)
                .post('/activities')
                .reply(201, { activity: { id: 205 } });

            nock(apiUrl)
                .put('/activities/205')
                .reply(200, { activity: { id: 205 } });

            nock(apiUrl)
                .get('/lists/categories')
                .reply(200, { categories: [] });

            const result = await redtail.createCallLog({
                user: mockUser,
                contactInfo: mockContact,
                authHeader,
                callLog: mockCallLogData,
                note: '',
                additionalSubmission: null,
                aiNote: 'AI summary',
                transcript: 'Call transcript',
                composedLogDetails: 'Details',
                hashedAccountId: 'hash-123'
            });

            expect(result.extraDataTracking.withSmartNoteLog).toBe(true);
            expect(result.extraDataTracking.withTranscript).toBe(true);
        });
    });

    // ==================== updateCallLog ====================
    describe('updateCallLog', () => {
        const existingCallLog = createMockExistingCallLog({ thirdPartyLogId: '201' });

        it('should update an existing call log', async () => {
            nock(apiUrl)
                .get('/activities/201')
                .reply(200, {
                    activity: {
                        id: 201,
                        description: 'Old description'
                    }
                });

            nock(apiUrl)
                .put('/activities/201')
                .reply(200, {
                    activity: { id: 201 }
                });

            const result = await redtail.updateCallLog({
                user: mockUser,
                existingCallLog,
                authHeader,
                recordingLink: 'https://recording.example.com/123',
                subject: 'Updated Subject',
                note: 'Updated note',
                startTime: Date.now(),
                duration: 600,
                result: 'Connected',
                aiNote: null,
                transcript: null,
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
                activity: {
                    id: 201,
                    description: 'Existing description'
                }
            };

            nock(apiUrl)
                .put('/activities/201')
                .reply(200, { activity: { id: 201 } });

            const result = await redtail.updateCallLog({
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

        it('should handle admin reassignment', async () => {
            UserModel.findByPk.mockResolvedValue({
                platformAdditionalInfo: { id: 999 }
            });

            const existingCallLogDetails = {
                activity: { id: 201, description: 'Existing' }
            };

            nock(apiUrl)
                .put('/activities/201')
                .reply(200, { activity: { id: 201 } });

            const result = await redtail.updateCallLog({
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
                additionalSubmission: {
                    isAssignedToUser: true,
                    adminAssignedUserToken: 'valid-jwt-token',
                    adminAssignedUserRcId: 'ext-123'
                },
                composedLogDetails: 'New details',
                existingCallLogDetails,
                hashedAccountId: 'hash-123'
            });

            expect(result.returnMessage.messageType).toBe('success');
        });
    });

    // ==================== upsertCallDisposition ====================
    describe('upsertCallDisposition', () => {
        const existingCallLog = createMockExistingCallLog({ thirdPartyLogId: '201' });

        it('should update disposition with category', async () => {
            nock(apiUrl)
                .put('/activities/201', body => body.category_id === 5)
                .reply(200, { activity: { id: 201 } });

            const result = await redtail.upsertCallDisposition({
                user: mockUser,
                existingCallLog,
                authHeader,
                dispositions: { category: 5 }
            });

            expect(result.logId).toBe('201');
        });

        it('should handle undefined category', async () => {
            nock(apiUrl)
                .put('/activities/201')
                .reply(200, { activity: { id: 201 } });

            const result = await redtail.upsertCallDisposition({
                user: mockUser,
                existingCallLog,
                authHeader,
                dispositions: {}
            });

            expect(result.logId).toBe('201');
        });
    });

    // ==================== getCallLog ====================
    describe('getCallLog', () => {
        it('should retrieve call log details', async () => {
            nock(apiUrl)
                .get('/activities/201')
                .reply(200, {
                    activity: {
                        id: 201,
                        subject: 'Test Call',
                        description: '<b>Agent notes</b><br>Test note content<br><br>More details',
                        category_id: 1,
                        linked_contacts: [
                            { contact_id: 101, first_name: 'John', last_name: 'Doe' }
                        ]
                    }
                });

            const result = await redtail.getCallLog({
                user: mockUser,
                callLogId: '201',
                authHeader
            });

            expect(result.callLogInfo.subject).toBe('Test Call');
            expect(result.callLogInfo.note).toBe('Test note content');
            expect(result.callLogInfo.contactName).toBe('John Doe');
            expect(result.callLogInfo.dispositions.category).toBe(1);
        });

        it('should handle missing agent notes section', async () => {
            nock(apiUrl)
                .get('/activities/201')
                .reply(200, {
                    activity: {
                        id: 201,
                        subject: 'Test Call',
                        description: 'Simple note without agent notes header',
                        category_id: 2,
                        linked_contacts: [
                            { contact_id: 101, first_name: 'Jane', last_name: 'Smith' }
                        ]
                    }
                });

            const result = await redtail.getCallLog({
                user: mockUser,
                callLogId: '201',
                authHeader
            });

            expect(result.callLogInfo.subject).toBe('Test Call');
            expect(result.callLogInfo.note).toBe('');
            expect(result.callLogInfo.fullBody).toBe('Simple note without agent notes header');
        });
    });

    // ==================== createMessageLog ====================
    describe('createMessageLog', () => {
        const mockContact = createMockContact({ id: 101, name: 'John Doe', phoneNumber: '+14155551234' });
        const mockMessageData = createMockMessage();

        it('should create an SMS message log', async () => {
            nock(apiUrl)
                .post('/activities')
                .reply(201, { activity: { id: 301 } });

            nock(apiUrl)
                .put('/activities/301')
                .reply(200, { activity: { id: 301 } });

            const result = await redtail.createMessageLog({
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
                .post('/activities', body => body.description.includes('Voicemail recording link'))
                .reply(201, { activity: { id: 302 } });

            nock(apiUrl)
                .put('/activities/302')
                .reply(200, { activity: { id: 302 } });

            const result = await redtail.createMessageLog({
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
                .post('/activities', body => body.description.includes('Fax document link'))
                .reply(201, { activity: { id: 303 } });

            nock(apiUrl)
                .put('/activities/303')
                .reply(200, { activity: { id: 303 } });

            const result = await redtail.createMessageLog({
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
    });

    // ==================== Message Log Format Tests ====================
    describe('createMessageLog format', () => {
        const mockContact = createMockContact({ id: 101, name: 'John Doe', phoneNumber: '+14155551234' });
        const mockMessageData = createMockMessage();

        it('should format SMS message log with HTML tags', async () => {
            let capturedBody;
            nock(apiUrl)
                .post('/activities', body => {
                    capturedBody = body;
                    return true;
                })
                .reply(201, { activity: { id: 401 } });

            nock(apiUrl)
                .put('/activities/401')
                .reply(200, { activity: { id: 401 } });

            await redtail.createMessageLog({
                user: mockUser,
                contactInfo: mockContact,
                authHeader,
                message: mockMessageData,
                additionalSubmission: null,
                recordingLink: null,
                faxDocLink: null
            });

            // Verify HTML format
            expect(capturedBody.description).toContain('<br>');
            expect(capturedBody.description).toContain('<b>');
            expect(capturedBody.description).toContain('<ul>');
            expect(capturedBody.description).toContain('<li>');
            expect(capturedBody.description).toContain('Conversation summary');
            expect(capturedBody.description).toContain('Participants');
            expect(capturedBody.description).toContain('RingCentral App Connect');
        });

        it('should format Voicemail message log with HTML tags', async () => {
            let capturedBody;
            nock(apiUrl)
                .post('/activities', body => {
                    capturedBody = body;
                    return true;
                })
                .reply(201, { activity: { id: 402 } });

            nock(apiUrl)
                .put('/activities/402')
                .reply(200, { activity: { id: 402 } });

            await redtail.createMessageLog({
                user: mockUser,
                contactInfo: mockContact,
                authHeader,
                message: mockMessageData,
                additionalSubmission: null,
                recordingLink: 'https://recording.example.com/voicemail.mp3',
                faxDocLink: null
            });

            // Verify HTML format
            expect(capturedBody.description).toContain('<br>');
            expect(capturedBody.description).toContain('<b>');
            expect(capturedBody.description).toContain('Voicemail recording link');
            expect(capturedBody.description).toContain('https://recording.example.com/voicemail.mp3');
            expect(capturedBody.description).toContain('RingCentral App Connect');
        });

        it('should format Fax message log with HTML tags', async () => {
            let capturedBody;
            nock(apiUrl)
                .post('/activities', body => {
                    capturedBody = body;
                    return true;
                })
                .reply(201, { activity: { id: 403 } });

            nock(apiUrl)
                .put('/activities/403')
                .reply(200, { activity: { id: 403 } });

            await redtail.createMessageLog({
                user: mockUser,
                contactInfo: mockContact,
                authHeader,
                message: mockMessageData,
                additionalSubmission: null,
                recordingLink: null,
                faxDocLink: 'https://fax.example.com/document.pdf'
            });

            // Verify HTML format
            expect(capturedBody.description).toContain('<br>');
            expect(capturedBody.description).toContain('<b>');
            expect(capturedBody.description).toContain('Fax document link');
            expect(capturedBody.description).toContain('https://fax.example.com/document.pdf');
            expect(capturedBody.description).toContain('RingCentral App Connect');
        });
    });

    // ==================== updateMessageLog ====================
    describe('updateMessageLog', () => {
        const mockContact = createMockContact({ id: 101, name: 'John Doe', phoneNumber: '+14155551234' });
        const mockMessageData = createMockMessage();
        const existingMessageLog = createMockExistingMessageLog({ thirdPartyLogId: '301' });

        it('should update an existing message log', async () => {
            nock(apiUrl)
                .get('/activities/301')
                .reply(200, {
                    activity: {
                        id: 301,
                        description: '<br>Conversation(1 messages)<br>BEGIN<br>------------<br><ul><li>John Doe 10:00 AM<br><b>First message</b></li></ul>------------<br>END<br>'
                    }
                });

            nock(apiUrl)
                .patch('/activities/301')
                .reply(200, { activity: { id: 301 } });

            await redtail.updateMessageLog({
                user: mockUser,
                contactInfo: mockContact,
                existingMessageLog,
                message: { ...mockMessageData, subject: 'Second message' },
                authHeader
            });

            // No return value to check, but no error means success
        });

        it('should increment message count', async () => {
            nock(apiUrl)
                .get('/activities/301')
                .reply(200, {
                    activity: {
                        id: 301,
                        description: '<br>Conversation(5 messages)<br>BEGIN<br>------------<br><ul></ul>------------<br>END<br>'
                    }
                });

            nock(apiUrl)
                .patch('/activities/301', body => body.description.includes('Conversation(6 messages)'))
                .reply(200, { activity: { id: 301 } });

            await redtail.updateMessageLog({
                user: mockUser,
                contactInfo: mockContact,
                existingMessageLog,
                message: mockMessageData,
                authHeader
            });
        });
    });

    // ==================== Error Scenarios ====================
    describe('Error Scenarios', () => {
        it('should handle 401 unauthorized errors in findContact', async () => {
            nock(apiUrl)
                .get('/contacts/search_basic')
                .query(true)
                .reply(401, { error: 'Unauthorized' });

            await expect(redtail.findContact({
                user: mockUser,
                authHeader,
                phoneNumber: '+1 4155551234',
                overridingFormat: '',
                isExtension: 'false'
            })).rejects.toThrow();
        });

        it('should handle 500 server errors in createCallLog', async () => {
            nock(apiUrl)
                .post('/activities')
                .reply(500, { error: 'Internal server error' });

            const mockContact = createMockContact({ id: 101 });
            const mockCallLogData = createMockCallLog();

            await expect(redtail.createCallLog({
                user: mockUser,
                contactInfo: mockContact,
                authHeader,
                callLog: mockCallLogData,
                note: '',
                additionalSubmission: null,
                aiNote: null,
                transcript: null,
                composedLogDetails: 'Details',
                hashedAccountId: 'hash-123'
            })).rejects.toThrow();
        });

        it('should handle network errors in getUserList', async () => {
            nock(apiUrl)
                .get('/lists/database_users')
                .replyWithError('Network error');

            await expect(redtail.getUserList({
                user: mockUser,
                authHeader
            })).rejects.toThrow();
        });
    });

    // ==================== Custom Timezone ====================
    describe('Custom Timezone Handling', () => {
        it('should use custom timezone when configured', async () => {
            const userWithTimezone = createMockUser({
                ...mockUser,
                userSettings: {
                    redtailCustomTimezone: { value: -420 } // UTC-7
                }
            });

            nock(apiUrl)
                .post('/activities')
                .reply(201, { activity: { id: 301 } });

            nock(apiUrl)
                .put('/activities/301')
                .reply(200, { activity: { id: 301 } });

            nock(apiUrl)
                .get('/lists/categories')
                .reply(200, { categories: [] });

            const mockContact = createMockContact({ id: 101, name: 'John Doe' });
            const mockCallLogData = createMockCallLog();

            const result = await redtail.createCallLog({
                user: userWithTimezone,
                contactInfo: mockContact,
                authHeader,
                callLog: mockCallLogData,
                note: '',
                additionalSubmission: null,
                aiNote: null,
                transcript: null,
                composedLogDetails: '<li><b>Date/time</b>: 2024-01-15 10:00:00 AM</li>',
                hashedAccountId: 'hash-123'
            });

            expect(result.logId).toBe(301);
        });
    });
});
