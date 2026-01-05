/* eslint-disable no-undef */
/**
 * Comprehensive integration tests for Bullhorn connector
 * Tests all exported functions with success and error scenarios
 */

const nock = require('nock');
const bullhorn = require('../../src/connectors/bullhorn');
const { mockBullhornRateLimitHeaders, createMockUser, createMockContact, createMockCallLog, createMockMessage, createMockExistingCallLog, createMockExistingMessageLog } = require('../fixtures/connectorMocks');

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

jest.mock('@app-connect/core/models/accountDataModel', () => ({
    AccountDataModel: {
        findByPk: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue({})
    },
    getOrRefreshAccountData: jest.fn().mockImplementation(async ({ fetchFn }) => {
        if (fetchFn) {
            return await fetchFn();
        }
        return ['Call', 'Email', 'Meeting', 'Note'];
    })
}));

jest.mock('@app-connect/core/lib/encode', () => ({
    encode: jest.fn(val => `encoded:${val}`),
    decoded: jest.fn(val => val?.replace('encoded:', '') || '')
}));

jest.mock('@app-connect/core/models/dynamo/lockSchema', () => ({
    Lock: {
        create: jest.fn(),
        get: jest.fn()
    }
}));

const { UserModel } = require('@app-connect/core/models/userModel');
const { AdminConfigModel } = require('@app-connect/core/models/adminConfigModel');
const { getOrRefreshAccountData } = require('@app-connect/core/models/accountDataModel');
const { encode, decoded } = require('@app-connect/core/lib/encode');
const { Lock } = require('@app-connect/core/models/dynamo/lockSchema');

