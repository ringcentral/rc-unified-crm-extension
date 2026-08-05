const identity = {
  userId: '8462001-bullhorn',
  platform: 'bullhorn',
  rcAccountId: 'e2e-bullhorn-coverage-account',
  rcExtensionId: 'e2e-bullhorn-coverage-extension',
  rcUserNumber: '+14155556000',
  hashedAccountId: 'e2e-bullhorn-coverage-hashed-account',
  hashedExtensionId: 'e2e-bullhorn-coverage-hashed-extension',
  rcAccessToken: 'e2e-bullhorn-coverage-rc-access-token',
  accessToken: 'e2e-bullhorn-coverage-access-token',
  refreshToken: 'e2e-bullhorn-coverage-refresh-token',
  agentName: 'Bailey Recruiter',
};

const provider = {
  hostname: 'app.bullhornstaffing.com',
  apiBaseUrl: 'https://login.e2e-bullhorn.example.test',
  restBaseUrl: 'https://rest.e2e-bullhorn.example.test',
  restPath: '/rest-services/app-level',
  tokenPath: '/oauth/token',
  bhRestToken: 'e2e-bullhorn-coverage-bh-rest-token',
  corporateUserId: 84620,
  clientId: 'e2e-bullhorn-client-id',
  clientSecret: 'e2e-bullhorn-client-secret',
  authorizationCode: 'e2e-bullhorn-authorization-code',
  redirectUri: 'https://ringcentral.github.io/ringcentral-embeddable/redirect.html',
  rateLimitHeaders: {
    'ratelimit-remaining': '99',
    'ratelimit-limit': '100',
    'ratelimit-reset': '60',
  },
};

const contact = {
  id: 84631,
  name: 'Morgan Candidate',
  phoneNumber: '+14155556031',
  type: 'Candidate',
};

const contacts = {
  unmatched: {
    phoneNumber: '+14155556010',
    statuses: {
      Lead: [{ const: 'New', title: 'New' }],
      Candidate: [{ const: 'Submitted', title: 'Submitted' }],
      Contact: [{ const: 'Active', title: 'Active' }],
    },
  },
  multiple: {
    phoneNumber: '+14155556020',
    crmResponses: {
      Contact: {
        id: 84641,
        name: 'Alex Client',
        phone: '+14155556020',
        dateAdded: Date.parse('2026-07-01T10:00:00.000Z'),
        dateLastModified: Date.parse('2026-07-02T10:00:00.000Z'),
        dateLastVisit: Date.parse('2026-07-03T10:00:00.000Z'),
      },
      Candidate: {
        id: 84642,
        name: 'Alex Candidate',
        phone: '+14155556020',
        dateAdded: Date.parse('2026-07-04T10:00:00.000Z'),
        dateLastComment: Date.parse('2026-07-05T10:00:00.000Z'),
        dateLastModified: Date.parse('2026-07-06T10:00:00.000Z'),
      },
      Lead: {
        id: 84643,
        name: 'Alex Lead',
        phone: '+14155556020',
        status: 'New',
        dateAdded: Date.parse('2026-07-07T10:00:00.000Z'),
        dateLastComment: Date.parse('2026-07-08T10:00:00.000Z'),
        dateLastModified: Date.parse('2026-07-09T10:00:00.000Z'),
      },
    },
  },
  create: {
    crmId: 84651,
    appRequestBody: {
      phoneNumber: '+14155556051',
      newContactName: 'Taylor Lead',
      newContactType: 'Lead',
      additionalSubmission: { status: 'New' },
    },
    expectedCrmRequestBody: {
      name: 'Taylor Lead',
      firstName: 'Taylor',
      lastName: 'Lead',
      phone: '+14155556051',
      status: 'New',
    },
  },
};

const conversation = {
  id: '8462001000001',
  logId: '8462001000001-2026-07-14',
  mediaAccessToken: 'e2e-bullhorn-message-media-access-token',
  noteId: 84661,
};

const inboundMessage = {
  uri: 'https://platform.ringcentral.com/restapi/v1.0/account/~/extension/~/message-store/8462001001',
  id: '8462001001',
  to: [{ phoneNumber: identity.rcUserNumber, name: identity.agentName }],
  from: {
    phoneNumber: contact.phoneNumber,
    name: contact.name,
    location: 'Denver, CO',
  },
  type: 'SMS',
  creationTime: '2026-07-14T03:00:00.000Z',
  readStatus: 'Unread',
  priority: 'Normal',
  attachments: [{
    id: '8462001001',
    uri: 'https://media.ringcentral.com/message-store/8462001001/content/8462001001',
    type: 'Text',
    contentType: 'text/plain',
  }],
  direction: 'Inbound',
  availability: 'Alive',
  subject: 'Can we schedule an interview?',
  messageStatus: 'Received',
  conversationId: conversation.id,
  conversation: { id: conversation.id },
  lastModifiedTime: '2026-07-14T03:00:01.000Z',
};

