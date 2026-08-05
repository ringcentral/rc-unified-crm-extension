const appointmentListFilterCases = [
  { label: 'today', filter: 'today' },
  { label: 'past', filter: 'past' },
  { label: 'all', filter: 'all' },
  { label: 'unknown filter fallback', filter: 'unknown-filter' },
];

const appointmentActionCases = [
  {
    label: 'confirm appointment',
    toolName: 'confirmAppointment',
    handlerName: 'confirmAppointment',
    capabilityName: 'confirmAppointment',
    defaultMessage: 'Appointment confirmed successfully',
    defaultError: 'Failed to confirm appointment',
  },
  {
    label: 'cancel appointment',
    toolName: 'cancelAppointment',
    handlerName: 'cancelAppointment',
    capabilityName: 'cancelAppointment',
    defaultMessage: 'Appointment cancelled successfully',
    defaultError: 'Failed to cancel appointment',
  },
];

module.exports = {
  appointmentListFilterCases,
  appointmentActionCases,
};

export {};
