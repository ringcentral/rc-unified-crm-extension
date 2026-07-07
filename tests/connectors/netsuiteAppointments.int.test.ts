jest.mock('axios', () => ({
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn()
}));

const axios = require('axios');
const netsuite = require('../../src/connectors/netsuite');

describe('NetSuite appointment connector', () => {
    const authHeader = 'Bearer netsuite-token';
    const user = {
        hostname: '1234567.suitetalk.api.netsuite.com',
        timezoneOffset: '-04:00'
    };

    beforeEach(() => {
        jest.clearAllMocks();
        jest.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    test('listAppointments returns a warning when hostname/account information is missing', async () => {
        await expect(netsuite.listAppointments({
            user: {
                hostname: ''
            },
            authHeader
        })).resolves.toEqual({
            successful: false,
            returnMessage: {
                messageType: 'warning',
                message: 'Missing NetSuite account information.',
                ttl: 5000
            }
        });
        expect(axios.get).not.toHaveBeenCalled();
    });

    test('listAppointments fetches calendar events and normalizes appointment rows', async () => {
        axios.get.mockResolvedValueOnce({
            data: {
                data: [
                    {
                        id: 1001,
                        title: 'Discovery Call',
                        description: '<p>Hello<br />World &amp; Team</p>',
                        startDate: '7/20/2026',
                        startTime: '3:00 pm',
                        endTime: '4:30 pm',
                        status: 'CONFIRMED',
                        attendees: [
                            { id: 501, name: 'Alice Client', type: 'contact' },
                            { name: 'Missing Id' }
                        ],
                        attendee: {
                            items: [
                                { attendee: { id: 502, name: 'Bob Client', type: 'contact' } }
                            ]
                        }
                    }
                ]
            }
        });

        await expect(netsuite.listAppointments({
            user,
            authHeader,
            range: {
                startDate: '2026-07-01',
                endDate: '2026-07-31'
            }
        })).resolves.toEqual({
            appointments: [
                {
                    thirdPartyAppointmentId: '1001',
                    id: '1001',
                    title: 'Discovery Call',
                    description: 'Hello\nWorld & Team',
                    startTimeUtc: '2026-07-20T19:00:00.000Z',
                    durationMinutes: 90,
                    status: 'CONFIRMED',
                    contactId: '',
                    attendees: [
                        { id: '501', name: 'Alice Client', type: 'contact' },
                        { id: '502', name: 'Bob Client', type: 'contact' }
                    ]
                }
            ]
        });
        expect(axios.get).toHaveBeenCalledWith(
            'https://1234567.restlets.api.netsuite.com/app/site/hosting/restlet.nl',
            {
                headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
                params: {
                    script: 'customscript_rcfetchcalendarevents',
                    deploy: 'customdeploy_rcfetchcalendarevents',
                    startDate: '2026-07-01',
                    endDate: '2026-07-31',
                    page: 0,
                    pageSize: 1000
                }
            }
        );
    });

    test('createAppointment posts a calendar event, reloads it, and normalizes the result', async () => {
        axios.post.mockResolvedValueOnce({
            headers: {
                location: 'https://example.com/services/rest/record/v1/calendarEvent/2002'
            },
            data: {}
        });
        axios.get.mockResolvedValueOnce({
            data: {
                id: 2002,
                title: 'Created Event',
                message: 'Created body',
                startDate: '2026-07-20',
                startTime: '15:00:00',
                endTime: '15:30:00',
                status: 'CONFIRMED',
                attendee: {
                    items: [
                        { attendee: { id: 501, name: 'Alice Client', type: 'contact' } }
                    ]
                }
            }
        });

        const result = await netsuite.createAppointment({
            user,
            authHeader,
            payload: {
                title: 'Created Event',
                summary: 'Created body',
                startTimeUtc: '2026-07-20T19:00:00.000Z',
                durationMinutes: 30,
                status: 'confirmed',
                contacts: [
                    { id: 501 },
                    502
                ]
            }
        });

        expect(axios.post).toHaveBeenCalledWith(
            'https://1234567.suitetalk.api.netsuite.com/services/rest/record/v1/calendarEvent',
            {
                title: 'Created Event',
                startDate: '2026-07-20',
                startTime: '15:00:00',
                endTime: '15:30:00',
                timedEvent: true,
                message: 'Created body',
                status: { id: 'CONFIRMED' },
                attendee: {
                    items: [
                        { attendee: { id: 501 } },
                        { attendee: { id: 502 } }
                    ]
                }
            },
            {
                headers: { Authorization: authHeader, 'Content-Type': 'application/json' }
            }
        );
        expect(axios.get).toHaveBeenCalledWith(
            'https://1234567.suitetalk.api.netsuite.com/services/rest/record/v1/calendarEvent/2002',
            { headers: { Authorization: authHeader } }
        );
        expect(result).toMatchObject({
            appointmentId: '2002',
            appointment: {
                id: '2002',
                title: 'Created Event',
                description: 'Created body',
                startTimeUtc: '2026-07-20T19:00:00.000Z',
                durationMinutes: 30,
                status: 'CONFIRMED',
                attendees: [
                    { id: '501', name: 'Alice Client', type: 'contact' }
                ]
            }
        });
    });

    test('createAppointment maps NetSuite error details into the warning message', async () => {
        axios.post.mockRejectedValueOnce({
            response: {
                data: {
                    'o:errorDetails': [
                        { detail: 'Calendar permission missing' },
                        { detail: 'Role is not allowed' }
                    ]
                }
            }
        });

        await expect(netsuite.createAppointment({
            user,
            authHeader,
            payload: {
                title: 'Blocked'
            }
        })).resolves.toEqual({
            successful: false,
            returnMessage: {
                messageType: 'warning',
                message: 'Calendar permission missing Role is not allowed',
                ttl: 60000
            }
        });
    });

    test('updateAppointment patches attendees and normalizes the updated event', async () => {
        axios.patch.mockResolvedValueOnce({
            data: {
                id: 3003,
                title: 'Updated Event',
                description: '<b>Updated body</b>',
                status: 'TENTATIVE',
                attendee: {
                    items: [
                        { attendee: { id: 601, name: 'Updated Client', type: 'contact' } }
                    ]
                }
            }
        });

        const result = await netsuite.updateAppointment({
            user,
            authHeader,
            appointmentId: '3003',
            patchBody: {
                title: 'Updated Event',
                summary: 'Updated body',
                status: 'tentative',
                contacts: [
                    { id: 601 },
                    { id: '' },
                    {}
                ]
            }
        });

        expect(axios.patch).toHaveBeenCalledWith(
            'https://1234567.suitetalk.api.netsuite.com/services/rest/record/v1/calendarEvent/3003?replace=attendee',
            {
                startDate: '',
                startTime: '',
                endTime: '',
                status: { id: 'TENTATIVE' },
                message: 'Updated body',
                title: 'Updated Event',
                attendee: {
                    items: [
                        { attendee: { id: '601' } }
                    ]
                }
            },
            {
                headers: { Authorization: authHeader, 'Content-Type': 'application/json' }
            }
        );
        expect(result.appointment).toMatchObject({
            id: '3003',
            title: 'Updated Event',
            description: 'Updated body',
            status: 'TENTATIVE',
            attendees: [
                { id: '601', name: 'Updated Client', type: 'contact' }
            ]
        });
    });

    test('refreshAppointment handles missing, success, and provider error responses', async () => {
        axios.get.mockResolvedValueOnce({
            data: null
        });

        await expect(netsuite.refreshAppointment({
            user,
            authHeader,
            appointmentId: 'missing'
        })).resolves.toEqual({
            successful: false,
            returnMessage: {
                messageType: 'warning',
                message: 'Appointment not found in NetSuite.',
                ttl: 5000
            }
        });

        axios.get.mockResolvedValueOnce({
            data: {
                id: 4004,
                title: 'Refreshed Event',
                startDate: '2026-07-20',
                startTime: '10:00:00',
                endTime: '11:00:00',
                status: 'CONFIRMED'
            }
        });

        await expect(netsuite.refreshAppointment({
            user,
            authHeader,
            appointmentId: '4004'
        })).resolves.toMatchObject({
            appointment: {
                id: '4004',
                title: 'Refreshed Event',
                startTimeUtc: '2026-07-20T14:00:00.000Z',
                durationMinutes: 60,
                status: 'CONFIRMED'
            }
        });

        axios.get.mockRejectedValueOnce({
            response: {
                data: {
                    'o:errorDetails': [
                        { detail: 'Calendar event lookup failed' }
                    ]
                }
            }
        });

        await expect(netsuite.refreshAppointment({
            user,
            authHeader,
            appointmentId: 'broken'
        })).resolves.toEqual({
            successful: false,
            returnMessage: {
                messageType: 'warning',
                message: 'Calendar event lookup failed',
                ttl: 60000
            }
        });
    });

    test('confirmAppointment and cancelAppointment patch appointment status', async () => {
        axios.patch
            .mockResolvedValueOnce({ data: { ok: true } })
            .mockResolvedValueOnce({ data: { ok: true } });

        await expect(netsuite.confirmAppointment({
            user,
            authHeader,
            appointmentId: '5005'
        })).resolves.toEqual({
            successful: true,
            returnMessage: {
                messageType: 'success',
                message: 'Appointment confirmed successfully',
                ttl: 60000
            }
        });

        await expect(netsuite.cancelAppointment({
            user,
            authHeader,
            appointmentId: '5005'
        })).resolves.toEqual({
            successful: true,
            returnMessage: {
                messageType: 'success',
                message: 'Appointment cancelled successfully',
                ttl: 60000
            }
        });

        expect(axios.patch).toHaveBeenNthCalledWith(
            1,
            'https://1234567.suitetalk.api.netsuite.com/services/rest/record/v1/calendarEvent/5005',
            { status: { id: 'CONFIRMED' } },
            { headers: { Authorization: authHeader, 'Content-Type': 'application/json' } }
        );
        expect(axios.patch).toHaveBeenNthCalledWith(
            2,
            'https://1234567.suitetalk.api.netsuite.com/services/rest/record/v1/calendarEvent/5005',
            { status: { id: 'CANCELLED' } },
            { headers: { Authorization: authHeader, 'Content-Type': 'application/json' } }
        );
    });
});

export {};