const outboundMessage = {
  uri: 'https://platform.ringcentral.com/restapi/v1.0/account/~/extension/~/message-store/8462001002',
  id: '8462001002',
  to: [{ phoneNumber: contact.phoneNumber, name: contact.name }],
  from: { phoneNumber: identity.rcUserNumber, name: identity.agentName },
  type: 'SMS',
  creationTime: '2026-07-14T03:05:00.000Z',
  readStatus: 'Read',
  priority: 'Normal',
  attachments: [
    {
      id: '8462001002',
      uri: 'https://media.ringcentral.com/message-store/8462001002/content/8462001002',
      type: 'Text',
      contentType: 'text/plain',
    },
    {
      id: '8462001002-attachment',
      uri: 'https://media.ringcentral.com/message-store/8462001002/content/attachment',
      type: 'MmsAttachment',
      contentType: 'image/jpeg',
      size: 128000,
    },
  ],
  direction: 'Outbound',
  availability: 'Alive',
  subject: 'Yes, I have sent the interview options.',
  messageStatus: 'Delivered',
  conversationId: conversation.id,
  conversation: { id: conversation.id },
  lastModifiedTime: '2026-07-14T03:05:01.000Z',
};

function buildMessageLogRequest(messages) {
  return {
    logInfo: {
      conversationId: conversation.id,
      conversationLogId: conversation.logId,
      correspondents: [{ phoneNumber: contact.phoneNumber, name: contact.name }],
      messages,
      rcAccessToken: conversation.mediaAccessToken,
    },
    contactId: contact.id,
    contactName: contact.name,
    contactType: contact.type,
    additionalSubmission: { noteActions: 'SMS' },
  };
}

const appointmentContact = {
  id: 84671,
  name: 'Jordan Interviewee',
  type: 'Candidate',
};
const secondAppointmentContact = {
  id: 84672,
  name: 'Casey Lead',
  type: 'Lead',
};

function bullhornAppointment(overrides = {}) {
  return {
    id: 84681,
    subject: 'Candidate interview',
    description: 'First-round interview',
    dateBegin: Date.parse('2026-07-20T15:00:00.000Z'),
    dateEnd: Date.parse('2026-07-20T15:45:00.000Z'),
    isDeleted: false,
    candidateReference: { id: appointmentContact.id },
    clientContactReference: null,
    lead: null,
    ...overrides,
  };
}

