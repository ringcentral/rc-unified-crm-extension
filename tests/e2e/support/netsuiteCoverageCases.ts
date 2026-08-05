const identity = {
  platform: 'netsuite',
  userId: 'e2e-netsuite-coverage-user',
  oauthUserId: '99011-ACME-netsuite',
  rcAccountId: 'e2e-netsuite-coverage-rc-account',
  rcExtensionId: 'e2e-netsuite-coverage-rc-extension',
  rcUserNumber: '+14155557000',
  rcAccessToken: 'e2e-netsuite-coverage-rc-token',
  hashedAccountId: 'e2e-netsuite-coverage-hashed-account',
  hashedExtensionId: 'e2e-netsuite-coverage-hashed-extension',
  accessToken: 'e2e-netsuite-coverage-access-token',
  refreshToken: 'e2e-netsuite-coverage-refresh-token',
  accountId: '8765432',
  clientId: 'e2e-netsuite-coverage-client-id',
  clientSecret: 'e2e-netsuite-coverage-client-secret',
};

const provider = {
  hostname: `${identity.accountId}.suitetalk.api.netsuite.com`,
  loginHostname: `${identity.accountId}.app.netsuite.com`,
  suiteTalkBaseUrl: `https://${identity.accountId}.suitetalk.api.netsuite.com`,
  restletsBaseUrl: `https://${identity.accountId}.restlets.api.netsuite.com`,
  authorization: `Bearer ${identity.accessToken}`,
};

const createNewContactOption = {
  id: 'createNewContact',
  name: 'Create new contact...',
  additionalInfo: null,
  isNewContact: true,
};

const contacts = {
  unmatched: {
    phoneNumber: '+14155557001',
    queryPhone: '4155557001',
    crmResponse: { items: [] },
    expectedContacts: [createNewContactOption],
  },
  multiple: {
    phoneNumber: '+14155557002',
    queryPhone: '4155557002',
    crmResponse: {
      items: [
        {
          id: 7011,
          firstname: 'Ada',
          middlename: 'M',
          lastname: 'Lovelace',
          entitytitle: 'Ada Lovelace',
          phone: '+14155557002',
          datecreated: '2026-06-01T10:00:00Z',
          lastmodifieddate: '2026-07-01T11:00:00Z',
        },
        {
          id: 7012,
          firstname: 'Grace',
          middlename: 'B',
          lastname: 'Hopper',
          entitytitle: 'Grace Hopper',
          phone: '+14155557002',
          datecreated: '2026-06-02T10:00:00Z',
          lastmodifieddate: '2026-07-02T11:00:00Z',
        },
      ],
    },
    expectedContacts: [
      {
        id: 7011,
        name: 'Ada M Lovelace',
        phone: '+14155557002',
        homephone: '',
        mobilephone: '',
        officephone: '',
        createdDate: '2026-06-01T10:00:00Z',
        mostRecentActivityDate: '2026-07-01T11:00:00Z',
        additionalInfo: {},
        type: 'contact',
      },
      {
        id: 7012,
        name: 'Grace B Hopper',
        phone: '+14155557002',
        homephone: '',
        mobilephone: '',
        officephone: '',
        createdDate: '2026-06-02T10:00:00Z',
        mostRecentActivityDate: '2026-07-02T11:00:00Z',
        additionalInfo: {},
        type: 'contact',
      },
      createNewContactOption,
    ],
  },
  create: {
    phoneNumber: '+14155557003',
    newContactName: 'Katherine G Johnson',
    customerId: '7013',
    appRequestBody: {
      phoneNumber: '+14155557003',
      newContactName: 'Katherine G Johnson',
      newContactType: 'custjob',
    },
    expectedCrmBody: {
      firstName: 'Katherine',
      middleName: 'G',
      lastName: 'Johnson',
      entityId: 'Katherine Johnson',
      phone: '+14155557003',
      isPerson: true,
    },
  },
};

const message = {
  contact: {
    id: 7021,
    name: 'NetSuite Message Customer',
    phoneNumber: '+14155557021',
    type: 'custjob',
  },
  agentName: 'NetSuite Coverage Agent',
  conversationId: 'e2e-netsuite-conversation-7021',
  conversationLogId: 'e2e-netsuite-conversation-7021-2026-07-14',
  providerLogId: '7022',
  inbound: {
    id: 7021001,
    type: 'SMS',
    creationTime: '2026-07-14T03:00:00.000Z',
    direction: 'Inbound',
    subject: 'Please confirm the NetSuite appointment.',
    conversationId: 'e2e-netsuite-conversation-7021',
    from: {
      phoneNumber: '+14155557021',
      name: 'NetSuite Message Customer',
    },
    to: [{ phoneNumber: identity.rcUserNumber, name: 'NetSuite Coverage Agent' }],
    attachments: [{ type: 'Text', contentType: 'text/plain' }],
  },
  outbound: {
    id: '7021002',
    type: 'SMS',
    creationTime: '2026-07-14T03:05:00.000Z',
    direction: 'Outbound',
    subject: 'Confirmed for tomorrow at 10 AM.',
    conversationId: 'e2e-netsuite-conversation-7021',
    from: { phoneNumber: identity.rcUserNumber, name: 'NetSuite Coverage Agent' },
    to: [{ phoneNumber: '+14155557021', name: 'NetSuite Message Customer' }],
    attachments: [{ type: 'Text', contentType: 'text/plain' }],
  },
};

function buildMessageRequest(messages) {
  return {
    logInfo: {
      conversationId: message.conversationId,
      conversationLogId: message.conversationLogId,
      correspondents: [{
        phoneNumber: message.contact.phoneNumber,
        name: message.contact.name,
      }],
      messages,
      rcAccessToken: 'e2e-netsuite-message-media-token',
    },
    contactId: message.contact.id,
    contactName: message.contact.name,
    contactType: message.contact.type,
  };
}

