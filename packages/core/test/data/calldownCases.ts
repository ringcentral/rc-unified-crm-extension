const scheduledCalldownCase = {
  body: {
    contactId: 12345,
    contactType: 'Lead',
    contactName: 'Ignored By Current Schema',
    phoneNumber: '+15551234567',
    scheduledAt: '2026-07-02T13:00:00.000Z',
  },
  expectedRecord: {
    userId: 'user-1',
    contactId: '12345',
    contactType: 'Lead',
    status: 'scheduled',
  },
};

const calldownListRecords = [
  {
    id: 'later',
    userId: 'user-1',
    contactId: 'contact-2',
    status: 'called',
    scheduledAt: new Date('2026-07-02T14:00:00.000Z'),
  },
  {
    id: 'earlier',
    userId: 'user-1',
    contactId: 'contact-1',
    status: 'scheduled',
    scheduledAt: new Date('2026-07-02T13:00:00.000Z'),
  },
  {
    id: 'other-user',
    userId: 'user-2',
    contactId: 'contact-3',
    status: 'scheduled',
    scheduledAt: new Date('2026-07-02T12:00:00.000Z'),
  },
];

const calldownStatusRecords = [
  {
    id: 'called',
    userId: 'user-1',
    status: 'called',
    scheduledAt: new Date('2026-07-02T13:00:00.000Z'),
  },
  {
    id: 'scheduled',
    userId: 'user-1',
    status: 'scheduled',
    scheduledAt: new Date('2026-07-02T14:00:00.000Z'),
  },
  {
    id: 'removed-status',
    userId: 'user-1',
    status: 'removed',
    scheduledAt: new Date('2026-07-02T15:00:00.000Z'),
  },
];

const calldownStatusFilterCases = [
  { label: 'called', status: 'called', expectedIds: ['called'] },
  {
    label: 'not called with spaces',
    status: 'not called',
    expectedIds: ['scheduled', 'removed-status'],
  },
  {
    label: 'not called with underscore',
    status: 'not_called',
    expectedIds: ['scheduled', 'removed-status'],
  },
  {
    label: 'not called without separator',
    status: 'notcalled',
    expectedIds: ['scheduled', 'removed-status'],
  },
  {
    label: 'case-insensitive all',
    status: 'ALL',
    expectedIds: ['called', 'scheduled', 'removed-status'],
  },
  {
    label: 'missing status defaults to all',
    status: undefined,
    expectedIds: ['called', 'scheduled', 'removed-status'],
  },
];

const unauthorizedCalldownOperationCases = [
  { label: 'schedule', method: 'schedule', args: { body: {} } },
  { label: 'list', method: 'list', args: {} },
  { label: 'remove', method: 'remove', args: { id: 'call-1' } },
  { label: 'mark called', method: 'markCalled', args: { id: 'call-1' } },
  {
    label: 'update',
    method: 'update',
    args: { id: 'call-1', updateData: { status: 'called' } },
  },
];

const calldownUpdateCase = {
  existingRecord: {
    id: 'call-to-update',
    userId: 'user-1',
    contactId: 'old-contact',
    contactType: 'Lead',
    status: 'scheduled',
    scheduledAt: new Date('2026-07-02T13:00:00.000Z'),
  },
  updateData: {
    contactId: 'new-contact',
    contactType: 'Contact',
    status: 'called',
    scheduledAt: '2026-07-02T15:00:00.000Z',
    lastCallAt: '2026-07-02T15:10:00.000Z',
    unexpectedField: 'ignored',
  },
  expectedRecord: {
    contactId: 'new-contact',
    contactType: 'Contact',
    status: 'called',
  },
};

module.exports = {
  scheduledCalldownCase,
  calldownListRecords,
  calldownStatusRecords,
  calldownStatusFilterCases,
  unauthorizedCalldownOperationCases,
  calldownUpdateCase,
};

export {};
