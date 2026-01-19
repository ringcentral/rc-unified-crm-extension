/* eslint-disable no-undef */
/**
 * Comprehensive integration tests for Netsuite connector
 * Tests all exported functions with success and error scenarios
 */

const nock = require('nock');
const netsuite = require('../../src/connectors/netsuite');
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

describe('Netsuite Connector', () => {
    const accountId = '1234567';
    const hostname = `${accountId}.suitetalk.api.netsuite.com`;
    const apiUrl = `https://${hostname}`;
    const authHeader = 'Bearer test-access-token';
    
    let mockUser;

    beforeEach(() => {
        nock.cleanAll();
        jest.clearAllMocks();
        
        process.env.NETSUITE_CRM_CLIENT_ID = 'test-client-id';
        process.env.NETSUITE_CRM_CLIENT_SECRET = 'test-client-secret';
        process.env.NETSUITE_CRM_REDIRECT_URI = 'https://example.com/callback';
        
        mockUser = createMockUser({
            id: '12345-netsuite',
            hostname,
            platform: 'netsuite',
            timezoneOffset: '-05:00',
            userSettings: {},
            platformAdditionalInfo: {
                accountId
            }
        });
    });

    afterEach(() => {
        nock.cleanAll();
    });

    // ==================== getAuthType ====================
    describe('getAuthType', () => {
        it('should return oauth', () => {
            expect(netsuite.getAuthType()).toBe('oauth');
        });
    });

    // ==================== getLogFormatType ====================
    describe('getLogFormatType', () => {
        it('should return PLAIN_TEXT format type', () => {
            const result = netsuite.getLogFormatType();
            expect(result).toBe('text/plain');
        });
    });

    // ==================== getOauthInfo ====================
    describe('getOauthInfo', () => {
        it('should return OAuth configuration with account ID', async () => {
            const result = await netsuite.getOauthInfo({ hostname, accountId });

            expect(result.clientId).toBe('test-client-id');
            expect(result.clientSecret).toBe('test-client-secret');
            expect(result.redirectUri).toBe('https://example.com/callback');
            expect(result.accessTokenUri).toContain(accountId);
        });
    });

    // ==================== getUserInfo ====================
    describe('getUserInfo', () => {
        const restletsApiUrl = `https://${accountId}.restlets.api.netsuite.com`;

        it('should return user info on successful API call', async () => {
            // Mock all restlets API calls - use a single persistent mock with function reply
            nock(restletsApiUrl)
                .persist()
                .get(/.*/)
                .reply(function(uri) {
                    if (uri.includes('getcurrentuser')) {
                        return [200, {
                            id: 12345,
                            name: 'Test User',
                            email: 'test@example.com',
                            subsidiary: '1'
                        }];
                    }
                    if (uri.includes('getoneworldlicense')) {
                        return [200, { oneWorldEnabled: true }];
                    }
                    return [404, { error: 'Not found' }];
                });

            nock(restletsApiUrl)
                .persist()
                .post(/.*/)
                .reply(function(uri) {
                    if (uri.includes('checkrolepermission')) {
                        return [200, {
                            permissionResults: {
                                LIST_CONTACT: true,
                                LIST_CUSTJOB: true,
                                LIST_CALL: true,
                                ADMI_LOGIN_OAUTH2: true,
                                ADMI_RESTWEBSERVICES: true,
                                REPO_ANALYTICS: true,
                                TRAN_SALESORD: true,
                                LIST_SUBSIDIARY: true
                            }
                        }];
                    }
                    return [404, { error: 'Not found' }];
                });

            const result = await netsuite.getUserInfo({ 
                authHeader, 
                additionalInfo: {},
                query: { hostname, accountId, entity: 12345, company: 'testcompany' } 
            });

            expect(result.successful).toBe(true);
            expect(result.platformUserInfo.id).toBe('12345-testcompany-netsuite');
            expect(result.platformUserInfo.name).toBe('Test User');
            expect(result.returnMessage.messageType).toBe('success');
        });

        it('should return error when missing required permissions', async () => {
            nock(restletsApiUrl)
                .persist()
                .get(/.*/)
                .reply(function(uri) {
                    if (uri.includes('getcurrentuser')) {
                        return [200, {
                            id: 12345,
                            name: 'Test User'
                        }];
                    }
                    if (uri.includes('getoneworldlicense')) {
                        return [200, { oneWorldEnabled: false }];
                    }
                    return [404, { error: 'Not found' }];
                });

            nock(restletsApiUrl)
                .persist()
                .post(/.*/)
                .reply(function(uri) {
                    if (uri.includes('checkrolepermission')) {
                        return [200, {
                            permissionResults: {
                                LIST_CONTACT: true,
                                LIST_CUSTJOB: false,
                                LIST_CALL: false,
                                ADMI_LOGIN_OAUTH2: true,
                                ADMI_RESTWEBSERVICES: true
                            }
                        }];
                    }
                    return [404, { error: 'Not found' }];
                });

            const result = await netsuite.getUserInfo({ 
                authHeader, 
                additionalInfo: {},
                query: { hostname, accountId, entity: 12345, company: 'testcompany' } 
            });

            expect(result.successful).toBe(false);
            expect(result.returnMessage.messageType).toBe('warning');
            expect(result.returnMessage.message).toContain('permission');
        });

        it('should return error on API failure', async () => {
            nock(restletsApiUrl)
                .get(/getcurrentuser/)
                .reply(401, { error: 'Unauthorized' });

            const result = await netsuite.getUserInfo({ 
                authHeader, 
                additionalInfo: {},
                query: { hostname, accountId, entity: 12345, company: 'testcompany' } 
            });

            expect(result.successful).toBe(false);
            expect(result.returnMessage.messageType).toBe('warning');
        });
    });

    // ==================== unAuthorize ====================
    describe('unAuthorize', () => {
        it('should clear user credentials', async () => {
            const user = createMockUser({
                id: '12345-netsuite',
                hostname,
                accessToken: 'test-access-token',
                refreshToken: 'test-refresh-token'
            });

            // Mock the revoke endpoint
            nock(apiUrl)
                .post('/services/rest/auth/oauth2/v1/revoke')
                .reply(200, {});

            const result = await netsuite.unAuthorize({ user });

            expect(result.returnMessage.messageType).toBe('success');
            expect(result.returnMessage.message).toBe('Logged out of NetSuite');
            expect(user.save).toHaveBeenCalled();
        });
    });

    // ==================== findContact ====================
    describe('findContact', () => {
        it('should return empty array for extension numbers', async () => {
            const result = await netsuite.findContact({
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
            // Use a single interceptor that can respond to multiple parallel requests
            nock(apiUrl)
                .post('/services/rest/query/v1/suiteql')
                .reply(function(uri, requestBody) {
                    if (requestBody.q && requestBody.q.includes('FROM contact')) {
                        return [200, {
                            items: [{
                                id: 101,
                                firstname: 'John',
                                middlename: '',
                                lastname: 'Doe',
                                entitytitle: 'John Doe',
                                phone: '+14155551234',
                                company: 201,
                                lastmodifieddate: '2024-01-15'
                            }]
                        }];
                    }
                    if (requestBody.q && requestBody.q.includes('FROM customer')) {
                        return [200, { items: [] }];
                    }
                    if (requestBody.q && requestBody.q.includes('FROM vendor')) {
                        return [200, { items: [] }];
                    }
                    if (requestBody.q && requestBody.q.includes('FROM salesorder')) {
                        return [200, { items: [{ id: 301, tranid: 'SO-001' }] }];
                    }
                    return [200, { items: [] }];
                })
                .persist();

            // Get company name
            nock(apiUrl)
                .get('/services/rest/record/v1/customer/201')
                .reply(200, { companyName: 'Test Corp' });

            const result = await netsuite.findContact({
                user: mockUser,
                authHeader,
                phoneNumber: '+14155551234',
                overridingFormat: '',
                isExtension: 'false'
            });

            expect(result.successful).toBe(true);
            expect(result.matchedContactInfo.length).toBeGreaterThan(0);
            // Find the contact that has John in the name (not the createNewContact option)
            const johnContact = result.matchedContactInfo.find(c => c.name && c.name.includes('John'));
            expect(johnContact).toBeDefined();
        });

        it('should find customers and vendors', async () => {
            // Use a single interceptor that can respond to multiple parallel requests
            nock(apiUrl)
                .post('/services/rest/query/v1/suiteql')
                .reply(function(uri, requestBody) {
                    if (requestBody.q && requestBody.q.includes('FROM contact')) {
                        return [200, { items: [] }];
                    }
                    if (requestBody.q && requestBody.q.includes('FROM customer')) {
                        return [200, {
                            items: [{
                                id: 102,
                                firstname: 'Jane',
                                middlename: '',
                                lastname: 'Smith',
                                entitytitle: 'Jane Smith',
                                phone: '+14155551234',
                                lastmodifieddate: '2024-01-15'
                            }]
                        }];
                    }
                    if (requestBody.q && requestBody.q.includes('FROM vendor')) {
                        return [200, {
                            items: [{
                                id: 103,
                                firstname: 'Bob',
                                middlename: '',
                                lastname: 'Wilson',
                                entitytitle: 'Bob Wilson',
                                phone: '+14155551234',
                                lastmodifieddate: '2024-01-15'
                            }]
                        }];
                    }
                    if (requestBody.q && requestBody.q.includes('FROM salesorder')) {
                        return [200, { items: [] }];
                    }
                    return [200, { items: [] }];
                })
                .persist();

            const result = await netsuite.findContact({
                user: mockUser,
                authHeader,
                phoneNumber: '+14155551234',
                overridingFormat: '',
                isExtension: 'false'
            });

            expect(result.successful).toBe(true);
            const customer = result.matchedContactInfo.find(c => c.type === 'custjob');
            expect(customer).toBeDefined();
            const vendor = result.matchedContactInfo.find(c => c.type === 'vendor');
            expect(vendor).toBeDefined();
        });

        it('should include create new contact option', async () => {
            nock(apiUrl)
                .post('/services/rest/query/v1/suiteql')
                .reply(200, { items: [] })
                .persist();

            const result = await netsuite.findContact({
                user: mockUser,
                authHeader,
                phoneNumber: '+14155551234',
                overridingFormat: '',
                isExtension: 'false'
            });

            expect(result.successful).toBe(true);
            const createNewOption = result.matchedContactInfo.find(c => c.id === 'createNewContact');
            expect(createNewOption).toBeDefined();
            expect(createNewOption.isNewContact).toBe(true);
        });
    });

    // ==================== findContactWithName ====================
    describe('findContactWithName', () => {
        it('should find contacts by name', async () => {
            // Use a single interceptor that can respond to multiple parallel requests
            nock(apiUrl)
                .post('/services/rest/query/v1/suiteql')
                .reply(function(uri, requestBody) {
                    if (requestBody.q && requestBody.q.includes('FROM contact') && requestBody.q.includes('John')) {
                        return [200, {
                            items: [{
                                id: 101,
                                firstname: 'John',
                                middlename: '',
                                lastname: 'Doe',
                                entitytitle: 'John Doe',
                                phone: '+14155551234',
                                lastmodifieddate: '2024-01-15'
                            }]
                        }];
                    }
                    if (requestBody.q && requestBody.q.includes('FROM customer')) {
                        return [200, { items: [] }];
                    }
                    if (requestBody.q && requestBody.q.includes('FROM vendor')) {
                        return [200, { items: [] }];
                    }
                    return [200, { items: [] }];
                })
                .persist();

            const result = await netsuite.findContactWithName({
                user: mockUser,
                authHeader,
                name: 'John'
            });

            expect(result.successful).toBe(true);
            expect(result.matchedContactInfo.length).toBe(1);
        });
    });

    // ==================== createContact ====================
    describe('createContact', () => {
        it('should create a new contact', async () => {
            // First, query for placeholder company
            nock(apiUrl)
                .post('/services/rest/query/v1/suiteql', body => 
                    body.q && body.q.includes('RingCentral_CRM_Extension_Placeholder_Company')
                )
                .reply(200, {
                    count: 1,
                    items: [{ id: 999, companyname: 'RingCentral_CRM_Extension_Placeholder_Company' }]
                });

            // Then create the contact
            nock(apiUrl)
                .post('/services/rest/record/v1/contact', body => 
                    body.firstName === 'John' && 
                    body.lastName === 'Doe' &&
                    body.phone === '+14155551234'
                )
                .reply(201, {}, { location: '/services/rest/record/v1/contact/102' });

            const result = await netsuite.createContact({
                user: mockUser,
                authHeader,
                phoneNumber: '+14155551234',
                newContactName: 'John Doe',
                newContactType: 'contact'
            });

            expect(result.contactInfo.id).toBe('102');
            expect(result.contactInfo.name).toBe('John Doe');
            expect(result.returnMessage.messageType).toBe('success');
        });

        it('should create a new customer', async () => {
            nock(apiUrl)
                .post('/services/rest/record/v1/customer', body => 
                    body.firstName === 'Jane' && 
                    body.lastName === 'Smith'
                )
                .reply(201, {}, { location: '/services/rest/record/v1/customer/103' });

            const result = await netsuite.createContact({
                user: mockUser,
                authHeader,
                phoneNumber: '+14155551234',
                newContactName: 'Jane Smith',
                newContactType: 'custjob'
            });

            expect(result.contactInfo.id).toBe('103');
        });

        it('should create a new vendor', async () => {
            nock(apiUrl)
                .post('/services/rest/record/v1/vendor', body => 
                    body.firstName === 'Bob' && 
                    body.lastName === 'Wilson'
                )
                .reply(201, {}, { location: '/services/rest/record/v1/vendor/104' });

            const result = await netsuite.createContact({
                user: mockUser,
                authHeader,
                phoneNumber: '+14155551234',
                newContactName: 'Bob Wilson',
                newContactType: 'vendor'
            });

            expect(result.contactInfo.id).toBe('104');
        });

        it('should include subsidiary for OneWorld accounts', async () => {
            const oneWorldUser = createMockUser({
                ...mockUser,
                platformAdditionalInfo: {
                    ...mockUser.platformAdditionalInfo,
                    oneWorldEnabled: true,
                    subsidiaryId: 10
                }
            });

            // First, query for placeholder company
            nock(apiUrl)
                .post('/services/rest/query/v1/suiteql', body => 
                    body.q && body.q.includes('RingCentral_CRM_Extension_Placeholder_Company')
                )
                .reply(200, {
                    count: 1,
                    items: [{ id: 999, companyname: 'RingCentral_CRM_Extension_Placeholder_Company' }]
                });

            // Then create the contact with subsidiary
            nock(apiUrl)
                .post('/services/rest/record/v1/contact', body => 
                    body.subsidiary && body.subsidiary.id === 10
                )
                .reply(201, {}, { location: '/services/rest/record/v1/contact/105' });

            const result = await netsuite.createContact({
                user: oneWorldUser,
                authHeader,
                phoneNumber: '+14155551234',
                newContactName: 'John Doe',
                newContactType: 'contact'
            });

            expect(result.contactInfo.id).toBe('105');
        });

        it('should return default response for empty contact type', async () => {
            // When contact type is empty, the switch falls through and returns default response
            const result = await netsuite.createContact({
                user: mockUser,
                authHeader,
                phoneNumber: '+14155551234',
                newContactName: 'John Doe',
                newContactType: ''
            });

            expect(result.contactInfo.id).toBe(0);
            expect(result.returnMessage.messageType).toBe('success');
        });
    });

    // ==================== getUserList ====================
    describe('getUserList', () => {
        it('should return list of active employees', async () => {
            nock(apiUrl)
                .post('/services/rest/query/v1/suiteql', body => 
                    body.q && body.q.includes('FROM employee') && 
                    body.q.includes('giveaccess') &&
                    body.q.includes('isinactive')
                )
                .reply(200, {
                    items: [
                        { id: 1, firstname: 'User', middlename: '', lastname: 'One', email: 'user1@example.com', giveaccess: 'T', isinactive: 'F' },
                        { id: 2, firstname: 'User', middlename: '', lastname: 'Two', email: 'user2@example.com', giveaccess: 'T', isinactive: 'F' }
                    ]
                });

            const result = await netsuite.getUserList({
                user: mockUser,
                authHeader
            });

            expect(result.length).toBe(2);
            expect(result[0].id).toBe(1);
            expect(result[0].name).toBe('User One');
            expect(result[0].email).toBe('user1@example.com');
        });

        it('should filter out inactive employees', async () => {
            nock(apiUrl)
                .post('/services/rest/query/v1/suiteql')
                .reply(200, {
                    items: [
                        { id: 1, firstname: 'Active', middlename: '', lastname: 'User', email: 'active@example.com', giveaccess: 'T', isinactive: 'F' }
                    ]
                });

            const result = await netsuite.getUserList({
                user: mockUser,
                authHeader
            });

            expect(result.length).toBe(1);
            expect(result[0].name).toBe('Active User');
        });
    });

    // ==================== createCallLog ====================
    describe('createCallLog', () => {
        const mockContact = createMockContact({ id: 101, name: 'John Doe', type: 'contact' });
        const mockCallLogData = createMockCallLog();

        // Mock for timezone endpoint (used by all createCallLog tests)
        const restletsUrl = `https://${accountId}.restlets.api.netsuite.com`;

        it('should create a phone call', async () => {
            // Mock timezone endpoint
            nock(restletsUrl)
                .get(/gettimezone/)
                .reply(200, { userTimezone: 'America/New_York' });

            // For contact type, need to get contact info first
            nock(apiUrl)
                .get('/services/rest/record/v1/contact/101')
                .reply(200, {
                    id: 101,
                    company: { id: 201 }
                });

            nock(apiUrl)
                .post('/services/rest/record/v1/phonecall', body => 
                    body.title && body.message
                )
                .reply(201, {}, { location: '/services/rest/record/v1/phonecall/201' });

            const result = await netsuite.createCallLog({
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

            expect(result.logId).toBe('201');
            expect(result.returnMessage.messageType).toBe('success');
        });

        it('should include sales order when provided', async () => {
            nock(restletsUrl)
                .get(/gettimezone/)
                .reply(200, { userTimezone: 'America/New_York' });

            nock(apiUrl)
                .get('/services/rest/record/v1/contact/101')
                .reply(200, {
                    id: 101,
                    company: { id: 201 }
                });

            nock(apiUrl)
                .post('/services/rest/record/v1/phonecall', body => 
                    body.transaction && body.transaction.id === 301
                )
                .reply(201, {}, { location: '/services/rest/record/v1/phonecall/202' });

            const result = await netsuite.createCallLog({
                user: mockUser,
                contactInfo: mockContact,
                authHeader,
                callLog: mockCallLogData,
                note: 'Test note',
                additionalSubmission: { salesorder: 301 },
                aiNote: null,
                transcript: null,
                composedLogDetails: 'Call details',
                hashedAccountId: 'hash-123'
            });

            expect(result.logId).toBe('202');
        });

        it('should ignore admin assigned user parameters (not supported by Netsuite)', async () => {
            // Netsuite doesn't support admin assigned user - verify it works normally with these params

            nock(restletsUrl)
                .get(/gettimezone/)
                .reply(200, { userTimezone: 'America/New_York' });

            nock(apiUrl)
                .get('/services/rest/record/v1/contact/101')
                .reply(200, {
                    id: 101,
                    company: { id: 201 }
                });

            nock(apiUrl)
                .post('/services/rest/record/v1/phonecall', body => 
                    body.title && body.message
                )
                .reply(201, {}, { location: '/services/rest/record/v1/phonecall/203' });

            const result = await netsuite.createCallLog({
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

            // The function should still succeed, just ignoring the admin params
            expect(result.logId).toBe('203');
        });

        it('should use custom subject when provided', async () => {
            nock(restletsUrl)
                .get(/gettimezone/)
                .reply(200, { userTimezone: 'America/New_York' });

            nock(apiUrl)
                .get('/services/rest/record/v1/contact/101')
                .reply(200, {
                    id: 101,
                    company: { id: 201 }
                });

            nock(apiUrl)
                .post('/services/rest/record/v1/phonecall', body => 
                    body.title === 'Custom Subject'
                )
                .reply(201, {}, { location: '/services/rest/record/v1/phonecall/204' });

            const callLogWithCustomSubject = { ...mockCallLogData, customSubject: 'Custom Subject' };

            const result = await netsuite.createCallLog({
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

            expect(result.logId).toBe('204');
        });

        it('should handle custjob type contact', async () => {
            const customerContact = { ...mockContact, type: 'custjob', id: 102 };

            nock(restletsUrl)
                .get(/gettimezone/)
                .reply(200, { userTimezone: 'America/New_York' });

            nock(apiUrl)
                .post('/services/rest/record/v1/phonecall', body => {
                    return body && body.company && body.company.id == 102;
                })
                .reply(201, {}, { location: '/services/rest/record/v1/phonecall/205' });

            const result = await netsuite.createCallLog({
                user: mockUser,
                contactInfo: customerContact,
                authHeader,
                callLog: mockCallLogData,
                note: 'Test note',
                additionalSubmission: null,
                aiNote: null,
                transcript: null,
                composedLogDetails: 'Call details',
                hashedAccountId: 'hash-123'
            });

            expect(result.logId).toBe('205');
        });

        it('should handle vendor type contact', async () => {
            const vendorContact = { ...mockContact, type: 'vendor', id: 103 };

            nock(restletsUrl)
                .get(/gettimezone/)
                .reply(200, { userTimezone: 'America/New_York' });

            nock(apiUrl)
                .post('/services/rest/record/v1/phonecall', body => {
                    return body && body.company && body.company.id == 103;
                })
                .reply(201, {}, { location: '/services/rest/record/v1/phonecall/206' });

            const result = await netsuite.createCallLog({
                user: mockUser,
                contactInfo: vendorContact,
                authHeader,
                callLog: mockCallLogData,
                note: 'Test note',
                additionalSubmission: null,
                aiNote: null,
                transcript: null,
                composedLogDetails: 'Call details',
                hashedAccountId: 'hash-123'
            });

            expect(result.logId).toBe('206');
        });
    });

    // ==================== updateCallLog ====================
    describe('updateCallLog', () => {
        const existingCallLog = createMockExistingCallLog({ thirdPartyLogId: '201' });
        const restletsUrlUpdate = `https://${accountId}.restlets.api.netsuite.com`;

        it('should update an existing phone call', async () => {
            // Mock timezone endpoint
            nock(restletsUrlUpdate)
                .get(/gettimezone/)
                .reply(200, { userTimezone: 'America/New_York' });

            // Need to GET existing log when existingCallLogDetails is null
            nock(apiUrl)
                .get('/services/rest/record/v1/phonecall/201')
                .reply(200, {
                    title: 'Existing Title',
                    message: 'Existing message'
                });

            // PATCH uses /phoneCall/ (capital C)
            nock(apiUrl)
                .patch('/services/rest/record/v1/phoneCall/201')
                .reply(200, {});

            const result = await netsuite.updateCallLog({
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
            // The updatedNote is the 'note' parameter passed, not 'composedLogDetails'
            expect(result.updatedNote).toBe('Updated note');
        });

        it('should use existing call log details when provided', async () => {
            const existingCallLogDetails = {
                title: 'Existing Title',
                message: 'Existing message'
            };

            // Mock timezone endpoint
            nock(restletsUrlUpdate)
                .get(/gettimezone/)
                .reply(200, { userTimezone: 'America/New_York' });

            nock(apiUrl)
                .patch('/services/rest/record/v1/phoneCall/201')
                .reply(200, {});

            const result = await netsuite.updateCallLog({
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
            // GET uses /phonecall/ (lowercase)
            nock(apiUrl)
                .get('/services/rest/record/v1/phonecall/201')
                .reply(200, {
                    title: 'Existing Title',
                    message: 'Existing message'
                });

            // PATCH uses /phoneCall/ (capital C)
            nock(apiUrl)
                .patch('/services/rest/record/v1/phoneCall/201')
                .reply(200, {});

            const result = await netsuite.updateCallLog({
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
        const existingCallLog = createMockExistingCallLog({ thirdPartyLogId: '201' });

        it('should return logId for valid existing log', async () => {
            // Mock user with sales order logging enabled
            const userWithSettings = createMockUser({
                ...mockUser,
                userSettings: {
                    enableSalesOrderLogging: { value: false }
                }
            });

            // upsertCallDisposition always fetches the log first
            nock(apiUrl)
                .get('/services/rest/record/v1/phonecall/201')
                .reply(200, {
                    id: 201,
                    title: 'Test Call',
                    message: 'Test message'
                });

            const result = await netsuite.upsertCallDisposition({
                user: userWithSettings,
                existingCallLog,
                authHeader,
                dispositions: { salesorder: 301 }
            });

            // Returns the existing log ID
            expect(result.logId).toBe('201');
        });

        it('should return logId when no dispositions provided', async () => {
            nock(apiUrl)
                .get('/services/rest/record/v1/phonecall/201')
                .reply(200, {
                    id: 201,
                    title: 'Test Call',
                    message: 'Test message'
                });

            const result = await netsuite.upsertCallDisposition({
                user: mockUser,
                existingCallLog,
                authHeader,
                dispositions: {}
            });

            // Function still returns the log ID even with no dispositions
            expect(result.logId).toBe('201');
        });
    });

    // ==================== getCallLog ====================
    describe('getCallLog', () => {
        it('should retrieve call log details', async () => {
            nock(apiUrl)
                .get('/services/rest/record/v1/phonecall/201')
                .reply(200, {
                    id: 201,
                    title: 'Test Call',
                    message: '- Note: Test note'
                });

            const result = await netsuite.getCallLog({
                user: mockUser,
                callLogId: '201',
                authHeader
            });

            expect(result.callLogInfo.subject).toBe('Test Call');
            expect(result.callLogInfo.note).toBe('Test note');
            expect(result.callLogInfo.fullLogResponse).toBeDefined();
        });

        it('should handle message without note section', async () => {
            nock(apiUrl)
                .get('/services/rest/record/v1/phonecall/201')
                .reply(200, {
                    id: 201,
                    title: 'Test Call',
                    message: 'Simple note without note prefix'
                });

            const result = await netsuite.getCallLog({
                user: mockUser,
                callLogId: '201',
                authHeader
            });

            expect(result.callLogInfo.subject).toBe('Test Call');
            expect(result.callLogInfo.fullBody).toBe('Simple note without note prefix');
        });
    });

    // ==================== createMessageLog ====================
    describe('createMessageLog', () => {
        const mockContact = createMockContact({ id: 101, name: 'John Doe', phoneNumber: '+14155551234', type: 'contact' });
        const mockMessageData = createMockMessage();

        it('should create an SMS message log', async () => {
            // For contact type, need to get contact info first
            nock(apiUrl)
                .get('/services/rest/record/v1/contact/101')
                .reply(200, {
                    id: 101,
                    company: { id: 201 }
                });

            nock(apiUrl)
                .post('/services/rest/record/v1/phonecall')
                .reply(201, {}, { location: '/services/rest/record/v1/phonecall/301' });

            const result = await netsuite.createMessageLog({
                user: mockUser,
                contactInfo: mockContact,
                authHeader,
                message: mockMessageData,
                additionalSubmission: null,
                recordingLink: null,
                faxDocLink: null
            });

            expect(result.logId).toBe('301');
            expect(result.returnMessage.message).toBe('Message logged');
        });

        it('should create a voicemail message log', async () => {
            nock(apiUrl)
                .get('/services/rest/record/v1/contact/101')
                .reply(200, {
                    id: 101,
                    company: { id: 201 }
                });

            nock(apiUrl)
                .post('/services/rest/record/v1/phonecall')
                .reply(201, {}, { location: '/services/rest/record/v1/phonecall/302' });

            const result = await netsuite.createMessageLog({
                user: mockUser,
                contactInfo: mockContact,
                authHeader,
                message: mockMessageData,
                additionalSubmission: null,
                recordingLink: 'https://recording.example.com/voicemail.mp3',
                faxDocLink: null
            });

            expect(result.logId).toBe('302');
        });

        it('should create a fax message log', async () => {
            nock(apiUrl)
                .get('/services/rest/record/v1/contact/101')
                .reply(200, {
                    id: 101,
                    company: { id: 201 }
                });

            nock(apiUrl)
                .post('/services/rest/record/v1/phonecall')
                .reply(201, {}, { location: '/services/rest/record/v1/phonecall/303' });

            const result = await netsuite.createMessageLog({
                user: mockUser,
                contactInfo: mockContact,
                authHeader,
                message: mockMessageData,
                additionalSubmission: null,
                recordingLink: null,
                faxDocLink: 'https://fax.example.com/document.pdf'
            });

            expect(result.logId).toBe('303');
        });
    });

    // ==================== Message Log Format Tests ====================
    describe('createMessageLog format', () => {
        const mockContact = createMockContact({ id: 101, name: 'John Doe', phoneNumber: '+14155551234', type: 'contact' });
        const mockMessageData = createMockMessage();

        it('should format SMS message log with plain text (no HTML tags)', async () => {
            let capturedBody;
            nock(apiUrl)
                .get('/services/rest/record/v1/contact/101')
                .reply(200, {
                    id: 101,
                    company: { id: 201 }
                });

            nock(apiUrl)
                .post('/services/rest/record/v1/phonecall', body => {
                    capturedBody = body;
                    return true;
                })
                .reply(201, {}, { location: '/services/rest/record/v1/phonecall/401' });

            await netsuite.createMessageLog({
                user: mockUser,
                contactInfo: mockContact,
                authHeader,
                message: mockMessageData,
                additionalSubmission: null,
                recordingLink: null,
                faxDocLink: null
            });

            // Verify plain text format (no HTML tags)
            expect(capturedBody.message).not.toContain('<br>');
            expect(capturedBody.message).not.toContain('<b>');
            expect(capturedBody.message).not.toContain('<ul>');
            expect(capturedBody.message).not.toContain('<li>');
            expect(capturedBody.message).toContain('Conversation summary');
            expect(capturedBody.message).toContain('Participants');
            expect(capturedBody.message).toContain('RingCentral App Connect');
        });

        it('should format Voicemail message log with plain text (no HTML tags)', async () => {
            let capturedBody;
            nock(apiUrl)
                .get('/services/rest/record/v1/contact/101')
                .reply(200, {
                    id: 101,
                    company: { id: 201 }
                });

            nock(apiUrl)
                .post('/services/rest/record/v1/phonecall', body => {
                    capturedBody = body;
                    return true;
                })
                .reply(201, {}, { location: '/services/rest/record/v1/phonecall/402' });

            await netsuite.createMessageLog({
                user: mockUser,
                contactInfo: mockContact,
                authHeader,
                message: mockMessageData,
                additionalSubmission: null,
                recordingLink: 'https://recording.example.com/voicemail.mp3',
                faxDocLink: null
            });

            // Verify plain text format (no HTML tags)
            expect(capturedBody.message).not.toContain('<br>');
            expect(capturedBody.message).not.toContain('<b>');
            expect(capturedBody.message).toContain('Voicemail recording link');
            expect(capturedBody.message).toContain('https://recording.example.com/voicemail.mp3');
            expect(capturedBody.message).toContain('RingCentral App Connect');
        });

        it('should format Fax message log with plain text (no HTML tags)', async () => {
            let capturedBody;
            nock(apiUrl)
                .get('/services/rest/record/v1/contact/101')
                .reply(200, {
                    id: 101,
                    company: { id: 201 }
                });

            nock(apiUrl)
                .post('/services/rest/record/v1/phonecall', body => {
                    capturedBody = body;
                    return true;
                })
                .reply(201, {}, { location: '/services/rest/record/v1/phonecall/403' });

            await netsuite.createMessageLog({
                user: mockUser,
                contactInfo: mockContact,
                authHeader,
                message: mockMessageData,
                additionalSubmission: null,
                recordingLink: null,
                faxDocLink: 'https://fax.example.com/document.pdf'
            });

            // Verify plain text format (no HTML tags)
            expect(capturedBody.message).not.toContain('<br>');
            expect(capturedBody.message).not.toContain('<b>');
            expect(capturedBody.message).toContain('Fax document link');
            expect(capturedBody.message).toContain('https://fax.example.com/document.pdf');
            expect(capturedBody.message).toContain('RingCentral App Connect');
        });
    });

    // ==================== updateMessageLog ====================
    describe('updateMessageLog', () => {
        const mockContact = createMockContact({ id: 101, name: 'John Doe', phoneNumber: '+14155551234' });
        const mockMessageData = createMockMessage();
        const existingMessageLog = createMockExistingMessageLog({ thirdPartyLogId: '301' });

        it('should update an existing message log', async () => {
            nock(apiUrl)
                .get('/services/rest/record/v1/phonecall/301')
                .reply(200, {
                    id: 301,
                    message: '\nConversation(1 messages)\nBEGIN\n------------\nFirst message\n------------\nEND\n'
                });

            nock(apiUrl)
                .patch('/services/rest/record/v1/phonecall/301')
                .reply(200, {});

            await netsuite.updateMessageLog({
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
        it('should handle 401 unauthorized errors gracefully in findContact', async () => {
            nock(apiUrl)
                .post('/services/rest/query/v1/suiteql')
                .reply(401, { error: 'Unauthorized' })
                .persist();

            // findContact catches errors and returns empty matches with create new contact option
            const result = await netsuite.findContact({
                user: mockUser,
                authHeader,
                phoneNumber: '+14155551234',
                overridingFormat: '',
                isExtension: 'false'
            });

            expect(result.successful).toBe(true);
            expect(result.matchedContactInfo).toContainEqual(
                expect.objectContaining({ id: 'createNewContact', isNewContact: true })
            );
        });

        it('should handle 500 server errors gracefully in createCallLog', async () => {
            nock(apiUrl)
                .post('/services/rest/record/v1/phonecall')
                .reply(500, { error: 'Internal server error' });

            const mockContact = createMockContact({ id: 101, type: 'contact' });
            const mockCallLogData = createMockCallLog();

            // createCallLog catches errors and returns a warning message
            const result = await netsuite.createCallLog({
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
            });

            expect(result.returnMessage.messageType).toBe('warning');
            expect(result.returnMessage.message).toContain('Error');
        });

        it('should handle network errors gracefully in findContact', async () => {
            nock(apiUrl)
                .post('/services/rest/query/v1/suiteql')
                .replyWithError('Network error')
                .persist();

            // findContact catches errors and returns empty matches with create new contact option
            const result = await netsuite.findContact({
                user: mockUser,
                authHeader,
                phoneNumber: '+14155551234',
                overridingFormat: '',
                isExtension: 'false'
            });

            expect(result.successful).toBe(true);
            expect(result.matchedContactInfo).toContainEqual(
                expect.objectContaining({ id: 'createNewContact', isNewContact: true })
            );
        });
    });

    // ==================== OneWorld Subsidiary ====================
    describe('OneWorld Subsidiary Handling', () => {
        it('should include subsidiary when creating contact in OneWorld account', async () => {
            const oneWorldUser = createMockUser({
                ...mockUser,
                platformAdditionalInfo: {
                    accountId,
                    oneWorldEnabled: true,
                    subsidiaryId: 10
                }
            });

            // First, query for placeholder company
            nock(apiUrl)
                .post('/services/rest/query/v1/suiteql', body => 
                    body.q && body.q.includes('RingCentral_CRM_Extension_Placeholder_Company')
                )
                .reply(200, {
                    count: 1,
                    items: [{ id: 999, companyname: 'RingCentral_CRM_Extension_Placeholder_Company' }]
                });

            // Then create the contact with subsidiary
            nock(apiUrl)
                .post('/services/rest/record/v1/contact', body => 
                    body.subsidiary && body.subsidiary.id === 10
                )
                .reply(201, {}, { location: '/services/rest/record/v1/contact/110' });

            const result = await netsuite.createContact({
                user: oneWorldUser,
                authHeader,
                phoneNumber: '+14155551234',
                newContactName: 'OneWorld Contact',
                newContactType: 'contact'
            });

            expect(result.contactInfo.id).toBe('110');
        });

        it('should include subsidiary when creating customer in OneWorld account', async () => {
            const oneWorldUser = createMockUser({
                ...mockUser,
                platformAdditionalInfo: {
                    accountId,
                    oneWorldEnabled: true,
                    subsidiaryId: 10
                }
            });

            nock(apiUrl)
                .post('/services/rest/record/v1/customer', body => 
                    body.subsidiary && body.subsidiary.id === 10
                )
                .reply(201, {}, { location: '/services/rest/record/v1/customer/111' });

            const result = await netsuite.createContact({
                user: oneWorldUser,
                authHeader,
                phoneNumber: '+14155551234',
                newContactName: 'OneWorld Customer',
                newContactType: 'custjob'
            });

            expect(result.contactInfo.id).toBe('111');
        });

        it('should include subsidiary when creating vendor in OneWorld account', async () => {
            const oneWorldUser = createMockUser({
                ...mockUser,
                platformAdditionalInfo: {
                    accountId,
                    oneWorldEnabled: true,
                    subsidiaryId: 10
                }
            });

            nock(apiUrl)
                .post('/services/rest/record/v1/vendor', body => 
                    body.subsidiary && body.subsidiary.id === 10
                )
                .reply(201, {}, { location: '/services/rest/record/v1/vendor/112' });

            const result = await netsuite.createContact({
                user: oneWorldUser,
                authHeader,
                phoneNumber: '+14155551234',
                newContactName: 'OneWorld Vendor',
                newContactType: 'vendor'
            });

            expect(result.contactInfo.id).toBe('112');
        });
    });

    // ==================== Create Contact Error Handling ====================
    describe('createContact Error Handling', () => {
        it('should handle error when creating contact fails', async () => {
            // Query for placeholder company succeeds
            nock(apiUrl)
                .post('/services/rest/query/v1/suiteql', body => 
                    body.q && body.q.includes('RingCentral_CRM_Extension_Placeholder_Company')
                )
                .reply(200, {
                    count: 1,
                    items: [{ id: 999, companyname: 'RingCentral_CRM_Extension_Placeholder_Company' }]
                });

            // Contact creation fails
            nock(apiUrl)
                .post('/services/rest/record/v1/contact')
                .reply(400, { error: 'Validation error' });

            const result = await netsuite.createContact({
                user: mockUser,
                authHeader,
                phoneNumber: '+14155551234',
                newContactName: 'Failed Contact',
                newContactType: 'contact'
            });

            expect(result.returnMessage.messageType).toBe('warning');
        });

        it('should handle error when creating customer fails', async () => {
            nock(apiUrl)
                .post('/services/rest/record/v1/customer')
                .reply(400, { error: 'Validation error' });

            const result = await netsuite.createContact({
                user: mockUser,
                authHeader,
                phoneNumber: '+14155551234',
                newContactName: 'Failed Customer',
                newContactType: 'custjob'
            });

            expect(result.returnMessage.messageType).toBe('warning');
        });

        it('should handle error when creating vendor fails', async () => {
            nock(apiUrl)
                .post('/services/rest/record/v1/vendor')
                .reply(400, { error: 'Validation error' });

            const result = await netsuite.createContact({
                user: mockUser,
                authHeader,
                phoneNumber: '+14155551234',
                newContactName: 'Failed Vendor',
                newContactType: 'vendor'
            });

            expect(result.returnMessage.messageType).toBe('warning');
        });

        it('should create placeholder company when not found', async () => {
            // Placeholder company not found
            nock(apiUrl)
                .post('/services/rest/query/v1/suiteql', body => 
                    body.q && body.q.includes('RingCentral_CRM_Extension_Placeholder_Company')
                )
                .reply(200, {
                    count: 0,
                    items: []
                });

            // Create placeholder company
            nock(apiUrl)
                .post('/services/rest/record/v1/customer', body =>
                    body.companyName === 'RingCentral_CRM_Extension_Placeholder_Company'
                )
                .reply(201, {}, { location: '/services/rest/record/v1/customer/1000' });

            // Create contact
            nock(apiUrl)
                .post('/services/rest/record/v1/contact')
                .reply(201, {}, { location: '/services/rest/record/v1/contact/113' });

            const result = await netsuite.createContact({
                user: mockUser,
                authHeader,
                phoneNumber: '+14155551234',
                newContactName: 'New Contact',
                newContactType: 'contact'
            });

            expect(result.contactInfo.id).toBe('113');
        });
    });

    // ==================== Message Log Error Handling ====================
    describe('createMessageLog Error Handling', () => {
        const mockContact = createMockContact({ id: 101, name: 'John Doe', phoneNumber: '+14155551234', type: 'contact' });
        const mockMessageData = createMockMessage();

        it('should handle error in createMessageLog', async () => {
            nock(apiUrl)
                .get('/services/rest/record/v1/contact/101')
                .reply(200, {
                    id: 101,
                    company: { id: 201 }
                });

            nock(apiUrl)
                .post('/services/rest/record/v1/phonecall')
                .reply(500, { error: 'Server error' });

            const result = await netsuite.createMessageLog({
                user: mockUser,
                contactInfo: mockContact,
                authHeader,
                message: mockMessageData,
                additionalSubmission: null,
                recordingLink: null,
                faxDocLink: null
            });

            expect(result.returnMessage.messageType).toBe('warning');
            expect(result.returnMessage.message).toContain('Error');
        });

        it('should create message log for custjob type', async () => {
            const customerContact = { ...mockContact, type: 'custjob', id: 102 };

            nock(apiUrl)
                .post('/services/rest/record/v1/phonecall')
                .reply(201, {}, { location: '/services/rest/record/v1/phonecall/401' });

            const result = await netsuite.createMessageLog({
                user: mockUser,
                contactInfo: customerContact,
                authHeader,
                message: mockMessageData,
                additionalSubmission: null,
                recordingLink: null,
                faxDocLink: null
            });

            expect(result.logId).toBe('401');
        });

        it('should create message log for vendor type', async () => {
            const vendorContact = { ...mockContact, type: 'vendor', id: 103 };

            nock(apiUrl)
                .post('/services/rest/record/v1/phonecall')
                .reply(201, {}, { location: '/services/rest/record/v1/phonecall/402' });

            const result = await netsuite.createMessageLog({
                user: mockUser,
                contactInfo: vendorContact,
                authHeader,
                message: mockMessageData,
                additionalSubmission: null,
                recordingLink: null,
                faxDocLink: null
            });

            expect(result.logId).toBe('402');
        });

        it('should include sales order in message log when provided', async () => {
            const restletsUrl = `https://${accountId}.restlets.api.netsuite.com`;

            nock(apiUrl)
                .get('/services/rest/record/v1/contact/101')
                .reply(200, {
                    id: 101,
                    company: { id: 201 }
                });

            nock(apiUrl)
                .post('/services/rest/record/v1/phonecall')
                .reply(201, {}, { location: '/services/rest/record/v1/phonecall/403' });

            // Mock user notes creation for sales order
            nock(restletsUrl)
                .post(/createusernotes/)
                .reply(200, { success: true, noteId: 501 });

            const result = await netsuite.createMessageLog({
                user: mockUser,
                contactInfo: mockContact,
                authHeader,
                message: mockMessageData,
                additionalSubmission: { salesorder: 301 },
                recordingLink: null,
                faxDocLink: null
            });

            expect(result.logId).toBe('403');
        });
    });

    // ==================== Update Message Log ====================
    describe('updateMessageLog', () => {
        const mockContact = createMockContact({ id: 101, name: 'John Doe', phoneNumber: '+14155551234' });
        const mockMessageData = createMockMessage();
        const existingMessageLog = createMockExistingMessageLog({ thirdPartyLogId: '401' });

        it('should handle error in updateMessageLog', async () => {
            nock(apiUrl)
                .get('/services/rest/record/v1/phonecall/401')
                .reply(500, { error: 'Server error' });

            const result = await netsuite.updateMessageLog({
                user: mockUser,
                contactInfo: mockContact,
                existingMessageLog,
                message: mockMessageData,
                authHeader
            });

            expect(result.returnMessage.messageType).toBe('warning');
        });

        it('should update message log successfully', async () => {
            nock(apiUrl)
                .get('/services/rest/record/v1/phonecall/401')
                .reply(200, {
                    id: 401,
                    message: 'SMS Conversation\nConversation(1 messages)\nBEGIN\n------------\nFirst message\n------------\nEND\n'
                });

            nock(apiUrl)
                .patch('/services/rest/record/v1/phoneCall/401')
                .reply(200, {});

            const result = await netsuite.updateMessageLog({
                user: mockUser,
                contactInfo: mockContact,
                existingMessageLog,
                message: { ...mockMessageData, subject: 'Second message' },
                authHeader
            });

            expect(result.logId).toBe('401');
            expect(result.returnMessage.messageType).toBe('success');
        });
    });

    // ==================== getUserList Error Handling ====================
    describe('getUserList Error Handling', () => {
        it('should return empty array on error', async () => {
            nock(apiUrl)
                .post('/services/rest/query/v1/suiteql')
                .reply(500, { error: 'Server error' });

            const result = await netsuite.getUserList({
                user: mockUser,
                authHeader
            });

            expect(result).toEqual([]);
        });

        it('should filter out users without email', async () => {
            nock(apiUrl)
                .post('/services/rest/query/v1/suiteql')
                .reply(200, {
                    items: [
                        { id: 1, firstname: 'User', middlename: '', lastname: 'One', email: 'user1@example.com', giveaccess: 'T', isinactive: 'F' },
                        { id: 2, firstname: 'No', middlename: '', lastname: 'Email', email: null, giveaccess: 'T', isinactive: 'F' },
                        { id: 3, firstname: 'Empty', middlename: '', lastname: 'Email', email: '', giveaccess: 'T', isinactive: 'F' }
                    ]
                });

            const result = await netsuite.getUserList({
                user: mockUser,
                authHeader
            });

            expect(result.length).toBe(1);
            expect(result[0].email).toBe('user1@example.com');
        });
    });

    // ==================== updateCallLog Additional Cases ====================
    describe('updateCallLog Additional Cases', () => {
        const existingCallLog = createMockExistingCallLog({ thirdPartyLogId: '201' });
        const restletsUrlUpdate = `https://${accountId}.restlets.api.netsuite.com`;

        it('should handle error when fetching existing log', async () => {
            nock(apiUrl)
                .get('/services/rest/record/v1/phonecall/201')
                .reply(500, { error: 'Server error' });

            const result = await netsuite.updateCallLog({
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

            expect(result.returnMessage.messageType).toBe('warning');
        });

        it('should handle error when patching log', async () => {
            nock(restletsUrlUpdate)
                .get(/gettimezone/)
                .reply(200, { userTimezone: 'America/New_York' });

            nock(apiUrl)
                .get('/services/rest/record/v1/phonecall/201')
                .reply(200, {
                    title: 'Existing Title',
                    message: 'Existing message'
                });

            nock(apiUrl)
                .patch('/services/rest/record/v1/phoneCall/201')
                .reply(500, { error: 'Server error' });

            const result = await netsuite.updateCallLog({
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

            expect(result.returnMessage.messageType).toBe('warning');
        });
    });

    // ==================== upsertCallDisposition Additional Cases ====================
    describe('upsertCallDisposition Additional Cases', () => {
        const existingCallLog = createMockExistingCallLog({ thirdPartyLogId: '201' });

        it('should handle error gracefully', async () => {
            nock(apiUrl)
                .get('/services/rest/record/v1/phonecall/201')
                .reply(500, { error: 'Server error' });

            const result = await netsuite.upsertCallDisposition({
                user: mockUser,
                existingCallLog,
                authHeader,
                dispositions: {}
            });

            // Function catches error and returns undefined
            expect(result).toBeUndefined();
        });
    });

    // ==================== Overriding Format in findContact ====================
    describe('findContact with Overriding Format', () => {
        it('should apply overriding format patterns', async () => {
            nock(apiUrl)
                .post('/services/rest/query/v1/suiteql')
                .reply(200, { items: [] })
                .persist();

            const result = await netsuite.findContact({
                user: mockUser,
                authHeader,
                phoneNumber: '+14155551234',
                overridingFormat: '(###) ###-####,###-###-####',
                isExtension: 'false'
            });

            expect(result.successful).toBe(true);
            // Should include create new contact
            const createNewOption = result.matchedContactInfo.find(c => c.id === 'createNewContact');
            expect(createNewOption).toBeDefined();
        });
    });

    // ==================== findContact with Vendor Search ====================
    describe('findContact with Vendor Search', () => {
        it('should find vendors by phone number', async () => {
            const userWithVendor = createMockUser({
                ...mockUser,
                userSettings: {
                    contactsSearchId: { value: ['vendor'] }
                }
            });

            nock(apiUrl)
                .post('/services/rest/query/v1/suiteql', body => body.q.includes('vendor'))
                .reply(200, {
                    items: [{
                        id: 102,
                        firstname: 'Vendor',
                        middlename: '',
                        lastname: 'One',
                        phone: '+14155551234',
                        lastmodifieddate: '2024-01-15'
                    }]
                });

            const result = await netsuite.findContact({
                user: userWithVendor,
                authHeader,
                phoneNumber: '+14155551234',
                overridingFormat: '',
                isExtension: 'false'
            });

            expect(result.successful).toBe(true);
            const vendor = result.matchedContactInfo.find(c => c.type === 'vendor');
            expect(vendor).toBeDefined();
            expect(vendor.name).toBe('Vendor One');
        });

        it('should use entitytitle when name parts are empty for vendor', async () => {
            const userWithVendor = createMockUser({
                ...mockUser,
                userSettings: {
                    contactsSearchId: { value: ['vendor'] }
                }
            });

            nock(apiUrl)
                .post('/services/rest/query/v1/suiteql', body => body.q.includes('vendor'))
                .reply(200, {
                    items: [{
                        id: 103,
                        firstname: '',
                        middlename: '',
                        lastname: '',
                        entitytitle: 'ACME Corp',
                        phone: '+14155551234',
                        lastmodifieddate: '2024-01-15'
                    }]
                });

            const result = await netsuite.findContact({
                user: userWithVendor,
                authHeader,
                phoneNumber: '+14155551234',
                overridingFormat: '',
                isExtension: 'false'
            });

            expect(result.successful).toBe(true);
            const vendor = result.matchedContactInfo.find(c => c.type === 'vendor');
            expect(vendor.name).toBe('ACME Corp');
        });
    });

    // ==================== findContact with Sales Order and Opportunity ====================
    describe('findContact with Sales Order and Opportunity logging', () => {
        it('should include sales orders when enabled for contact with company', async () => {
            const userWithSalesOrder = createMockUser({
                ...mockUser,
                userSettings: {
                    enableSalesOrderLogging: { value: true },
                    enableOpportunityLogging: { value: true }
                }
            });

            // Contact query returns contact with company
            nock(apiUrl)
                .post('/services/rest/query/v1/suiteql', body => body.q.includes('contact'))
                .reply(200, {
                    items: [{
                        id: 101,
                        firstname: 'John',
                        middlename: '',
                        lastname: 'Doe',
                        phone: '+14155551234',
                        company: 201,
                        lastmodifieddate: '2024-01-15'
                    }]
                });

            // Customer query returns empty
            nock(apiUrl)
                .post('/services/rest/query/v1/suiteql', body => body.q.includes('customer'))
                .reply(200, { items: [] });

            // Vendor query returns empty
            nock(apiUrl)
                .post('/services/rest/query/v1/suiteql', body => body.q.includes('vendor'))
                .reply(200, { items: [] });

            // Sales orders query
            nock(apiUrl)
                .post('/services/rest/query/v1/suiteql', body => body.q.includes('salesorder'))
                .reply(200, {
                    items: [{ id: 301, trandisplayname: 'SO-001' }]
                });

            // Opportunities query
            nock(apiUrl)
                .post('/services/rest/query/v1/suiteql', body => body.q.includes('opportunity'))
                .reply(200, {
                    items: [{ id: 401, trandisplayname: 'OP-001' }]
                });

            const result = await netsuite.findContact({
                user: userWithSalesOrder,
                authHeader,
                phoneNumber: '+14155551234',
                overridingFormat: '',
                isExtension: 'false'
            });

            expect(result.successful).toBe(true);
            const contact = result.matchedContactInfo.find(c => c.id === 101);
            expect(contact).toBeDefined();
        });

        it('should include sales orders for customer type', async () => {
            const userWithSalesOrder = createMockUser({
                ...mockUser,
                userSettings: {
                    enableSalesOrderLogging: { value: true },
                    contactsSearchId: { value: ['customer'] }
                }
            });

            nock(apiUrl)
                .post('/services/rest/query/v1/suiteql', body => body.q.includes('customer'))
                .reply(200, {
                    items: [{
                        id: 102,
                        firstname: 'Jane',
                        middlename: '',
                        lastname: 'Smith',
                        phone: '+14155551234',
                        lastmodifieddate: '2024-01-15'
                    }]
                });

            nock(apiUrl)
                .post('/services/rest/query/v1/suiteql', body => body.q.includes('salesorder'))
                .reply(200, {
                    items: [{ id: 302, trandisplayname: 'SO-002' }]
                });

            const result = await netsuite.findContact({
                user: userWithSalesOrder,
                authHeader,
                phoneNumber: '+14155551234',
                overridingFormat: '',
                isExtension: 'false'
            });

            expect(result.successful).toBe(true);
            const customer = result.matchedContactInfo.find(c => c.type === 'custjob');
            expect(customer).toBeDefined();
        });
    });

    // ==================== getUserInfo OneWorld Inference ====================
    describe('getUserInfo OneWorld Inference', () => {
        const restletsUrl = `https://${accountId}.restlets.api.netsuite.com`;

        it('should infer OneWorld from subsidiary when license check fails', async () => {
            nock(restletsUrl)
                .get(/getcurrentuser/)
                .reply(200, {
                    name: 'Test User',
                    email: 'test@example.com',
                    subsidiary: '5'  // Has subsidiary, so OneWorld is inferred
                });

            nock(restletsUrl)
                .get(/getoneworldlicense/)
                .reply(500, { error: 'Error' });  // License check fails

            nock(restletsUrl)
                .post(/checkrolepermission/)
                .reply(200, {
                    permissionResults: {
                        LIST_CONTACT: true,
                        REPO_ANALYTICS: true,
                        TRAN_SALESORD: true,
                        LIST_CUSTJOB: true,
                        ADMI_LOGIN_OAUTH2: true,
                        ADMI_RESTWEBSERVICES: true,
                        LIST_CALL: true,
                        LIST_SUBSIDIARY: true
                    }
                });

            const result = await netsuite.getUserInfo({
                authHeader,
                additionalInfo: {},
                query: {
                    hostname: hostname,
                    entity: '12345',
                    company: 'testcompany'
                }
            });

            expect(result.successful).toBe(true);
            expect(result.platformUserInfo.platformAdditionalInfo.oneWorldEnabled).toBe(true);
        });

        it('should handle permission check failure gracefully', async () => {
            nock(restletsUrl)
                .get(/getcurrentuser/)
                .reply(200, {
                    name: 'Test User',
                    email: 'test@example.com'
                });

            nock(restletsUrl)
                .get(/getoneworldlicense/)
                .reply(200, { oneWorldEnabled: false });

            nock(restletsUrl)
                .post(/checkrolepermission/)
                .reply(500, { error: 'Permission check failed' });

            const result = await netsuite.getUserInfo({
                authHeader,
                additionalInfo: {},
                query: {
                    hostname: hostname,
                    entity: '12345',
                    company: 'testcompany'
                }
            });

            // Should succeed even when permission check fails
            expect(result.successful).toBe(true);
        });
    });

    // ==================== createCallLog with Contact Type Handling ====================
    describe('createCallLog Contact Type Handling', () => {
        const mockCallLogData = createMockCallLog();
        const restletsUrlCreateCall = `https://${accountId}.restlets.api.netsuite.com`;

        it('should get contact info and set company for CONTACT type', async () => {
            const contactInfo = createMockContact({ id: 101, name: 'John Doe', type: 'CONTACT' });

            // Mock timezone fetch
            nock(restletsUrlCreateCall)
                .get(/gettimezone/)
                .reply(200, { userTimezone: 'America/New_York' });

            // Get contact info to retrieve company
            nock(apiUrl)
                .get('/services/rest/record/v1/contact/101')
                .reply(200, {
                    id: 101,
                    company: { id: 201 }
                });

            nock(apiUrl)
                .post('/services/rest/record/v1/phonecall')
                .reply(201, {}, { location: '/services/rest/record/v1/phonecall/501' });

            const result = await netsuite.createCallLog({
                user: mockUser,
                contactInfo,
                authHeader,
                callLog: mockCallLogData,
                note: 'Test',
                additionalSubmission: null,
                aiNote: null,
                transcript: null,
                composedLogDetails: 'Details',
                hashedAccountId: 'hash-123'
            });

            expect(result.logId).toBe('501');
        });
    });

    // ==================== handleDispositionNote Tests ====================
    describe('handleDispositionNote via upsertCallDisposition', () => {
        const restletsUrl = `https://${accountId}.restlets.api.netsuite.com`;

        it('should create a sales order note when disposition is salesorder', async () => {
            const existingCallLog = createMockExistingCallLog({ thirdPartyLogId: '201' });

            const userWithSettings = createMockUser({
                ...mockUser,
                userSettings: {
                    enableSalesOrderLogging: { value: true }
                }
            });

            // Get existing call log
            nock(apiUrl)
                .get('/services/rest/record/v1/phonecall/201')
                .reply(200, {
                    id: 201,
                    title: 'Test Call',
                    message: 'Test message without sales order info'
                });

            // Create user note for sales order
            nock(restletsUrl)
                .post(/createusernotes/)
                .reply(200, { success: true, noteId: 801 });

            // Update phone call with sales order note URL
            nock(apiUrl)
                .patch('/services/rest/record/v1/phoneCall/201')
                .reply(200, {});

            const result = await netsuite.upsertCallDisposition({
                user: userWithSettings,
                existingCallLog,
                authHeader,
                dispositions: { salesorder: 401 }
            });

            expect(result.logId).toBe('201');
        });

        it('should update existing sales order note when it already exists', async () => {
            const existingCallLog = createMockExistingCallLog({ thirdPartyLogId: '202' });

            const userWithSettings = createMockUser({
                ...mockUser,
                userSettings: {
                    enableSalesOrderLogging: { value: true }
                }
            });

            // Get existing call log with existing sales order note
            nock(apiUrl)
                .get('/services/rest/record/v1/phonecall/202')
                .reply(200, {
                    id: 202,
                    title: 'Test Call',
                    message: 'Test message\nSales Order Call Logs (Do Not Edit)\n- SalesOrderNoteUrl: https://123456.app.netsuite.com/app/crm/common/note.nl?id=555 SalesOrderId: 401'
                });

            // Update existing note
            nock(restletsUrl)
                .put(/createusernotes/)
                .reply(200, { success: true });

            const result = await netsuite.upsertCallDisposition({
                user: userWithSettings,
                existingCallLog,
                authHeader,
                dispositions: { salesorder: 401 }
            });

            expect(result.logId).toBe('202');
        });

        it('should create an opportunity note when disposition is opportunity', async () => {
            const existingCallLog = createMockExistingCallLog({ thirdPartyLogId: '203' });

            const userWithSettings = createMockUser({
                ...mockUser,
                userSettings: {
                    enableOpportunityLogging: { value: true }
                }
            });

            // Get existing call log
            nock(apiUrl)
                .get('/services/rest/record/v1/phonecall/203')
                .reply(200, {
                    id: 203,
                    title: 'Test Call',
                    message: 'Test message without opportunity info'
                });

            // Create user note for opportunity
            nock(restletsUrl)
                .post(/createusernotes/)
                .reply(200, { success: true, noteId: 802 });

            // Update phone call with opportunity note URL
            nock(apiUrl)
                .patch('/services/rest/record/v1/phoneCall/203')
                .reply(200, {});

            const result = await netsuite.upsertCallDisposition({
                user: userWithSettings,
                existingCallLog,
                authHeader,
                dispositions: { opportunity: 501 }
            });

            expect(result.logId).toBe('203');
        });

        it('should update existing opportunity note when it already exists', async () => {
            const existingCallLog = createMockExistingCallLog({ thirdPartyLogId: '204' });

            const userWithSettings = createMockUser({
                ...mockUser,
                userSettings: {
                    enableOpportunityLogging: { value: true }
                }
            });

            // Get existing call log with existing opportunity note
            nock(apiUrl)
                .get('/services/rest/record/v1/phonecall/204')
                .reply(200, {
                    id: 204,
                    title: 'Test Call',
                    message: 'Test message\nOpportunity Call Logs (Do Not Edit)\n- OpportunityNoteUrl: https://123456.app.netsuite.com/app/crm/common/note.nl?id=666 OpportunityId: 501'
                });

            // Update existing note
            nock(restletsUrl)
                .put(/createusernotes/)
                .reply(200, { success: true });

            const result = await netsuite.upsertCallDisposition({
                user: userWithSettings,
                existingCallLog,
                authHeader,
                dispositions: { opportunity: 501 }
            });

            expect(result.logId).toBe('204');
        });
    });

    // ==================== Vendor Search with Sales Orders ====================
    describe('findContact with Vendor and Sales Order Integration', () => {
        it('should handle vendor with company name as fallback', async () => {
            const userWithVendor = createMockUser({
                ...mockUser,
                userSettings: {
                    contactsSearchId: { value: ['vendor'] }
                }
            });

            nock(apiUrl)
                .post('/services/rest/query/v1/suiteql')
                .reply(function(uri, requestBody) {
                    if (requestBody.q && requestBody.q.includes('vendor')) {
                        return [200, {
                            items: [{
                                id: 110,
                                firstname: '',
                                middlename: '',
                                lastname: '',
                                entitytitle: '',
                                companyname: 'Acme Supplies Inc',
                                phone: '+14155551234',
                                lastmodifieddate: '2024-01-15'
                            }]
                        }];
                    }
                    return [200, { items: [] }];
                })
                .persist();

            const result = await netsuite.findContact({
                user: userWithVendor,
                authHeader,
                phoneNumber: '+14155551234',
                overridingFormat: '',
                isExtension: 'false'
            });

            expect(result.successful).toBe(true);
            const vendor = result.matchedContactInfo.find(c => c.type === 'vendor');
            expect(vendor.name).toBe('Acme Supplies Inc');
        });
    });

    // ==================== Customer with Sales Order Error Handling ====================
    describe('findContact with Sales Order Error Handling', () => {
        it('should continue when sales order fetch fails for customer', async () => {
            const userWithSalesOrder = createMockUser({
                ...mockUser,
                userSettings: {
                    enableSalesOrderLogging: { value: true },
                    contactsSearchId: { value: ['customer'] }
                }
            });

            // Customer search returns result
            nock(apiUrl)
                .post('/services/rest/query/v1/suiteql', body => body.q.includes('customer'))
                .reply(200, {
                    items: [{
                        id: 120,
                        firstname: 'Test',
                        middlename: '',
                        lastname: 'Customer',
                        phone: '+14155551234',
                        lastmodifieddate: '2024-01-15'
                    }]
                });

            // Sales order fetch fails
            nock(apiUrl)
                .post('/services/rest/query/v1/suiteql', body => body.q.includes('salesorder'))
                .reply(500, { error: 'Server error' });

            const result = await netsuite.findContact({
                user: userWithSalesOrder,
                authHeader,
                phoneNumber: '+14155551234',
                overridingFormat: '',
                isExtension: 'false'
            });

            expect(result.successful).toBe(true);
            // Should still return the customer even if sales order fetch failed
            const customer = result.matchedContactInfo.find(c => c.type === 'custjob');
            expect(customer).toBeDefined();
        });

        it('should continue when opportunity fetch fails for contact with company', async () => {
            const userWithOpportunity = createMockUser({
                ...mockUser,
                userSettings: {
                    enableOpportunityLogging: { value: true },
                    contactsSearchId: { value: ['contact'] }
                }
            });

            // Contact search returns result with company
            nock(apiUrl)
                .post('/services/rest/query/v1/suiteql', body => body.q.includes('contact'))
                .reply(200, {
                    items: [{
                        id: 130,
                        firstname: 'Test',
                        middlename: '',
                        lastname: 'Contact',
                        phone: '+14155551234',
                        company: 200,
                        lastmodifieddate: '2024-01-15'
                    }]
                });

            // Opportunity fetch fails
            nock(apiUrl)
                .post('/services/rest/query/v1/suiteql', body => body.q.includes('opportunity'))
                .reply(500, { error: 'Server error' });

            const result = await netsuite.findContact({
                user: userWithOpportunity,
                authHeader,
                phoneNumber: '+14155551234',
                overridingFormat: '',
                isExtension: 'false'
            });

            expect(result.successful).toBe(true);
            const contact = result.matchedContactInfo.find(c => c.type === 'contact');
            expect(contact).toBeDefined();
        });
    });

    // ==================== attachFileWithPhoneCall (triggered by long transcript) ====================
    describe('updateCallLog with long transcript', () => {
        const existingCallLog = createMockExistingCallLog({ thirdPartyLogId: '210' });
        const restletsUrlUpdate = `https://${accountId}.restlets.api.netsuite.com`;

        it('should attach file when transcript is too long', async () => {
            const longTranscript = 'a'.repeat(4000); // Very long transcript

            nock(restletsUrlUpdate)
                .get(/gettimezone/)
                .reply(200, { userTimezone: 'America/New_York' });

            nock(apiUrl)
                .get('/services/rest/record/v1/phonecall/210')
                .reply(200, {
                    title: 'Existing Title',
                    message: 'Existing message'
                });

            nock(apiUrl)
                .patch('/services/rest/record/v1/phoneCall/210')
                .reply(200, {});

            // File attachment endpoint
            nock(restletsUrlUpdate)
                .post(/createattachment/)
                .reply(200, { success: true, fileId: 999 });

            const result = await netsuite.updateCallLog({
                user: mockUser,
                existingCallLog,
                authHeader,
                recordingLink: null,
                subject: 'Call with transcript',
                note: null,
                startTime: Date.now(),
                duration: 600,
                result: null,
                aiNote: null,
                transcript: longTranscript,
                additionalSubmission: null,
                composedLogDetails: longTranscript,
                existingCallLogDetails: null,
                hashedAccountId: 'hash-123'
            });

            expect(result.returnMessage.messageType).toBe('success');
        });
    });

    // ==================== addCallLogDateTime setting ====================
    describe('updateCallLog with addCallLogDateTime setting', () => {
        const existingCallLog = createMockExistingCallLog({ thirdPartyLogId: '211' });
        const restletsUrlUpdate = `https://${accountId}.restlets.api.netsuite.com`;

        it('should override date time in composed log details when setting is enabled', async () => {
            const userWithDateTimeSetting = createMockUser({
                ...mockUser,
                userSettings: {
                    addCallLogDateTime: { value: true }
                }
            });

            nock(restletsUrlUpdate)
                .get(/gettimezone/)
                .reply(200, { userTimezone: 'America/New_York' });

            nock(apiUrl)
                .get('/services/rest/record/v1/phonecall/211')
                .reply(200, {
                    title: 'Existing Title',
                    message: 'Existing message'
                });

            nock(apiUrl)
                .patch('/services/rest/record/v1/phoneCall/211')
                .reply(200, {});

            const result = await netsuite.updateCallLog({
                user: userWithDateTimeSetting,
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
                composedLogDetails: 'Call details',
                existingCallLogDetails: null,
                hashedAccountId: 'hash-123'
            });

            expect(result.returnMessage.messageType).toBe('success');
        });

        it('should not override date time when setting is disabled', async () => {
            const userWithoutDateTimeSetting = createMockUser({
                ...mockUser,
                userSettings: {
                    addCallLogDateTime: { value: false }
                }
            });

            nock(restletsUrlUpdate)
                .get(/gettimezone/)
                .reply(200, { userTimezone: 'America/New_York' });

            nock(apiUrl)
                .get('/services/rest/record/v1/phonecall/211')
                .reply(200, {
                    title: 'Existing Title',
                    message: 'Existing message'
                });

            nock(apiUrl)
                .patch('/services/rest/record/v1/phoneCall/211')
                .reply(200, {});

            const result = await netsuite.updateCallLog({
                user: userWithoutDateTimeSetting,
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
                composedLogDetails: 'Call details',
                existingCallLogDetails: null,
                hashedAccountId: 'hash-123'
            });

            expect(result.returnMessage.messageType).toBe('success');
        });
    });

    // ==================== findContactWithName with multiple results ====================
    describe('findContactWithName with multiple entity types', () => {
        it('should find customers and vendors by name', async () => {
            nock(apiUrl)
                .post('/services/rest/query/v1/suiteql')
                .reply(function(uri, requestBody) {
                    if (requestBody.q && requestBody.q.includes('contact') && requestBody.q.includes('John')) {
                        return [200, { items: [] }];
                    }
                    if (requestBody.q && requestBody.q.includes('customer') && requestBody.q.includes('John')) {
                        return [200, {
                            items: [{
                                id: 201,
                                firstname: 'John',
                                middlename: '',
                                lastname: 'Customer',
                                phone: '+14155551234',
                                lastmodifieddate: '2024-01-15'
                            }]
                        }];
                    }
                    if (requestBody.q && requestBody.q.includes('vendor') && requestBody.q.includes('John')) {
                        return [200, {
                            items: [{
                                id: 202,
                                firstname: 'John',
                                middlename: '',
                                lastname: 'Vendor',
                                phone: '+14155551234',
                                lastmodifieddate: '2024-01-15'
                            }]
                        }];
                    }
                    return [200, { items: [] }];
                })
                .persist();

            const result = await netsuite.findContactWithName({
                user: mockUser,
                authHeader,
                name: 'John'
            });

            expect(result.successful).toBe(true);
            expect(result.matchedContactInfo.length).toBe(2);
        });
    });

    // ==================== createCallLog with opportunity ====================
    describe('createCallLog with Opportunity', () => {
        const mockContact = createMockContact({ id: 101, name: 'John Doe', type: 'contact' });
        const mockCallLogData = createMockCallLog();
        const restletsUrl = `https://${accountId}.restlets.api.netsuite.com`;

        it('should include opportunity when provided', async () => {
            nock(restletsUrl)
                .get(/gettimezone/)
                .reply(200, { userTimezone: 'America/New_York' });

            nock(apiUrl)
                .get('/services/rest/record/v1/contact/101')
                .reply(200, {
                    id: 101,
                    company: { id: 201 }
                });

            nock(apiUrl)
                .post('/services/rest/record/v1/phonecall', body => 
                    body.transaction && body.transaction.id === 501
                )
                .reply(201, {}, { location: '/services/rest/record/v1/phonecall/220' });

            const result = await netsuite.createCallLog({
                user: mockUser,
                contactInfo: mockContact,
                authHeader,
                callLog: mockCallLogData,
                note: 'Test note',
                additionalSubmission: { opportunity: 501 },
                aiNote: null,
                transcript: null,
                composedLogDetails: 'Call details',
                hashedAccountId: 'hash-123'
            });

            expect(result.logId).toBe('220');
        });
    });

    // ==================== Error Details Extraction ====================
    describe('Error Detail Extraction', () => {
        it('should handle NetSuite API errors with o:errorDetails', async () => {
            nock(apiUrl)
                .post('/services/rest/record/v1/customer')
                .reply(400, {
                    'o:errorDetails': [
                        { detail: 'First error detail.' },
                        { detail: 'Second error detail.' }
                    ]
                });

            const result = await netsuite.createContact({
                user: mockUser,
                authHeader,
                phoneNumber: '+14155551234',
                newContactName: 'Error Customer',
                newContactType: 'custjob'
            });

            expect(result.returnMessage.messageType).toBe('warning');
            expect(result.returnMessage.message).toContain('First error detail');
        });
    });

    // ==================== splitName helper coverage (via createContact) ====================
    describe('splitName Helper via createContact', () => {
        it('should correctly split a three-part name', async () => {
            nock(apiUrl)
                .post('/services/rest/record/v1/customer', body => 
                    body.firstName === 'John' && 
                    body.middleName === 'Robert' && 
                    body.lastName === 'Doe'
                )
                .reply(201, {}, { location: '/services/rest/record/v1/customer/230' });

            const result = await netsuite.createContact({
                user: mockUser,
                authHeader,
                phoneNumber: '+14155551234',
                newContactName: 'John Robert Doe',
                newContactType: 'custjob'
            });

            expect(result.contactInfo.id).toBe('230');
        });

        it('should handle single word name', async () => {
            // For a single word name, firstName gets the word and lastName is empty
            nock(apiUrl)
                .post('/services/rest/record/v1/customer')
                .reply(201, {}, { location: '/services/rest/record/v1/customer/231' });

            const result = await netsuite.createContact({
                user: mockUser,
                authHeader,
                phoneNumber: '+14155551234',
                newContactName: 'Madonna',
                newContactType: 'custjob'
            });

            expect(result.contactInfo.id).toBe('231');
        });
    });

    // ==================== Phone Field Variations ====================
    describe('findContact with Phone Field Variations', () => {
        it('should search with custom phone fields', async () => {
            const userWithCustomPhoneFields = createMockUser({
                ...mockUser,
                userSettings: {
                    phoneFieldsId: { value: ['phone', 'mobilePhone'] },
                    contactsSearchId: { value: ['contact'] }
                }
            });

            nock(apiUrl)
                .post('/services/rest/query/v1/suiteql')
                .reply(200, {
                    items: [{
                        id: 301,
                        firstname: 'Mobile',
                        middlename: '',
                        lastname: 'User',
                        mobilephone: '+14155551234',
                        lastmodifieddate: '2024-01-15'
                    }]
                })
                .persist();

            const result = await netsuite.findContact({
                user: userWithCustomPhoneFields,
                authHeader,
                phoneNumber: '+14155551234',
                overridingFormat: '',
                isExtension: 'false'
            });

            expect(result.successful).toBe(true);
            const contact = result.matchedContactInfo.find(c => c.id === 301);
            expect(contact).toBeDefined();
        });

        it('should include altPhone for customers when specified', async () => {
            const userWithAltPhone = createMockUser({
                ...mockUser,
                userSettings: {
                    phoneFieldsId: { value: ['altPhone'] },
                    contactsSearchId: { value: ['customer'] }
                }
            });

            nock(apiUrl)
                .post('/services/rest/query/v1/suiteql', body => body.q.includes('altPhone'))
                .reply(200, {
                    items: [{
                        id: 302,
                        firstname: 'Alt',
                        middlename: '',
                        lastname: 'Phone',
                        altphone: '+14155551234',
                        lastmodifieddate: '2024-01-15'
                    }]
                });

            const result = await netsuite.findContact({
                user: userWithAltPhone,
                authHeader,
                phoneNumber: '+14155551234',
                overridingFormat: '',
                isExtension: 'false'
            });

            expect(result.successful).toBe(true);
        });

        it('should include officePhone for contacts when specified', async () => {
            const userWithOfficePhone = createMockUser({
                ...mockUser,
                userSettings: {
                    phoneFieldsId: { value: ['officePhone'] },
                    contactsSearchId: { value: ['contact'] }
                }
            });

            nock(apiUrl)
                .post('/services/rest/query/v1/suiteql', body => body.q.includes('officePhone'))
                .reply(200, {
                    items: [{
                        id: 303,
                        firstname: 'Office',
                        middlename: '',
                        lastname: 'Phone',
                        officephone: '+14155551234',
                        lastmodifieddate: '2024-01-15'
                    }]
                });

            const result = await netsuite.findContact({
                user: userWithOfficePhone,
                authHeader,
                phoneNumber: '+14155551234',
                overridingFormat: '',
                isExtension: 'false'
            });

            expect(result.successful).toBe(true);
        });
    });

    // ==================== createMessageLog for Vendor Type ====================
    describe('createMessageLog for Vendor Type', () => {
        const mockContact = createMockContact({ id: 101, name: 'Vendor Co', phoneNumber: '+14155551234', type: 'vendor' });
        const mockMessageData = createMockMessage();

        it('should create message log for vendor contact', async () => {
            // For vendor type, the function creates phonecall without setting company
            // (only 'CONTACT' and 'custjob' types get special company handling)
            nock(apiUrl)
                .post('/services/rest/record/v1/phonecall')
                .reply(201, {}, { location: '/services/rest/record/v1/phonecall/410' });

            const result = await netsuite.createMessageLog({
                user: mockUser,
                contactInfo: mockContact,
                authHeader,
                message: mockMessageData,
                additionalSubmission: null,
                recordingLink: null,
                faxDocLink: null
            });

            expect(result.logId).toBe('410');
        });
    });
});