function calendarEvent(overrides = {}) {
  return {
    id: '7031',
    title: 'NetSuite case review',
    description: 'Review evidence<br />and next steps',
    startDate: '7/20/2026',
    startTime: '10:00 am',
    endTime: '10:45 am',
    status: { id: 'CONFIRMED' },
    attendees: [{ id: 7011, name: 'Ada Lovelace', type: 'contact' }],
    ...overrides,
  };
}

const appointments = {
  list: {
    requestQuery: { startDate: '2026-07-20', endDate: '2026-07-21' },
    crmResponse: { data: [calendarEvent()] },
  },
  create: {
    appointmentId: '7032',
    requestBody: {
      payload: {
        title: 'NetSuite initial consultation',
        summary: 'Discuss the new case',
        startTimeUtc: '2026-07-21T15:00:00.000Z',
        durationMinutes: 30,
        contacts: [{ id: '7011', type: 'contact' }],
      },
    },
    expectedCrmBody: {
      title: 'NetSuite initial consultation',
      startDate: '2026-07-21',
      startTime: '10:00:00',
      endTime: '10:30:00',
      timedEvent: true,
      message: 'Discuss the new case',
      attendee: { items: [{ attendee: { id: '7011' } }] },
    },
    crmRecord: calendarEvent({
      id: '7032',
      title: 'NetSuite initial consultation',
      description: 'Discuss the new case',
      startDate: '2026-07-21',
      startTime: '10:00:00',
      endTime: '10:30:00',
      status: { id: 'TENTATIVE' },
      attendees: [],
      attendee: { items: [{ attendee: { id: '7011', name: 'Ada Lovelace', type: 'contact' } }] },
    }),
  },
  update: {
    appointmentId: '7032',
    requestBody: {
      title: 'NetSuite updated consultation',
      summary: 'Updated agenda',
      contacts: [{ id: '7012' }],
    },
    expectedCrmBody: {
      message: 'Updated agenda',
      title: 'NetSuite updated consultation',
      attendee: { items: [{ attendee: { id: '7012' } }] },
    },
    crmRecord: calendarEvent({
      id: '7032',
      title: 'NetSuite updated consultation',
      description: 'Updated agenda',
      startDate: '2026-07-21',
      startTime: '10:00:00',
      endTime: '10:30:00',
      status: { id: 'CONFIRMED' },
      attendees: [{ id: '7012', name: 'Grace Hopper', type: 'contact' }],
    }),
  },
  refresh: {
    appointmentId: '7033',
    crmRecord: calendarEvent({ id: '7033', title: 'NetSuite refreshed event' }),
  },
  confirm: { appointmentId: '7034' },
  cancel: { appointmentId: '7035' },
};

const userMapping = {
  crmResponse: {
    items: [
      {
        id: 7041,
        firstname: 'Ada',
        middlename: 'M',
        lastname: 'Mapping',
        email: 'ada.netsuite.mapping@example.test',
        giveaccess: true,
        isinactive: false,
      },
      {
        id: 7042,
        firstname: 'Unmapped',
        lastname: 'Employee',
        email: 'unmapped.netsuite@example.test',
        giveaccess: true,
        isinactive: false,
      },
    ],
  },
  requestBody: {
    rcExtensionList: [
      {
        id: 'e2e-netsuite-mapping-extension',
        firstName: 'Ada',
        lastName: 'Mapping',
        extensionNumber: '7041',
        email: 'ada.netsuite.mapping@example.test',
      },
    ],
  },
  expectedResponse: [
    {
      crmUser: {
        id: 7041,
        name: 'Ada M Mapping',
        email: 'ada.netsuite.mapping@example.test',
      },
      rcUser: [{
        extensionId: 'e2e-netsuite-mapping-extension',
        name: 'Ada Mapping',
        extensionNumber: '7041',
        email: 'ada.netsuite.mapping@example.test',
      }],
    },
    {
      crmUser: {
        id: 7042,
        name: 'Unmapped Employee',
        email: 'unmapped.netsuite@example.test',
      },
      rcUser: [],
    },
  ],
  expectedPersistedMappings: [{
    crmUserId: '7041',
    rcExtensionId: ['e2e-netsuite-mapping-extension'],
  }],
};

const oauth = {
  authorizationCode: 'e2e-netsuite-oauth-code',
  entity: '99011',
  company: 'ACME',
  role: '3',
  accessToken: 'e2e-netsuite-oauth-access-token',
  refreshToken: 'e2e-netsuite-oauth-refresh-token',
  tokenResponse: {
    access_token: 'e2e-netsuite-oauth-access-token',
    refresh_token: 'e2e-netsuite-oauth-refresh-token',
    token_type: 'Bearer',
    expires_in: 7200,
  },
  currentUserResponse: {
    name: 'NetSuite OAuth User',
    email: 'netsuite.oauth@example.test',
    subsidiary: '1',
  },
  oneWorldResponse: { oneWorldEnabled: true },
  permissionResponse: {
    permissionResults: {
      LIST_CONTACT: true,
      REPO_ANALYTICS: true,
      TRAN_SALESORD: true,
      LIST_CUSTJOB: true,
      ADMI_LOGIN_OAUTH2: true,
      ADMI_RESTWEBSERVICES: true,
      LIST_CALL: true,
      LIST_SUBSIDIARY: true,
    },
  },
};

const netsuiteCoverageCase = {
  identity,
  provider,
  contacts,
  message,
  appointments,
  userMapping,
  oauth,
};

module.exports = {
  netsuiteCoverageCase,
  buildMessageRequest,
};

export {};
