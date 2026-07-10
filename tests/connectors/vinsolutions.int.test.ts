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
const { AdminConfigModel } = require('@app-connect/core/models/adminConfigModel');

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
                    items: [{
                        leadId: 9001,
                        leadStatus: 'ACTIVE_NEW_LEAD',
                        leadSource: { leadSourceName: 'Internet' }
                    }]
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

    describe('createMessageLog', () => {
        it('should create a lead when none is selected', async () => {
            nock(apiBase)
                .get('/leadSources')
                .query({ dealerId: 2002, limit: 100 })
                .matchHeader('api_key', 'lead-api-key')
                .reply(200, {
                    items: [{ href: `${apiBase}/leadSources/id/77` }]
                });

            nock(apiBase)
                .post('/leads', (body) => (
                    body.leadSource === `${apiBase}/leadSources/id/77`
                    && body.leadType === 'INTERNET'
                    && typeof body.contact === 'string'
                ))
                .matchHeader('content-type', 'application/vnd.coxauto.v3+json')
                .reply(200, { leadId: 9500 });

            nock(apiBase)
                .put('/leads/id/9500', (body) => (
                    typeof body.notes === 'string'
                    && body.notes.includes('SMS conversation with Jane Buyer')
                ))
                .matchHeader('api_key', 'lead-api-key')
                .reply(200, {});

            const result = await vinsolutions.createMessageLog({
                user: mockUser,
                contactInfo: createMockContact({ id: 501, name: 'Jane Buyer', phoneNumber: '+15551234567' }),
                authHeader,
                message: {
                    id: 'msg-1',
                    subject: 'Hello there',
                    direction: 'Outbound',
                    creationTime: new Date('2026-07-02T20:00:00Z')
                },
                additionalSubmission: {}
            });

            expect(result.logId).toBe('9500');
            expect(result.returnMessage.messageType).toBe('success');
        });

        it('should write SMS notes to the selected lead', async () => {
            nock(apiBase)
                .put('/leads/id/9001', (body) => (
                    body.isHot === false
                    && body.coBuyerContact === null
                    && body.trades === null
                    && body.vehiclesOfInterest === null
                    && typeof body.notes === 'string'
                    && body.notes.includes('SMS conversation with Jane Buyer')
                    && body.notes.includes('Hello there')
                ))
                .matchHeader('api_key', 'lead-api-key')
                .matchHeader('content-type', 'application/vnd.coxauto.v3+json')
                .reply(200, {});

            const result = await vinsolutions.createMessageLog({
                user: mockUser,
                contactInfo: createMockContact({ id: 501, name: 'Jane Buyer', phoneNumber: '+15551234567' }),
                authHeader,
                message: {
                    id: 'msg-1',
                    subject: 'Hello there',
                    direction: 'Outbound',
                    creationTime: new Date('2026-07-02T20:00:00Z')
                },
                additionalSubmission: { leads: 9001 }
            });

            expect(result.logId).toBe('9001');
            expect(result.returnMessage.messageType).toBe('success');
        });
    });

    describe('updateMessageLog', () => {
        it('should append a new SMS entry to the lead notes', async () => {
            nock(apiBase)
                .get('/leads/id/9001')
                .query({ dealerId: 2002, userId: 1001 })
                .matchHeader('api_key', 'lead-api-key')
                .matchHeader('accept', 'application/vnd.coxauto.v3+json')
                .reply(200, {
                    leadId: 9001,
                    notes: 'Existing SMS note'
                });

            nock(apiBase)
                .put('/leads/id/9001', (body) => (
                    body.notes.includes('Existing SMS note')
                    && body.notes.includes('Follow up message')
                ))
                .matchHeader('api_key', 'lead-api-key')
                .matchHeader('content-type', 'application/vnd.coxauto.v3+json')
                .reply(200, {});

            const result = await vinsolutions.updateMessageLog({
                user: mockUser,
                contactInfo: createMockContact({ id: 501, name: 'Jane Buyer', phoneNumber: '+15551234567' }),
                existingMessageLog: { thirdPartyLogId: '9001' },
                authHeader,
                message: {
                    id: 'msg-2',
                    subject: 'Follow up message',
                    direction: 'Inbound',
                    creationTime: new Date('2026-07-02T21:00:00Z')
                },
                additionalSubmission: { leads: 9001 }
            });

            expect(result.returnMessage).toBeUndefined();
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

            const refreshedUser: any = await vinsolutions.checkAndRefreshAccessToken(null, expiredUser);

            expect(refreshedUser.platformAdditionalInfo.vinsLeadManagementAccessToken).toBe(accessToken);
            expect(refreshedUser.platformAdditionalInfo.vinsCallTrackingAccessToken).toBe('call-tracking-token');
            expect(expiredUser.save).toHaveBeenCalled();
        });
    });

    describe('refreshUserInfo', () => {
        it('should report success when both tokens are still valid', async () => {
            const result = await vinsolutions.refreshUserInfo({ user: mockUser });

            expect(result.successful).toBe(true);
            expect(result.returnMessage.messageType).toBe('success');
        });

        it('should warn when a token cannot be renewed', async () => {
            const expiredUser = {
                ...mockUser,
                platformAdditionalInfo: {
                    ...mockUser.platformAdditionalInfo,
                    vinsLeadManagementTokenExpiry: new Date(Date.now() - 60000).toISOString(),
                    vinsCallTrackingTokenExpiry: new Date(Date.now() - 60000).toISOString()
                }
            };

            nock(tokenUri).post('/connect/token').reply(500, {});

            const result = await vinsolutions.refreshUserInfo({ user: expiredUser });

            expect(result.successful).toBe(false);
            expect(result.returnMessage.messageType).toBe('warning');
        });
    });

    describe('postSaveUserInfo', () => {
        it('should persist tokens in platformAdditionalInfo after login', async () => {
            const save = jest.fn().mockResolvedValue(true);
            const userRecord: any = {
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

    describe('additional branch coverage', () => {
        it('should expose log format and oauth metadata', async () => {
            expect(vinsolutions.getLogFormatType()).toBe('text/plain');

            const info = await vinsolutions.getOauthInfo();

            expect(info).toEqual({
                clientId: 'lead-client-id',
                clientSecret: 'lead-client-secret',
                accessTokenUri: 'https://authentication.vinsolutions.com/connect/token'
            });
        });

        it('should throw when required OAuth client credentials are missing', async () => {
            delete process.env.VINSOLUTIONS_LEAD_MANAGEMENT_CLIENT_SECRET;

            await expect(vinsolutions.getOauthInfo()).rejects.toThrow(
                'VinSolutions leadManagement OAuth credentials are not configured'
            );
        });

        it('should return the user unchanged when token refresh has nothing to do', async () => {
            await expect(vinsolutions.checkAndRefreshAccessToken(null, null)).resolves.toBeNull();

            const userWithoutTokens: any = {
                platformAdditionalInfo: {},
                save: jest.fn()
            };
            await expect(vinsolutions.checkAndRefreshAccessToken(null, userWithoutTokens)).resolves.toBe(userWithoutTokens);
            expect(userWithoutTokens.save).not.toHaveBeenCalled();
        });

        it('should return null when token renewal fails', async () => {
            const expiredUser = {
                ...mockUser,
                platformAdditionalInfo: {
                    ...mockUser.platformAdditionalInfo,
                    vinsLeadManagementAccessToken: accessToken,
                    vinsLeadManagementTokenExpiry: new Date(Date.now() - 60000).toISOString()
                },
                save: jest.fn()
            };
            nock(tokenUri)
                .post('/connect/token')
                .reply(500, { message: 'token unavailable' });

            await expect(vinsolutions.checkAndRefreshAccessToken(null, expiredUser)).resolves.toBeNull();
        });

        it('should leave partially configured valid tokens unchanged', async () => {
            const partialTokenUser = {
                ...mockUser,
                platformAdditionalInfo: {
                    vinsLeadManagementAccessToken: accessToken,
                    vinsLeadManagementTokenExpiry: new Date(Date.now() + 3600000).toISOString()
                },
                save: jest.fn()
            };

            await expect(vinsolutions.checkAndRefreshAccessToken(null, partialTokenUser)).resolves.toBe(partialTokenUser);
            expect(partialTokenUser.save).not.toHaveBeenCalled();
        });

        it('should return a warning when getUserInfo cannot fetch tokens', async () => {
            const result = await vinsolutions.getUserInfo({
                additionalInfo: {
                    dealerId: '2002',
                    crmUserId: '1001'
                }
            });

            expect(result.successful).toBe(false);
            expect(result.returnMessage.message).toContain('Could not connect to VinSolutions');
        });

        it('should connect with split user names and no matching dealer name', async () => {
            mockBothTokenRequests({
                leadAccessToken: 'fresh-lead-token',
                vinsCallTrackingAccessToken: 'fresh-call-token'
            });
            nock(apiBase)
                .get('/gateway/v1/tenant/user/id/1001')
                .query({ dealerId: 2002 })
                .reply(200, {
                    FirstName: 'Alex',
                    LastName: 'Fallback'
                });
            nock(apiBase)
                .get('/gateway/v1/organization/dealers')
                .reply(200, {
                    Items: [{ DealerId: 9999, Name: 'Other Dealer' }]
                });

            const result = await vinsolutions.getUserInfo({
                additionalInfo: {
                    dealerId: '2002',
                    crmUserId: '1001'
                }
            });

            expect(result.successful).toBe(true);
            expect(result.platformUserInfo.name).toBe('Alex Fallback');
            expect(result.platformUserInfo.platformAdditionalInfo.dealerName).toBe('');
            expect(result.platformUserInfo.platformAdditionalInfo.email).toBe('');
            expect(result.returnMessage.message).toBe('Connected to VinSolutions.');
        });

        it('should return userInfo unchanged when postSaveUserInfo cannot find a user', async () => {
            UserModel.findByPk.mockResolvedValue(null);
            const userInfo = { id: 'missing-vinsolutions', platformAdditionalInfo: { dealerId: 2002 } };

            await expect(vinsolutions.postSaveUserInfo({ userInfo })).resolves.toBe(userInfo);
        });

        it('should swallow save errors in postSaveUserInfo', async () => {
            const userRecord: any = {
                platformAdditionalInfo: {},
                save: jest.fn().mockRejectedValue(new Error('database unavailable'))
            };
            UserModel.findByPk.mockResolvedValue(userRecord);

            await expect(vinsolutions.postSaveUserInfo({
                userInfo: {
                    id: '1001-2002-vinsolutions',
                    platformAdditionalInfo: { dealerId: 2002 }
                }
            })).resolves.toMatchObject({
                id: '1001-2002-vinsolutions'
            });
            expect(userRecord.platformAdditionalInfo.dealerId).toBe(2002);
        });

        it('should clear all VinSolutions tokens on logout', async () => {
            const result = await vinsolutions.unAuthorize({ user: mockUser });

            expect(result.returnMessage.messageType).toBe('success');
            expect(mockUser.accessToken).toBe('');
            expect(mockUser.platformAdditionalInfo.vinsLeadManagementAccessToken).toBe('');
            expect(mockUser.platformAdditionalInfo.vinsCallTrackingAccessToken).toBe('');
            expect(mockUser.save).toHaveBeenCalled();
        });

        it('should return no matches for extension lookup and warning on lookup failure', async () => {
            await expect(vinsolutions.findContact({
                user: mockUser,
                phoneNumber: '101',
                isExtension: 'true'
            })).resolves.toEqual({ successful: false, matchedContactInfo: [] });

            nock(apiBase)
                .get('/gateway/v1/contact')
                .query(true)
                .reply(500, { message: 'lookup failed' });

            const result = await vinsolutions.findContact({
                user: mockUser,
                phoneNumber: '+14155552671'
            });

            expect(result.successful).toBe(false);
            expect(result.returnMessage.message).toBe('Contact lookup failed in VinSolutions.');
        });

        it('should support overriding phone formats during contact lookup', async () => {
            nock(apiBase)
                .persist()
                .get('/gateway/v1/contact')
                .query(true)
                .reply(200, []);

            const result = await vinsolutions.findContact({
                user: mockUser,
                phoneNumber: '+14155552671',
                overridingFormat: '###-###-####,(###) ###-####'
            });

            expect(result.successful).toBe(true);
            expect(result.matchedContactInfo).toEqual([
                {
                    id: 'createNewContact',
                    name: 'Create new contact...',
                    isNewContact: true
                }
            ]);
        });

        it('should create a single-name contact with default customer last name and fallback contact id path', async () => {
            nock(apiBase)
                .post('/gateway/v1/contact', (body) => (
                    body.ContactInformation.FirstName === 'Cher'
                    && body.ContactInformation.LastName === 'Customer'
                    && body.ContactInformation.Phones[0].Number === 'not-a-phone'
                ))
                .matchHeader('api_key', 'lead-api-key')
                .reply(201, { ContactInformation: { ContactId: 779 } });

            const result = await vinsolutions.createContact({
                user: mockUser,
                phoneNumber: 'not-a-phone',
                newContactName: 'Cher'
            });

            expect(result.contactInfo).toEqual({
                id: 779,
                name: 'Cher'
            });
        });

        it('should find contacts by name and tolerate lead lookup failures', async () => {
            nock(apiBase)
                .get('/gateway/v1/contact')
                .query(true)
                .reply(200, [
                    {
                        ContactId: 888,
                        ContactInformation: {
                            CompanyName: 'Acme Motors',
                            Phones: [
                                { PhoneType: 'Home', Number: '5550001111' }
                            ]
                        }
                    }
                ]);
            nock(apiBase)
                .get('/leads')
                .query(true)
                .reply(500, { message: 'lead lookup failed' });

            const result = await vinsolutions.findContactWithName({
                user: mockUser,
                name: 'Acme Motors'
            });

            expect(result.successful).toBe(true);
            expect(result.matchedContactInfo).toEqual([
                {
                    id: 888,
                    name: 'Acme Motors',
                    phone: '5550001111',
                    additionalInfo: null,
                    type: 'contact'
                }
            ]);
        });

        it('should return warning when name lookup fails', async () => {
            nock(apiBase)
                .get('/gateway/v1/contact')
                .query(true)
                .reply(500, { message: 'name lookup failed' });

            const result = await vinsolutions.findContactWithName({
                user: mockUser,
                name: 'Jane Buyer'
            });

            expect(result.successful).toBe(false);
            expect(result.returnMessage.message).toBe('Name search failed in VinSolutions.');
        });

        it('should load user list and ignore users without email', async () => {
            nock(apiBase)
                .get('/gateway/v1/tenant/user')
                .query({ dealerId: 2002 })
                .reply(200, [
                    { UserId: 1, FullName: 'Full Name', EmailAddress: 'full@example.com' },
                    { UserId: 2, FirstName: 'Split', LastName: 'Name', EmailAddress: 'split@example.com' },
                    { UserId: 3, FullName: 'No Email' }
                ]);

            await expect(vinsolutions.getUserList({ user: mockUser })).resolves.toEqual([
                { id: 1, name: 'Full Name', email: 'full@example.com' },
                { id: 2, name: 'Split Name', email: 'split@example.com' }
            ]);
        });

        it('should return empty user list when VinSolutions user lookup fails', async () => {
            nock(apiBase)
                .get('/gateway/v1/tenant/user')
                .query(true)
                .reply(500, { message: 'tenant unavailable' });

            await expect(vinsolutions.getUserList({ user: mockUser })).resolves.toEqual([]);
        });

        it('should map voicemail result and return error response on createCallLog failure', async () => {
            nock(apiBase)
                .post('/calldetails', body => body.callResult === 'LEFT_MESSAGE')
                .reply(201, {}, { Location: `${apiBase}/calldetails/id/2468` });

            const success = await vinsolutions.createCallLog({
                user: mockUser,
                contactInfo: createMockContact({ id: 501, name: 'Jane Buyer' }),
                callLog: createMockCallLog({ result: 'Left voicemail', duration: 0 }),
                composedLogDetails: 'Left a message',
                hashedAccountId: 'hash-1'
            });

            expect(success.logId).toBe('2468');

            nock(apiBase)
                .post('/calldetails')
                .reply(403, { message: 'provider disabled' });

            const failure = await vinsolutions.createCallLog({
                user: mockUser,
                contactInfo: createMockContact({ id: 501, name: 'Jane Buyer' }),
                callLog: createMockCallLog({ result: 'Busy' }),
                composedLogDetails: 'Could not connect',
                hashedAccountId: 'hash-1'
            });

            expect(failure.logId).toBeNull();
            expect(failure.returnMessage.messageType).toBe('error');
        });

        it('should create inbound pending-duration call logs with fallback numbers and ids', async () => {
            nock(apiBase)
                .post('/calldetails', (body) => (
                    body.callDirection === 'INBOUND'
                    && body.fromNumber === '101'
                    && body.toNumber === ''
                    && body.callDurationSeconds === 0
                    && body.providerReferenceId === 'call-id-1'
                    && !('leadId' in body.vinProperties)
                ))
                .reply(201, {}, { Location: `${apiBase}/calldetails/id/3579` });

            const result = await vinsolutions.createCallLog({
                user: mockUser,
                contactInfo: createMockContact({ id: 501, name: 'Jane Buyer' }),
                callLog: {
                    id: 'call-id-1',
                    direction: 'Inbound',
                    startTime: '2026-07-09T00:00:00Z',
                    duration: 'pending',
                    from: { extensionId: '101' },
                    to: {},
                    result: 'Connected',
                    recordingLink: 'https://recording.example.com/1'
                },
                composedLogDetails: '',
                hashedAccountId: 'hash-1'
            });

            expect(result.logId).toBe('3579');
        });

        it('should map generic call log details without a related contact lookup', async () => {
            nock(apiBase)
                .get('/calldetails/id/9999')
                .query({
                    accountId: '2002',
                    providerName: 'RingCentral'
                })
                .reply(200, {
                    callDetailId: 9999,
                    callDirection: 'SIDEWAYS',
                    transcriptFull: 'Free form CRM note',
                    vinProperties: {}
                });

            const result = await vinsolutions.getCallLog({
                user: mockUser,
                callLogId: '9999'
            });

            expect(result.callLogInfo).toMatchObject({
                subject: 'Phone call',
                note: 'Free form CRM note',
                fullBody: 'Free form CRM note',
                contactName: '',
                dispositions: {}
            });
        });

        it('should map inbound call details with empty contact results and structured notes', async () => {
            nock(apiBase)
                .get('/calldetails/id/1000')
                .query({
                    accountId: '2002',
                    providerName: 'RingCentral'
                })
                .reply(200, {
                    callDetailId: 1000,
                    callDirection: 'INBOUND',
                    transcriptFull: '- Summary: no explicit note',
                    vinProperties: {
                        contactId: 501
                    }
                });
            nock(apiBase)
                .get('/gateway/v1/contact')
                .query({
                    dealerId: 2002,
                    userId: 1001,
                    contactId: 501,
                    pageSize: 1
                })
                .reply(200, []);

            const result = await vinsolutions.getCallLog({
                user: mockUser,
                callLogId: '1000'
            });

            expect(result.callLogInfo).toMatchObject({
                subject: 'Inbound call',
                note: '',
                contactName: ''
            });
        });

        it('should treat object AlreadyLoggedException responses as success', async () => {
            nock(apiBase)
                .post('/calldetails')
                .reply(500, { message: 'AlreadyLoggedException: duplicate call' }, { Location: `${apiBase}/calldetails/id/2222` });

            const result = await vinsolutions.createCallLog({
                user: mockUser,
                contactInfo: createMockContact({ id: 501, name: 'Jane Buyer' }),
                callLog: createMockCallLog({ sessionId: 'session-already-logged-object' }),
                hashedAccountId: 'hash-1'
            });

            expect(result.logId).toBe('2222');
            expect(result.returnMessage.messageType).toBe('success');
        });

        it('should write shared SMS content directly to the selected lead', async () => {
            nock(apiBase)
                .put('/leads/id/9001', (body) => body.notes === 'Shared SMS transcript')
                .reply(200, {});

            const result = await vinsolutions.createMessageLog({
                user: mockUser,
                contactInfo: createMockContact({ id: 501, name: 'Jane Buyer' }),
                sharedSMSLogContent: { body: 'Shared SMS transcript' },
                message: {
                    subject: 'Ignored body',
                    direction: 'Outbound',
                    creationTime: new Date('2026-07-02T20:00:00Z')
                },
                additionalSubmission: { leads: 9001 }
            });

            expect(result.logId).toBe('9001');
            expect(result.returnMessage.messageType).toBe('success');
        });

        it.each([
            ['voicemail', { recordingLink: 'https://recording.example.com/1' }, 'Voicemail left by Jane Buyer'],
            ['fax', { faxDocLink: 'https://fax.example.com/1' }, 'Fax document from Jane Buyer']
        ])('should compose %s notes for selected leads', async (_name, linkArgs, expectedText) => {
            nock(apiBase)
                .put('/leads/id/9001', (body) => (
                    typeof body.notes === 'string'
                    && body.notes.includes(expectedText)
                ))
                .reply(200, {});

            const result = await vinsolutions.createMessageLog({
                user: mockUser,
                contactInfo: createMockContact({ id: 501, name: 'Jane Buyer' }),
                message: {
                    subject: 'Message body',
                    direction: 'Inbound',
                    creationTime: new Date('2026-07-02T20:00:00Z')
                },
                additionalSubmission: { leads: 9001 },
                ...linkArgs
            });

            expect(result.returnMessage.messageType).toBe('success');
        });

        it('should return an error when no lead source exists for automatic lead creation', async () => {
            nock(apiBase)
                .get('/leadSources')
                .query({ dealerId: 2002, limit: 100 })
                .reply(200, { items: [] });

            const result = await vinsolutions.createMessageLog({
                user: mockUser,
                contactInfo: createMockContact({ id: 501, name: 'Jane Buyer' }),
                message: {
                    subject: 'Hello',
                    direction: 'Outbound',
                    creationTime: new Date('2026-07-02T20:00:00Z')
                },
                additionalSubmission: {}
            });

            expect(result.logId).toBeNull();
            expect(result.returnMessage.messageType).toBe('error');
        });

        it('should cover updateMessageLog warning, shared body, empty notes, and failure paths', async () => {
            await expect(vinsolutions.updateMessageLog({
                user: mockUser,
                existingMessageLog: {},
                additionalSubmission: {}
            })).resolves.toMatchObject({
                returnMessage: {
                    message: 'Lead ID not found for message log update.',
                    messageType: 'warning'
                }
            });

            nock(apiBase)
                .put('/leads/id/9001', (body) => body.notes === 'Updated shared transcript')
                .reply(200, {});
            await expect(vinsolutions.updateMessageLog({
                user: mockUser,
                existingMessageLog: { thirdPartyLogId: '9001' },
                sharedSMSLogContent: { body: 'Updated shared transcript' }
            })).resolves.toEqual({});

            nock(apiBase)
                .get('/leads/id/9002')
                .query({ dealerId: 2002, userId: 1001 })
                .reply(200, {});
            nock(apiBase)
                .put('/leads/id/9002', (body) => (
                    typeof body.notes === 'string'
                    && body.notes.includes('SMS conversation with Jane Buyer')
                ))
                .reply(200, {});
            await expect(vinsolutions.updateMessageLog({
                user: mockUser,
                contactInfo: createMockContact({ id: 501, name: 'Jane Buyer' }),
                existingMessageLog: { thirdPartyLogId: '9002' },
                message: {
                    subject: 'Fresh thread',
                    direction: 'Outbound',
                    creationTime: new Date('2026-07-02T20:00:00Z')
                }
            })).resolves.toEqual({});

            nock(apiBase)
                .get('/leads/id/9003')
                .query(true)
                .reply(500, { message: 'lead unavailable' });
            const failed = await vinsolutions.updateMessageLog({
                user: mockUser,
                existingMessageLog: { thirdPartyLogId: '9003' },
                message: {
                    subject: 'Failure path',
                    direction: 'Inbound',
                    creationTime: new Date('2026-07-02T20:00:00Z')
                }
            });

            expect(failed.returnMessage.messageType).toBe('error');
        });

        it('should cover updateCallLog missing id, nothing to update, lead assignment, and failure', async () => {
            await expect(vinsolutions.updateCallLog({
                user: mockUser,
                existingCallLog: {},
                hashedAccountId: 'hash-1'
            })).resolves.toMatchObject({
                returnMessage: {
                    message: 'Call log ID not found.',
                    messageType: 'warning'
                }
            });

            await expect(vinsolutions.updateCallLog({
                user: mockUser,
                existingCallLog: { thirdPartyLogId: '4321' },
                hashedAccountId: 'hash-1'
            })).resolves.toMatchObject({
                returnMessage: {
                    message: 'Nothing to update.',
                    messageType: 'success'
                }
            });

            AdminConfigModel.findByPk.mockResolvedValue({
                userMappings: [
                    { rcExtensionId: ['ext-2'], crmUserId: 8080 }
                ]
            });
            nock(apiBase)
                .patch('/calldetails/id/4321', body => (
                    body.vinProperties.userId === 8080
                    && body.vinProperties.leadId === 9001
                    && body.callDurationSeconds === 123
                    && body.callResult === undefined
                ))
                .reply(204);

            const assigned = await vinsolutions.updateCallLog({
                user: mockUser,
                existingCallLog: { thirdPartyLogId: '4321' },
                duration: 123,
                additionalSubmission: {
                    isAssignedToUser: true,
                    adminAssignedUserRcId: 'ext-2',
                    leads: 9001
                },
                hashedAccountId: 'hash-1'
            });

            expect(assigned.returnMessage.messageType).toBe('success');

            nock(apiBase)
                .patch('/calldetails/id/5000')
                .reply(500, { message: 'patch failed' });

            const failed = await vinsolutions.updateCallLog({
                user: mockUser,
                existingCallLog: { thirdPartyLogId: '5000' },
                duration: 10,
                hashedAccountId: 'hash-1'
            });

            expect(failed.returnMessage.messageType).toBe('error');
        });

        it('should throw when the OAuth client id is missing and reject login without dealer id', async () => {
            delete process.env.VINSOLUTIONS_LEAD_MANAGEMENT_CLIENT_ID;

            await expect(vinsolutions.getOauthInfo()).rejects.toThrow(
                'VinSolutions leadManagement OAuth credentials are not configured'
            );

            const result = await vinsolutions.getUserInfo({
                additionalInfo: {
                    crmUserId: '1001'
                }
            });

            expect(result.successful).toBe(false);
            expect(result.returnMessage.message).toContain('required');
        });

        it('should refresh missing stored tokens and use token response defaults', async () => {
            const userWithoutStoredTokens: any = {
                ...mockUser,
                platformAdditionalInfo: null,
                save: jest.fn().mockResolvedValue(true)
            };
            nock(tokenUri)
                .post('/connect/token')
                .twice()
                .reply(200, {
                    access_token: 'defaulted-token'
                });

            const result = await vinsolutions.refreshUserInfo({ user: userWithoutStoredTokens });

            expect(result.successful).toBe(true);
            expect(userWithoutStoredTokens.platformAdditionalInfo.vinsLeadManagementAccessToken).toBe('defaulted-token');
            expect(userWithoutStoredTokens.platformAdditionalInfo.vinsCallTrackingAccessToken).toBe('defaulted-token');
            expect(userWithoutStoredTokens.save).toHaveBeenCalledTimes(2);
        });

        it('should refresh a single expired configured token and skip missing token profiles', async () => {
            const partialExpiredUser: any = {
                ...mockUser,
                platformAdditionalInfo: {
                    vinsLeadManagementAccessToken: 'expired-lead-token',
                    vinsLeadManagementTokenExpiry: new Date(Date.now() - 60000).toISOString()
                },
                save: jest.fn().mockResolvedValue(true)
            };
            mockTokenRequest({ tokenType: 'leadManagement', accessTokenValue: 'fresh-lead-token' });

            const result = await vinsolutions.checkAndRefreshAccessToken(null, partialExpiredUser);

            expect(result).toBe(partialExpiredUser);
            expect(partialExpiredUser.platformAdditionalInfo.vinsLeadManagementAccessToken).toBe('fresh-lead-token');
            expect(partialExpiredUser.save).toHaveBeenCalledTimes(1);
        });

        it('should connect with token defaults, empty dealer list, and empty user display fields', async () => {
            nock(tokenUri)
                .post('/connect/token')
                .twice()
                .reply(200, {
                    access_token: 'token-with-defaults'
                });
            nock(apiBase)
                .get('/gateway/v1/tenant/user/id/1001')
                .query({ dealerId: 2002 })
                .reply(200, {});
            nock(apiBase)
                .get('/gateway/v1/organization/dealers')
                .reply(200, {});

            const result = await vinsolutions.getUserInfo({
                additionalInfo: {
                    dealerId: '2002',
                    crmUserId: '1001'
                }
            });

            expect(result.successful).toBe(true);
            expect(result.platformUserInfo.name).toBe('');
            expect(result.platformUserInfo.platformAdditionalInfo.dealerName).toBe('');
            expect(result.platformUserInfo.platformAdditionalInfo.email).toBe('');
        });

        it('should format fallback contacts and lead results during phone lookup', async () => {
            nock(apiBase)
                .get('/gateway/v1/contact')
                .query({
                    dealerId: 2002,
                    userId: 1001,
                    phone: 'lookup',
                    pageSize: 100
                })
                .reply(200, [
                    {
                        ContactId: 999,
                        ContactInformation: {
                            Phones: [
                                {
                                    PhoneType: 'Work',
                                    Number: '5550002222'
                                }
                            ]
                        }
                    }
                ]);
            nock(apiBase)
                .get('/leads')
                .query({
                    dealerId: 2002,
                    userId: 1001,
                    contactId: 999,
                    limit: 100
                })
                .reply(200, {
                    results: [
                        {
                            leadId: 9100,
                            leadStatusType: 'ACTIVE'
                        }
                    ]
                });

            const result = await vinsolutions.findContact({
                user: mockUser,
                phoneNumber: 'lookup'
            });

            expect(result.successful).toBe(true);
            expect(result.matchedContactInfo[0]).toMatchObject({
                id: 999,
                name: 'Contact 999',
                phone: '5550002222',
                additionalInfo: {
                    leads: [
                        {
                            const: 9100,
                            title: 'Lead #9100 (ACTIVE)'
                        }
                    ]
                }
            });
        });

        it('should search by first name only when no last name is supplied', async () => {
            nock(apiBase)
                .get('/gateway/v1/contact')
                .query((query) => (
                    query.dealerId === '2002'
                    && query.userId === '1001'
                    && query.firstName === 'Cher'
                    && !('lastName' in query)
                ))
                .reply(200, null);

            const result = await vinsolutions.findContactWithName({
                user: mockUser,
                name: 'Cher'
            });

            expect(result).toEqual({
                successful: true,
                matchedContactInfo: []
            });
        });

        it('should create a default no-answer call log without optional ids or recordings', async () => {
            nock(apiBase)
                .post('/calldetails', (body) => (
                    body.callResult === 'NO_ANSWER'
                    && body.fromNumber === ''
                    && body.toNumber === ''
                    && body.recordingHref === ''
                    && body.providerReferenceId === ''
                ))
                .reply(201, {});

            const result = await vinsolutions.createCallLog({
                user: mockUser,
                contactInfo: createMockContact({ id: 501, name: 'Jane Buyer' }),
                callLog: {
                    direction: 'Outbound',
                    startTime: '2026-07-09T00:00:00Z',
                    duration: 0,
                    from: {},
                    to: {},
                    result: ''
                },
                hashedAccountId: 'hash-1'
            });

            expect(result.logId).toBeNull();
            expect(result.returnMessage.messageType).toBe('success');
        });

        it('should resolve admin assigned user from token during call log update', async () => {
            UserModel.findByPk.mockResolvedValue({
                platformAdditionalInfo: {
                    crmUserId: 7070
                }
            });
            nock(apiBase)
                .patch('/calldetails/id/7000', (body) => (
                    body.vinProperties.userId === 7070
                    && body.vinProperties.leadId === 9004
                    && body.transcriptFull === 'Assigned update'
                ))
                .reply(204);

            const result = await vinsolutions.updateCallLog({
                user: mockUser,
                existingCallLog: { thirdPartyLogId: '7000' },
                composedLogDetails: 'Assigned update',
                additionalSubmission: {
                    isAssignedToUser: true,
                    adminAssignedUserToken: 'encoded-token',
                    leads: 9004
                },
                hashedAccountId: 'hash-1'
            });

            expect(result.returnMessage.messageType).toBe('success');
        });

        it('should include correspondent names in composed SMS notes', async () => {
            nock(apiBase)
                .put('/leads/id/9005', (body) => (
                    body.notes.includes('Participants: Alex Agent, Jane Buyer, Co Buyer, Manager')
                    && body.notes.includes('Conversation (1 message):')
                ))
                .reply(200, {});

            const result = await vinsolutions.createMessageLog({
                user: {
                    ...mockUser,
                    name: 'Alex Agent'
                },
                contactInfo: createMockContact({ id: 501, name: 'Jane Buyer' }),
                correspondents: [
                    [{ name: 'Co Buyer' }],
                    { name: 'Manager' }
                ],
                message: {
                    subject: 'See you soon',
                    direction: 'Outbound',
                    creationTime: new Date('2026-07-02T20:00:00Z')
                },
                additionalSubmission: { leads: 9005 }
            });

            expect(result.returnMessage.messageType).toBe('success');
        });
    });
});

export {};
