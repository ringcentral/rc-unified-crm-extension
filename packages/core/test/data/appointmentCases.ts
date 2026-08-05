const appointmentUser = {
  id: 'user-1',
  hostname: 'crm.example.com',
  accessToken: 'access-token',
  platformAdditionalInfo: {},
};

const appointmentCreatePayload = {
  title: 'Meeting',
  summary: 'Discuss the project',
  startTimeUtc: '2026-07-20T19:00:00.000Z',
  durationMinutes: 30,
};

const appointmentListRange = {
  startDate: '2026-07-01',
  endDate: '2026-07-31',
};

const appointmentApiKeyOperationCases = [
  {
    label: 'list appointments',
    handlerName: 'listAppointments',
    connectorMethod: 'listAppointments',
    handlerArgs: { range: appointmentListRange },
    connectorArgs: { range: appointmentListRange },
    connectorResult: { appointments: [{ id: 'appt-1' }] },
    expectedResult: { appointments: [{ id: 'appt-1' }] },
  },
  {
    label: 'create an appointment',
    handlerName: 'createAppointment',
    connectorMethod: 'createAppointment',
    handlerArgs: {
      payload: { ...appointmentCreatePayload, title: 'Create' },
    },
    connectorArgs: {
      payload: { ...appointmentCreatePayload, title: 'Create' },
    },
    connectorResult: {
      appointmentId: 'appt-2',
      appointment: { id: 'appt-2' },
    },
    expectedResult: {
      appointmentId: 'appt-2',
      appointment: { id: 'appt-2' },
    },
  },
  {
    label: 'update an appointment',
    handlerName: 'updateAppointment',
    connectorMethod: 'updateAppointment',
    handlerArgs: {
      appointmentId: 'appt-2',
      patchBody: { title: 'Update' },
    },
    connectorArgs: {
      appointmentId: 'appt-2',
      patchBody: { title: 'Update' },
    },
    connectorResult: { appointment: { id: 'appt-3' } },
    expectedResult: { appointment: { id: 'appt-3' } },
  },
  {
    label: 'refresh an appointment',
    handlerName: 'refreshAppointment',
    connectorMethod: 'refreshAppointment',
    handlerArgs: { appointmentId: 'appt-3' },
    connectorArgs: { appointmentId: 'appt-3' },
    connectorResult: { appointment: { id: 'appt-4' } },
    expectedResult: { appointment: { id: 'appt-4' } },
  },
  {
    label: 'confirm an appointment',
    handlerName: 'confirmAppointment',
    connectorMethod: 'confirmAppointment',
    handlerArgs: { appointmentId: 'appt-4' },
    connectorArgs: { appointmentId: 'appt-4' },
    connectorResult: { appointment: { id: 'appt-5' } },
    expectedResult: { appointment: { id: 'appt-5' } },
  },
  {
    label: 'cancel an appointment',
    handlerName: 'cancelAppointment',
    connectorMethod: 'cancelAppointment',
    handlerArgs: { appointmentId: 'appt-5' },
    connectorArgs: { appointmentId: 'appt-5' },
    connectorResult: { appointment: { id: 'appt-6' } },
    expectedResult: { appointment: { id: 'appt-6' } },
  },
];

const invalidAppointmentConnectorResultCases = [
  { label: 'null result', connectorResult: null },
  { label: 'undefined result', connectorResult: undefined },
  { label: 'string result', connectorResult: 'created' },
  { label: 'numeric result', connectorResult: 1 },
  { label: 'array result', connectorResult: [] },
  {
    label: 'non-boolean successful value',
    connectorResult: {
      successful: 'false',
      appointment: { id: 'appt-invalid' },
    },
  },
];

module.exports = {
  appointmentUser,
  appointmentCreatePayload,
  appointmentListRange,
  appointmentApiKeyOperationCases,
  invalidAppointmentConnectorResultCases,
};

export {};
