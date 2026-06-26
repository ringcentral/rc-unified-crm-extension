/* eslint-disable no-undef */
const nock = require('nock');
const vinsolutions = require('../../src/connectors/vinsolutions');
const { createMockUser, createMockContact, createMockCallLog } = require('../fixtures/connectorMocks');

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

describe('VinSolutions Connector', () => {
    const apiBase = 'https://api.vinsolutions.com';
    const tokenUri = 'https://authentication.vinsolutions.com';
    const accessToken = 'test-bearer-token';
    const connectedSentinel = 'vinsolutions-connected';
    const authHeader = `Bearer ${accessToken}`;

    let mockUser;

    beforeEach(() => {
        nock.cleanAll();
        nock.disableNetConnect();
        jest.clearAllMocks();

        process.env.VINSOLUTIONS_TOKEN_URI = `${tokenUri}/connect/token`;
        process.env.VINSOLUTIONS_LEAD_MANAGEMENT_CLIENT_ID = 'lead-client-id';
        process.env.VINSOLUTIONS_LEAD_MANAGEMENT_CLIENT_SECRET = 'lead-client-secret';
        process.env.VINSOLUTIONS_CALL_TRACKING_CLIENT_ID = 'call-client-id';
        process.env.VINSOLUTIONS_CALL_TRACKING_CLIENT_SECRET = 'call-client-secret';
        delete process.env.VINSOLUTIONS_CLIENT_ID;
        delete process.env.VINSOLUTIONS_CLIENT_SECRET;
        process.env.VINSOLUTIONS_LEAD_MANAGEMENT_API_KEY = 'lead-api-key';
        process.env.VINSOLUTIONS_CALL_TRACKING_API_KEY = 'call-api-key';
        delete process.env.VINSOLUTIONS_API_KEY;
        process.env.VINSOLUTIONS_PROVIDER_NAME = 'RingCentral';

        mockUser = createMockUser({
            id: '1001-2002-vinsolutions',
            hostname: 'vinsolutions.app.coxautoinc.com',
            platform: 'vinsolutions',
            accessToken: connectedSentinel,
            tokenExpiry: null,
            refreshToken: '',
            platformAdditionalInfo: {
                dealerId: 2002,
                crmUserId: 1001,
                vinsLeadManagementApiKey: 'lead-api-key',
                vinsCallTrackingApiKey: 'call-api-key',
                vinsLeadManagementAccessToken: accessToken,
                vinsLeadManagementTokenExpiry: new Date(Date.now() + 3600000).toISOString(),
                vinsCallTrackingAccessToken: 'call-tracking-token',
                vinsCallTrackingTokenExpiry: new Date(Date.now() + 3600000).toISOString()
            }
        });
    });

    afterEach(() => {
        nock.cleanAll();
        nock.enableNetConnect();
    });

    function mockTokenRequest({
        tokenType = 'leadManagement',
        accessTokenValue = accessToken
    } = {}) {
        const credentials = tokenType === 'callTracking'
            ? { clientId: 'call-client-id', clientSecret: 'call-client-secret' }
            : { clientId: 'lead-client-id', clientSecret: 'lead-client-secret' };

        nock(tokenUri)
            .post('/connect/token', (body) => (
                body.grant_type === 'client_credentials'
                && body.client_id === credentials.clientId
                && body.client_secret === credentials.clientSecret
                && body.scope === 'PublicAPI'
            ))
            .reply(200, {
                access_token: accessTokenValue,
                expires_in: 3600,
                token_type: 'Bearer',
                scope: 'PublicAPI'
            });
    }

    function mockBothTokenRequests({
        leadAccessToken = accessToken,
        vinsCallTrackingAccessToken = 'call-tracking-token'
    } = {}) {
        mockTokenRequest({ tokenType: 'leadManagement', accessTokenValue: leadAccessToken });
        mockTokenRequest({ tokenType: 'callTracking', accessTokenValue: vinsCallTrackingAccessToken });
    }

    describe('getAuthType', () => {
        it('should return oauth for runtime API calls', () => {
            expect(vinsolutions.getAuthType()).toBe('oauth');
        });
    });

    describe('getBasicAuth', () => {
        it('should return empty string for apiKey login flow', () => {
            expect(vinsolutions.getBasicAuth()).toBe('');
        });
    });

    describe('getUserInfo', () => {
        it('should connect when dealer and user are valid', async () => {
            mockBothTokenRequests();
            nock(apiBase)
                .get('/gateway/v1/tenant/user/id/1001')
                .query({ dealerId: 2002 })
                .reply(200, {
                    UserId: 1001,
                    FullName: 'Alex Sales',
                    EmailAddress: 'alex@dealer.com'
                });
            nock(apiBase)
                .get('/gateway/v1/organization/dealers')
                .reply(200, {
                    Items: [{ DealerId: 2002, Name: 'Demo Motors' }]
                });

            const result = await vinsolutions.getUserInfo({
                additionalInfo: {
                    dealerId: '2002',
                    crmUserId: '1001'
                }
            });

            expect(result.successful).toBe(true);
            expect(result.platformUserInfo.id).toBe('1001-2002-vinsolutions');
            expect(result.platformUserInfo.overridingApiKey).toBe(connectedSentinel);
            expect(result.platformUserInfo.platformAdditionalInfo.vinsLeadManagementAccessToken).toBe(accessToken);
            expect(result.platformUserInfo.platformAdditionalInfo.vinsCallTrackingAccessToken).toBe('call-tracking-token');
            expect(result.platformUserInfo.platformAdditionalInfo.vinsLeadManagementApiKey).toBe('lead-api-key');
            expect(result.platformUserInfo.platformAdditionalInfo.vinsCallTrackingApiKey).toBe('call-api-key');
            expect(result.returnMessage.message).toContain('Demo Motors');
        });

        it('should fail when dealer or user id is missing', async () => {
            const result = await vinsolutions.getUserInfo({
                additionalInfo: { dealerId: '2002' }
            });

            expect(result.successful).toBe(false);
            expect(result.returnMessage.message).toContain('required');
        });
    });

    describe('findContact', () => {
        it('should return matched contacts by phone', async () => {
            nock(apiBase)
                .get('/gateway/v1/contact')
                .query(true)
                .matchHeader('api_key', 'lead-api-key')
                .matchHeader('accept', 'application/json')
                .reply(200, [
                    {
                        ContactId: 501,
                        ContactInformation: {
                            FirstName: 'Jane',
                            LastName: 'Buyer',
                            Phones: [{ PhoneType: 'Cell', Number: '5551234567' }]
                        }
                    }
                ]);
            nock(apiBase)
                .get('/leads')
                .query(true)
                .matchHeader('api_key', 'lead-api-key')
                .matchHeader('accept', 'application/vnd.coxauto.v3+json')
                .reply(200, {
                    results: [{ leadId: 9001, leadStatus: 'ACTIVE_NEW_LEAD' }]
                });

            const result = await vinsolutions.findContact({
                user: mockUser,
                authHeader,
                phoneNumber: '+15551234567'
            });

            expect(result.successful).toBe(true);
            expect(result.matchedContactInfo).toHaveLength(2);
            expect(result.matchedContactInfo[0].id).toBe(501);
            expect(result.matchedContactInfo[0].additionalInfo.leads[0].const).toBe(9001);
        });
    });

    describe('createContact', () => {
        it('should create a contact', async () => {
            nock(apiBase)
                .post('/gateway/v1/contact')
                .matchHeader('api_key', 'lead-api-key')
                .matchHeader('content-type', 'application/json')
                .reply(201, { ContactId: 777 });

            const result = await vinsolutions.createContact({
                user: mockUser,
                authHeader,
                phoneNumber: '+15559876543',
                newContactName: 'John Smith'
            });

            expect(result.contactInfo.id).toBe(777);
            expect(result.returnMessage.messageType).toBe('success');
        });
    });

    describe('createCallLog', () => {
        it('should treat AlreadyLoggedException as success', async () => {
            nock(apiBase)
                .post('/calldetails')
                .reply(500, 'AlreadyLoggedException');

            const result = await vinsolutions.createCallLog({
                user: mockUser,
                contactInfo: createMockContact({ id: 501, name: 'Jane Buyer' }),
                authHeader,
                callLog: createMockCallLog({ sessionId: 'session-already-logged' }),
                hashedAccountId: 'hash-1'
            });

            expect(result.logId).toBeNull();
            expect(result.returnMessage.messageType).toBe('success');
            expect(result.returnMessage.message).toContain('already logged');
        });

        it('should extract call detail id from AlreadyLoggedException Location header', async () => {
            nock(apiBase)
                .post('/calldetails')
                .reply(500, 'AlreadyLoggedException', { Location: `${apiBase}/calldetails/id/9876` });

            const result = await vinsolutions.createCallLog({
                user: mockUser,
                contactInfo: createMockContact({ id: 501, name: 'Jane Buyer' }),
                authHeader,
                callLog: createMockCallLog({ sessionId: 'session-already-logged' }),
                hashedAccountId: 'hash-1'
            });

            expect(result.logId).toBe('9876');
            expect(result.returnMessage.messageType).toBe('success');
        });

        it('should post call details to VinSolutions', async () => {
            nock(apiBase)
                .post('/calldetails')
                .matchHeader('api_key', 'call-api-key')
                .matchHeader('content-type', 'application/vnd.coxauto.v1+json')
                .reply(201, {}, { Location: `${apiBase}/calldetails/id/4321` });

            const result = await vinsolutions.createCallLog({
                user: mockUser,
                contactInfo: createMockContact({ id: 501, name: 'Jane Buyer' }),
                authHeader,
                callLog: createMockCallLog(),
                additionalSubmission: { leads: 9001 },
                composedLogDetails: 'Discussed test drive',
                hashedAccountId: 'hash-1'
            });

            expect(result.logId).toBe('4321');
            expect(result.returnMessage.messageType).toBe('success');
        });
    });

    describe('getCallLog', () => {
        it('should retrieve call details by id', async () => {
            nock(apiBase)
                .get('/calldetails/id/4321')
                .query({
                    accountId: '2002',
                    providerName: 'RingCentral'
                })
                .matchHeader('api_key', 'call-api-key')
                .reply(200, {
                    callDetailId: 4321,
                    callDirection: 'OUTBOUND',
                    transcriptShort: 'Discussed test drive',
                    marketingSource: 'RingCentral',
                    vinProperties: {
                        contactId: 501,
                        leadId: 9001
                    }
                });

            nock(apiBase)
                .get('/gateway/v1/contact')
                .query(true)
                .reply(200, [{
                    ContactId: 501,
                    ContactInformation: {
                        FirstName: 'Jane',
                        LastName: 'Buyer'
                    }
                }]);

            const result = await vinsolutions.getCallLog({
                user: mockUser,
                callLogId: '4321',
                contactId: 501,
                authHeader
            });

            expect(result.callLogInfo.subject).toBe('Outbound call');
            expect(result.callLogInfo.note).toBe('Discussed test drive');
            expect(result.callLogInfo.contactName).toBe('Jane Buyer');
            expect(result.callLogInfo.dispositions.leads).toBe(9001);
        });

        it('should extract only the Note value from composed log details', async () => {
            nock(apiBase)
                .get('/calldetails/id/4321')
                .query({
                    accountId: '2002',
                    providerName: 'RingCentral'
                })
                .matchHeader('api_key', 'call-api-key')
                .reply(200, {
                    callDetailId: 4321,
                    callDirection: 'OUTBOUND',
                    transcriptShort: '- Note: Test With Sushil\n- Session Id: 546916939049\n- RingCentral user name: Sushil Mall\n- Summary: ',
                    vinProperties: {
                        contactId: 501
                    }
                });

            nock(apiBase)
                .get('/gateway/v1/contact')
                .query(true)
                .reply(200, [{
                    ContactId: 501,
                    ContactInformation: {
                        FirstName: 'Jane',
                        LastName: 'Buyer'
                    }
                }]);

            const result = await vinsolutions.getCallLog({
                user: mockUser,
                callLogId: '4321',
                contactId: 501,
                authHeader
            });

            expect(result.callLogInfo.note).toBe('Test With Sushil');
            expect(result.callLogInfo.fullBody).toContain('Session Id: 546916939049');
        });

    });

    describe('updateCallLog', () => {
        it('should patch an existing call detail record', async () => {
            nock(apiBase)
                .patch('/calldetails/id/4321', {
                    providerName: 'RingCentral',
                    transcriptFull: 'Updated notes',
                    callDurationSeconds: 420,
                    vinProperties: {
                        dealerId: 2002
                    }
                })
                .matchHeader('api_key', 'call-api-key')
                .matchHeader('content-type', 'application/vnd.coxauto.v1+json')
                .reply(204);

            const result = await vinsolutions.updateCallLog({
                user: mockUser,
                existingCallLog: { thirdPartyLogId: '4321' },
                authHeader,
                duration: 420,
                composedLogDetails: 'Updated notes',
                hashedAccountId: 'hash-1'
            });

            expect(result.returnMessage.messageType).toBe('success');
            expect(result.updatedNote).toBe('Updated notes');
        });
    });

    describe('checkAndRefreshAccessToken', () => {
        it('should refresh expired lead management and call tracking tokens', async () => {
            const expiredUser = {
                ...mockUser,
                platformAdditionalInfo: {
                    ...mockUser.platformAdditionalInfo,
                    vinsLeadManagementAccessToken: accessToken,
                    vinsLeadManagementTokenExpiry: new Date(Date.now() - 60000).toISOString(),
                    vinsCallTrackingAccessToken: 'call-tracking-token',
                    vinsCallTrackingTokenExpiry: new Date(Date.now() - 60000).toISOString()
                },
                save: jest.fn().mockResolvedValue(true)
            };
            mockBothTokenRequests();

            const refreshedUser = await vinsolutions.checkAndRefreshAccessToken(null, expiredUser);

            expect(refreshedUser.platformAdditionalInfo.vinsLeadManagementAccessToken).toBe(accessToken);
            expect(refreshedUser.platformAdditionalInfo.vinsCallTrackingAccessToken).toBe('call-tracking-token');
            expect(expiredUser.save).toHaveBeenCalled();
        });
    });

    describe('postSaveUserInfo', () => {
        it('should persist tokens in platformAdditionalInfo after login', async () => {
            const save = jest.fn().mockResolvedValue(true);
            const userRecord = {
                id: '1001-2002-vinsolutions',
                accessToken: connectedSentinel,
                platformAdditionalInfo: {},
                refreshToken: '',
                save
            };
            UserModel.findByPk.mockResolvedValue(userRecord);

            await vinsolutions.postSaveUserInfo({
                userInfo: {
                    id: '1001-2002-vinsolutions',
                    overridingApiKey: connectedSentinel,
                    platformAdditionalInfo: {
                        vinsLeadManagementAccessToken: accessToken,
                        vinsLeadManagementTokenExpiry: '2099-01-01T00:00:00.000Z',
                        vinsCallTrackingAccessToken: 'call-tracking-token',
                        vinsCallTrackingTokenExpiry: '2099-01-01T00:00:00.000Z'
                    }
                }
            });

            expect(save).toHaveBeenCalled();
            expect(userRecord.platformAdditionalInfo.vinsLeadManagementAccessToken).toBe(accessToken);
            expect(userRecord.platformAdditionalInfo.vinsCallTrackingAccessToken).toBe('call-tracking-token');
        });
    });
});
