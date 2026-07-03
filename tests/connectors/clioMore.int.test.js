jest.mock('axios', () => ({
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn()
}));

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

const axios = require('axios');
const clio = require('../../src/connectors/clio');

describe('Clio connector additional mocked coverage', () => {
    const authHeader = 'Bearer clio-token';
    const rateHeaders = {
        'x-ratelimit-remaining': '99',
        'x-ratelimit-limit': '100',
        'x-ratelimit-reset': '123'
    };
    const user = {
        id: '100-clio',
        hostname: 'app.clio.com',
        timezoneOffset: '-04:00',
        userSettings: {}
    };
    const contactInfo = {
        id: 501,
        name: 'Alice Client',
        phone: '+14155551234',
        phoneNumber: '+14155551234',
        type: 'Contact'
    };
    const message = {
        id: 'sms-1',
        direction: 'Outbound',
        creationTime: '2026-07-20T19:00:00.000Z',
        subject: 'SMS body',
        typingDurationMs: 12000
    };

    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('refreshUserInfo and regional OAuth metadata return expected values', async () => {
        process.env.CLIO_AU_CLIENT_ID = 'au-id';
        process.env.CLIO_AU_CLIENT_SECRET = 'au-secret';
        process.env.CLIO_EU_CLIENT_ID = 'eu-id';
        process.env.CLIO_EU_CLIENT_SECRET = 'eu-secret';
        process.env.CLIO_CA_CLIENT_ID = 'ca-id';
        process.env.CLIO_CA_CLIENT_SECRET = 'ca-secret';
        process.env.CLIO_CLIENT_ID = 'us-id';
        process.env.CLIO_CLIENT_SECRET = 'us-secret';

        await expect(clio.refreshUserInfo({ user, authHeader })).resolves.toMatchObject({
            successful: true,
            returnMessage: {
                message: 'User info refreshed'
            }
        });
        await expect(clio.getOauthInfo({ hostname: 'au.app.clio.com' })).resolves.toMatchObject({
            clientId: 'au-id',
            accessTokenUri: 'https://au.app.clio.com/oauth/token'
        });
        await expect(clio.getOauthInfo({ hostname: 'eu.app.clio.com' })).resolves.toMatchObject({
            clientId: 'eu-id',
            accessTokenUri: 'https://eu.app.clio.com/oauth/token'
        });
        await expect(clio.getOauthInfo({ hostname: 'ca.app.clio.com' })).resolves.toMatchObject({
            clientId: 'ca-id',
            accessTokenUri: 'https://ca.app.clio.com/oauth/token'
        });
        await expect(clio.getOauthInfo({ hostname: 'app.clio.com', isFromMCP: true })).resolves.toMatchObject({
            clientId: 'us-id',
            redirectUri: 'https://ringcentral.github.io/ringcentral-embeddable/redirect.html'
        });
    });

    test('findContactWithName sorts contacts with email before contacts without email', async () => {
        axios.get
            .mockResolvedValueOnce({
                headers: rateHeaders,
                data: {
                    data: [
                        { id: 1, name: 'No Email', primary_phone_number: '+1' },
                        { id: 2, name: 'Has Email', primary_email_address: 'has@example.com', primary_phone_number: '+2' },
                        { id: 3, name: 'Blank Email', primary_email_address: '', primary_phone_number: '+3' }
                    ]
                }
            })
            .mockResolvedValue({ headers: rateHeaders, data: { data: [] } });

        const result = await clio.findContactWithName({
            user,
            authHeader,
            name: 'Email'
        });

        expect(result.successful).toBe(true);
        expect(result.matchedContactInfo.map(c => c.id)).toEqual([2, 1, 3]);
    });

    test('createContact and getUserList map Clio responses with rate-limit metadata', async () => {
        axios.post.mockResolvedValueOnce({
            headers: rateHeaders,
            data: {
                data: {
                    id: 777,
                    name: 'Created Contact'
                }
            }
        });

        await expect(clio.createContact({
            user,
            authHeader,
            phoneNumber: '+14155550000',
            newContactName: 'Created Contact',
            newContactType: 'Company'
        })).resolves.toMatchObject({
            contactInfo: {
                id: 777,
                name: 'Created Contact'
            },
            extraDataTracking: {
                ratelimitRemaining: '99'
            }
        });

        axios.get.mockResolvedValueOnce({
            data: {
                data: [
                    { id: 1, name: 'Named User', email: 'named@example.com' },
                    { id: 2, first_name: 'Split', last_name: 'User', email: 'split@example.com' }
                ]
            }
        });

        await expect(clio.getUserList({ user, authHeader })).resolves.toEqual([
            { id: 1, name: 'Named User', email: 'named@example.com' },
            { id: 2, name: 'Split User', email: 'split@example.com' }
        ]);
    });

    test('createCallLog returns after communication write when time entries are disabled by string setting', async () => {
        axios.post.mockResolvedValueOnce({
            headers: rateHeaders,
            data: {
                data: {
                    id: 8801
                }
            }
        });

        const result = await clio.createCallLog({
            user: {
                ...user,
                userSettings: {
                    clioTimeEntriesEnabled: { value: 'false' }
                }
            },
            contactInfo,
            authHeader,
            callLog: {
                direction: 'Outbound',
                startTime: '2026-07-20T19:00:00.000Z',
                duration: 60,
                sessionId: 'call-1'
            },
            additionalSubmission: null,
            composedLogDetails: '',
            hashedAccountId: 'hash-1'
        });

        expect(result).toMatchObject({
            logId: 8801,
            returnMessage: {
                message: 'Call logged'
            }
        });
        expect(axios.post).toHaveBeenCalledTimes(1);
        expect(axios.post.mock.calls[0][1].data.body).toBe('No details available');
    });

    test('createCallLog creates a Clio time entry with billable status and matter', async () => {
        axios.post
            .mockResolvedValueOnce({
                headers: rateHeaders,
                data: {
                    data: {
                        id: 8802
                    }
                }
            })
            .mockResolvedValueOnce({
                headers: rateHeaders,
                data: {
                    data: {
                        id: 9901
                    }
                }
            });

        const result = await clio.createCallLog({
            user,
            contactInfo,
            authHeader,
            callLog: {
                direction: 'Inbound',
                startTime: '2026-07-20T19:00:00.000Z',
                duration: 90,
                sessionId: 'call-2'
            },
            additionalSubmission: {
                billableStatus: 'billable',
                matters: 444
            },
            composedLogDetails: 'Call body',
            hashedAccountId: 'hash-1'
        });

        expect(result.logId).toBe(8802);
        expect(axios.post).toHaveBeenNthCalledWith(
            2,
            'https://app.clio.com/api/v4/activities.json',
            expect.objectContaining({
                data: expect.objectContaining({
                    quantity: 90,
                    non_billable: false,
                    matter: { id: 444 }
                })
            }),
            { headers: { Authorization: authHeader } }
        );
    });

    test('createMessageLog creates SMS time entry with minimum duration and non-billable setting', async () => {
        axios.get.mockResolvedValueOnce({
            data: {
                data: {
                    name: 'Clio User'
                }
            }
        });
        axios.post
            .mockResolvedValueOnce({
                headers: rateHeaders,
                data: {
                    data: {
                        id: 8810
                    }
                }
            })
            .mockResolvedValueOnce({
                headers: rateHeaders,
                data: {
                    data: {
                        id: 9902
                    }
                }
            });

        const result = await clio.createMessageLog({
            user: {
                ...user,
                userSettings: {
                    smsTimeTrackingEnabled: { value: true },
                    smsTimeTrackingMinimumDuration: { value: '45' },
                    smsTimeTrackingDefaultBillable: { value: 'non-billable' }
                }
            },
            contactInfo,
            authHeader,
            message,
            additionalSubmission: {
                matters: 555
            }
        });

        expect(result.logId).toBe(8810);
        expect(axios.post).toHaveBeenNthCalledWith(
            2,
            'https://app.clio.com/api/v4/activities.json',
            expect.objectContaining({
                data: expect.objectContaining({
                    quantity: 45,
                    non_billable: true,
                    matter: { id: 555 },
                    communication: { id: 8810 }
                })
            }),
            { headers: { Authorization: authHeader } }
        );
    });
});
