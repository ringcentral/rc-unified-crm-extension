jest.mock('axios', () => ({
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn()
}));

const axios = require('axios');
const netsuite = require('../../src/connectors/netsuite');

describe('NetSuite contact creation branches', () => {
    const authHeader = 'Bearer netsuite-token';
    const user = {
        hostname: '1234567.suitetalk.api.netsuite.com',
        platformAdditionalInfo: {
            oneWorldEnabled: true,
            subsidiaryId: 10
        }
    };

    beforeEach(() => {
        jest.clearAllMocks();
        jest.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    test('creates a placeholder company before creating a contact when no placeholder exists', async () => {
        axios.post
            .mockResolvedValueOnce({
                data: {
                    count: 0,
                    items: []
                }
            })
            .mockResolvedValueOnce({
                headers: {
                    location: 'https://example.com/services/rest/record/v1/customer/9000'
                }
            })
            .mockResolvedValueOnce({
                headers: {
                    location: 'https://example.com/services/rest/record/v1/contact/9001'
                }
            });

        const result = await netsuite.createContact({
            user,
            authHeader,
            phoneNumber: '+14155551234',
            newContactName: 'Chris Middle Contact',
            newContactType: 'contact'
        });

        expect(axios.post).toHaveBeenNthCalledWith(
            2,
            'https://1234567.suitetalk.api.netsuite.com/services/rest/record/v1/customer',
            {
                companyName: 'RingCentral_CRM_Extension_Placeholder_Company',
                entityId: 'RingCentral_CRM_Extension_Placeholder_Company',
                comments: "This company was created automatically by the RingCentral App Connect. Feel free to edit, or associate this company's contacts to more appropriate records.",
                subsidiary: { id: 10 }
            },
            {
                headers: { Authorization: authHeader, 'Content-Type': 'application/json' }
            }
        );
        expect(axios.post).toHaveBeenNthCalledWith(
            3,
            'https://1234567.suitetalk.api.netsuite.com/services/rest/record/v1/contact',
            {
                firstName: 'Chris',
                middleName: 'Middle',
                lastName: 'Contact',
                phone: '+14155551234',
                company: { id: '9000' },
                subsidiary: { id: 10 }
            },
            {
                headers: { Authorization: authHeader, 'Content-Type': 'application/json' }
            }
        );
        expect(result).toMatchObject({
            contactInfo: {
                id: '9001',
                name: 'Chris Middle Contact'
            },
            returnMessage: {
                messageType: 'success'
            }
        });
    });

    test('creates a lead using the first active lead customer status', async () => {
        axios.post
            .mockResolvedValueOnce({
                data: {
                    items: [
                        { id: 101, name: 'Qualified Lead' }
                    ]
                }
            })
            .mockResolvedValueOnce({
                headers: {
                    location: 'https://example.com/services/rest/record/v1/customer/9101'
                }
            });

        const result = await netsuite.createContact({
            user,
            authHeader,
            phoneNumber: '+14155559876',
            newContactName: 'Lena Lead',
            newContactType: 'lead'
        });

        expect(axios.post).toHaveBeenNthCalledWith(
            1,
            'https://1234567.suitetalk.api.netsuite.com/services/rest/query/v1/suiteql',
            {
                q: "SELECT id, name FROM CustomerStatus WHERE stage = 'LEAD' AND isinactive = 'F' ORDER BY id ASC"
            },
            {
                headers: { Authorization: authHeader, 'Content-Type': 'application/json', Prefer: 'transient' }
            }
        );
        expect(axios.post).toHaveBeenNthCalledWith(
            2,
            'https://1234567.suitetalk.api.netsuite.com/services/rest/record/v1/customer',
            {
                isPerson: true,
                firstName: 'Lena',
                middleName: '',
                lastName: 'Lead',
                entityId: 'Lena Lead',
                phone: '+14155559876',
                entityStatus: { id: 101 },
                subsidiary: { id: '10' }
            },
            {
                headers: { Authorization: authHeader, 'Content-Type': 'application/json' }
            }
        );
        expect(result.contactInfo.id).toBe('9101');
        expect(result.returnMessage.message).toBe('Lead created');
    });

    test('returns a warning when no active lead customer status exists', async () => {
        axios.post.mockResolvedValueOnce({
            data: {
                items: []
            }
        });

        const result = await netsuite.createContact({
            user,
            authHeader,
            phoneNumber: '+14155559876',
            newContactName: 'No Status',
            newContactType: 'lead'
        });

        expect(result).toMatchObject({
            contactInfo: {
                id: 0,
                name: 'No Status'
            },
            returnMessage: {
                message: 'No lead customer status found',
                messageType: 'warning'
            }
        });
    });

    test('maps NetSuite lead creation errors into the return message', async () => {
        axios.post
            .mockResolvedValueOnce({
                data: {
                    items: [
                        { id: 101, name: 'Qualified Lead' }
                    ]
                }
            })
            .mockRejectedValueOnce({
                response: {
                    data: {
                        'o:errorDetails': [
                            { detail: 'Lead permission missing' },
                            { detail: 'Duplicate entity' }
                        ]
                    }
                }
            });

        const result = await netsuite.createContact({
            user,
            authHeader,
            phoneNumber: '+14155559876',
            newContactName: 'Blocked Lead',
            newContactType: 'lead'
        });

        expect(result).toMatchObject({
            contactInfo: {
                id: 0,
                name: 'Blocked Lead'
            },
            returnMessage: {
                message: 'Lead permission missing Duplicate entity',
                messageType: 'warning'
            }
        });
    });

    test('creates a prospect using the first active prospect customer status', async () => {
        const prospectUser = {
            ...user,
            platformAdditionalInfo: {
                oneWorldEnabled: false
            }
        };
        axios.post
            .mockResolvedValueOnce({
                data: {
                    items: [
                        { id: 202, name: 'Qualified Prospect' }
                    ]
                }
            })
            .mockResolvedValueOnce({
                headers: {
                    location: 'https://example.com/services/rest/record/v1/customer/9201'
                }
            });

        const result = await netsuite.createContact({
            user: prospectUser,
            authHeader,
            phoneNumber: '+14155550000',
            newContactName: 'Pat Prospect',
            newContactType: 'prospect'
        });

        expect(axios.post).toHaveBeenNthCalledWith(
            2,
            'https://1234567.suitetalk.api.netsuite.com/services/rest/record/v1/customer',
            {
                isPerson: true,
                firstName: 'Pat',
                middleName: '',
                lastName: 'Prospect',
                entityId: 'Pat Prospect',
                phone: '+14155550000',
                entityStatus: { id: 202 }
            },
            {
                headers: { Authorization: authHeader, 'Content-Type': 'application/json' }
            }
        );
        expect(result.contactInfo.id).toBe('9201');
        expect(result.returnMessage.message).toBe('Prospect created');
    });

    test('returns a warning when no active prospect customer status exists', async () => {
        axios.post.mockResolvedValueOnce({
            data: {}
        });

        const result = await netsuite.createContact({
            user,
            authHeader,
            phoneNumber: '+14155550000',
            newContactName: 'Missing Prospect Status',
            newContactType: 'prospect'
        });

        expect(result).toMatchObject({
            contactInfo: {
                id: 0,
                name: 'Missing Prospect Status'
            },
            returnMessage: {
                message: 'No prospect customer status found',
                messageType: 'warning'
            }
        });
    });

    test('maps NetSuite prospect creation errors into the return message', async () => {
        axios.post
            .mockResolvedValueOnce({
                data: {
                    items: [
                        { id: 202, name: 'Qualified Prospect' }
                    ]
                }
            })
            .mockRejectedValueOnce({
                response: {
                    data: {
                        'o:errorDetails': [
                            { detail: 'Prospect permission missing' }
                        ]
                    }
                }
            });

        const result = await netsuite.createContact({
            user,
            authHeader,
            phoneNumber: '+14155550000',
            newContactName: 'Blocked Prospect',
            newContactType: 'prospect'
        });

        expect(result).toMatchObject({
            contactInfo: {
                id: 0,
                name: 'Blocked Prospect'
            },
            returnMessage: {
                message: 'Prospect permission missing',
                messageType: 'warning'
            }
        });
    });

    test('updateCallLog attaches a long transcript file after updating the phone call', async () => {
        const longTranscript = 'transcript '.repeat(500);
        const composedLogDetails = `- Note: Long call\n- Transcript:\nold transcript\n--- END\n${'x'.repeat(3600)}`;
        axios.patch.mockResolvedValueOnce({});
        axios.get.mockResolvedValueOnce({
            data: {
                success: false,
                message: 'No folder found with name App Connect Phone Calls'
            }
        });
        axios.post
            .mockResolvedValueOnce({
                data: {
                    folderId: 3001
                }
            })
            .mockResolvedValueOnce({
                data: {
                    fileId: 3002
                }
            })
            .mockResolvedValueOnce({});

        const result = await netsuite.updateCallLog({
            user: {
                ...user,
                userSettings: {
                    addCallLogDateTime: { value: false }
                }
            },
            existingCallLog: {
                thirdPartyLogId: '4001'
            },
            authHeader,
            subject: 'Long Transcript Call',
            note: 'Long call',
            transcript: longTranscript,
            composedLogDetails
        });

        expect(result.returnMessage.messageType).toBe('success');
        expect(axios.get).toHaveBeenCalledWith(
            'https://1234567.restlets.api.netsuite.com/app/site/hosting/restlet.nl?script=customscript_getappconnectfolderbyname&deploy=customdeploy_getappconnectfolderbyname&name=App Connect Phone Calls',
            {
                headers: { Authorization: authHeader, 'Content-Type': 'application/json' }
            }
        );
        expect(axios.post).toHaveBeenNthCalledWith(
            2,
            'https://1234567.restlets.api.netsuite.com/app/site/hosting/restlet.nl?script=customscript_createappconnectfile&deploy=customdeploy_createappconnectfile',
            {
                folderId: 3001,
                fileName: 'Long Transcript Call 4001',
                content: longTranscript,
                note: 'This file was generated via RingCentral App Connect'
            },
            {
                headers: { Authorization: authHeader, 'Content-Type': 'application/json' }
            }
        );
        expect(axios.post).toHaveBeenNthCalledWith(
            3,
            'https://1234567.restlets.api.netsuite.com/app/site/hosting/restlet.nl?script=customscript_attachfilewithphonecalls&deploy=customdeploy_attachfilewithphonecalls',
            {
                phoneCallId: '4001',
                fileId: 3002
            },
            {
                headers: { Authorization: authHeader, 'Content-Type': 'application/json' }
            }
        );
    });

    test('updateCallLog attaches a long transcript file to an existing folder', async () => {
        const longTranscript = 'transcript '.repeat(500);
        const composedLogDetails = `- Note: Long call\n- Transcript:\nold transcript\n--- END\n${'x'.repeat(3600)}`;
        axios.patch.mockResolvedValueOnce({});
        axios.get.mockResolvedValueOnce({
            data: {
                success: true,
                results: [{ id: 3003 }]
            }
        });
        axios.post
            .mockResolvedValueOnce({
                data: {
                    fileId: 3004
                }
            })
            .mockResolvedValueOnce({});

        const result = await netsuite.updateCallLog({
            user: {
                ...user,
                userSettings: {
                    addCallLogDateTime: { value: false }
                }
            },
            existingCallLog: {
                thirdPartyLogId: '4002'
            },
            authHeader,
            subject: 'Existing Folder Call',
            note: 'Long call',
            transcript: longTranscript,
            composedLogDetails
        });

        expect(result.returnMessage.messageType).toBe('success');
        expect(axios.post).toHaveBeenNthCalledWith(
            1,
            'https://1234567.restlets.api.netsuite.com/app/site/hosting/restlet.nl?script=customscript_createappconnectfile&deploy=customdeploy_createappconnectfile',
            expect.objectContaining({
                folderId: 3003,
                fileName: 'Existing Folder Call 4002',
                content: longTranscript
            }),
            {
                headers: { Authorization: authHeader, 'Content-Type': 'application/json' }
            }
        );
        expect(axios.post).toHaveBeenNthCalledWith(
            2,
            'https://1234567.restlets.api.netsuite.com/app/site/hosting/restlet.nl?script=customscript_attachfilewithphonecalls&deploy=customdeploy_attachfilewithphonecalls',
            {
                phoneCallId: '4002',
                fileId: 3004
            },
            {
                headers: { Authorization: authHeader, 'Content-Type': 'application/json' }
            }
        );
    });

    test('updateCallLog skips file upload when the folder lookup returns no usable folder', async () => {
        const longTranscript = 'transcript '.repeat(500);
        const composedLogDetails = `- Note: Long call\n- Transcript:\nold transcript\n--- END\n${'x'.repeat(3600)}`;
        axios.patch.mockResolvedValueOnce({});
        axios.get.mockResolvedValueOnce({
            data: {
                success: true,
                results: []
            }
        });

        const result = await netsuite.updateCallLog({
            user: {
                ...user,
                userSettings: {
                    addCallLogDateTime: { value: false }
                }
            },
            existingCallLog: {
                thirdPartyLogId: '4003'
            },
            authHeader,
            subject: 'No Folder Call',
            note: 'Long call',
            transcript: longTranscript,
            composedLogDetails
        });

        expect(result.returnMessage.messageType).toBe('success');
        expect(axios.post).not.toHaveBeenCalled();
    });

    test('createAppointment falls back to fetched timezone when offset is missing', async () => {
        axios.get
            .mockResolvedValueOnce({
                data: {
                    userTimezone: 'America/New_York'
                }
            })
            .mockResolvedValueOnce({
                data: {
                    id: 5001,
                    title: 'Fetched Timezone',
                    message: '<p>With timezone</p>',
                    startDate: '2026-07-20',
                    startTime: '15:00:00',
                    endTime: '16:15:00',
                    status: 'CONFIRMED'
                }
            });
        axios.post.mockResolvedValueOnce({
            headers: {
                location: 'https://example.com/services/rest/record/v1/calendarEvent/5001'
            }
        });

        const result = await netsuite.createAppointment({
            user: {
                hostname: user.hostname
            },
            authHeader,
            payload: {
                title: 'Fetched Timezone',
                summary: 'With timezone',
                startTimeUtc: '2026-07-20T19:00:00.000Z',
                durationMinutes: 75,
                contacts: [
                    { id: 101 },
                    102
                ]
            }
        });

        expect(axios.post).toHaveBeenCalledWith(
            'https://1234567.suitetalk.api.netsuite.com/services/rest/record/v1/calendarEvent',
            expect.objectContaining({
                startDate: '2026-07-20',
                startTime: '15:00:00',
                endTime: '16:15:00',
                attendee: {
                    items: [
                        { attendee: { id: 101 } },
                        { attendee: { id: 102 } }
                    ]
                }
            }),
            {
                headers: { Authorization: authHeader, 'Content-Type': 'application/json' }
            }
        );
        expect(result.appointment).toMatchObject({
            id: '5001',
            title: 'Fetched Timezone',
            durationMinutes: 75
        });
    });

    test('createAppointment falls back to UTC when timezone lookup fails', async () => {
        axios.get
            .mockRejectedValueOnce(new Error('timezone unavailable'))
            .mockResolvedValueOnce({
                data: {
                    id: 5002,
                    title: 'UTC Fallback',
                    startDate: '2026-07-20',
                    startTime: '19:00:00',
                    endTime: '19:30:00'
                }
            });
        axios.post.mockResolvedValueOnce({
            headers: {
                location: 'https://example.com/services/rest/record/v1/calendarEvent/5002'
            }
        });

        const result = await netsuite.createAppointment({
            user: {
                hostname: user.hostname,
                timezoneOffset: ''
            },
            authHeader,
            payload: {
                title: 'UTC Fallback',
                startTimeUtc: '2026-07-20T19:00:00.000Z',
                durationMinutes: 30
            }
        });

        expect(axios.post).toHaveBeenCalledWith(
            'https://1234567.suitetalk.api.netsuite.com/services/rest/record/v1/calendarEvent',
            expect.objectContaining({
                startDate: '2026-07-20',
                startTime: '19:00:00',
                endTime: '19:30:00'
            }),
            {
                headers: { Authorization: authHeader, 'Content-Type': 'application/json' }
            }
        );
        expect(result.appointment.id).toBe('5002');
    });

    test('listAppointments returns mapped NetSuite error details on fetch failure', async () => {
        axios.get.mockRejectedValueOnce({
            response: {
                data: {
                    'o:errorDetails': [
                        { detail: 'Calendar restlet failed' }
                    ]
                }
            }
        });

        await expect(netsuite.listAppointments({
            user,
            authHeader
        })).resolves.toEqual({
            successful: false,
            returnMessage: {
                messageType: 'warning',
                message: 'Calendar restlet failed',
                ttl: 60000
            }
        });
    });

    test('updateAppointment fetches timezone and maps NetSuite patch error details', async () => {
        axios.get.mockRejectedValueOnce(new Error('timezone lookup failed'));
        axios.patch.mockRejectedValueOnce({
            response: {
                data: {
                    'o:errorDetails': [
                        { detail: 'Calendar patch failed' }
                    ]
                }
            }
        });

        await expect(netsuite.updateAppointment({
            user: {
                hostname: user.hostname
            },
            authHeader,
            appointmentId: '6001',
            patchBody: {
                title: 'Patch Fails',
                summary: 'Patch body',
                startTimeUtc: '2026-07-20T19:00:00.000Z',
                durationMinutes: 45,
                status: 'cancelled',
                contacts: [
                    { id: 901 },
                    { id: '' }
                ]
            }
        })).resolves.toEqual({
            successful: false,
            returnMessage: {
                messageType: 'warning',
                message: 'Calendar patch failed',
                ttl: 60000
            }
        });
        expect(axios.patch).toHaveBeenCalledWith(
            'https://1234567.suitetalk.api.netsuite.com/services/rest/record/v1/calendarEvent/6001?replace=attendee',
            expect.objectContaining({
                status: { id: 'CANCELLED' },
                attendee: {
                    items: [
                        { attendee: { id: '901' } }
                    ]
                }
            }),
            {
                headers: { Authorization: authHeader, 'Content-Type': 'application/json' }
            }
        );
    });

    test('confirmAppointment and cancelAppointment map NetSuite errors', async () => {
        axios.patch
            .mockRejectedValueOnce({
                response: {
                    data: {
                        'o:errorDetails': [
                            { detail: 'Confirm failed' }
                        ]
                    }
                }
            })
            .mockRejectedValueOnce({
                response: {
                    data: {
                        'o:errorDetails': [
                            { detail: 'Cancel failed' }
                        ]
                    }
                }
            });

        await expect(netsuite.confirmAppointment({
            user,
            authHeader,
            appointmentId: '7001'
        })).resolves.toEqual({
            successful: false,
            returnMessage: {
                messageType: 'warning',
                message: 'Confirm failed',
                ttl: 60000
            }
        });

        await expect(netsuite.cancelAppointment({
            user,
            authHeader,
            appointmentId: '7002'
        })).resolves.toEqual({
            successful: false,
            returnMessage: {
                messageType: 'warning',
                message: 'Cancel failed',
                ttl: 60000
            }
        });
    });

    test('getUserInfo parses callback parameters and skips subsidiary permission when OneWorld is off', async () => {
        const query = {
            hostname: user.hostname,
            callbackUri: 'https://ringcentral.github.io/ringcentral-embeddable/redirect.html?entity=42&company=1234567&role=3'
        };
        axios.get
            .mockResolvedValueOnce({
                data: {
                    id: 'current-user',
                    name: 'NetSuite User',
                    email: 'user@example.com',
                    subsidiary: ''
                }
            })
            .mockResolvedValueOnce({
                data: {
                    oneWorldEnabled: false
                }
            });
        axios.post.mockResolvedValueOnce({
            data: {
                permissionResults: {
                    LIST_CONTACT: true,
                    REPO_ANALYTICS: true,
                    TRAN_SALESORD: true,
                    LIST_CUSTJOB: true,
                    ADMI_LOGIN_OAUTH2: true,
                    ADMI_RESTWEBSERVICES: true,
                    LIST_CALL: true,
                    LIST_SUBSIDIARY: false
                }
            }
        });

        const result = await netsuite.getUserInfo({ authHeader, query });

        expect(result.successful).toBe(true);
        expect(result.platformUserInfo).toMatchObject({
            id: '42-1234567-netsuite',
            name: 'NetSuite User'
        });
        expect(result.platformUserInfo.platformAdditionalInfo.oneWorldEnabled).toBe(false);
        expect(query).toMatchObject({
            entity: '42',
            company: '1234567',
            role: '3'
        });
    });

    test('getUserInfo returns warning when required callback parameters are missing', async () => {
        axios.get
            .mockResolvedValueOnce({
                data: {
                    id: 'current-user',
                    name: 'NetSuite User',
                    email: 'user@example.com',
                    subsidiary: 10
                }
            })
            .mockResolvedValueOnce({
                data: {
                    oneWorldEnabled: true
                }
            });
        axios.post.mockResolvedValueOnce({
            data: {
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
            }
        });

        const result = await netsuite.getUserInfo({
            authHeader,
            query: {
                hostname: user.hostname
            }
        });

        expect(result).toMatchObject({
            successful: false,
            returnMessage: {
                messageType: 'warning',
                message: 'Missing required NetSuite parameters (entity or company). Please try reconnecting to NetSuite.'
            }
        });
    });

    test('createMessageLog logs shared SMS against sales order and swallows user note failures', async () => {
        axios.post
            .mockResolvedValueOnce({
                headers: {
                    location: 'https://example.com/services/rest/record/v1/phonecall/8101'
                }
            })
            .mockRejectedValueOnce(new Error('sales order note failed'));

        const result = await netsuite.createMessageLog({
            user,
            contactInfo: {
                id: '4501',
                type: 'custjob',
                name: 'Acme Customer',
                phoneNumber: '+14155551234'
            },
            sharedSMSLogContent: {
                subject: 'Shared SMS thread',
                body: 'Shared SMS body'
            },
            authHeader,
            message: {
                creationTime: '2026-07-20T19:00:00.000Z',
                direction: 'Outbound',
                subject: 'Ignored for shared body'
            },
            additionalSubmission: {
                salesorder: '9901'
            }
        });

        expect(result.logId).toBe('8101');
        expect(result.returnMessage.messageType).toBe('success');
        expect(axios.post).toHaveBeenNthCalledWith(
            1,
            'https://1234567.suitetalk.api.netsuite.com/services/rest/record/v1/phonecall',
            expect.objectContaining({
                title: 'Shared SMS thread',
                message: 'Shared SMS body',
                company: { id: '4501' }
            }),
            {
                headers: { Authorization: authHeader }
            }
        );
        expect(axios.post).toHaveBeenNthCalledWith(
            2,
            'https://1234567.restlets.api.netsuite.com/app/site/hosting/restlet.nl?script=customscript_createusernotes&deploy=customdeploy_createusernotes',
            {
                salesOrderId: '9901',
                noteTitle: 'Shared SMS thread',
                noteText: 'Shared SMS body'
            },
            {
                headers: { Authorization: authHeader }
            }
        );
    });

    test('createMessageLog includes correspondents and contact company for normal SMS', async () => {
        axios.get.mockResolvedValueOnce({
            data: {
                company: {
                    id: '3301'
                }
            }
        });
        axios.post.mockResolvedValueOnce({
            headers: {
                location: 'https://example.com/services/rest/record/v1/phonecall/8102'
            }
        });

        const result = await netsuite.createMessageLog({
            user: {
                ...user,
                dataValues: {
                    platformAdditionalInfo: {
                        name: 'Agent Smith'
                    }
                }
            },
            contactInfo: {
                id: '2201',
                type: 'CONTACT',
                name: 'John Doe',
                phoneNumber: '+14155551234'
            },
            correspondents: [
                [{ name: 'Jane Smith' }],
                [{}]
            ],
            authHeader,
            message: {
                creationTime: '2026-07-20T19:00:00.000Z',
                direction: 'Inbound',
                subject: 'Hello there'
            }
        });

        expect(result.logId).toBe('8102');
        expect(axios.post).toHaveBeenCalledWith(
            'https://1234567.suitetalk.api.netsuite.com/services/rest/record/v1/phonecall',
            expect.objectContaining({
                contact: { id: '2201' },
                company: { id: '3301' },
                message: expect.stringContaining('Jane Smith')
            }),
            {
                headers: { Authorization: authHeader }
            }
        );
        expect(axios.post.mock.calls[0][1].message).toContain('Unknown');
    });

    test('getCallLog and message log mutations map NetSuite errors', async () => {
        axios.get.mockRejectedValueOnce({
            response: {
                data: {
                    'o:errorDetails': [
                        { detail: 'Load phone call failed' }
                    ]
                }
            }
        });

        const callLogResult = await netsuite.getCallLog({
            user,
            callLogId: '8101',
            authHeader
        });
        expect(callLogResult.returnMessage).toMatchObject({
            messageType: 'warning',
            message: 'Load phone call failed'
        });

        axios.post.mockRejectedValueOnce({
            response: {
                data: {
                    'o:errorDetails': [
                        { detail: 'Create message failed' }
                    ]
                }
            }
        });
        const createMessageResult = await netsuite.createMessageLog({
            user,
            contactInfo: {
                id: '4501',
                type: 'custjob',
                name: 'Acme Customer',
                phoneNumber: '+14155551234'
            },
            authHeader,
            message: {
                creationTime: '2026-07-20T19:00:00.000Z',
                direction: 'Outbound',
                subject: 'Will fail'
            }
        });
        expect(createMessageResult.returnMessage).toMatchObject({
            messageType: 'warning',
            message: 'Create message failed'
        });

        axios.patch.mockRejectedValueOnce({
            response: {
                data: {
                    'o:errorDetails': [
                        { detail: 'Update message failed' }
                    ]
                }
            }
        });
        const updateMessageResult = await netsuite.updateMessageLog({
            user,
            contactInfo: {
                id: '4501',
                type: 'custjob',
                name: 'Acme Customer',
                phoneNumber: '+14155551234'
            },
            sharedSMSLogContent: {
                body: 'Updated shared body'
            },
            existingMessageLog: {
                thirdPartyLogId: '8101'
            },
            message: {
                creationTime: '2026-07-20T19:00:00.000Z',
                direction: 'Outbound',
                subject: 'Will fail'
            },
            authHeader
        });
        expect(updateMessageResult.returnMessage).toMatchObject({
            messageType: 'warning',
            message: 'Update message failed'
        });
    });
});

export {};