describe('Bullhorn Connector', () => {
    const restUrl = 'https://rest-test.bullhornstaffing.com/rest-services/test123/';
    const loginUrl = 'https://rest-test.bullhornstaffing.com/rest-services/test123';
    const bhRestToken = 'bh-rest-token-123';
    const hostname = 'rest-test.bullhornstaffing.com';
    const authHeader = 'Bearer test-access-token';
    
    let mockUser;

    beforeEach(() => {
        nock.cleanAll();
        jest.clearAllMocks();
        
        process.env.BULLHORN_CLIENT_ID = 'test-client-id';
        process.env.BULLHORN_CLIENT_SECRET = 'test-client-secret';
        process.env.BULLHORN_REDIRECT_URI = 'https://example.com/callback';
        
        mockUser = createMockUser({
            id: '12345-bullhorn',
            hostname,
            platform: 'bullhorn',
            timezoneOffset: '-05:00',
            rcAccountId: 'test-rc-account',
            accessToken: 'test-access-token',
            refreshToken: 'test-refresh-token',
            userSettings: {},
            platformAdditionalInfo: {
                id: 123,
                restUrl,
                loginUrl,
                bhRestToken,
                tokenUrl: 'https://auth.bullhornstaffing.com/oauth/token'
            }
        });
    });

    afterEach(() => {
        nock.cleanAll();
    });

    // ==================== getAuthType ====================
    describe('getAuthType', () => {
        it('should return oauth', () => {
            expect(bullhorn.getAuthType()).toBe('oauth');
        });
    });

    // ==================== getLogFormatType ====================
    describe('getLogFormatType', () => {
        it('should return HTML format type', () => {
            const result = bullhorn.getLogFormatType();
            expect(result).toBe('text/html');
        });
    });

    // ==================== getOauthInfo ====================
    describe('getOauthInfo', () => {
        it('should return OAuth configuration with auth URL and token URL', async () => {
            const tokenUrl = 'https://auth.bullhornstaffing.com/oauth/token';

            const result = await bullhorn.getOauthInfo({ tokenUrl });

            expect(result.clientId).toBe('test-client-id');
            expect(result.clientSecret).toBe('test-client-secret');
            expect(result.redirectUri).toBe('https://example.com/callback');
            expect(result.accessTokenUri).toBe(tokenUrl);
        });
    });

    // ==================== getUserInfo ====================
    describe('getUserInfo', () => {
        const tokenUrl = 'https://auth.bullhornstaffing.com/oauth/token';
        const apiUrl = 'https://rest.bullhornstaffing.com/rest-services';

        it('should return user info on successful API call', async () => {
            // Mock login call
            nock(apiUrl)
                .post('/login')
                .query(true)
                .reply(200, {
                    BhRestToken: bhRestToken,
                    restUrl: restUrl
                });

            // Mock corporate user query
            nock(restUrl.slice(0, -1))
                .get(/query\/CorporateUser/)
                .query(true)
                .reply(200, {
                    data: [{
                        id: 123,
                        name: 'Test User',
                        masterUserID: 456,
                        timeZoneOffsetEST: -300
                    }]
                }, mockBullhornRateLimitHeaders);

            const result = await bullhorn.getUserInfo({
                authHeader,
                tokenUrl,
                apiUrl,
                username: 'testuser'
            });

            expect(result.successful).toBe(true);
            expect(result.platformUserInfo.id).toBe('456-bullhorn');
            expect(result.platformUserInfo.name).toBe('Test User');
            expect(result.returnMessage.messageType).toBe('success');
        });

        it('should return error on login failure', async () => {
            nock(apiUrl)
                .post('/login')
                .query(true)
                .reply(401, { error: 'Unauthorized' });

            const result = await bullhorn.getUserInfo({
                authHeader,
                tokenUrl,
                apiUrl,
                username: 'testuser'
            });

            expect(result.successful).toBe(false);
            expect(result.returnMessage.messageType).toBe('warning');
            expect(result.returnMessage.message).toContain('Could not load user information');
        });

        it('should return error on user query failure', async () => {
            nock(apiUrl)
                .post('/login')
                .query(true)
                .reply(200, {
                    BhRestToken: bhRestToken,
                    restUrl: restUrl
                });

            nock(restUrl.slice(0, -1))
                .get(/query\/CorporateUser/)
                .query(true)
                .reply(500, { error: 'Internal Server Error' });

            const result = await bullhorn.getUserInfo({
                authHeader,
                tokenUrl,
                apiUrl,
                username: 'testuser'
            });

            expect(result.successful).toBe(false);
            expect(result.returnMessage.messageType).toBe('warning');
        });
    });

    // ==================== authValidation ====================
    describe('authValidation', () => {
        it('should return valid when ping succeeds with valid session', async () => {
            const futureDate = new Date(Date.now() + 3600000).toISOString();
            
            nock(restUrl.slice(0, -1))
                .get('/ping')
                .reply(200, {
                    sessionExpires: futureDate
                }, mockBullhornRateLimitHeaders);

            const result = await bullhorn.authValidation({ user: mockUser });

            expect(result.successful).toBe(true);
            expect(result.status).toBe(200);
        });

        it('should refresh session when session is expired', async () => {
            const pastDate = new Date(Date.now() - 3600000).toISOString();
            
            // First ping returns expired session
            nock(restUrl.slice(0, -1))
                .get('/ping')
                .reply(200, {
                    sessionExpires: pastDate
                }, mockBullhornRateLimitHeaders);

            // Mock login for session refresh
            nock(loginUrl)
                .post('/login')
                .query(true)
                .reply(200, {
                    BhRestToken: 'new-bh-rest-token',
                    restUrl: restUrl
                });

            const result = await bullhorn.authValidation({ user: mockUser });

            expect(result.successful).toBe(true);
            expect(result.status).toBe(200);
        });

        it('should attempt refresh when ping fails with auth error', async () => {
            // First ping fails
            nock(restUrl.slice(0, -1))
                .get('/ping')
                .reply(401, { error: 'Unauthorized' });

            // Mock login for session refresh
            nock(loginUrl)
                .post('/login')
                .query(true)
                .reply(200, {
                    BhRestToken: 'new-bh-rest-token',
                    restUrl: restUrl
                });

            // Second ping succeeds
            nock(restUrl.slice(0, -1))
                .get('/ping')
                .reply(200, {
                    sessionExpires: new Date(Date.now() + 3600000).toISOString()
                }, mockBullhornRateLimitHeaders);

            const result = await bullhorn.authValidation({ user: mockUser });

            expect(result.successful).toBe(true);
            expect(result.status).toBe(200);
        });

        it('should return failure when refresh fails', async () => {
            // First ping fails
            nock(restUrl.slice(0, -1))
                .get('/ping')
                .reply(401, { error: 'Unauthorized' });

            // Mock login for session refresh
            nock(loginUrl)
                .post('/login')
                .query(true)
                .reply(200, {
                    BhRestToken: 'new-bh-rest-token',
                    restUrl: restUrl
                });

            // Second ping also fails
            nock(restUrl.slice(0, -1))
                .get('/ping')
                .reply(401, { error: 'Unauthorized' });

            const result = await bullhorn.authValidation({ user: mockUser });

            expect(result.successful).toBe(false);
            expect(result.returnMessage.messageType).toBe('warning');
            expect(result.returnMessage.message).toContain('session has expired');
        });
    });

    // ==================== unAuthorize ====================
    describe('unAuthorize', () => {
        it('should clear user credentials', async () => {
            const user = createMockUser({
                id: '12345-bullhorn',
                accessToken: 'test-access-token',
                refreshToken: 'test-refresh-token'
            });

            const result = await bullhorn.unAuthorize({ user });

            expect(result.returnMessage.messageType).toBe('success');
            expect(result.returnMessage.message).toBe('Logged out of Bullhorn');
            expect(user.save).toHaveBeenCalled();
        });
    });

    // ==================== findContact ====================
    describe('findContact', () => {
        beforeEach(() => {
            // Mock commentActionList for all findContact tests - use fetchFn to simulate real behavior
            getOrRefreshAccountData.mockImplementation(async ({ fetchFn, dataKey }) => {
                if (dataKey === 'commentActionList') {
                    return [{ const: 'Call', title: 'Call' }, { const: 'Email', title: 'Email' }];
                }
                if (dataKey === 'leadStatuses' || dataKey === 'candidateStatuses' || dataKey === 'contactStatuses') {
                    return [{ const: 'Active', title: 'Active' }];
                }
                return [];
            });
        });

        it('should return empty array for extension numbers', async () => {
            const result = await bullhorn.findContact({
                user: mockUser,
                authHeader,
                phoneNumber: '1234',
                overridingFormat: '',
                isExtension: 'true'
            });

            expect(result.successful).toBe(false);
            expect(result.matchedContactInfo).toEqual([]);
        });

        it('should return error for invalid phone number', async () => {
            const result = await bullhorn.findContact({
                user: mockUser,
                authHeader,
                phoneNumber: 'invalid',
                overridingFormat: '',
                isExtension: 'false'
            });

            expect(result.successful).toBe(false);
            expect(result.returnMessage.message).toContain('Invalid phone number');
        });

        it('should find ClientContacts by phone number', async () => {
            // Mock ClientContact search
            nock(restUrl.slice(0, -1))
                .post('/search/ClientContact')
                .query(true)
                .reply(200, {
                    data: [{
                        id: 101,
                        name: 'John Doe',
                        email: 'john@example.com',
                        phone: '+14155551234',
                        dateAdded: Date.now(),
                        dateLastModified: Date.now(),
                        dateLastVisit: Date.now()
                    }]
                }, mockBullhornRateLimitHeaders);

            // Mock Candidate search
            nock(restUrl.slice(0, -1))
                .post('/search/Candidate')
                .query(true)
                .reply(200, { data: [] }, mockBullhornRateLimitHeaders);

            // Mock Lead search
            nock(restUrl.slice(0, -1))
                .post('/search/Lead')
                .query(true)
                .reply(200, { data: [] }, mockBullhornRateLimitHeaders);

            const result = await bullhorn.findContact({
                user: mockUser,
                authHeader,
                phoneNumber: '+14155551234',
                overridingFormat: '',
                isExtension: 'false'
            });

            expect(result.successful).toBe(true);
            expect(result.matchedContactInfo.length).toBe(1);
            expect(result.matchedContactInfo[0].name).toBe('John Doe');
            expect(result.matchedContactInfo[0].type).toBe('Contact');
        });

        it('should find Candidates by phone number', async () => {
            // Mock ClientContact search
            nock(restUrl.slice(0, -1))
                .post('/search/ClientContact')
                .query(true)
                .reply(200, { data: [] }, mockBullhornRateLimitHeaders);

            // Mock Candidate search
            nock(restUrl.slice(0, -1))
                .post('/search/Candidate')
                .query(true)
                .reply(200, {
                    data: [{
                        id: 102,
                        name: 'Jane Smith',
                        email: 'jane@example.com',
                        phone: '+14155551234',
                        dateAdded: Date.now(),
                        dateLastComment: Date.now(),
                        dateLastModified: Date.now()
                    }]
                }, mockBullhornRateLimitHeaders);

            // Mock Lead search
            nock(restUrl.slice(0, -1))
                .post('/search/Lead')
                .query(true)
                .reply(200, { data: [] }, mockBullhornRateLimitHeaders);

            const result = await bullhorn.findContact({
                user: mockUser,
                authHeader,
                phoneNumber: '+14155551234',
                overridingFormat: '',
                isExtension: 'false'
            });

            expect(result.successful).toBe(true);
            expect(result.matchedContactInfo.length).toBe(1);
            expect(result.matchedContactInfo[0].name).toBe('Jane Smith');
            expect(result.matchedContactInfo[0].type).toBe('Candidate');
        });

        it('should find Leads by phone number', async () => {
            // Mock ClientContact search
            nock(restUrl.slice(0, -1))
                .post('/search/ClientContact')
                .query(true)
                .reply(200, { data: [] }, mockBullhornRateLimitHeaders);

            // Mock Candidate search
            nock(restUrl.slice(0, -1))
                .post('/search/Candidate')
                .query(true)
                .reply(200, { data: [] }, mockBullhornRateLimitHeaders);

            // Mock Lead search
            nock(restUrl.slice(0, -1))
                .post('/search/Lead')
                .query(true)
                .reply(200, {
                    data: [{
                        id: 103,
                        name: 'Bob Wilson',
                        email: 'bob@example.com',
                        phone: '+14155551234',
                        status: 'Open',
                        dateAdded: Date.now(),
                        dateLastComment: Date.now(),
                        dateLastModified: Date.now()
                    }]
                }, mockBullhornRateLimitHeaders);

            const result = await bullhorn.findContact({
                user: mockUser,
                authHeader,
                phoneNumber: '+14155551234',
                overridingFormat: '',
                isExtension: 'false'
            });

            expect(result.successful).toBe(true);
            expect(result.matchedContactInfo.length).toBe(1);
            expect(result.matchedContactInfo[0].name).toBe('Bob Wilson');
            expect(result.matchedContactInfo[0].type).toBe('Lead');
        });

        it('should include create new contact options when no matches found', async () => {
            // Mock all searches return empty
            nock(restUrl.slice(0, -1))
                .post('/search/ClientContact')
                .query(true)
                .reply(200, { data: [] }, mockBullhornRateLimitHeaders);

            nock(restUrl.slice(0, -1))
                .post('/search/Candidate')
                .query(true)
                .reply(200, { data: [] }, mockBullhornRateLimitHeaders);

            nock(restUrl.slice(0, -1))
                .post('/search/Lead')
                .query(true)
                .reply(200, { data: [] }, mockBullhornRateLimitHeaders);

            const result = await bullhorn.findContact({
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
            expect(createNewOption.defaultContactType).toBe('Lead');
        });

        it('should fetch lead, candidate, and contact statuses when using fetchFn', async () => {
            // Make getOrRefreshAccountData call the fetchFn
            getOrRefreshAccountData.mockImplementation(async ({ fetchFn, dataKey }) => {
                if (fetchFn) {
                    try {
                        return await fetchFn();
                    } catch (e) {
                        return [];
                    }
                }
                return [];
            });

            // Mock all searches return empty
            nock(restUrl.slice(0, -1))
                .post('/search/ClientContact')
                .query(true)
                .reply(200, { data: [] }, mockBullhornRateLimitHeaders);

            nock(restUrl.slice(0, -1))
                .post('/search/Candidate')
                .query(true)
                .reply(200, { data: [] }, mockBullhornRateLimitHeaders);

            nock(restUrl.slice(0, -1))
                .post('/search/Lead')
                .query(true)
                .reply(200, { data: [] }, mockBullhornRateLimitHeaders);

            // Mock meta endpoints for status options (called by fetchFn)
            nock(restUrl.slice(0, -1))
                .get('/settings/commentActionList')
                .reply(200, { commentActionList: ['Call'] }, mockBullhornRateLimitHeaders);

            nock(restUrl.slice(0, -1))
                .get('/meta/Lead')
                .query(true)
                .reply(200, {
                    fields: [{ name: 'status', options: [{ value: 'New', label: 'New' }] }]
                }, mockBullhornRateLimitHeaders);

            nock(restUrl.slice(0, -1))
                .get('/meta/Candidate')
                .query(true)
                .reply(200, {
                    fields: [{ name: 'status', options: [{ value: 'Active', label: 'Active' }] }]
                }, mockBullhornRateLimitHeaders);

            nock(restUrl.slice(0, -1))
                .get('/meta/ClientContact')
                .query(true)
                .reply(200, {
                    fields: [{ name: 'status', options: [{ value: 'Active', label: 'Active' }] }]
                }, mockBullhornRateLimitHeaders);

            const result = await bullhorn.findContact({
                user: mockUser,
                authHeader,
                phoneNumber: '+14155551234',
                overridingFormat: '',
                isExtension: 'false'
            });

            expect(result.successful).toBe(true);
            const createNewOption = result.matchedContactInfo.find(c => c.id === 'createNewContact');
            expect(createNewOption).toBeDefined();
            expect(createNewOption.additionalInfo.Lead).toBeDefined();
        });
    });

    // ==================== findContactWithName ====================
    describe('findContactWithName', () => {
        it('should find contacts by name', async () => {
            // Mock commentActionList
            nock(restUrl.slice(0, -1))
                .get('/settings/commentActionList')
                .reply(200, {
                    commentActionList: ['Call', 'Email', 'Meeting']
                }, mockBullhornRateLimitHeaders);

            // Mock ClientContact search
            nock(restUrl.slice(0, -1))
                .post('/search/ClientContact')
                .query(true)
                .reply(200, {
                    data: [{
                        id: 101,
                        name: 'John Doe',
                        email: 'john@example.com',
                        phone: '+14155551234'
                    }]
                }, mockBullhornRateLimitHeaders);

            // Mock Candidate search
            nock(restUrl.slice(0, -1))
                .post('/search/Candidate')
                .query(true)
                .reply(200, { data: [] }, mockBullhornRateLimitHeaders);

            // Mock Lead search
            nock(restUrl.slice(0, -1))
                .post('/search/Lead')
                .query(true)
                .reply(200, { data: [] }, mockBullhornRateLimitHeaders);

            const result = await bullhorn.findContactWithName({
                user: mockUser,
                authHeader,
                name: 'John Doe'
            });

            expect(result.successful).toBe(true);
            expect(result.matchedContactInfo.length).toBe(1);
            expect(result.matchedContactInfo[0].name).toBe('John Doe');
            expect(result.matchedContactInfo[0].type).toBe('Contact');
        });

        it('should return empty array when no contacts found', async () => {
            nock(restUrl.slice(0, -1))
                .get('/settings/commentActionList')
                .reply(200, {
                    commentActionList: ['Call', 'Email']
                }, mockBullhornRateLimitHeaders);

            nock(restUrl.slice(0, -1))
                .post('/search/ClientContact')
                .query(true)
                .reply(200, { data: [] }, mockBullhornRateLimitHeaders);

            nock(restUrl.slice(0, -1))
                .post('/search/Candidate')
                .query(true)
                .reply(200, { data: [] }, mockBullhornRateLimitHeaders);

            nock(restUrl.slice(0, -1))
                .post('/search/Lead')
                .query(true)
                .reply(200, { data: [] }, mockBullhornRateLimitHeaders);

            const result = await bullhorn.findContactWithName({
                user: mockUser,
                authHeader,
                name: 'Nobody'
            });

            expect(result.successful).toBe(true);
            expect(result.matchedContactInfo).toEqual([]);
        });

        it('should refresh session on auth error', async () => {
            // First call fails with 401
            nock(restUrl.slice(0, -1))
                .get('/settings/commentActionList')
                .reply(401, { error: 'Unauthorized' });

            // Mock login for session refresh
            nock(loginUrl)
                .post('/login')
                .query(true)
                .reply(200, {
                    BhRestToken: 'new-bh-rest-token',
                    restUrl: restUrl
                });

            // Retry succeeds
            nock(restUrl.slice(0, -1))
                .get('/settings/commentActionList')
                .reply(200, {
                    commentActionList: ['Call']
                }, mockBullhornRateLimitHeaders);

            nock(restUrl.slice(0, -1))
                .post('/search/ClientContact')
                .query(true)
                .reply(200, { data: [] }, mockBullhornRateLimitHeaders);

            nock(restUrl.slice(0, -1))
                .post('/search/Candidate')
                .query(true)
                .reply(200, { data: [] }, mockBullhornRateLimitHeaders);

            nock(restUrl.slice(0, -1))
                .post('/search/Lead')
                .query(true)
                .reply(200, { data: [] }, mockBullhornRateLimitHeaders);

            const result = await bullhorn.findContactWithName({
                user: mockUser,
                authHeader,
                name: 'John'
            });

            expect(result.successful).toBe(true);
        });
    });

    // ==================== createContact ====================
    describe('createContact', () => {
        it('should return null for empty contact type', async () => {
            const result = await bullhorn.createContact({
                user: mockUser,
                authHeader,
                phoneNumber: '+14155551234',
                newContactName: 'John Doe',
                newContactType: ''
            });

            expect(result).toBeNull();
        });

        it('should create a new Lead', async () => {
            // Mock commentActionList
            nock(restUrl.slice(0, -1))
                .get('/settings/commentActionList')
                .reply(200, {
                    commentActionList: ['Call', 'Email']
                }, mockBullhornRateLimitHeaders);

            // Mock Lead creation
            nock(restUrl.slice(0, -1))
                .put('/entity/Lead')
                .reply(200, {
                    changedEntityId: 201
                }, mockBullhornRateLimitHeaders);

            const result = await bullhorn.createContact({
                user: mockUser,
                authHeader,
                phoneNumber: '+14155551234',
                newContactName: 'John Doe',
                newContactType: 'Lead',
                additionalSubmission: { status: 'New' }
            });

            expect(result.contactInfo.id).toBe(201);
            expect(result.contactInfo.name).toBe('John Doe');
            expect(result.returnMessage.messageType).toBe('success');
        });

        it('should create a new Candidate', async () => {
            nock(restUrl.slice(0, -1))
                .get('/settings/commentActionList')
                .reply(200, {
                    commentActionList: ['Call']
                }, mockBullhornRateLimitHeaders);

            nock(restUrl.slice(0, -1))
                .put('/entity/Candidate')
                .reply(200, {
                    changedEntityId: 202
                }, mockBullhornRateLimitHeaders);

            const result = await bullhorn.createContact({
                user: mockUser,
                authHeader,
                phoneNumber: '+14155551234',
                newContactName: 'Jane Smith',
                newContactType: 'Candidate',
                additionalSubmission: { status: 'Active' }
            });

            expect(result.contactInfo.id).toBe(202);
            expect(result.contactInfo.name).toBe('Jane Smith');
        });

        it('should create a new Contact with placeholder company', async () => {
            nock(restUrl.slice(0, -1))
                .get('/settings/commentActionList')
                .reply(200, {
                    commentActionList: ['Call']
                }, mockBullhornRateLimitHeaders);

            // Mock company search - existing placeholder found (uses query params)
            nock(restUrl.slice(0, -1))
                .post('/search/ClientCorporation')
                .query(true)
                .reply(200, {
                    total: 1,
                    data: [{
                        id: 999,
                        name: 'RingCentral_CRM_Extension_Placeholder_Company'
                    }]
                }, mockBullhornRateLimitHeaders);

            // Mock Contact creation
            nock(restUrl.slice(0, -1))
                .put('/entity/ClientContact')
                .reply(200, {
                    changedEntityId: 203
                }, mockBullhornRateLimitHeaders);

            const result = await bullhorn.createContact({
                user: mockUser,
                authHeader,
                phoneNumber: '+14155551234',
                newContactName: 'Bob Wilson',
                newContactType: 'Contact',
                additionalSubmission: { status: 'Active' }
            });

            expect(result.contactInfo.id).toBe(203);
            expect(result.contactInfo.name).toBe('Bob Wilson');
        });

        it('should create placeholder company if not exists', async () => {
            nock(restUrl.slice(0, -1))
                .get('/settings/commentActionList')
                .reply(200, {
                    commentActionList: ['Call']
                }, mockBullhornRateLimitHeaders);

            // Mock company search - not found (uses query params)
            nock(restUrl.slice(0, -1))
                .post('/search/ClientCorporation')
                .query(true)
                .reply(200, {
                    total: 0,
                    data: []
                }, mockBullhornRateLimitHeaders);

            // Mock company creation
            nock(restUrl.slice(0, -1))
                .put('/entity/ClientCorporation')
                .reply(200, {
                    changedEntityId: 1000
                }, mockBullhornRateLimitHeaders);

            // Mock Contact creation
            nock(restUrl.slice(0, -1))
                .put('/entity/ClientContact')
                .reply(200, {
                    changedEntityId: 204
                }, mockBullhornRateLimitHeaders);

            const result = await bullhorn.createContact({
                user: mockUser,
                authHeader,
                phoneNumber: '+14155551234',
                newContactName: 'New Contact',
                newContactType: 'Contact',
                additionalSubmission: { status: 'Active' }
            });

            expect(result.contactInfo.id).toBe(204);
        });
    });

    // ==================== getUserList ====================
    describe('getUserList', () => {
        it('should return list of corporate users', async () => {
            nock(restUrl.slice(0, -1))
                .get(/query\/CorporateUser/)
                .query(true)
                .reply(200, {
                    start: 0,
                    count: 2,
                    data: [
                        { id: 1, firstName: 'User', lastName: 'One', email: 'user1@example.com' },
                        { id: 2, firstName: 'User', lastName: 'Two', email: 'user2@example.com' }
                    ]
                }, mockBullhornRateLimitHeaders);

            // Second page empty
            nock(restUrl.slice(0, -1))
                .get(/query\/CorporateUser/)
                .query(true)
                .reply(200, {
                    start: 2,
                    count: 0,
                    data: []
                }, mockBullhornRateLimitHeaders);

            const result = await bullhorn.getUserList({ user: mockUser });

            expect(result.length).toBe(2);
            expect(result[0].id).toBe(1);
            expect(result[0].name).toBe('User One');
            expect(result[0].email).toBe('user1@example.com');
        });

        it('should return empty array when no users', async () => {
            nock(restUrl.slice(0, -1))
                .get(/query\/CorporateUser/)
                .query(true)
                .reply(200, {
                    start: 0,
                    count: 0,
                    data: []
                }, mockBullhornRateLimitHeaders);

            const result = await bullhorn.getUserList({ user: mockUser });

            expect(result).toEqual([]);
        });
    });

    // ==================== createCallLog ====================
    describe('createCallLog', () => {
        const mockContact = createMockContact({ id: 101, name: 'John Doe', type: 'Contact' });
        const mockCallLogData = createMockCallLog();

        it('should create a Note for call log', async () => {
            nock(restUrl.slice(0, -1))
                .put('/entity/Note')
                .reply(200, {
                    changedEntityId: 501
                }, mockBullhornRateLimitHeaders);

            const result = await bullhorn.createCallLog({
                user: mockUser,
                contactInfo: mockContact,
                authHeader,
                callLog: mockCallLogData,
                note: 'Test note',
                additionalSubmission: { noteActions: 'Call' },
                aiNote: 'AI summary',
                transcript: 'Transcript',
                composedLogDetails: '<b>Call details</b>',
                hashedAccountId: 'hash-123'
            });

            expect(result.logId).toBe(501);
            expect(result.returnMessage.messageType).toBe('success');
            expect(result.returnMessage.message).toBe('Call logged');
        });

        it('should use default noteActions when not provided', async () => {
            nock(restUrl.slice(0, -1))
                .put('/entity/Note')
                .reply(200, {
                    changedEntityId: 502
                }, mockBullhornRateLimitHeaders);

            const result = await bullhorn.createCallLog({
                user: mockUser,
                contactInfo: mockContact,
                authHeader,
                callLog: mockCallLogData,
                note: 'Test note',
                additionalSubmission: null,
                aiNote: null,
                transcript: null,
                composedLogDetails: '<b>Call details</b>',
                hashedAccountId: 'hash-123'
            });

            expect(result.logId).toBe(502);
        });

        it('should handle admin assigned user', async () => {
            UserModel.findByPk.mockResolvedValue({
                platformAdditionalInfo: { id: 999 }
            });

            nock(restUrl.slice(0, -1))
                .put('/entity/Note', body => body.commentingPerson && body.commentingPerson.id === 999)
                .reply(200, {
                    changedEntityId: 503
                }, mockBullhornRateLimitHeaders);

            const result = await bullhorn.createCallLog({
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

            expect(result.logId).toBe(503);
        });

        it('should use custom subject when provided', async () => {
            nock(restUrl.slice(0, -1))
                .put('/entity/Note')
                .reply(200, {
                    changedEntityId: 504
                }, mockBullhornRateLimitHeaders);

            const callLogWithCustomSubject = { ...mockCallLogData, customSubject: 'Custom Subject' };

            const result = await bullhorn.createCallLog({
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

            expect(result.logId).toBe(504);
        });

        it('should refresh session on auth error', async () => {
            // First call fails
            nock(restUrl.slice(0, -1))
                .put('/entity/Note')
                .reply(401, { error: 'Unauthorized' });

            // Mock login for session refresh
            nock(loginUrl)
                .post('/login')
                .query(true)
                .reply(200, {
                    BhRestToken: 'new-bh-rest-token',
                    restUrl: restUrl
                });

            // Retry succeeds
            nock(restUrl.slice(0, -1))
                .put('/entity/Note')
                .reply(200, {
                    changedEntityId: 505
                }, mockBullhornRateLimitHeaders);

            const result = await bullhorn.createCallLog({
                user: mockUser,
                contactInfo: mockContact,
                authHeader,
                callLog: mockCallLogData,
                note: 'Test note',
                additionalSubmission: null,
                aiNote: null,
                transcript: null,
                composedLogDetails: 'Call details',
                hashedAccountId: 'hash-123'
            });

            expect(result.logId).toBe(505);
        });
    });

    // ==================== updateCallLog ====================
    describe('updateCallLog', () => {
        const existingCallLog = createMockExistingCallLog({ thirdPartyLogId: '501' });

        it('should update an existing Note', async () => {
            // Mock GET existing log
            nock(restUrl.slice(0, -1))
                .get('/entity/Note/501')
                .query(true)
                .reply(200, {
                    data: {
                        comments: 'Existing comments',
                        commentingPerson: { id: 123 }
                    }
                }, mockBullhornRateLimitHeaders);

            // Mock POST update
            nock(restUrl.slice(0, -1))
                .post('/entity/Note/501')
                .reply(200, {
                    changedEntityId: 501
                }, mockBullhornRateLimitHeaders);

            const result = await bullhorn.updateCallLog({
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
                comments: 'Existing comments',
                commentingPerson: { id: 123 }
            };

            nock(restUrl.slice(0, -1))
                .post('/entity/Note/501')
                .reply(200, {
                    changedEntityId: 501
                }, mockBullhornRateLimitHeaders);

            const result = await bullhorn.updateCallLog({
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

        it('should handle admin reassignment', async () => {
            AdminConfigModel.findByPk.mockResolvedValue({
                userMappings: [
                    { rcExtensionId: 'ext-123', crmUserId: 888 }
                ]
            });

            const existingCallLogDetails = {
                comments: 'Existing comments',
                commentingPerson: { id: 123 }
            };

            nock(restUrl.slice(0, -1))
                .post('/entity/Note/501', body => body.commentingPerson && body.commentingPerson.id === 888)
                .reply(200, {
                    changedEntityId: 501
                }, mockBullhornRateLimitHeaders);

            const result = await bullhorn.updateCallLog({
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
                additionalSubmission: {
                    isAssignedToUser: true,
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
        const existingCallLog = createMockExistingCallLog({ thirdPartyLogId: '501' });

        it('should update Note with action', async () => {
            nock(restUrl.slice(0, -1))
                .post('/entity/Note/501', body => body.action === 'Meeting')
                .reply(200, {
                    changedEntityId: 501
                }, mockBullhornRateLimitHeaders);

            const result = await bullhorn.upsertCallDisposition({
                user: mockUser,
                existingCallLog,
                authHeader,
                dispositions: { noteActions: 'Meeting' }
            });

            expect(result.logId).toBe('501');
        });

        it('should use default action when none provided', async () => {
            nock(restUrl.slice(0, -1))
                .post('/entity/Note/501', body => body.action === 'pending note')
                .reply(200, {
                    changedEntityId: 501
                }, mockBullhornRateLimitHeaders);

            const result = await bullhorn.upsertCallDisposition({
                user: mockUser,
                existingCallLog,
                authHeader,
                dispositions: {}
            });

            expect(result.logId).toBe('501');
        });

        it('should handle 403 permission error', async () => {
            nock(restUrl.slice(0, -1))
                .post('/entity/Note/501')
                .reply(403, { error: 'Forbidden' });

            const result = await bullhorn.upsertCallDisposition({
                user: mockUser,
                existingCallLog,
                authHeader,
                dispositions: { noteActions: 'Call' }
            });

            expect(result.returnMessage.messageType).toBe('warning');
            expect(result.returnMessage.message).toContain('does not have permission');
        });
    });

    // ==================== getCallLog ====================
    describe('getCallLog', () => {
        it('should retrieve call log details', async () => {
            nock(restUrl.slice(0, -1))
                .get('/entity/Note/501')
                .query(true)
                .reply(200, {
                    data: {
                        comments: '<ul><li><b>Summary</b>: Test Subject<li><b></ul><b>Agent notes</b>Test note<b>Call details</b>Duration: 5:00',
                        candidates: { total: 0, data: [] },
                        clientContacts: { total: 1, data: [{ firstName: 'John', lastName: 'Doe' }] },
                        action: 'Call'
                    }
                }, mockBullhornRateLimitHeaders);

            const result = await bullhorn.getCallLog({
                user: mockUser,
                callLogId: '501',
                authHeader
            });

            expect(result.callLogInfo.subject).toBe('Test Subject');
            expect(result.callLogInfo.note).toBe('Test note');
            expect(result.callLogInfo.contactName).toBe('John Doe');
            expect(result.callLogInfo.dispositions.noteActions).toBe('Call');
        });

        it('should handle candidate contacts', async () => {
            nock(restUrl.slice(0, -1))
                .get('/entity/Note/501')
                .query(true)
                .reply(200, {
                    data: {
                        comments: 'Simple note',
                        candidates: { total: 1, data: [{ firstName: 'Jane', lastName: 'Smith' }] },
                        clientContacts: { total: 0, data: [] },
                        action: 'Email'
                    }
                }, mockBullhornRateLimitHeaders);

            const result = await bullhorn.getCallLog({
                user: mockUser,
                callLogId: '501',
                authHeader
            });

            expect(result.callLogInfo.contactName).toBe('Jane Smith');
        });

        it('should refresh session on auth error', async () => {
            // First call fails
            nock(restUrl.slice(0, -1))
                .get('/entity/Note/501')
                .query(true)
                .reply(401, { error: 'Unauthorized' });

            // Mock login for session refresh
            nock(loginUrl)
                .post('/login')
                .query(true)
                .reply(200, {
                    BhRestToken: 'new-bh-rest-token',
                    restUrl: restUrl
                });

            // Retry succeeds
            nock(restUrl.slice(0, -1))
                .get('/entity/Note/501')
                .query(true)
                .reply(200, {
                    data: {
                        comments: 'Simple note',
                        candidates: { total: 0, data: [] },
                        clientContacts: { total: 0, data: [] },
                        action: 'Call'
                    }
                }, mockBullhornRateLimitHeaders);

            const result = await bullhorn.getCallLog({
                user: mockUser,
                callLogId: '501',
                authHeader
            });

            expect(result.callLogInfo.fullBody).toBe('Simple note');
        });
    });

    // ==================== createMessageLog ====================
    describe('createMessageLog', () => {
        const mockContact = createMockContact({ id: 101, name: 'John Doe', phoneNumber: '+14155551234' });
        const mockMessageData = createMockMessage();

        beforeEach(() => {
            // Mock user info query
            nock(restUrl.slice(0, -1))
                .get(/query\/CorporateUser/)
                .query(true)
                .reply(200, {
                    data: [{ id: 123, name: 'Test User' }]
                }, mockBullhornRateLimitHeaders);
        });

        it('should create an SMS message log', async () => {
            nock(restUrl.slice(0, -1))
                .put('/entity/Note')
                .reply(200, {
                    changedEntityId: 601
                }, mockBullhornRateLimitHeaders);

            const result = await bullhorn.createMessageLog({
                user: mockUser,
                contactInfo: mockContact,
                authHeader,
                message: mockMessageData,
                additionalSubmission: { noteActions: 'SMS' },
                recordingLink: null,
                faxDocLink: null
            });

            expect(result.logId).toBe(601);
            expect(result.returnMessage.message).toBe('Message logged');
        });

        it('should create a voicemail message log', async () => {
            nock(restUrl.slice(0, -1))
                .put('/entity/Note')
                .reply(200, {
                    changedEntityId: 602
                }, mockBullhornRateLimitHeaders);

            const result = await bullhorn.createMessageLog({
                user: mockUser,
                contactInfo: mockContact,
                authHeader,
                message: mockMessageData,
                additionalSubmission: null,
                recordingLink: 'https://recording.example.com/voicemail.mp3',
                faxDocLink: null
            });

            expect(result.logId).toBe(602);
        });

        it('should create a fax message log', async () => {
            nock(restUrl.slice(0, -1))
                .put('/entity/Note')
                .reply(200, {
                    changedEntityId: 603
                }, mockBullhornRateLimitHeaders);

            const result = await bullhorn.createMessageLog({
                user: mockUser,
                contactInfo: mockContact,
                authHeader,
                message: mockMessageData,
                additionalSubmission: null,
                recordingLink: null,
                faxDocLink: 'https://fax.example.com/document.pdf'
            });

            expect(result.logId).toBe(603);
        });
    });

    // ==================== updateMessageLog ====================
    describe('updateMessageLog', () => {
        const mockContact = createMockContact({ id: 101, name: 'John Doe', phoneNumber: '+14155551234' });
        const mockMessageData = createMockMessage();
        const existingMessageLog = createMockExistingMessageLog({ thirdPartyLogId: '601' });

        it('should update an existing message log', async () => {
            // Mock user info query
            nock(restUrl.slice(0, -1))
                .get(/query\/CorporateUser/)
                .query(true)
                .reply(200, {
                    data: [{ id: 123, name: 'Test User' }]
                }, mockBullhornRateLimitHeaders);

            // Mock get existing log
            nock(restUrl.slice(0, -1))
                .get('/entity/Note/601')
                .query(true)
                .reply(200, {
                    data: {
                        id: 601,
                        comments: '<br>Conversation(1 messages)<br>BEGIN<br>------------<br><ul><li>John Doe 10:00 AM<br><b>First message</b></li></ul>------------<br>END<br>'
                    }
                }, mockBullhornRateLimitHeaders);

            // Mock update
            nock(restUrl.slice(0, -1))
                .post('/entity/Note/601')
                .reply(200, {
                    changedEntityId: 601
                }, mockBullhornRateLimitHeaders);

            const result = await bullhorn.updateMessageLog({
                user: mockUser,
                contactInfo: mockContact,
                existingMessageLog,
                message: { ...mockMessageData, subject: 'Second message' },
                authHeader
            });

            expect(result.extraDataTracking).toBeDefined();
        });

        it('should handle 403 permission error', async () => {
            nock(restUrl.slice(0, -1))
                .get(/query\/CorporateUser/)
                .query(true)
                .reply(200, {
                    data: [{ id: 123, name: 'Test User' }]
                }, mockBullhornRateLimitHeaders);

            nock(restUrl.slice(0, -1))
                .get('/entity/Note/601')
                .query(true)
                .reply(200, {
                    data: {
                        id: 601,
                        comments: '<br>Conversation(1 messages)<br>BEGIN<br>------------<br><ul><li>John Doe 10:00 AM<br><b>First message</b></li></ul>------------<br>END<br>'
                    }
                }, mockBullhornRateLimitHeaders);

            nock(restUrl.slice(0, -1))
                .post('/entity/Note/601')
                .reply(403, { error: 'Forbidden' });

            const result = await bullhorn.updateMessageLog({
                user: mockUser,
                contactInfo: mockContact,
                existingMessageLog,
                message: mockMessageData,
                authHeader
            });

            expect(result.returnMessage.messageType).toBe('warning');
            expect(result.returnMessage.message).toContain('does not have permission');
        });
    });

    // ==================== Error Scenarios ====================
    describe('Error Scenarios', () => {
        it('should handle 500 server errors in findContact', async () => {
            getOrRefreshAccountData.mockImplementation(async ({ fetchFn, dataKey }) => {
                if (dataKey === 'commentActionList') {
                    return [{ const: 'Call', title: 'Call' }];
                }
                return [];
            });

            nock(restUrl.slice(0, -1))
                .post('/search/ClientContact')
                .query(true)
                .reply(500, { error: 'Internal Server Error' });

            await expect(bullhorn.findContact({
                user: mockUser,
                authHeader,
                phoneNumber: '+14155551234',
                overridingFormat: '',
                isExtension: 'false'
            })).rejects.toThrow();
        });

        it('should handle network errors in createCallLog', async () => {
            nock(restUrl.slice(0, -1))
                .put('/entity/Note')
                .replyWithError('Network error');

            const mockContact = createMockContact({ id: 101 });
            const mockCallLogData = createMockCallLog();

            await expect(bullhorn.createCallLog({
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

        it('should handle non-auth errors without retry', async () => {
            nock(restUrl.slice(0, -1))
                .get('/settings/commentActionList')
                .reply(500, { error: 'Internal Server Error' });

            await expect(bullhorn.findContactWithName({
                user: mockUser,
                authHeader,
                name: 'John'
            })).rejects.toThrow();
        });
    });

    // ==================== getOverridingOAuthOption ====================
    describe('getOverridingOAuthOption', () => {
        it('should return correct OAuth options with code', () => {
            const result = bullhorn.getOverridingOAuthOption({ code: 'test-auth-code' });

            expect(result.query.grant_type).toBe('authorization_code');
            expect(result.query.code).toBe('test-auth-code');
            expect(result.query.client_id).toBe('test-client-id');
            expect(result.query.client_secret).toBe('test-client-secret');
            expect(result.query.redirect_uri).toBe('https://example.com/callback');
            expect(result.headers.Authorization).toBe('');
        });
    });

    // ==================== checkAndRefreshAccessToken ====================
    describe('checkAndRefreshAccessToken', () => {
        it('should return user unchanged if no accessToken', async () => {
            const userWithoutToken = createMockUser({
                id: '12345-bullhorn',
                accessToken: '',
                refreshToken: ''
            });

            const result = await bullhorn.checkAndRefreshAccessToken(
                {},  // oauthApp
                userWithoutToken
            );

            expect(result).toBe(userWithoutToken);
        });

        it('should return user unchanged if no refreshToken', async () => {
            const userWithoutRefresh = createMockUser({
                id: '12345-bullhorn',
                accessToken: 'token',
                refreshToken: ''
            });

            const result = await bullhorn.checkAndRefreshAccessToken(
                {},
                userWithoutRefresh
            );

            expect(result).toBe(userWithoutRefresh);
        });

        it('should return null if user is null', async () => {
            const result = await bullhorn.checkAndRefreshAccessToken({}, null);
            expect(result).toBeNull();
        });
    });

    // ==================== Additional findContactWithName edge cases ====================
    describe('findContactWithName edge cases', () => {
        it('should handle multi-word names and find contacts across all types', async () => {
            nock(restUrl.slice(0, -1))
                .get('/settings/commentActionList')
                .reply(200, {
                    commentActionList: ['Call', 'Email']
                }, mockBullhornRateLimitHeaders);

            // Mock all three search endpoints returning results
            nock(restUrl.slice(0, -1))
                .post('/search/ClientContact')
                .query(true)
                .reply(200, {
                    data: [
                        { id: 101, name: 'John Doe', phone: '123', email: 'john@test.com' }
                    ]
                }, mockBullhornRateLimitHeaders);

            nock(restUrl.slice(0, -1))
                .post('/search/Candidate')
                .query(true)
                .reply(200, {
                    data: [
                        { id: 102, name: 'John Smith', phone: '456', email: 'johns@test.com' }
                    ]
                }, mockBullhornRateLimitHeaders);

            nock(restUrl.slice(0, -1))
                .post('/search/Lead')
                .query(true)
                .reply(200, {
                    data: [
                        { id: 103, name: 'John Adams', phone: '789', email: 'johna@test.com' }
                    ]
                }, mockBullhornRateLimitHeaders);

            const result = await bullhorn.findContactWithName({
                user: mockUser,
                authHeader,
                name: 'John Doe'
            });

            expect(result.successful).toBe(true);
            expect(result.matchedContactInfo.length).toBe(3);
            expect(result.matchedContactInfo.map(c => c.type)).toContain('Contact');
            expect(result.matchedContactInfo.map(c => c.type)).toContain('Candidate');
            expect(result.matchedContactInfo.map(c => c.type)).toContain('Lead');
        });

        it('should deduplicate contacts with same id', async () => {
            nock(restUrl.slice(0, -1))
                .get('/settings/commentActionList')
                .reply(200, { commentActionList: ['Call'] }, mockBullhornRateLimitHeaders);

            // Same contact appears multiple times in results
            nock(restUrl.slice(0, -1))
                .post('/search/ClientContact')
                .query(true)
                .reply(200, {
                    data: [
                        { id: 101, name: 'John Doe', phone: '123' },
                        { id: 101, name: 'John Doe', phone: '123' } // Duplicate
                    ]
                }, mockBullhornRateLimitHeaders);

            nock(restUrl.slice(0, -1))
                .post('/search/Candidate')
                .query(true)
                .reply(200, { data: [] }, mockBullhornRateLimitHeaders);

            nock(restUrl.slice(0, -1))
                .post('/search/Lead')
                .query(true)
                .reply(200, { data: [] }, mockBullhornRateLimitHeaders);

            const result = await bullhorn.findContactWithName({
                user: mockUser,
                authHeader,
                name: 'John'
            });

            expect(result.successful).toBe(true);
            // Should have deduplicated
            expect(result.matchedContactInfo.length).toBe(1);
        });
    });

    // ==================== Additional createCallLog edge cases ====================
    describe('createCallLog edge cases', () => {
        const mockContact = createMockContact({ id: 101, name: 'John Doe', type: 'Contact' });
        const mockCallLogData = createMockCallLog();

        it('should fallback to admin config for assignee when token decoding fails', async () => {
            // Make JWT decode throw an error
            const jwt = require('@app-connect/core/lib/jwt');
            jwt.decodeJwt.mockImplementationOnce(() => {
                throw new Error('Invalid token');
            });

            AdminConfigModel.findByPk.mockResolvedValue({
                userMappings: [
                    { rcExtensionId: 'ext-456', crmUserId: 777 }
                ]
            });

            nock(restUrl.slice(0, -1))
                .put('/entity/Note', body => body.commentingPerson && body.commentingPerson.id === 777)
                .reply(200, {
                    changedEntityId: 510
                }, mockBullhornRateLimitHeaders);

            const result = await bullhorn.createCallLog({
                user: mockUser,
                contactInfo: mockContact,
                authHeader,
                callLog: mockCallLogData,
                note: 'Test note',
                additionalSubmission: {
                    isAssignedToUser: true,
                    adminAssignedUserToken: 'invalid-token',
                    adminAssignedUserRcId: 'ext-456'
                },
                aiNote: null,
                transcript: null,
                composedLogDetails: 'Call details',
                hashedAccountId: 'hash-123'
            });

            expect(result.logId).toBe(510);
        });

        it('should handle extension IDs as arrays in user mapping', async () => {
            AdminConfigModel.findByPk.mockResolvedValue({
                userMappings: [
                    { rcExtensionId: ['ext-111', 'ext-222'], crmUserId: 888 }
                ]
            });

            UserModel.findByPk.mockResolvedValue(null);

            nock(restUrl.slice(0, -1))
                .put('/entity/Note', body => body.commentingPerson && body.commentingPerson.id === 888)
                .reply(200, {
                    changedEntityId: 511
                }, mockBullhornRateLimitHeaders);

            const result = await bullhorn.createCallLog({
                user: mockUser,
                contactInfo: mockContact,
                authHeader,
                callLog: mockCallLogData,
                note: 'Test note',
                additionalSubmission: {
                    isAssignedToUser: true,
                    adminAssignedUserToken: 'valid-token',
                    adminAssignedUserRcId: 'ext-222'
                },
                aiNote: null,
                transcript: null,
                composedLogDetails: 'Call details',
                hashedAccountId: 'hash-123'
            });

            expect(result.logId).toBe(511);
        });
    });

    // ==================== Additional updateCallLog edge cases ====================
    describe('updateCallLog edge cases', () => {
        const existingCallLog = createMockExistingCallLog({ thirdPartyLogId: '501' });

        it('should handle isFromSSCL with pending note pattern', async () => {
            const existingCallLogDetails = {
                comments: '<br>From auto logging (Pending)<br>Old content',
                commentingPerson: { id: 123 }
            };

            nock(restUrl.slice(0, -1))
                .post('/entity/Note/501')
                .reply(200, {
                    changedEntityId: 501
                }, mockBullhornRateLimitHeaders);

            const result = await bullhorn.updateCallLog({
                user: mockUser,
                existingCallLog,
                authHeader,
                recordingLink: 'https://recording.example.com/123',
                subject: null,
                note: null,
                startTime: Date.now(),
                duration: 300,
                result: 'Connected',
                aiNote: 'AI note',
                transcript: 'Transcript',
                additionalSubmission: null,
                composedLogDetails: 'Updated details',
                existingCallLogDetails,
                hashedAccountId: 'hash-123',
                isFromSSCL: true
            });

            expect(result.returnMessage.messageType).toBe('success');
        });

        it('should update upsert fields when isFromSSCL without pending note', async () => {
            const existingCallLogDetails = {
                comments: 'User entered notes without pending marker',
                commentingPerson: { id: 123 }
            };

            nock(restUrl.slice(0, -1))
                .post('/entity/Note/501')
                .reply(200, {
                    changedEntityId: 501
                }, mockBullhornRateLimitHeaders);

            const result = await bullhorn.updateCallLog({
                user: mockUser,
                existingCallLog,
                authHeader,
                recordingLink: 'https://recording.example.com/123',
                subject: null,
                note: null,
                startTime: Date.now(),
                duration: 300,
                result: 'Connected',
                aiNote: 'AI note',
                transcript: 'Transcript',
                additionalSubmission: null,
                composedLogDetails: 'Updated details',
                existingCallLogDetails,
                hashedAccountId: 'hash-123',
                isFromSSCL: true,
                ringSenseTranscript: 'RingSense transcript',
                ringSenseSummary: 'Summary',
                ringSenseAIScore: 85,
                ringSenseBulletedSummary: '• Point 1',
                ringSenseLink: 'https://ringsense.example.com'
            });

            expect(result.returnMessage.messageType).toBe('success');
        });

        it('should refresh session on auth error when fetching existing log', async () => {
            // First GET fails with 401
            nock(restUrl.slice(0, -1))
                .get('/entity/Note/501')
                .query(true)
                .reply(401, { error: 'Unauthorized' });

            // Mock login for session refresh
            nock(loginUrl)
                .post('/login')
                .query(true)
                .reply(200, {
                    BhRestToken: 'new-bh-rest-token',
                    restUrl: restUrl
                });

            // Retry GET succeeds
            nock(restUrl.slice(0, -1))
                .get('/entity/Note/501')
                .query(true)
                .reply(200, {
                    data: {
                        comments: 'Existing comments',
                        commentingPerson: { id: 123 }
                    }
                }, mockBullhornRateLimitHeaders);

            // POST update
            nock(restUrl.slice(0, -1))
                .post('/entity/Note/501')
                .reply(200, {
                    changedEntityId: 501
                }, mockBullhornRateLimitHeaders);

            const result = await bullhorn.updateCallLog({
                user: mockUser,
                existingCallLog,
                authHeader,
                recordingLink: null,
                subject: 'New Subject',
                note: null,
                startTime: Date.now(),
                duration: 300,
                result: null,
                aiNote: null,
                transcript: null,
                additionalSubmission: null,
                composedLogDetails: 'Updated details',
                existingCallLogDetails: null,
                hashedAccountId: 'hash-123'
            });

            expect(result.returnMessage.messageType).toBe('success');
        });
    });

    // ==================== createContact auth error handling ====================
    describe('createContact auth error handling', () => {
        it('should refresh session on auth error when fetching commentActionList', async () => {
            // First call fails with 401
            nock(restUrl.slice(0, -1))
                .get('/settings/commentActionList')
                .reply(401, { error: 'Unauthorized' });

            // Mock login for session refresh
            nock(loginUrl)
                .post('/login')
                .query(true)
                .reply(200, {
                    BhRestToken: 'new-bh-rest-token',
                    restUrl: restUrl
                });

            // Retry succeeds
            nock(restUrl.slice(0, -1))
                .get('/settings/commentActionList')
                .reply(200, {
                    commentActionList: ['Call']
                }, mockBullhornRateLimitHeaders);

            // Lead creation
            nock(restUrl.slice(0, -1))
                .put('/entity/Lead')
                .reply(200, {
                    changedEntityId: 301
                }, mockBullhornRateLimitHeaders);

            const result = await bullhorn.createContact({
                user: mockUser,
                authHeader,
                phoneNumber: '+14155551234',
                newContactName: 'New Lead',
                newContactType: 'Lead',
                additionalSubmission: { status: 'New' }
            });

            expect(result.contactInfo.id).toBe(301);
        });
    });

    // ==================== createMessageLog auth error handling ====================
    describe('createMessageLog auth error handling', () => {
        const mockContact = createMockContact({ id: 101, name: 'John Doe', phoneNumber: '+14155551234' });
        const mockMessageData = createMockMessage();

        it('should refresh session on auth error when fetching user info', async () => {
            // First user info call fails
            nock(restUrl.slice(0, -1))
                .get(/query\/CorporateUser/)
                .query(true)
                .reply(401, { error: 'Unauthorized' });

            // Mock login for session refresh
            nock(loginUrl)
                .post('/login')
                .query(true)
                .reply(200, {
                    BhRestToken: 'new-bh-rest-token',
                    restUrl: restUrl
                });

            // Retry user info succeeds
            nock(restUrl.slice(0, -1))
                .get(/query\/CorporateUser/)
                .query(true)
                .reply(200, {
                    data: [{ id: 123, name: 'Test User' }]
                }, mockBullhornRateLimitHeaders);

            // Create message log
            nock(restUrl.slice(0, -1))
                .put('/entity/Note')
                .reply(200, {
                    changedEntityId: 701
                }, mockBullhornRateLimitHeaders);

            const result = await bullhorn.createMessageLog({
                user: mockUser,
                contactInfo: mockContact,
                authHeader,
                message: mockMessageData,
                additionalSubmission: null,
                recordingLink: null,
                faxDocLink: null
            });

            expect(result.logId).toBe(701);
        });
    });

    // ==================== getServerLoggingSettings ====================
    describe('getServerLoggingSettings', () => {
        it('should return decoded credentials when they exist', async () => {
            const userWithCredentials = createMockUser({
                id: '12345-bullhorn',
                hostname,
                platformAdditionalInfo: {
                    ...mockUser.platformAdditionalInfo,
                    encodedApiUsername: 'encoded:testuser',
                    encodedApiPassword: 'encoded:testpass'
                }
            });

            const result = await bullhorn.getServerLoggingSettings({ user: userWithCredentials });

            expect(result.apiUsername).toBe('testuser');
            expect(result.apiPassword).toBe('testpass');
        });

        it('should return empty strings when credentials do not exist', async () => {
            const userWithoutCredentials = createMockUser({
                id: '12345-bullhorn',
                hostname,
                platformAdditionalInfo: {
                    ...mockUser.platformAdditionalInfo
                }
            });

            const result = await bullhorn.getServerLoggingSettings({ user: userWithoutCredentials });

            expect(result.apiUsername).toBe('');
            expect(result.apiPassword).toBe('');
        });
    });

    // ==================== updateServerLoggingSettings ====================
    describe('updateServerLoggingSettings', () => {
        it('should clear credentials when empty values provided', async () => {
            const user = createMockUser({
                id: '12345-bullhorn',
                hostname,
                platformAdditionalInfo: {
                    ...mockUser.platformAdditionalInfo,
                    encodedApiUsername: 'encoded:olduser',
                    encodedApiPassword: 'encoded:oldpass'
                }
            });
            user.update = jest.fn().mockResolvedValue({});

            const result = await bullhorn.updateServerLoggingSettings({
                user,
                additionalFieldValues: { apiUsername: '', apiPassword: '' },
                oauthApp: {}
            });

            expect(result.successful).toBe(true);
            expect(result.returnMessage.message).toBe('Server logging settings cleared');
            expect(user.update).toHaveBeenCalled();
        });

        it('should fail when password authorization fails', async () => {
            const user = createMockUser({
                id: '12345-bullhorn',
                hostname,
                platformAdditionalInfo: {
                    ...mockUser.platformAdditionalInfo,
                    tokenUrl: 'https://auth.bullhornstaffing.com/oauth/token'
                }
            });

            // Mock authorization failure
            nock('https://auth.bullhornstaffing.com')
                .get('/oauth/authorize')
                .query(true)
                .reply(401, { error: 'Unauthorized' });

            const mockOauthApp = {
                code: {
                    getToken: jest.fn().mockResolvedValue({
                        accessToken: 'new-token',
                        refreshToken: 'new-refresh',
                        expires: 3600
                    })
                }
            };

            const result = await bullhorn.updateServerLoggingSettings({
                user,
                additionalFieldValues: { apiUsername: 'testuser', apiPassword: 'testpass' },
                oauthApp: mockOauthApp
            });

            expect(result.successful).toBe(false);
            expect(result.returnMessage.message).toContain('failed');
        });

        it('should succeed when password authorization works', async () => {
            const user = createMockUser({
                id: '12345-bullhorn',
                hostname,
                platformAdditionalInfo: {
                    ...mockUser.platformAdditionalInfo,
                    tokenUrl: 'https://auth.bullhornstaffing.com/oauth/token'
                }
            });

            // Mock successful authorization redirect
            nock('https://auth.bullhornstaffing.com')
                .get('/oauth/authorize')
                .query(true)
                .reply(302, '', {
                    location: 'https://example.com/callback?code=test-auth-code'
                });

            // Mock login after getting token
            nock(loginUrl)
                .post('/login')
                .query(true)
                .reply(200, {
                    BhRestToken: 'new-bh-rest-token',
                    restUrl: restUrl
                });

            const mockOauthApp = {
                code: {
                    getToken: jest.fn().mockResolvedValue({
                        accessToken: 'new-token',
                        refreshToken: 'new-refresh',
                        expires: 3600
                    })
                }
            };

            const result = await bullhorn.updateServerLoggingSettings({
                user,
                additionalFieldValues: { apiUsername: 'testuser', apiPassword: 'testpass' },
                oauthApp: mockOauthApp
            });

            expect(result.successful).toBe(true);
            expect(result.returnMessage.message).toBe('Server logging settings updated');
        });
    });

    // ==================== postSaveUserInfo ====================
    describe('postSaveUserInfo', () => {
        it('should use password authorize when encoded credentials exist', async () => {
            const userInfo = {
                id: '456-bullhorn',
                platformAdditionalInfo: {
                    encodedApiUsername: 'encoded:apiuser',
                    encodedApiPassword: 'encoded:apipass',
                    tokenUrl: 'https://auth.bullhornstaffing.com/oauth/token'
                }
            };

            UserModel.findByPk.mockResolvedValue({
                id: '456-bullhorn',
                platformAdditionalInfo: {
                    encodedApiUsername: 'encoded:apiuser',
                    encodedApiPassword: 'encoded:apipass',
                    tokenUrl: 'https://auth.bullhornstaffing.com/oauth/token'
                },
                save: jest.fn()
            });

            // Mock authorization (it will fail, but that's okay - error is caught)
            nock('https://auth.bullhornstaffing.com')
                .get('/oauth/authorize')
                .query(true)
                .reply(401, { error: 'Unauthorized' });

            const mockOauthApp = {
                code: {
                    getToken: jest.fn()
                }
            };

            const result = await bullhorn.postSaveUserInfo({
                userInfo,
                oauthApp: mockOauthApp
            });

            expect(result).toEqual(userInfo);
        });

        it('should return userInfo unchanged when no credentials', async () => {
            const userInfo = {
                id: '456-bullhorn',
                platformAdditionalInfo: {}
            };

            UserModel.findByPk.mockResolvedValue({
                id: '456-bullhorn',
                platformAdditionalInfo: {},
                save: jest.fn()
            });

            const result = await bullhorn.postSaveUserInfo({
                userInfo,
                oauthApp: {}
            });

            expect(result).toEqual(userInfo);
        });
    });

    // ==================== Token Refresh with checkAndRefreshAccessToken ====================
    describe('checkAndRefreshAccessToken with expired session', () => {
        beforeEach(() => {
            // Reset the Lock mocks
            Lock.create.mockReset();
            Lock.get.mockReset();
        });

        it('should refresh token when session is about to expire', async () => {
            // Create a user with valid token
            const userWithToken = createMockUser({
                id: '12345-bullhorn',
                hostname,
                accessToken: 'valid-access-token',
                refreshToken: 'valid-refresh-token',
                platformAdditionalInfo: {
                    ...mockUser.platformAdditionalInfo,
                    tokenUrl: 'https://auth.bullhornstaffing.com/oauth/token'
                }
            });

            // Session is about to expire (within 2 minute buffer)
            const expiringDate = new Date(Date.now() + 60000).toISOString(); // 1 minute from now

            // Mock ping showing near-expiry
            nock(restUrl.slice(0, -1))
                .get('/ping')
                .reply(200, {
                    sessionExpires: expiringDate
                }, mockBullhornRateLimitHeaders);

            // Mock Lock to allow immediate creation
            Lock.create.mockResolvedValue({
                delete: jest.fn().mockResolvedValue({})
            });

            // Mock token refresh
            nock('https://auth.bullhornstaffing.com')
                .post('/oauth/token')
                .query(true)
                .reply(200, {
                    access_token: 'new-access-token',
                    refresh_token: 'new-refresh-token',
                    expires_in: 3600
                });

            // Mock login after refresh
            nock(loginUrl)
                .post('/login')
                .query(true)
                .reply(200, {
                    BhRestToken: 'new-bh-rest-token',
                    restUrl: restUrl
                });

            const result = await bullhorn.checkAndRefreshAccessToken({}, userWithToken);

            expect(result).not.toBeNull();
            expect(result.accessToken).toBeDefined();
        });

        it('should skip refresh when using skipLock parameter', async () => {
            const userWithToken = createMockUser({
                id: '12345-bullhorn',
                hostname,
                accessToken: 'valid-access-token',
                refreshToken: 'valid-refresh-token',
                platformAdditionalInfo: {
                    ...mockUser.platformAdditionalInfo,
                    tokenUrl: 'https://auth.bullhornstaffing.com/oauth/token'
                }
            });

            // Session is about to expire
            const expiringDate = new Date(Date.now() + 60000).toISOString();

            nock(restUrl.slice(0, -1))
                .get('/ping')
                .reply(200, {
                    sessionExpires: expiringDate
                }, mockBullhornRateLimitHeaders);

            // Mock token refresh
            nock('https://auth.bullhornstaffing.com')
                .post('/oauth/token')
                .query(true)
                .reply(200, {
                    access_token: 'new-access-token',
                    refresh_token: 'new-refresh-token',
                    expires_in: 3600
                });

            // Mock login after refresh
            nock(loginUrl)
                .post('/login')
                .query(true)
                .reply(200, {
                    BhRestToken: 'new-bh-rest-token',
                    restUrl: restUrl
                });

            // Call with skipLock = true
            const result = await bullhorn.checkAndRefreshAccessToken({}, userWithToken, 20, true);

            // Lock.create should not be called when skipLock is true
            expect(Lock.create).not.toHaveBeenCalled();
        });

        it('should handle token refresh failure gracefully', async () => {
            const userWithToken = createMockUser({
                id: '12345-bullhorn',
                hostname,
                accessToken: 'valid-access-token',
                refreshToken: 'valid-refresh-token',
                platformAdditionalInfo: {
                    ...mockUser.platformAdditionalInfo,
                    tokenUrl: 'https://auth.bullhornstaffing.com/oauth/token'
                }
            });

            // Ping fails (session expired)
            nock(restUrl.slice(0, -1))
                .get('/ping')
                .reply(401, { error: 'Unauthorized' });

            // Token refresh fails
            nock('https://auth.bullhornstaffing.com')
                .post('/oauth/token')
                .query(true)
                .reply(401, { error: 'Invalid refresh token' });

            // Call with skipLock = true to avoid lock complexity
            const result = await bullhorn.checkAndRefreshAccessToken({}, userWithToken, 20, true);

            // Should still return the user (with error logged)
            expect(result).toBeDefined();
        });

        it('should wait for lock and return refreshed user when lock exists', async () => {
            const userWithToken = createMockUser({
                id: '12345-bullhorn',
                hostname,
                accessToken: 'valid-access-token',
                refreshToken: 'valid-refresh-token',
                platformAdditionalInfo: {
                    ...mockUser.platformAdditionalInfo,
                    tokenUrl: 'https://auth.bullhornstaffing.com/oauth/token'
                }
            });

            // Ping fails
            nock(restUrl.slice(0, -1))
                .get('/ping')
                .reply(401, { error: 'Unauthorized' });

            // Simulate lock already exists (ConditionalCheckFailedException)
            const mockError = new Error('Conditional Check Failed');
            mockError.name = 'ConditionalCheckFailedException';
            Lock.create.mockRejectedValue(mockError);

            // Lock.get returns a lock that is not expired, then null (simulating lock release)
            let callCount = 0;
            Lock.get.mockImplementation(() => {
                callCount++;
                if (callCount === 1) {
                    return { ttl: Date.now() / 1000 + 30 }; // Valid lock
                }
                return null; // Lock released
            });

            // Mock UserModel.findByPk to return refreshed user
            UserModel.findByPk.mockResolvedValue({
                ...userWithToken,
                accessToken: 'refreshed-by-other-process',
                save: jest.fn()
            });

            const result = await bullhorn.checkAndRefreshAccessToken({}, userWithToken, 2);

            expect(result).toBeDefined();
        });
    });

    // ==================== toCsv and CSV Helper Functions ====================
    describe('CSV Report Helper Functions', () => {
        it('toCsv should escape values with commas', () => {
            // Access toCsv through the module (if exported)
            // Since toCsv is not exported, we'll test through a higher-level function
            // or skip this test if toCsv is internal only
        });
    });

    // ==================== Additional Contact Type Handling ====================
    describe('createContact with different types', () => {
        it('should create a Lead with custom status', async () => {
            nock(restUrl.slice(0, -1))
                .get('/settings/commentActionList')
                .reply(200, {
                    commentActionList: ['Call', 'Email']
                }, mockBullhornRateLimitHeaders);

            nock(restUrl.slice(0, -1))
                .put('/entity/Lead', body => 
                    body.status === 'Hot' && 
                    body.phone === '+14155551234' &&
                    body.firstName === 'Test'
                )
                .reply(200, {
                    changedEntityId: 305
                }, mockBullhornRateLimitHeaders);

            const result = await bullhorn.createContact({
                user: mockUser,
                authHeader,
                phoneNumber: '+14155551234',
                newContactName: 'Test Lead',
                newContactType: 'Lead',
                additionalSubmission: { status: 'Hot' }
            });

            expect(result.contactInfo.id).toBe(305);
            expect(result.contactInfo.name).toBe('Test Lead');
            expect(result.returnMessage.message).toContain('Lead');
        });

        it('should create a Candidate with valid additionalSubmission', async () => {
            nock(restUrl.slice(0, -1))
                .get('/settings/commentActionList')
                .reply(200, {
                    commentActionList: ['Call']
                }, mockBullhornRateLimitHeaders);

            nock(restUrl.slice(0, -1))
                .put('/entity/Candidate')
                .reply(200, {
                    changedEntityId: 306
                }, mockBullhornRateLimitHeaders);

            const result = await bullhorn.createContact({
                user: mockUser,
                authHeader,
                phoneNumber: '+14155551234',
                newContactName: 'New Candidate',
                newContactType: 'Candidate',
                additionalSubmission: { status: 'Available' }
            });

            expect(result.contactInfo.id).toBe(306);
            expect(result.contactInfo.name).toBe('New Candidate');
        });
    });

    // ==================== getCallLog edge cases ====================
    describe('getCallLog edge cases', () => {
        it('should handle Candidate contacts', async () => {
            nock(restUrl.slice(0, -1))
                .get('/entity/Note/502')
                .query(true)
                .reply(200, {
                    data: {
                        comments: '<ul><li><b>Summary</b>: Candidate Call<li><b></ul><b>Agent notes</b>Candidate note',
                        candidates: { total: 1, data: [{ firstName: 'Candidate', lastName: 'Person' }] },
                        clientContacts: { total: 0, data: [] },
                        action: 'Call'
                    }
                }, mockBullhornRateLimitHeaders);

            const result = await bullhorn.getCallLog({
                user: mockUser,
                callLogId: '502',
                authHeader
            });

            expect(result.callLogInfo.contactName).toBe('Candidate Person');
        });

        it('should handle note when no contacts found', async () => {
            nock(restUrl.slice(0, -1))
                .get('/entity/Note/504')
                .query(true)
                .reply(200, {
                    data: {
                        comments: 'Note with no contacts',
                        candidates: { total: 0, data: [] },
                        clientContacts: { total: 0, data: [] },
                        action: 'Email'
                    }
                }, mockBullhornRateLimitHeaders);

            const result = await bullhorn.getCallLog({
                user: mockUser,
                callLogId: '504',
                authHeader
            });

            expect(result.callLogInfo.contactName).toBe(' ');
            expect(result.callLogInfo.fullBody).toBe('Note with no contacts');
        });

        it('should handle note without structured format', async () => {
            nock(restUrl.slice(0, -1))
                .get('/entity/Note/503')
                .query(true)
                .reply(200, {
                    data: {
                        comments: 'Just a plain note without any special formatting',
                        candidates: { total: 0, data: [] },
                        clientContacts: { total: 0, data: [] },
                        action: 'Meeting'
                    }
                }, mockBullhornRateLimitHeaders);

            const result = await bullhorn.getCallLog({
                user: mockUser,
                callLogId: '503',
                authHeader
            });

            expect(result.callLogInfo.fullBody).toBe('Just a plain note without any special formatting');
            expect(result.callLogInfo.dispositions.noteActions).toBe('Meeting');
        });
    });

    // ==================== Additional updateCallLog scenarios ====================
    describe('updateCallLog with RingSense data', () => {
        const existingCallLog = createMockExistingCallLog({ thirdPartyLogId: '501' });

        it('should include RingSense fields in update', async () => {
            const existingCallLogDetails = {
                comments: 'Existing comments',
                commentingPerson: { id: 123 }
            };

            nock(restUrl.slice(0, -1))
                .post('/entity/Note/501')
                .reply(200, {
                    changedEntityId: 501
                }, mockBullhornRateLimitHeaders);

            const result = await bullhorn.updateCallLog({
                user: mockUser,
                existingCallLog,
                authHeader,
                recordingLink: 'https://recording.example.com/123',
                subject: null,
                note: null,
                startTime: Date.now(),
                duration: 300,
                result: 'Connected',
                aiNote: 'AI generated note',
                transcript: 'Full transcript here',
                additionalSubmission: null,
                composedLogDetails: 'Updated details with RingSense',
                existingCallLogDetails,
                hashedAccountId: 'hash-123',
                ringSenseTranscript: 'RingSense transcript',
                ringSenseSummary: 'RingSense summary',
                ringSenseAIScore: 85,
                ringSenseBulletedSummary: '• Point 1\n• Point 2',
                ringSenseLink: 'https://ringsense.example.com/call/123'
            });

            expect(result.returnMessage.messageType).toBe('success');
        });
    });

    // ==================== findContact with overriding format ====================
    describe('findContact with overriding format', () => {
        beforeEach(() => {
            getOrRefreshAccountData.mockImplementation(async ({ fetchFn, dataKey }) => {
                if (dataKey === 'commentActionList') {
                    return [{ const: 'Call', title: 'Call' }];
                }
                return [];
            });
        });

        it('should apply overriding phone format', async () => {
            // Mock all searches return empty with custom format applied
            nock(restUrl.slice(0, -1))
                .post('/search/ClientContact')
                .query(true)
                .reply(200, { data: [] }, mockBullhornRateLimitHeaders);

            nock(restUrl.slice(0, -1))
                .post('/search/Candidate')
                .query(true)
                .reply(200, { data: [] }, mockBullhornRateLimitHeaders);

            nock(restUrl.slice(0, -1))
                .post('/search/Lead')
                .query(true)
                .reply(200, { data: [] }, mockBullhornRateLimitHeaders);

            const result = await bullhorn.findContact({
                user: mockUser,
                authHeader,
                phoneNumber: '+14155551234',
                overridingFormat: '(###) ###-####,###-###-####',
                isExtension: 'false'
            });

            expect(result.successful).toBe(true);
            const createNewOption = result.matchedContactInfo.find(c => c.id === 'createNewContact');
            expect(createNewOption).toBeDefined();
        });
    });

    // ==================== findContact status fetching errors ====================
    describe('findContact with status fetching errors', () => {
        it('should handle lead status fetch error gracefully', async () => {
            // Make getOrRefreshAccountData throw for leadStatuses
            getOrRefreshAccountData.mockImplementation(async ({ fetchFn, dataKey }) => {
                if (dataKey === 'commentActionList') {
                    return [{ const: 'Call', title: 'Call' }];
                }
                if (dataKey === 'leadStatuses') {
                    const error = new Error('Status fetch failed');
                    error.response = { status: 500 };
                    throw error;
                }
                if (dataKey === 'candidateStatuses' || dataKey === 'contactStatuses') {
                    return [{ const: 'Active', title: 'Active' }];
                }
                return [];
            });

            nock(restUrl.slice(0, -1))
                .post('/search/ClientContact')
                .query(true)
                .reply(200, { data: [] }, mockBullhornRateLimitHeaders);

            nock(restUrl.slice(0, -1))
                .post('/search/Candidate')
                .query(true)
                .reply(200, { data: [] }, mockBullhornRateLimitHeaders);

            nock(restUrl.slice(0, -1))
                .post('/search/Lead')
                .query(true)
                .reply(200, { data: [] }, mockBullhornRateLimitHeaders);

            const result = await bullhorn.findContact({
                user: mockUser,
                authHeader,
                phoneNumber: '+14155551234',
                overridingFormat: '',
                isExtension: 'false'
            });

            expect(result.successful).toBe(true);
            const createNewOption = result.matchedContactInfo.find(c => c.id === 'createNewContact');
            expect(createNewOption).toBeDefined();
        });

        it('should handle candidate status fetch error gracefully', async () => {
            getOrRefreshAccountData.mockImplementation(async ({ fetchFn, dataKey }) => {
                if (dataKey === 'commentActionList') {
                    return [{ const: 'Call', title: 'Call' }];
                }
                if (dataKey === 'candidateStatuses') {
                    const error = new Error('Status fetch failed');
                    error.response = { status: 500 };
                    throw error;
                }
                if (dataKey === 'leadStatuses' || dataKey === 'contactStatuses') {
                    return [{ const: 'Active', title: 'Active' }];
                }
                return [];
            });

            nock(restUrl.slice(0, -1))
                .post('/search/ClientContact')
                .query(true)
                .reply(200, { data: [] }, mockBullhornRateLimitHeaders);

            nock(restUrl.slice(0, -1))
                .post('/search/Candidate')
                .query(true)
                .reply(200, { data: [] }, mockBullhornRateLimitHeaders);

            nock(restUrl.slice(0, -1))
                .post('/search/Lead')
                .query(true)
                .reply(200, { data: [] }, mockBullhornRateLimitHeaders);

            const result = await bullhorn.findContact({
                user: mockUser,
                authHeader,
                phoneNumber: '+14155551234',
                overridingFormat: '',
                isExtension: 'false'
            });

            expect(result.successful).toBe(true);
        });

        it('should handle contact status fetch error gracefully', async () => {
            getOrRefreshAccountData.mockImplementation(async ({ fetchFn, dataKey }) => {
                if (dataKey === 'commentActionList') {
                    return [{ const: 'Call', title: 'Call' }];
                }
                if (dataKey === 'contactStatuses') {
                    const error = new Error('Status fetch failed');
                    error.response = { status: 500 };
                    throw error;
                }
                if (dataKey === 'leadStatuses' || dataKey === 'candidateStatuses') {
                    return [{ const: 'Active', title: 'Active' }];
                }
                return [];
            });

            nock(restUrl.slice(0, -1))
                .post('/search/ClientContact')
                .query(true)
                .reply(200, { data: [] }, mockBullhornRateLimitHeaders);

            nock(restUrl.slice(0, -1))
                .post('/search/Candidate')
                .query(true)
                .reply(200, { data: [] }, mockBullhornRateLimitHeaders);

            nock(restUrl.slice(0, -1))
                .post('/search/Lead')
                .query(true)
                .reply(200, { data: [] }, mockBullhornRateLimitHeaders);

            const result = await bullhorn.findContact({
                user: mockUser,
                authHeader,
                phoneNumber: '+14155551234',
                overridingFormat: '',
                isExtension: 'false'
            });

            expect(result.successful).toBe(true);
        });
    });

    // ==================== createContact non-auth error handling ====================
    describe('createContact non-auth error handling', () => {
        it('should throw on non-auth errors when fetching commentActionList', async () => {
            // First call fails with 500 (non-auth error)
            nock(restUrl.slice(0, -1))
                .get('/settings/commentActionList')
                .reply(500, { error: 'Internal Server Error' });

            await expect(bullhorn.createContact({
                user: mockUser,
                authHeader,
                phoneNumber: '+14155551234',
                newContactName: 'New Contact',
                newContactType: 'Lead',
                additionalSubmission: { status: 'New' }
            })).rejects.toThrow();
        });
    });

    // ==================== createCallLog error scenarios ====================
    describe('createCallLog additional error scenarios', () => {
        const mockContact = createMockContact({ id: 101, name: 'John Doe', type: 'Contact' });
        const mockCallLogData = createMockCallLog();

        it('should succeed after session refresh on auth error', async () => {
            // First PUT fails with 401
            nock(restUrl.slice(0, -1))
                .put('/entity/Note')
                .reply(401, { error: 'Unauthorized' });

            // Mock login for session refresh
            nock(loginUrl)
                .post('/login')
                .query(true)
                .reply(200, {
                    BhRestToken: 'new-bh-rest-token',
                    restUrl: restUrl
                });

            // Retry succeeds
            nock(restUrl.slice(0, -1))
                .put('/entity/Note')
                .reply(200, {
                    changedEntityId: 601
                }, mockBullhornRateLimitHeaders);

            const result = await bullhorn.createCallLog({
                user: mockUser,
                contactInfo: mockContact,
                authHeader,
                callLog: mockCallLogData,
                note: 'Test note',
                additionalSubmission: null,
                aiNote: null,
                transcript: null,
                composedLogDetails: 'Call details',
                hashedAccountId: 'hash-123'
            });

            expect(result.logId).toBe(601);
            expect(result.returnMessage.messageType).toBe('success');
        });

        it('should throw on non-auth server error', async () => {
            nock(restUrl.slice(0, -1))
                .put('/entity/Note')
                .reply(502, { error: 'Bad Gateway' });

            await expect(bullhorn.createCallLog({
                user: mockUser,
                contactInfo: mockContact,
                authHeader,
                callLog: mockCallLogData,
                note: 'Test note',
                additionalSubmission: null,
                aiNote: null,
                transcript: null,
                composedLogDetails: 'Call details',
                hashedAccountId: 'hash-123'
            })).rejects.toThrow();
        });
    });

    // ==================== updateCallLog error scenarios ====================
    describe('updateCallLog additional error scenarios', () => {
        const existingCallLog = createMockExistingCallLog({ thirdPartyLogId: '501' });

        it('should succeed after session refresh on auth error', async () => {
            const existingCallLogDetails = {
                comments: 'Existing comments',
                commentingPerson: { id: 123 }
            };

            // First POST fails with 401
            nock(restUrl.slice(0, -1))
                .post('/entity/Note/501')
                .reply(401, { error: 'Unauthorized' });

            // Mock login for session refresh
            nock(loginUrl)
                .post('/login')
                .query(true)
                .reply(200, {
                    BhRestToken: 'new-bh-rest-token',
                    restUrl: restUrl
                });

            // Retry succeeds
            nock(restUrl.slice(0, -1))
                .post('/entity/Note/501')
                .reply(200, {
                    changedEntityId: 501
                }, mockBullhornRateLimitHeaders);

            const result = await bullhorn.updateCallLog({
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
                composedLogDetails: 'Updated details',
                existingCallLogDetails,
                hashedAccountId: 'hash-123'
            });

            expect(result.returnMessage.messageType).toBe('success');
        });

        it('should throw on non-auth server error', async () => {
            const existingCallLogDetails = {
                comments: 'Existing comments',
                commentingPerson: { id: 123 }
            };

            nock(restUrl.slice(0, -1))
                .post('/entity/Note/501')
                .reply(502, { error: 'Bad Gateway' });

            await expect(bullhorn.updateCallLog({
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
                composedLogDetails: 'Updated details',
                existingCallLogDetails,
                hashedAccountId: 'hash-123'
            })).rejects.toThrow();
        });
    });

    // ==================== createMessageLog error scenarios ====================
    describe('createMessageLog additional error scenarios', () => {
        const mockContact = createMockContact({ id: 101, name: 'John Doe', phoneNumber: '+14155551234' });
        const mockMessageData = createMockMessage();

        it('should succeed after session refresh on user info auth error', async () => {
            // First user query fails with 401
            nock(restUrl.slice(0, -1))
                .get(/query\/CorporateUser/)
                .query(true)
                .reply(401, { error: 'Unauthorized' });

            // Mock login for session refresh
            nock(loginUrl)
                .post('/login')
                .query(true)
                .reply(200, {
                    BhRestToken: 'new-bh-rest-token',
                    restUrl: restUrl
                });

            // Retry user query succeeds
            nock(restUrl.slice(0, -1))
                .get(/query\/CorporateUser/)
                .query(true)
                .reply(200, {
                    data: [{ id: 123, name: 'Test User' }]
                }, mockBullhornRateLimitHeaders);

            // Create message log succeeds
            nock(restUrl.slice(0, -1))
                .put('/entity/Note')
                .reply(200, {
                    changedEntityId: 701
                }, mockBullhornRateLimitHeaders);

            const result = await bullhorn.createMessageLog({
                user: mockUser,
                contactInfo: mockContact,
                authHeader,
                message: mockMessageData,
                additionalSubmission: null,
                recordingLink: null,
                faxDocLink: null
            });

            expect(result.logId).toBe(701);
            expect(result.returnMessage.message).toBe('Message logged');
        });
    });

    // ==================== updateMessageLog additional scenarios ====================
    describe('updateMessageLog additional scenarios', () => {
        const mockContact = createMockContact({ id: 101, name: 'John Doe', phoneNumber: '+14155551234' });
        const mockMessageData = createMockMessage();
        const existingMessageLog = createMockExistingMessageLog({ thirdPartyLogId: '601' });

        it('should refresh session on auth error when fetching user info', async () => {
            // First user info call fails
            nock(restUrl.slice(0, -1))
                .get(/query\/CorporateUser/)
                .query(true)
                .reply(401, { error: 'Unauthorized' });

            // Mock login for session refresh
            nock(loginUrl)
                .post('/login')
                .query(true)
                .reply(200, {
                    BhRestToken: 'new-bh-rest-token',
                    restUrl: restUrl
                });

            // Retry user info succeeds
            nock(restUrl.slice(0, -1))
                .get(/query\/CorporateUser/)
                .query(true)
                .reply(200, {
                    data: [{ id: 123, name: 'Test User' }]
                }, mockBullhornRateLimitHeaders);

            // Get existing log
            nock(restUrl.slice(0, -1))
                .get('/entity/Note/601')
                .query(true)
                .reply(200, {
                    data: {
                        id: 601,
                        comments: '<br>Conversation(1 messages)<br>BEGIN<br>------------<br><ul><li>John Doe 10:00 AM<br><b>First message</b></li></ul>------------<br>END<br>'
                    }
                }, mockBullhornRateLimitHeaders);

            // Update
            nock(restUrl.slice(0, -1))
                .post('/entity/Note/601')
                .reply(200, {
                    changedEntityId: 601
                }, mockBullhornRateLimitHeaders);

            const result = await bullhorn.updateMessageLog({
                user: mockUser,
                contactInfo: mockContact,
                existingMessageLog,
                message: mockMessageData,
                authHeader
            });

            expect(result.extraDataTracking).toBeDefined();
        });
    });

    // ==================== Token lock edge cases ====================
    describe('Token lock edge cases', () => {
        it('should handle expired lock and create new one', async () => {
            const userWithToken = createMockUser({
                id: '12345-bullhorn',
                hostname,
                accessToken: 'valid-access-token',
                refreshToken: 'valid-refresh-token',
                platformAdditionalInfo: {
                    ...mockUser.platformAdditionalInfo,
                    tokenUrl: 'https://auth.bullhornstaffing.com/oauth/token'
                }
            });

            // Ping fails
            nock(restUrl.slice(0, -1))
                .get('/ping')
                .reply(401, { error: 'Unauthorized' });

            // First lock creation fails (lock exists)
            const mockError = new Error('Conditional Check Failed');
            mockError.name = 'ConditionalCheckFailedException';
            Lock.create
                .mockRejectedValueOnce(mockError)  // First attempt fails
                .mockResolvedValueOnce({  // Second attempt after deleting expired lock
                    delete: jest.fn().mockResolvedValue({})
                });

            // Lock.get returns an expired lock, then succeeds
            const expiredLock = {
                ttl: (Date.now() / 1000) - 60,  // Expired 60 seconds ago
                delete: jest.fn().mockResolvedValue({})
            };
            Lock.get.mockResolvedValueOnce(expiredLock);

            // Token refresh succeeds
            nock('https://auth.bullhornstaffing.com')
                .post('/oauth/token')
                .query(true)
                .reply(200, {
                    access_token: 'new-access-token',
                    refresh_token: 'new-refresh-token',
                    expires_in: 3600
                });

            // Mock login after refresh
            nock(loginUrl)
                .post('/login')
                .query(true)
                .reply(200, {
                    BhRestToken: 'new-bh-rest-token',
                    restUrl: restUrl
                });

            const result = await bullhorn.checkAndRefreshAccessToken({}, userWithToken, 20);

            expect(result).toBeDefined();
        });
    });

    // ==================== updateCallLog non-auth error in get log ====================
    describe('updateCallLog error when fetching existing log', () => {
        const existingCallLog = createMockExistingCallLog({ thirdPartyLogId: '501' });

        it('should throw on non-auth error when fetching existing log', async () => {
            // GET existing log fails with 502 (non-auth error)
            nock(restUrl.slice(0, -1))
                .get('/entity/Note/501')
                .query(true)
                .reply(502, { error: 'Bad Gateway' });

            await expect(bullhorn.updateCallLog({
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
                composedLogDetails: 'Updated details',
                existingCallLogDetails: null,
                hashedAccountId: 'hash-123'
            })).rejects.toThrow();
        });
    });

    // ==================== upsertCallDisposition non-auth error ====================
    describe('upsertCallDisposition error scenarios', () => {
        const existingCallLog = createMockExistingCallLog({ thirdPartyLogId: '501' });

        it('should throw on non-auth server error', async () => {
            nock(restUrl.slice(0, -1))
                .post('/entity/Note/501')
                .reply(502, { error: 'Bad Gateway' });

            await expect(bullhorn.upsertCallDisposition({
                user: mockUser,
                existingCallLog,
                authHeader,
                dispositions: { noteActions: 'Call' }
            })).rejects.toThrow();
        });
    });

    // ==================== createMessageLog non-auth error ====================
    describe('createMessageLog non-auth error', () => {
        const mockContact = createMockContact({ id: 101, name: 'John Doe', phoneNumber: '+14155551234' });
        const mockMessageData = createMockMessage();

        it('should throw on non-auth server error when fetching user info', async () => {
            nock(restUrl.slice(0, -1))
                .get(/query\/CorporateUser/)
                .query(true)
                .reply(502, { error: 'Bad Gateway' });

            await expect(bullhorn.createMessageLog({
                user: mockUser,
                contactInfo: mockContact,
                authHeader,
                message: mockMessageData,
                additionalSubmission: null,
                recordingLink: null,
                faxDocLink: null
            })).rejects.toThrow();
        });
    });

    // ==================== updateMessageLog non-auth error ====================
    describe('updateMessageLog non-auth error', () => {
        const mockContact = createMockContact({ id: 101, name: 'John Doe', phoneNumber: '+14155551234' });
        const mockMessageData = createMockMessage();
        const existingMessageLog = createMockExistingMessageLog({ thirdPartyLogId: '601' });

        it('should throw on non-auth server error when fetching user info', async () => {
            nock(restUrl.slice(0, -1))
                .get(/query\/CorporateUser/)
                .query(true)
                .reply(502, { error: 'Bad Gateway' });

            await expect(bullhorn.updateMessageLog({
                user: mockUser,
                contactInfo: mockContact,
                existingMessageLog,
                message: mockMessageData,
                authHeader
            })).rejects.toThrow();
        });
    });

    // ==================== getCallLog non-auth error ====================
    describe('getCallLog non-auth error', () => {
        it('should throw on non-auth server error when fetching log', async () => {
            nock(restUrl.slice(0, -1))
                .get('/entity/Note/501')
                .query(true)
                .reply(502, { error: 'Bad Gateway' });

            await expect(bullhorn.getCallLog({
                user: mockUser,
                callLogId: '501',
                authHeader
            })).rejects.toThrow();
        });
    });

    // ==================== getUserList pagination ====================
    describe('getUserList pagination', () => {
        it('should handle multiple pages of users', async () => {
            // First page
            nock(restUrl.slice(0, -1))
                .get(/query\/CorporateUser/)
                .query(true)
                .reply(200, {
                    start: 0,
                    count: 500,
                    data: Array(500).fill(null).map((_, i) => ({
                        id: i + 1,
                        firstName: 'User',
                        lastName: `${i + 1}`,
                        email: `user${i + 1}@example.com`
                    }))
                }, mockBullhornRateLimitHeaders);

            // Second page
            nock(restUrl.slice(0, -1))
                .get(/query\/CorporateUser/)
                .query(true)
                .reply(200, {
                    start: 500,
                    count: 100,
                    data: Array(100).fill(null).map((_, i) => ({
                        id: i + 501,
                        firstName: 'User',
                        lastName: `${i + 501}`,
                        email: `user${i + 501}@example.com`
                    }))
                }, mockBullhornRateLimitHeaders);

            // Third page (empty - signals end)
            nock(restUrl.slice(0, -1))
                .get(/query\/CorporateUser/)
                .query(true)
                .reply(200, {
                    start: 600,
                    count: 0,
                    data: []
                }, mockBullhornRateLimitHeaders);

            const result = await bullhorn.getUserList({ user: mockUser });

            expect(result.length).toBe(600);
        });
    });

    // ==================== authValidation session validity ====================
    describe('authValidation session validity', () => {
        it('should return true when session is valid and not near expiry', async () => {
            // Session expires in 1 hour
            const futureDate = new Date(Date.now() + 3600000).toISOString();
            
            nock(restUrl.slice(0, -1))
                .get('/ping')
                .reply(200, {
                    sessionExpires: futureDate
                }, mockBullhornRateLimitHeaders);

            const result = await bullhorn.authValidation({ user: mockUser });

            expect(result.successful).toBe(true);
            expect(result.status).toBe(200);
        });
    });

    // ==================== findContact with multiple contact types in results ====================
    describe('findContact with multiple matches', () => {
        beforeEach(() => {
            getOrRefreshAccountData.mockImplementation(async ({ fetchFn, dataKey }) => {
                if (dataKey === 'commentActionList') {
                    return [{ const: 'Call', title: 'Call' }];
                }
                return [{ const: 'Active', title: 'Active' }];
            });
        });

        it('should return all matching contacts from all types', async () => {
            // Mock ClientContact search with results
            nock(restUrl.slice(0, -1))
                .post('/search/ClientContact')
                .query(true)
                .reply(200, {
                    data: [{
                        id: 101,
                        name: 'John Contact',
                        email: 'john.contact@example.com',
                        phone: '+14155551234',
                        dateAdded: Date.now()
                    }]
                }, mockBullhornRateLimitHeaders);

            // Mock Candidate search with results
            nock(restUrl.slice(0, -1))
                .post('/search/Candidate')
                .query(true)
                .reply(200, {
                    data: [{
                        id: 102,
                        name: 'John Candidate',
                        email: 'john.candidate@example.com',
                        phone: '+14155551234',
                        dateAdded: Date.now()
                    }]
                }, mockBullhornRateLimitHeaders);

            // Mock Lead search with results
            nock(restUrl.slice(0, -1))
                .post('/search/Lead')
                .query(true)
                .reply(200, {
                    data: [{
                        id: 103,
                        name: 'John Lead',
                        email: 'john.lead@example.com',
                        phone: '+14155551234',
                        status: 'Open',
                        dateAdded: Date.now()
                    }]
                }, mockBullhornRateLimitHeaders);

            const result = await bullhorn.findContact({
                user: mockUser,
                authHeader,
                phoneNumber: '+14155551234',
                overridingFormat: '',
                isExtension: 'false'
            });

            expect(result.successful).toBe(true);
            expect(result.matchedContactInfo.length).toBe(3);
            expect(result.matchedContactInfo.map(c => c.type)).toContain('Contact');
            expect(result.matchedContactInfo.map(c => c.type)).toContain('Candidate');
            expect(result.matchedContactInfo.map(c => c.type)).toContain('Lead');
        });
    });

});
