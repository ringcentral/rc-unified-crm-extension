jest.mock('axios', () => ({
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
    delete: jest.fn(),
    put: jest.fn()
}));

const axios = require('axios');
const clio = require('../../src/connectors/clio');

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

        await expect(clio.listAppointments({ user, authHeader })).resolves.toEqual({
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

    test('cancelAppointment deletes the entry and returns the normalized cancelled appointment', async () => {
        axios.delete.mockResolvedValueOnce({
            data: {
                data: {
                    id: 555,
                    summary: 'Cancelled',
                    description: '',
                    start_at: '2026-07-20T22:00:00.000Z',
                    end_at: '2026-07-20T22:30:00.000Z',
                    attendees: [],
                    external_properties: [
                        { name: 'rcAppointmentStatus', value: 'cancelled' }
                    ]
                }
            }
        });

        await expect(clio.cancelAppointment({
            user,
            authHeader,
            appointmentId: '555'
        })).resolves.toMatchObject({
            appointment: {
                id: '555',
                title: 'Cancelled',
                status: 'cancelled',
                durationMinutes: 30
            }
        });
        expect(axios.delete).toHaveBeenCalledWith(
            'https://app.clio.com/api/v4/calendar_entries/555.json',
            { headers: { Authorization: authHeader } }
        );
    });
});

export {};
