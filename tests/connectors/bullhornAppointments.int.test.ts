jest.mock('axios', () => ({
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn()
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

jest.mock('@app-connect/core/models/accountDataModel', () => ({
    AccountDataModel: {
        findByPk: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue({})
    },
    getOrRefreshAccountData: jest.fn().mockResolvedValue(['Call', 'Meeting'])
}));

jest.mock('@app-connect/core/lib/encode', () => ({
    encode: jest.fn(value => `encoded:${value}`),
    decoded: jest.fn(value => value?.replace('encoded:', '') || '')
}));

jest.mock('@app-connect/core/models/dynamo/lockSchema', () => ({
    Lock: {
        create: jest.fn(),
        get: jest.fn()
    }
}));

const axios = require('axios');
const bullhorn = require('../../src/connectors/bullhorn');

describe('Bullhorn appointment connector', () => {
    const restUrl = 'https://rest-test.bullhornstaffing.com/rest-services/corp/';
    const loginUrl = 'https://rest-test.bullhornstaffing.com/rest-services/corp';
    let user;

    beforeEach(() => {
        jest.clearAllMocks();
        jest.spyOn(console, 'log').mockImplementation(() => {});
        user = {
            id: '12345-bullhorn',
            accessToken: 'access-token',
            refreshToken: 'refresh-token',
            timezoneOffset: '+00:00',
            platformAdditionalInfo: {
                id: 321,
                restUrl,
                loginUrl,
                bhRestToken: 'bh-token',
                tokenUrl: 'https://auth.bullhornstaffing.com/oauth/token'
            },
            save: jest.fn().mockResolvedValue(true)
        };
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    test('listAppointments fetches Bullhorn appointments and dedupes attendees', async () => {
        axios.get
            .mockResolvedValueOnce({
                data: {
                    data: [
                        {
                            id: 101,
                            subject: 'Candidate Screen',
                            description: 'Talk through resume',
                            dateBegin: Date.parse('2026-07-20T15:00:00.000Z'),
                            dateEnd: Date.parse('2026-07-20T15:45:00.000Z'),
                            isDeleted: false,
                            candidateReference: { id: 501 }
                        },
                        {
                            id: 102,
                            subject: 'Lead Follow-up',
                            description: 'Pipeline review',
                            dateBegin: Date.parse('2026-07-21T16:00:00.000Z'),
                            dateEnd: Date.parse('2026-07-21T16:30:00.000Z'),
                            isDeleted: false,
                            lead: { id: 701 }
                        },
                        {
                            subject: 'Missing id'
                        }
                    ]
                }
            })
            .mockResolvedValueOnce({
                data: {
                    data: [
                        {
                            id: 1,
                            appointment: { id: 101 },
                            attendee: { id: 601, firstName: 'Alice', lastName: 'Able', _subtype: 'CorporateUser' },
                            acceptanceStatus: 'ACCEPTED'
                        },
                        {
                            id: 2,
                            appointment: { id: 101 },
                            attendee: { id: 601, firstName: 'Alice', lastName: 'Able', _subtype: 'CorporateUser' }
                        },
                        {
                            id: 3,
                            appointment: { id: 102 },
                            attendee: { id: 602, firstName: 'Bob', lastName: 'Baker', type: 'Candidate' }
                        },
                        {
                            id: 4,
                            appointment: {},
                            attendee: { id: 603 }
                        }
                    ]
                }
            });

        const result = await bullhorn.listAppointments({ user });

        expect(result.appointments).toEqual([
            {
                thirdPartyAppointmentId: '101',
                id: '101',
                title: 'Candidate Screen',
                description: 'Talk through resume',
                participantName: '',
                startTimeUtc: '2026-07-20T15:00:00.000Z',
                durationMinutes: 45,
                status: 'scheduled',
                contactId: '501',
                contactType: 'Candidate',
                attendeeIds: [],
                attendees: [
                    { id: '601', name: 'Alice Able', type: 'CorporateUser', status: 'ACCEPTED' }
                ]
            },
            {
                thirdPartyAppointmentId: '102',
                id: '102',
                title: 'Lead Follow-up',
                description: 'Pipeline review',
                participantName: '',
                startTimeUtc: '2026-07-21T16:00:00.000Z',
                durationMinutes: 30,
                status: 'scheduled',
                contactId: '701',
                contactType: 'Lead',
                attendeeIds: [],
                attendees: [
                    { id: '602', name: 'Bob Baker', type: 'Candidate' }
                ]
            }
        ]);
        expect(axios.get).toHaveBeenNthCalledWith(
            2,
            `${restUrl}query/AppointmentAttendee`,
            expect.objectContaining({
                params: expect.objectContaining({
                    where: 'appointment.id IN (101,102)'
                })
            })
        );
    });

    test('listAppointments returns a warning when Bullhorn query fails', async () => {
        axios.get.mockRejectedValueOnce({ response: { status: 500 } });

        await expect(bullhorn.listAppointments({ user })).resolves.toEqual({
            successful: false,
            returnMessage: {
                messageType: 'warning',
                message: 'Error listing appointments',
                ttl: 5000
            }
        });
    });

    test('createAppointment writes a lead appointment and ignores attendee creation errors', async () => {
        axios.put
            .mockResolvedValueOnce({ data: { changedEntityId: 777 } })
            .mockRejectedValueOnce(new Error('attendee write failed'));

        const result = await bullhorn.createAppointment({
            user,
            payload: {
                title: 'Intro Meeting',
                summary: 'Discuss role',
                startTimeUtc: '2026-07-22T17:00:00.000Z',
                durationMinutes: 60,
                contacts: [
                    { id: 701, type: 'Lead' }
                ]
            }
        });

        expect(result).toEqual({ appointmentId: '777' });
        expect(axios.put).toHaveBeenNthCalledWith(
            1,
            `${restUrl}entity/Appointment`,
            {
                dateBegin: Date.parse('2026-07-22T17:00:00.000Z'),
                dateEnd: Date.parse('2026-07-22T18:00:00.000Z'),
                description: 'Discuss role',
                isPrivate: false,
                subject: 'Intro Meeting',
                isDeleted: false,
                lead: { id: 701 }
            },
            { headers: { BhRestToken: 'bh-token' } }
        );
        expect(axios.put).toHaveBeenNthCalledWith(
            2,
            `${restUrl}entity/AppointmentAttendee`,
            {
                appointment: { id: 777 },
                attendee: { id: 701 }
            },
            { headers: { BhRestToken: 'bh-token' } }
        );
    });

    test('createAppointment returns a warning when Bullhorn does not return an id', async () => {
        axios.put.mockResolvedValueOnce({ data: {} });

        await expect(bullhorn.createAppointment({
            user,
            payload: {
                title: 'No Id',
                contacts: []
            }
        })).resolves.toEqual({
            successful: false,
            returnMessage: {
                messageType: 'warning',
                message: 'Could not create appointment in Bullhorn.',
                ttl: 5000
            }
        });
    });

    test('createAppointment refreshes the Bullhorn session after an auth error', async () => {
        axios.put
            .mockRejectedValueOnce({ response: { status: 401 } })
            .mockResolvedValueOnce({ data: { changedEntityId: 778 } });
        axios.post.mockResolvedValueOnce({
            data: {
                BhRestToken: 'refreshed-token',
                restUrl
            }
        });

        const result = await bullhorn.createAppointment({
            user,
            payload: {
                title: 'Retry Meeting',
                contacts: [
                    { id: 501, type: 'Candidate' }
                ]
            }
        });

        expect(result).toEqual({ appointmentId: '778' });
        expect(user.save).toHaveBeenCalledTimes(1);
        expect(axios.put).toHaveBeenNthCalledWith(
            2,
            `${restUrl}entity/Appointment`,
            expect.objectContaining({
                candidateReference: { id: 501 }
            }),
            { headers: { BhRestToken: 'refreshed-token' } }
        );
    });

    test('updateAppointment patches fields, removes stale attendees, adds new attendees, and reloads', async () => {
        axios.post.mockResolvedValueOnce({ data: {} });
        axios.get
            .mockResolvedValueOnce({
                data: {
                    data: [
                        { id: 9001, attendee: { id: 601 }, appointment: { id: 888 } },
                        { id: 9002, attendee: { id: 602 }, appointment: { id: 888 } },
                        { id: null, attendee: { id: null } }
                    ]
                }
            })
            .mockResolvedValueOnce({
                data: {
                    data: {
                        id: 888,
                        subject: 'Updated Meeting',
                        description: 'Updated summary',
                        dateBegin: Date.parse('2026-07-23T18:00:00.000Z'),
                        dateEnd: Date.parse('2026-07-23T18:30:00.000Z'),
                        isDeleted: false,
                        clientContactReference: { id: 502 }
                    }
                }
            });
        axios.delete.mockRejectedValueOnce({ response: { status: 401 } }).mockResolvedValueOnce({});
        axios.put.mockResolvedValueOnce({});
        axios.post.mockResolvedValueOnce({
            data: {
                BhRestToken: 'retry-token',
                restUrl
            }
        });

        const result = await bullhorn.updateAppointment({
            user,
            appointmentId: '888',
            patchBody: {
                title: 'Updated Meeting',
                summary: 'Updated summary',
                startTimeUtc: '2026-07-23T18:00:00.000Z',
                durationMinutes: 30,
                location: 'Zoom',
                communicationMethod: 'Video',
                type: 'Interview',
                contacts: [
                    { id: 602 },
                    603,
                    { id: 'bad' }
                ]
            }
        });

        expect(axios.post).toHaveBeenNthCalledWith(
            1,
            `${restUrl}entity/Appointment/888`,
            {
                subject: 'Updated Meeting',
                description: 'Updated summary',
                dateBegin: Date.parse('2026-07-23T18:00:00.000Z'),
                dateEnd: Date.parse('2026-07-23T18:30:00.000Z'),
                location: 'Zoom',
                communicationMethod: 'Video',
                type: 'Interview'
            },
            { headers: { BhRestToken: 'bh-token' } }
        );
        expect(axios.delete).toHaveBeenNthCalledWith(
            2,
            `${restUrl}entity/AppointmentAttendee/9001`,
            { headers: { BhRestToken: 'retry-token' } }
        );
        expect(axios.put).toHaveBeenCalledWith(
            `${restUrl}entity/AppointmentAttendee`,
            {
                appointment: { id: 888 },
                attendee: { id: 603 }
            },
            { headers: { BhRestToken: 'retry-token' } }
        );
        expect(result.appointment).toMatchObject({
            id: '888',
            title: 'Updated Meeting',
            description: 'Updated summary',
            durationMinutes: 30,
            contactId: '502',
            contactType: 'ClientContact'
        });
    });

    test('updateAppointment returns a warning on a Bullhorn write failure', async () => {
        axios.post.mockRejectedValueOnce({ response: { status: 500 } });

        await expect(bullhorn.updateAppointment({
            user,
            appointmentId: '999',
            patchBody: {
                title: 'Blocked'
            }
        })).resolves.toEqual({
            successful: false,
            returnMessage: {
                messageType: 'warning',
                message: 'Error updating appointment',
                ttl: 5000
            }
        });
    });

    test('refreshAppointment returns normalized appointment details', async () => {
        axios.get.mockResolvedValueOnce({
            data: {
                data: {
                    id: 444,
                    subject: 'Refresh Me',
                    description: 'Fresh details',
                    dateBegin: Date.parse('2026-07-24T19:00:00.000Z'),
                    dateEnd: Date.parse('2026-07-24T20:30:00.000Z'),
                    isDeleted: false,
                    attendees: {
                        data: [
                            { id: 11 },
                            { id: 12 }
                        ]
                    }
                }
            }
        });

        await expect(bullhorn.refreshAppointment({
            user,
            appointmentId: '444'
        })).resolves.toEqual({
            appointment: {
                thirdPartyAppointmentId: '444',
                id: '444',
                title: 'Refresh Me',
                description: 'Fresh details',
                participantName: '',
                startTimeUtc: '2026-07-24T19:00:00.000Z',
                durationMinutes: 90,
                status: 'scheduled',
                contactId: '',
                contactType: '',
                attendeeIds: ['11', '12']
            }
        });
    });

    test('refreshAppointment returns not found when the appointment has no id', async () => {
        axios.get.mockResolvedValueOnce({ data: { data: {} } });

        await expect(bullhorn.refreshAppointment({
            user,
            appointmentId: 'missing'
        })).resolves.toEqual({
            successful: false,
            returnMessage: {
                messageType: 'warning',
                message: 'Appointment not found in Bullhorn.',
                ttl: 5000
            }
        });
    });

    test('cancelAppointment marks the Bullhorn appointment deleted', async () => {
        axios.post.mockResolvedValueOnce({ data: {} });

        await expect(bullhorn.cancelAppointment({
            user,
            appointmentId: '777'
        })).resolves.toEqual({
            successful: true,
            returnMessage: {
                messageType: 'success',
                message: 'Appointment cancelled successfully.',
                ttl: 5000
            }
        });
        expect(axios.post).toHaveBeenCalledWith(
            `${restUrl}entity/Appointment/777`,
            { isDeleted: true },
            { headers: { BhRestToken: 'bh-token' } }
        );
    });

    test('listAppointments skips attendee lookup when Bullhorn returns no appointment ids', async () => {
        axios.get.mockResolvedValueOnce({
            data: {
                data: [
                    { subject: 'No id row' },
                    { id: null, subject: 'Null id row' }
                ]
            }
        });

        await expect(bullhorn.listAppointments({ user })).resolves.toEqual({
            appointments: []
        });
        expect(axios.get).toHaveBeenCalledTimes(1);
        expect(axios.get).toHaveBeenCalledWith(
            `${restUrl}query/Appointment`,
            expect.objectContaining({
                params: expect.objectContaining({
                    fields: 'id,subject,description,dateBegin,dateEnd,isDeleted,candidateReference,clientContactReference,lead'
                })
            })
        );
    });

    test('listAppointments maps attendee lookup failures to a warning', async () => {
        axios.get
            .mockResolvedValueOnce({
                data: {
                    data: [
                        {
                            id: 111,
                            subject: 'Needs attendee lookup',
                            dateBegin: Date.parse('2026-07-25T15:00:00.000Z'),
                            dateEnd: Date.parse('2026-07-25T15:30:00.000Z')
                        }
                    ]
                }
            })
            .mockRejectedValueOnce({ response: { status: 500 } });

        await expect(bullhorn.listAppointments({ user })).resolves.toEqual({
            successful: false,
            returnMessage: {
                messageType: 'warning',
                message: 'Error listing appointments',
                ttl: 5000
            }
        });
    });

    test('createAppointment uses default dates and client contact reference for contact payloads', async () => {
        jest.useFakeTimers().setSystemTime(new Date('2026-07-26T10:00:00.000Z'));
        axios.put.mockResolvedValueOnce({ data: { changedEntityId: 779 } });

        await expect(bullhorn.createAppointment({
            user,
            payload: {
                contacts: [
                    { id: 502, contactType: 'ClientContact' }
                ]
            }
        })).resolves.toEqual({ appointmentId: '779' });

        expect(axios.put).toHaveBeenCalledWith(
            `${restUrl}entity/Appointment`,
            {
                dateBegin: Date.parse('2026-07-26T10:00:00.000Z'),
                dateEnd: Date.parse('2026-07-26T10:15:00.000Z'),
                description: '',
                isPrivate: false,
                subject: 'Appointment',
                isDeleted: false,
                clientContactReference: { id: 502 }
            },
            { headers: { BhRestToken: 'bh-token' } }
        );
    });

    test('refreshAppointment refreshes the Bullhorn session after an auth error', async () => {
        axios.get
            .mockRejectedValueOnce({ response: { status: 401 } })
            .mockResolvedValueOnce({
                data: {
                    data: {
                        id: 445,
                        subject: 'Retry Refresh',
                        dateBegin: Date.parse('2026-07-27T15:00:00.000Z'),
                        dateEnd: Date.parse('2026-07-27T15:20:00.000Z'),
                        isDeleted: true,
                        lead: { id: 701 },
                        attendees: [{ id: 901 }, 902]
                    }
                }
            });
        axios.post.mockResolvedValueOnce({
            data: {
                BhRestToken: 'refreshed-token',
                restUrl
            }
        });

        const result = await bullhorn.refreshAppointment({
            user,
            appointmentId: '445'
        });

        expect(result.appointment).toMatchObject({
            id: '445',
            title: 'Retry Refresh',
            status: 'cancelled',
            contactId: '701',
            contactType: 'Lead',
            attendeeIds: ['901', '902']
        });
        expect(axios.get).toHaveBeenNthCalledWith(
            2,
            `${restUrl}entity/Appointment/445`,
            expect.objectContaining({
                headers: { BhRestToken: 'refreshed-token' }
            })
        );
        expect(user.save).toHaveBeenCalledTimes(1);
    });

    test('cancelAppointment refreshes the Bullhorn session after an auth error', async () => {
        axios.post
            .mockRejectedValueOnce({ response: { status: 401 } })
            .mockResolvedValueOnce({
                data: {
                    BhRestToken: 'cancel-refreshed-token',
                    restUrl
                }
            })
            .mockResolvedValueOnce({ data: {} });

        await expect(bullhorn.cancelAppointment({
            user,
            appointmentId: '780'
        })).resolves.toEqual({
            successful: true,
            returnMessage: {
                messageType: 'success',
                message: 'Appointment cancelled successfully.',
                ttl: 5000
            }
        });
        expect(axios.post).toHaveBeenNthCalledWith(
            3,
            `${restUrl}entity/Appointment/780`,
            { isDeleted: true },
            { headers: { BhRestToken: 'cancel-refreshed-token' } }
        );
    });
});

export {};
