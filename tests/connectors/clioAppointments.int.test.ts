jest.mock('axios', () => ({
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
    delete: jest.fn(),
    put: jest.fn()
}));

const axios = require('axios');
const clio = require('../../src/connectors/clio');
const {
    AppointmentActionResponseSchema,
    AppointmentCreateResponseSchema,
    AppointmentListResponseSchema,
    AppointmentRecordResponseSchema
} = require('../../packages/core/contracts');

describe('Clio appointment connector', () => {
    const user = {
        hostname: 'app.clio.com'
    };
    const authHeader = 'Bearer clio-token';

    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('listAppointments maps calendar entries into appointment contract', async () => {
        axios.get.mockResolvedValueOnce({
            data: {
                data: [
                    {
                        id: 101,
                        summary: 'Consultation',
                        description: 'Initial consult',
                        start_at: '2026-07-20T15:00:00-04:00',
                        end_at: '2026-07-20T15:45:00-04:00',
                        attendees: [
                            { id: 501, name: 'Alice Client', type: 'Contact' },
                            { name: 'No Id' }
                        ]
                    }
                ]
            }
        });

        await expect(clio.listAppointments({ user, authHeader, range: 'past' })).resolves.toEqual({
            appointments: [
                {
                    thirdPartyAppointmentId: '101',
                    id: '101',
                    title: 'Consultation',
                    description: 'Initial consult',
                    participantName: '',
                    startTimeUtc: '2026-07-20T19:00:00.000Z',
                    durationMinutes: 45,
                    status: 'scheduled',
                    contactId: '',
                    attendees: [
                        { id: 501, name: 'Alice Client', type: 'Contact' }
                    ]
                }
            ]
        });
        expect(axios.get).toHaveBeenCalledWith(
            'https://app.clio.com/api/v4/calendar_entries.json',
            {
                headers: { Authorization: authHeader },
                params: {
                    fields: 'id,summary,start_at,end_at,description,attendees{id,name,type}'
                }
            }
        );
    });

    test('listAppointments filters a custom date range using inclusive boundaries', async () => {
        axios.get.mockResolvedValueOnce({
            data: {
                data: [
                    {
                        id: 100,
                        summary: 'Before range',
                        start_at: '2026-07-19T23:59:59.999Z',
                        end_at: '2026-07-20T00:29:59.999Z'
                    },
                    {
                        id: 101,
                        summary: 'Start boundary',
                        start_at: '2026-07-20T00:00:00.000Z',
                        end_at: '2026-07-20T00:30:00.000Z'
                    },
                    {
                        id: 102,
                        summary: 'End boundary',
                        start_at: '2026-07-21T23:59:59.999Z',
                        end_at: '2026-07-22T00:29:59.999Z'
                    },
                    {
                        id: 103,
                        summary: 'After range',
                        start_at: '2026-07-22T00:00:00.000Z',
                        end_at: '2026-07-22T00:30:00.000Z'
                    }
                ]
            }
        });

        const result = await clio.listAppointments({
            user,
            authHeader,
            range: {
                startDate: '2026-07-20',
                endDate: '2026-07-21'
            }
        });

        expect(result.appointments.map(appointment => appointment.id)).toEqual(['101', '102']);
        expect(() => AppointmentListResponseSchema.parse({ successful: true, ...result })).not.toThrow();
    });

    test('createAppointment returns a warning when no writeable calendar is available', async () => {
        axios.get
            .mockResolvedValueOnce({ data: { data: [] } })
            .mockResolvedValueOnce({ data: { data: [] } });

        await expect(clio.createAppointment({
            user,
            authHeader,
            payload: {
                title: 'No Calendar'
            }
        })).resolves.toEqual({
            successful: false,
            returnMessage: {
                message: 'No writeable calendar found in Clio.',
                messageType: 'warning',
                ttl: 5000
            }
        });
        expect(axios.post).not.toHaveBeenCalled();
    });

    test('createAppointment posts calendar entry with attendees and normalizes the response', async () => {
        axios.get.mockResolvedValueOnce({
            data: {
                data: [
                    { id: 9001 }
                ]
            }
        });
        axios.post.mockResolvedValueOnce({
            data: {
                data: {
                    id: 222,
                    summary: 'Strategy Call',
                    description: 'Discuss case plan',
                    start_at: '2026-07-20T19:00:00.000Z',
                    end_at: '2026-07-20T19:30:00.000Z',
                    attendees: [
                        { id: 501, name: 'Alice Client', type: 'Contact' }
                    ],
                    external_properties: [
                        { name: 'rcAppointmentParticipantName', value: 'Alice Client' },
                        { name: 'rcAppointmentContactId', value: '501' },
                        { name: 'rcAppointmentContactType', value: 'Contact' },
                        { name: 'rcAppointmentStatus', value: 'scheduled' },
                        { name: 'rcAppointmentTitle', value: 'Strategy Call' }
                    ]
                }
            }
        });

        const result = await clio.createAppointment({
            user,
            authHeader,
            payload: {
                title: 'Strategy Call',
                summary: 'Discuss case plan',
                startTimeUtc: '2026-07-20T19:00:00.000Z',
                durationMinutes: 30,
                contacts: [
                    { id: 501 },
                    'not-a-number'
                ]
            }
        });

        expect(result.appointmentId).toBe('222');
        expect(result.appointment).toMatchObject({
            id: '222',
            participantName: 'Alice Client',
            contactId: '501',
            contactType: 'Contact',
            attendeeIds: ['501'],
            title: 'Strategy Call',
            summary: 'Discuss case plan',
            status: 'scheduled',
            durationMinutes: 30
        });
        expect(() => AppointmentCreateResponseSchema.parse({ successful: true, ...result })).not.toThrow();
        expect(axios.post).toHaveBeenCalledWith(
            'https://app.clio.com/api/v4/calendar_entries.json',
            {
                data: {
                    calendar_owner: { id: 9001 },
                    summary: 'Strategy Call',
                    description: 'Discuss case plan',
                    start_at: '2026-07-20T19:00:00.000Z',
                    end_at: '2026-07-20T19:30:00.000Z',
                    send_email_notification: false,
                    attendees: [
                        { id: 501, type: 'Contact' }
                    ]
                }
            },
            {
                headers: { Authorization: authHeader },
                params: {
                    fields: 'id,summary,description,start_at,end_at,attendees,external_properties,calendar_owner_id'
                }
            }
        );
    });

    test('createAppointment uses fallback calendar lookup and omits attendees when none are supplied', async () => {
        axios.get
            .mockResolvedValueOnce({ data: { data: [] } })
            .mockResolvedValueOnce({ data: { data: [{ id: 9002 }] } });
        axios.post.mockResolvedValueOnce({
            data: {
                data: {
                    id: 223,
                    summary: 'Appointment',
                    description: '',
                    start_at: null,
                    end_at: null,
                    attendees: [],
                    external_properties: []
                }
            }
        });

        const result = await clio.createAppointment({
            user,
            authHeader,
            payload: {}
        });

        expect(result.appointmentId).toBe('223');
        expect(axios.post).toHaveBeenCalledWith(
            'https://app.clio.com/api/v4/calendar_entries.json',
            {
                data: {
                    calendar_owner: { id: 9002 },
                    summary: 'Appointment',
                    description: '',
                    start_at: null,
                    end_at: null,
                    send_email_notification: false
                }
            },
            {
                headers: { Authorization: authHeader },
                params: {
                    fields: 'id,summary,description,start_at,end_at,attendees,external_properties,calendar_owner_id'
                }
            }
        );
        expect(result.appointment).toMatchObject({
            id: '223',
            title: 'Appointment',
            durationMinutes: null
        });
    });

    test('updateAppointment returns a warning when the appointment is missing', async () => {
        axios.get.mockResolvedValueOnce({
            data: {
                data: null
            }
        });

        await expect(clio.updateAppointment({
            user,
            authHeader,
            appointmentId: '404',
            patchBody: {
                title: 'Missing'
            }
        })).resolves.toEqual({
            successful: false,
            returnMessage: {
                message: 'Appointment not found in Clio.',
                messageType: 'warning',
                ttl: 5000
            }
        });
        expect(axios.patch).not.toHaveBeenCalled();
    });

    test('updateAppointment merges desired attendee changes and normalizes the updated entry', async () => {
        axios.get.mockResolvedValueOnce({
            data: {
                data: {
                    id: 333,
                    attendees: [
                        { id: 501 },
                        { id: 502 },
                        { name: 'missing id' }
                    ]
                }
            }
        });
        axios.patch.mockResolvedValueOnce({
            data: {
                data: {
                    id: 333,
                    summary: 'Updated Strategy Call',
                    description: 'Updated description',
                    start_at: '2026-07-20T20:00:00.000Z',
                    end_at: '2026-07-20T21:00:00.000Z',
                    attendees: [
                        { id: 502, name: 'Kept Client', type: 'Contact' },
                        { id: 503, name: 'Added Client', type: 'Contact' }
                    ],
                    external_properties: []
                }
            }
        });

        const result = await clio.updateAppointment({
            user,
            authHeader,
            appointmentId: '333',
            patchBody: {
                title: 'Updated Strategy Call',
                summary: 'Updated description',
                startTimeUtc: '2026-07-20T20:00:00.000Z',
                durationMinutes: 60,
                contacts: [
                    502,
                    { id: 503 },
                    { id: 'bad-id' }
                ]
            }
        });

        expect(axios.patch).toHaveBeenCalledWith(
            'https://app.clio.com/api/v4/calendar_entries/333.json',
            {
                data: {
                    summary: 'Updated Strategy Call',
                    description: 'Updated description',
                    start_at: '2026-07-20T20:00:00.000Z',
                    end_at: '2026-07-20T21:00:00.000Z',
                    attendees: [
                        { id: 501, type: 'Contact', _destroy: true },
                        { id: 502, type: 'Contact' },
                        { id: 503, type: 'Contact' }
                    ]
                }
            },
            {
                headers: { Authorization: authHeader },
                params: {
                    fields: 'id,summary,description,start_at,end_at,attendees,external_properties,calendar_owner_id'
                }
            }
        );
        expect(result.appointment).toMatchObject({
            id: '333',
            title: 'Updated Strategy Call',
            summary: 'Updated description',
            attendeeIds: ['502', '503'],
            durationMinutes: 60,
            status: 'tentative'
        });
        expect(() => AppointmentRecordResponseSchema.parse({
            successful: true,
            appointmentId: '333',
            ...result
        })).not.toThrow();
    });

    test('updateAppointment sends only the Clio summary for a title-only patch', async () => {
        axios.get.mockResolvedValueOnce({
            data: {
                data: {
                    id: 334,
                    summary: 'Original title',
                    description: 'Preserve this description',
                    start_at: '2026-07-20T22:00:00.000Z',
                    end_at: '2026-07-20T22:30:00.000Z',
                    attendees: [
                        { id: 701, name: 'Existing Client', type: 'Contact' }
                    ]
                }
            }
        });
        axios.patch.mockResolvedValueOnce({
            data: {
                data: {
                    id: 334,
                    summary: 'Renamed appointment',
                    description: 'Preserve this description',
                    start_at: '2026-07-20T22:00:00.000Z',
                    end_at: '2026-07-20T22:30:00.000Z',
                    attendees: [
                        { id: 701, name: 'Existing Client', type: 'Contact' }
                    ],
                    external_properties: []
                }
            }
        });

        await clio.updateAppointment({
            user,
            authHeader,
            appointmentId: '334',
            patchBody: {
                title: 'Renamed appointment'
            }
        });

        expect(axios.patch).toHaveBeenCalledWith(
            'https://app.clio.com/api/v4/calendar_entries/334.json',
            {
                data: {
                    summary: 'Renamed appointment'
                }
            },
            {
                headers: { Authorization: authHeader },
                params: {
                    fields: 'id,summary,description,start_at,end_at,attendees,external_properties,calendar_owner_id'
                }
            }
        );
    });

    test('updateAppointment leaves attendees and omitted description untouched when contacts are not supplied', async () => {
        axios.get.mockResolvedValueOnce({
            data: {
                data: {
                    id: 334,
                    attendees: [
                        { id: '701' }
                    ]
                }
            }
        });
        axios.patch.mockResolvedValueOnce({
            data: {
                data: {
                    id: 334,
                    summary: 'No attendee change',
                    description: '',
                    start_at: '2026-07-20T22:00:00.000Z',
                    end_at: '2026-07-20T22:10:00.000Z',
                    attendees: [
                        { id: 701, name: 'Existing Client', type: 'Contact' }
                    ],
                    external_properties: []
                }
            }
        });

        const result = await clio.updateAppointment({
            user,
            authHeader,
            appointmentId: '334',
            patchBody: {
                title: 'No attendee change',
                startTime: '2026-07-20T22:00:00.000Z',
                durationMinutes: 10
            }
        });

        expect(axios.patch).toHaveBeenCalledWith(
            'https://app.clio.com/api/v4/calendar_entries/334.json',
            {
                data: {
                    summary: 'No attendee change',
                    start_at: '2026-07-20T22:00:00.000Z',
                    end_at: '2026-07-20T22:10:00.000Z'
                }
            },
            {
                headers: { Authorization: authHeader },
                params: {
                    fields: 'id,summary,description,start_at,end_at,attendees,external_properties,calendar_owner_id'
                }
            }
        );
        expect(result.appointment).toMatchObject({
            id: '334',
            attendeeIds: ['701'],
            durationMinutes: 10
        });
    });

    test('updateAppointment reports unsupported status-only changes without mutating Clio', async () => {
        await expect(clio.updateAppointment({
            user,
            authHeader,
            appointmentId: '335',
            patchBody: {
                status: 'confirmed'
            }
        })).resolves.toEqual({
            successful: false,
            returnMessage: {
                message: 'Clio does not support appointment status changes.',
                messageType: 'warning',
                ttl: 5000
            }
        });

        expect(axios.get).not.toHaveBeenCalled();
        expect(axios.patch).not.toHaveBeenCalled();
    });

    test('refreshAppointment returns not-found warning or normalized appointment', async () => {
        axios.get.mockResolvedValueOnce({
            data: {
                data: null
            }
        });

        await expect(clio.refreshAppointment({
            user,
            authHeader,
            appointmentId: 'missing'
        })).resolves.toEqual({
            successful: false,
            returnMessage: {
                message: 'Appointment not found in Clio.',
                messageType: 'warning',
                ttl: 5000
            }
        });

        axios.get.mockResolvedValueOnce({
            data: {
                data: {
                    id: 444,
                    summary: 'Refreshed',
                    description: 'Refreshed body',
                    start_at: '2026-07-20T21:00:00.000Z',
                    end_at: '2026-07-20T21:15:00.000Z',
                    attendees: [
                        { id: 700, name: 'Refresh Client', type: 'Contact' }
                    ],
                    external_properties: [
                        { name: 'rcAppointmentStatus', value: 'scheduled' }
                    ]
                }
            }
        });

        await expect(clio.refreshAppointment({
            user,
            authHeader,
            appointmentId: '444'
        })).resolves.toMatchObject({
            appointment: {
                id: '444',
                title: 'Refreshed',
                summary: 'Refreshed body',
                attendeeIds: ['700'],
                status: 'scheduled',
                durationMinutes: 15
            }
        });
    });

    test('cancelAppointment accepts Clio 204 and returns an action response', async () => {
        axios.delete.mockResolvedValueOnce({ status: 204 });

        const result = await clio.cancelAppointment({
            user,
            authHeader,
            appointmentId: '555'
        });

        expect(result).toEqual({
            successful: true,
            returnMessage: {
                message: 'Appointment cancelled successfully.',
                messageType: 'success',
                ttl: 5000
            }
        });
        expect(() => AppointmentActionResponseSchema.parse({
            appointmentId: '555',
            ...result
        })).not.toThrow();
        expect(axios.delete).toHaveBeenCalledWith(
            'https://app.clio.com/api/v4/calendar_entries/555.json',
            { headers: { Authorization: authHeader } }
        );
    });
});

export {};