const appointments = {
  list: {
    appRequestQuery: { startDate: '2026-07-01', endDate: '2026-07-31' },
    crmResponse: { data: [bullhornAppointment()] },
    attendeeCrmResponse: {
      data: [{
        id: 84691,
        appointment: { id: 84681 },
        attendee: { id: appointmentContact.id },
        acceptanceStatus: 'Accepted',
      }],
    },
    expectedResponse: {
      successful: true,
      appointments: [{
        thirdPartyAppointmentId: '84681',
        id: '84681',
        title: 'Candidate interview',
        description: 'First-round interview',
        participantName: '',
        startTimeUtc: '2026-07-20T15:00:00.000Z',
        durationMinutes: 45,
        status: 'scheduled',
        contactId: String(appointmentContact.id),
        contactType: 'Candidate',
        attendeeIds: [],
        attendees: [{ id: String(appointmentContact.id), status: 'Accepted' }],
      }],
    },
  },
  create: {
    appointmentId: '84682',
    appRequestBody: {
      payload: {
        title: 'Client screening',
        summary: 'Discuss the open role',
        startTimeUtc: '2026-07-22T16:00:00.000Z',
        durationMinutes: 30,
        contacts: [
          { id: String(appointmentContact.id), type: appointmentContact.type },
          { id: String(secondAppointmentContact.id), type: secondAppointmentContact.type },
          { id: String(appointmentContact.id), type: appointmentContact.type },
        ],
      },
    },
    expectedCrmRequestBody: {
      dateBegin: Date.parse('2026-07-22T16:00:00.000Z'),
      dateEnd: Date.parse('2026-07-22T16:30:00.000Z'),
      description: 'Discuss the open role',
      isPrivate: false,
      subject: 'Client screening',
      isDeleted: false,
      candidateReference: { id: appointmentContact.id },
    },
    expectedAttendeeBodies: [
      {
        appointment: { id: 84682 },
        attendee: { id: appointmentContact.id },
      },
      {
        appointment: { id: 84682 },
        attendee: { id: secondAppointmentContact.id },
      },
    ],
  },
  update: {
    appointmentId: '84683',
    appRequestBody: {
      patch: {
        title: 'Updated candidate interview',
        summary: 'Technical interview panel',
        startTimeUtc: '2026-07-23T17:00:00.000Z',
        durationMinutes: 60,
      },
    },
    expectedCrmRequestBody: {
      subject: 'Updated candidate interview',
      description: 'Technical interview panel',
      dateBegin: Date.parse('2026-07-23T17:00:00.000Z'),
      dateEnd: Date.parse('2026-07-23T18:00:00.000Z'),
    },
    crmResponse: {
      data: bullhornAppointment({
        id: 84683,
        subject: 'Updated candidate interview',
        description: 'Technical interview panel',
        dateBegin: Date.parse('2026-07-23T17:00:00.000Z'),
        dateEnd: Date.parse('2026-07-23T18:00:00.000Z'),
        candidateReference: null,
        clientContactReference: { id: appointmentContact.id },
      }),
    },
  },
  refresh: {
    appointmentId: '84684',
    crmResponse: {
      data: bullhornAppointment({
        id: 84684,
        subject: 'Refreshed interview',
        description: 'Latest details from Bullhorn',
        dateBegin: Date.parse('2026-07-24T18:00:00.000Z'),
        dateEnd: Date.parse('2026-07-24T18:20:00.000Z'),
        candidateReference: null,
        lead: { id: secondAppointmentContact.id },
        attendees: { data: [{ id: appointmentContact.id }, { id: secondAppointmentContact.id }] },
      }),
    },
  },
  cancel: {
    appointmentId: '84685',
    expectedResponse: {
      successful: true,
      appointmentId: '84685',
      returnMessage: {
        message: 'Appointment cancelled successfully.',
        messageType: 'success',
        ttl: 5000,
      },
    },
  },
};

const userMapping = {
  crmUser: {
    id: 84620,
    name: 'Bailey Recruiter',
    email: 'bailey.recruiter@example.test',
  },
  legacyPersistedMappings: [{ crmUserId: 'legacy-bullhorn-user', rcExtensionId: ['legacy-extension'] }],
  appRequestBody: {
    rcExtensionList: [{
      id: identity.rcExtensionId,
      firstName: 'Bailey',
      lastName: 'Recruiter',
      extensionNumber: '6201',
      email: 'bailey.recruiter@example.test',
    }],
  },
  expectedResult: [{
    crmUser: {
      id: 84620,
      name: 'Bailey Recruiter',
      email: 'bailey.recruiter@example.test',
    },
    rcUser: [{
      extensionId: identity.rcExtensionId,
      name: 'Bailey Recruiter',
      extensionNumber: '6201',
      email: 'bailey.recruiter@example.test',
    }],
  }],
  expectedPersistedMappings: [{
    crmUserId: '84620',
    rcExtensionId: [identity.rcExtensionId],
  }],
};

const oauth = {
  username: 'bailey.recruiter',
  userName: identity.agentName,
  tokenResponse: {
    access_token: identity.accessToken,
    refresh_token: identity.refreshToken,
    token_type: 'Bearer',
    expires_in: 7200,
  },
  loginResponse: {
    BhRestToken: provider.bhRestToken,
    restUrl: `${provider.restBaseUrl}${provider.restPath}/`,
  },
  corporateUserResponse: {
    data: [{
      id: provider.corporateUserId,
      name: identity.agentName,
      timeZoneOffsetEST: 300,
      masterUserID: Number(identity.userId.replace('-bullhorn', '')),
    }],
  },
};

const restUrl = `${provider.restBaseUrl}${provider.restPath}/`;
const requestHeaders = {
  'X-RC-Access-Token': identity.rcAccessToken,
  'rc-account-id': identity.hashedAccountId,
  'rc-extension-id': identity.hashedExtensionId,
};

const bullhornCoverageCases = {
  identity,
  provider: {
    ...provider,
    restUrl,
    requestHeaders,
    expectedBhRestToken: provider.bhRestToken,
  },
  contact,
  contacts,
  conversation,
  messages: {
    inbound: inboundMessage,
    outbound: outboundMessage,
  },
  appointments,
  userMapping,
  oauth,
  commentActions: ['Call', 'SMS'],
};

module.exports = {
  bullhornCoverageCases,
  buildBullhornMessageLogRequest: buildMessageLogRequest,
};

export {};
