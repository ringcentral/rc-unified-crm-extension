const user = {
  id: 'e2e-clio-appointments-user',
  platform: 'clio',
  rcAccountId: 'e2e-clio-appointments-account',
  rcUserNumber: '+14155550101',
  accessToken: 'e2e-clio-appointments-access-token',
  refreshToken: 'e2e-clio-appointments-refresh-token',
  hashedAccountId: 'e2e-clio-appointments-hashed-account',
  hashedExtensionId: 'e2e-clio-appointments-hashed-extension',
  platformAdditionalInfo: { id: 7101 },
};

const provider = {
  hostname: 'appointments.e2e.clio.com',
  calendarEntryFields:
    'id,summary,description,start_at,end_at,attendees{id,name,type},external_properties,calendar_owner_id',
  listFields: 'id,summary,start_at,end_at,description,attendees{id,name,type}',
  mutationFields:
    'id,summary,description,start_at,end_at,attendees,external_properties,calendar_owner_id',
};

function calendarEntry(overrides = {}) {
  return {
    id: 4101,
    summary: 'Case strategy meeting',
    description: 'Review evidence and next steps',
    start_at: '2026-07-20T15:00:00-04:00',
    end_at: '2026-07-20T15:45:00-04:00',
    attendees: [{ id: 5101, name: 'Alice Client', type: 'Contact' }],
    external_properties: [],
    calendar_owner_id: 6101,
    ...overrides,
  };
}

const list = {
  appRequestQuery: {
    startDate: '2026-07-20',
    endDate: '2026-07-21',
  },
  crmResponse: {
    data: [
      calendarEntry(),
      calendarEntry({
        id: 4102,
        summary: 'Outside requested range',
        start_at: '2026-08-01T10:00:00.000Z',
        end_at: '2026-08-01T10:30:00.000Z',
      }),
    ],
  },
  expectedResponse: {
    successful: true,
    appointments: [{
      thirdPartyAppointmentId: '4101',
      id: '4101',
      title: 'Case strategy meeting',
      description: 'Review evidence and next steps',
      participantName: '',
      startTimeUtc: '2026-07-20T19:00:00.000Z',
      durationMinutes: 45,
      status: 'scheduled',
      contactId: '',
      attendees: [{ id: 5101, name: 'Alice Client', type: 'Contact' }],
    }],
  },
};

const create = {
  calendarResponse: {
    data: [{ id: 6101, type: 'UserCalendar', permission: 'write' }],
  },
  expectedCalendarQuery: {
    owner: 'true',
    writeable: 'true',
    visible: 'true',
    type: 'UserCalendar',
    order: 'id(desc)',
    limit: '1',
    fields: 'id,type,permission,visible',
  },
  appRequestBody: {
    payload: {
      title: 'Initial consultation',
      summary: 'Discuss the new matter',
      startTimeUtc: '2026-07-22T16:00:00.000Z',
      durationMinutes: 30,
      contacts: [{ id: '5101', type: 'Contact' }],
    },
  },
  expectedCrmRequestBody: {
    data: {
      calendar_owner: { id: 6101 },
      summary: 'Initial consultation',
      description: 'Discuss the new matter',
      start_at: '2026-07-22T16:00:00.000Z',
      end_at: '2026-07-22T16:30:00.000Z',
      send_email_notification: false,
      attendees: [{ id: 5101, type: 'Contact' }],
    },
  },
  crmResponse: {
    data: calendarEntry({
      id: 4201,
      summary: 'Initial consultation',
      description: 'Discuss the new matter',
      start_at: '2026-07-22T16:00:00.000Z',
      end_at: '2026-07-22T16:30:00.000Z',
      external_properties: [
        { name: 'rcAppointmentParticipantName', value: 'Alice Client' },
        { name: 'rcAppointmentContactId', value: '5101' },
        { name: 'rcAppointmentContactType', value: 'Contact' },
        { name: 'rcAppointmentStatus', value: 'scheduled' },
        { name: 'rcAppointmentTitle', value: 'Initial consultation' },
      ],
    }),
  },
  expectedResponse: {
    successful: true,
    appointmentId: '4201',
    appointment: {
      id: '4201',
      participantName: 'Alice Client',
      contactId: '5101',
      contactType: 'Contact',
      attendeeIds: ['5101'],
      title: 'Initial consultation',
      summary: 'Discuss the new matter',
      startTimeUtc: '2026-07-22T16:00:00.000Z',
      durationMinutes: 30,
      status: 'scheduled',
    },
  },
};

