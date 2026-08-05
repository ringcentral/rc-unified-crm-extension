// Shared fictional data intentionally covers Unicode names, reserved phone ranges,
// multiline notes, direction changes, and optional call fields without using real customers.
const practicalContacts = {
  renewalCustomer: {
    name: 'Maya Patel',
    phoneNumber: '+14155550142',
  },
  internationalProspect: {
    name: 'Élodie Martin',
    phoneNumber: '+441632960123',
  },
  recruitingCandidate: {
    name: "Siobhán O'Connor",
    phoneNumber: '+14155550165',
  },
  smallBusinessOwner: {
    name: 'José Álvarez',
    phoneNumber: '+14155550176',
  },
};

const practicalAgents = {
  accountManager: {
    name: 'Jordan Lee',
    phoneNumber: '+14155550101',
  },
  supportSpecialist: {
    name: 'Alex Morgan',
    phoneNumber: '+14155550102',
  },
};

const practicalNotes = {
  renewalFollowUp: [
    'Reviewed the annual service renewal and the two available plans.',
    'Customer requested a written quote by Friday and prefers email follow-up.',
  ].join('\n'),
  noAnswer: 'No answer. Retry after 4:00 PM in the customer\'s local time zone.',
  recruitingFollowUp: [
    'Candidate confirmed availability for the warehouse supervisor interview.',
    'Send the calendar invitation and parking instructions before noon tomorrow.',
  ].join('\n'),
  supportResolution: [
    'Confirmed that incoming calls now route to the support queue.',
    'Customer will monitor the configuration for one business day before closure.',
  ].join('\n'),
};

function buildPracticalCall({
  id,
  sessionId,
  telephonySessionId,
  extensionNumber,
  direction = 'Inbound',
  contact = practicalContacts.renewalCustomer,
  agent = practicalAgents.accountManager,
  duration = 487,
  result = 'Completed',
  startTime = '2026-03-12T14:35:20.000Z',
  recordingLink,
  customSubject,
}) {
  const inbound = direction === 'Inbound';
  return {
    id,
    sessionId,
    telephonySessionId,
    extensionNumber,
    direction,
    from: inbound ? contact : agent,
    to: inbound ? agent : contact,
    duration,
    result,
    startTime: new Date(startTime).getTime(),
    ...(recordingLink ? { recording: { link: recordingLink } } : {}),
    ...(customSubject ? { customSubject } : {}),
  };
}

module.exports = {
  practicalContacts,
  practicalAgents,
  practicalNotes,
  buildPracticalCall,
};

export {};