const update = {
  appointmentId: '4301',
  existingCrmResponse: {
    data: calendarEntry({
      id: 4301,
      attendees: [
        { id: 5101, name: 'Alice Client', type: 'Contact' },
        { id: 5102, name: 'Bob Client', type: 'Contact' },
      ],
    }),
  },
  appRequestBody: {
    patch: {
      title: 'Updated strategy meeting',
      summary: 'Review revised evidence',
      startTimeUtc: '2026-07-23T17:00:00.000Z',
      durationMinutes: 60,
      contacts: [5102, { id: 5103, type: 'Contact' }],
    },
  },
  expectedCrmRequestBody: {
    data: {
      summary: 'Updated strategy meeting',
      description: 'Review revised evidence',
      start_at: '2026-07-23T17:00:00.000Z',
      end_at: '2026-07-23T18:00:00.000Z',
      attendees: [
        { id: 5101, type: 'Contact', _destroy: true },
        { id: 5102, type: 'Contact' },
        { id: 5103, type: 'Contact' },
      ],
    },
  },
  crmResponse: {
    data: calendarEntry({
      id: 4301,
      summary: 'Updated strategy meeting',
      description: 'Review revised evidence',
      start_at: '2026-07-23T17:00:00.000Z',
      end_at: '2026-07-23T18:00:00.000Z',
      attendees: [
        { id: 5102, name: 'Bob Client', type: 'Contact' },
        { id: 5103, name: 'Carol Client', type: 'Contact' },
      ],
      external_properties: [
        { name: 'rcAppointmentStatus', value: 'scheduled' },
      ],
    }),
  },
  expectedResponse: {
    successful: true,
    appointmentId: '4301',
    appointment: {
      id: '4301',
      title: 'Updated strategy meeting',
      summary: 'Review revised evidence',
      startTimeUtc: '2026-07-23T17:00:00.000Z',
      durationMinutes: 60,
      status: 'scheduled',
      attendeeIds: ['5102', '5103'],
    },
  },
};

const refresh = {
  appointmentId: '4401',
  crmResponse: {
    data: calendarEntry({
      id: 4401,
      summary: 'Refreshed appointment',
      description: 'Current CRM description',
      start_at: '2026-07-24T18:00:00.000Z',
      end_at: '2026-07-24T18:20:00.000Z',
      attendees: [{ id: 5201, name: 'Refresh Client', type: 'Contact' }],
      external_properties: [
        { name: 'rcAppointmentParticipantName', value: 'Refresh Client' },
        { name: 'rcAppointmentStatus', value: 'scheduled' },
      ],
    }),
  },
  expectedResponse: {
    successful: true,
    appointmentId: '4401',
    appointment: {
      id: '4401',
      participantName: 'Refresh Client',
      contactId: '5201',
      contactType: 'Contact',
      attendeeIds: ['5201'],
      title: 'Refreshed appointment',
      summary: 'Current CRM description',
      startTimeUtc: '2026-07-24T18:00:00.000Z',
      durationMinutes: 20,
      status: 'scheduled',
    },
  },
};

const cancel = {
  appointmentId: '4501',
  expectedResponse: {
    successful: true,
    appointmentId: '4501',
    returnMessage: {
      message: 'Appointment cancelled successfully.',
      messageType: 'success',
      ttl: 5000,
    },
  },
};

const clioAppointmentCases = {
  user,
  provider: {
    ...provider,
    apiBaseUrl: `https://${provider.hostname}`,
    expectedAuthorization: `Bearer ${user.accessToken}`,
    requestHeaders: {
      'rc-account-id': user.hashedAccountId,
      'rc-extension-id': user.hashedExtensionId,
    },
  },
  expectedCapabilities: {
    listAppointments: true,
    createAppointment: true,
    updateAppointment: true,
    refreshAppointment: true,
    confirmAppointment: false,
    cancelAppointment: true,
  },
  scenarios: {
    list,
    create,
    update,
    refresh,
    cancel,
  },
};

module.exports = { clioAppointmentCases };

export {};
