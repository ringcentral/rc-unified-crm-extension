const identity = {
  platform: 'clio',
  userId: '71101-clio',
  oauthUserId: '71102-clio',
  rcAccountId: 'e2e-clio-coverage-account',
  rcExtensionId: 'e2e-clio-coverage-admin-extension',
  rcUserNumber: '+14155557100',
  rcAccessToken: 'e2e-clio-coverage-rc-token',
  hashedAccountId: 'e2e-clio-coverage-hashed-account',
  hashedExtensionId: 'e2e-clio-coverage-hashed-extension',
  accessToken: 'e2e-clio-coverage-access-token',
  refreshToken: 'e2e-clio-coverage-refresh-token',
  clientId: 'e2e-clio-coverage-client-id',
  clientSecret: 'e2e-clio-coverage-client-secret',
};

const provider = {
  hostname: 'app.clio.com',
  baseUrl: 'https://app.clio.com',
  authorization: `Bearer ${identity.accessToken}`,
  rateLimitHeaders: {
    'x-ratelimit-remaining': '99',
    'x-ratelimit-limit': '100',
    'x-ratelimit-reset': '60',
  },
};

const createNewContactOption = {
  id: 'createNewContact',
  name: 'Create new contact...',
  additionalInfo: { logTimeEntry: true },
  isNewContact: true,
};

const billableStatus = [
  { const: 'billable', title: 'Billable' },
  { const: 'non-billable', title: 'Non-billable' },
];

const contacts = {
  unmatched: {
    phoneNumber: '+14155557101',
    crmResponse: { data: [] },
    expectedContacts: [createNewContactOption],
  },
  multiple: {
    phoneNumber: '+14155557102',
    crmResponse: {
      data: [
        {
          id: 71201,
          name: 'Ada Clio',
          type: 'Person',
          created_at: '2026-06-01T10:00:00Z',
          updated_at: '2026-07-01T11:00:00Z',
        },
        {
          id: 71202,
          name: 'Grace Clio',
          type: 'Person',
          created_at: '2026-06-02T10:00:00Z',
          updated_at: '2026-07-02T11:00:00Z',
        },
      ],
    },
    enrichments: [
      {
        contactId: 71201,
        mattersResponse: {
          data: [{
            id: 71301,
            display_number: 'CLIO-71301',
            description: 'Ada active matter',
            status: 'Open',
          }],
        },
        relationshipsResponse: {
          data: [{
            matter: {
              id: 71401,
              display_number: 'CLIO-71401',
              description: 'Ada related matter',
              status: 'Open',
            },
          }],
        },
      },
      {
        contactId: 71202,
        mattersResponse: {
          data: [{
            id: 71302,
            display_number: 'CLIO-71302',
            description: 'Grace active matter',
            status: 'Open',
          }],
        },
        relationshipsResponse: { data: [] },
      },
    ],
    expectedContacts: [
      {
        id: 71201,
        name: 'Ada Clio',
        phone: '+14155557102',
        type: 'Person',
        createdDate: '2026-06-01T10:00:00Z',
        mostRecentActivityDate: '2026-07-01T11:00:00Z',
        additionalInfo: {
          matters: [
            {
              const: 71301,
              title: 'CLIO-71301',
              description: 'Open - Ada active matter',
              status: 'Open',
            },
            {
              const: 71401,
              title: 'CLIO-71401',
              description: 'Open - Ada related matter',
              status: 'Open',
            },
          ],
          logTimeEntry: true,
          billableStatus,
        },
      },
      {
        id: 71202,
        name: 'Grace Clio',
        phone: '+14155557102',
        type: 'Person',
        createdDate: '2026-06-02T10:00:00Z',
        mostRecentActivityDate: '2026-07-02T11:00:00Z',
        additionalInfo: {
          matters: [{
            const: 71302,
            title: 'CLIO-71302',
            description: 'Open - Grace active matter',
            status: 'Open',
          }],
          logTimeEntry: true,
          billableStatus,
        },
      },
      createNewContactOption,
    ],
  },
  create: {
    phoneNumber: '+14155557103',
    name: 'Katherine Clio',
    contactId: 71203,
    appRequestBody: {
      phoneNumber: '+14155557103',
      newContactName: 'Katherine Clio',
      newContactType: 'Person',
    },
    expectedCrmBody: {
      data: {
        name: 'Katherine Clio',
        type: 'Person',
        phone_numbers: [{
          name: 'Work',
          number: '+14155557103',
          default_number: true,
        }],
      },
    },
  },
};

const message = {
  contact: {
    id: 71501,
    name: 'Clio SMS Client',
    phoneNumber: '+14155557151',
    location: 'San Francisco, CA',
    type: 'Person',
  },
  agentName: 'Clio Coverage Agent',
  matterId: 71502,
  providerLogId: 71503,
  conversationId: 'e2e-clio-conversation-71501',
  conversationLogId: 'e2e-clio-conversation-71501-2026-07-14',
  inbound: {
    uri: 'https://platform.ringcentral.com/restapi/v1.0/account/~/extension/~/message-store/7150101',
    id: 7150101,
    type: 'SMS',
    creationTime: '2026-07-14T15:00:00.000Z',
    readStatus: 'Unread',
    priority: 'Normal',
    direction: 'Inbound',
    availability: 'Alive',
    subject: 'Can you confirm our consultation?',
    messageStatus: 'Received',
    conversationId: 'e2e-clio-conversation-71501',
    from: {
      phoneNumber: '+14155557151',
      name: 'Clio SMS Client',
      location: 'San Francisco, CA',
    },
    to: [{ phoneNumber: identity.rcUserNumber, name: 'Clio Coverage Agent' }],
    attachments: [{
      id: 7150101,
      uri: 'https://media.ringcentral.com/restapi/v1.0/account/~/extension/~/message-store/7150101/content/7150101',
      type: 'Text',
      contentType: 'text/plain',
    }],
    conversation: {
      id: 'e2e-clio-conversation-71501',
      uri: 'https://platform.ringcentral.com/restapi/v1.0/conversation/e2e-clio-conversation-71501',
    },
    lastModifiedTime: '2026-07-14T15:00:01.000Z',
  },
  outbound: {
    uri: 'https://platform.ringcentral.com/restapi/v1.0/account/~/extension/~/message-store/7150102',
    id: '7150102',
    type: 'SMS',
    creationTime: '2026-07-14T15:05:00.000Z',
    readStatus: 'Read',
    priority: 'Normal',
    direction: 'Outbound',
    availability: 'Alive',
    subject: 'Your consultation is confirmed.',
    messageStatus: 'Delivered',
    smsDeliveryTime: '2026-07-14T15:05:02.000Z',
    conversationId: 'e2e-clio-conversation-71501',
    from: { phoneNumber: identity.rcUserNumber, name: 'Clio Coverage Agent' },
    to: [{ phoneNumber: '+14155557151', name: 'Clio SMS Client' }],
    attachments: [{
      id: '7150102',
      uri: 'https://media.ringcentral.com/restapi/v1.0/account/~/extension/~/message-store/7150102/content/7150102',
      type: 'Text',
      contentType: 'text/plain',
    }],
    conversation: {
      id: 'e2e-clio-conversation-71501',
      uri: 'https://platform.ringcentral.com/restapi/v1.0/conversation/e2e-clio-conversation-71501',
    },
    lastModifiedTime: '2026-07-14T15:05:03.000Z',
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
      rcAccessToken: 'e2e-clio-message-media-token',
    },
    contactId: message.contact.id,
    contactName: message.contact.name,
    contactType: message.contact.type,
    additionalSubmission: { matters: message.matterId },
  };
}

const userMapping = {
  crmResponse: {
    data: [
      {
        id: 71601,
        name: 'Ada Mapping',
        email: 'ada.clio.mapping@example.test',
      },
      {
        id: 71602,
        name: 'Unmapped Clio User',
        email: 'unmapped.clio@example.test',
      },
    ],
  },
  requestBody: {
    rcExtensionList: [{
      id: 'e2e-clio-mapping-extension',
      firstName: 'Ada',
      lastName: 'Mapping',
      extensionNumber: '71601',
      email: 'ada.clio.mapping@example.test',
    }],
  },
  expectedResponse: [
    {
      crmUser: {
        id: 71601,
        name: 'Ada Mapping',
        email: 'ada.clio.mapping@example.test',
      },
      rcUser: [{
        extensionId: 'e2e-clio-mapping-extension',
        name: 'Ada Mapping',
        extensionNumber: '71601',
        email: 'ada.clio.mapping@example.test',
      }],
    },
    {
      crmUser: {
        id: 71602,
        name: 'Unmapped Clio User',
        email: 'unmapped.clio@example.test',
      },
      rcUser: [],
    },
  ],
  expectedPersistedMappings: [{
    crmUserId: '71601',
    rcExtensionId: ['e2e-clio-mapping-extension'],
  }],
};

const oauth = {
  authorizationCode: 'e2e-clio-oauth-code',
  accessToken: 'e2e-clio-oauth-access-token',
  refreshToken: 'e2e-clio-oauth-refresh-token',
  tokenResponse: {
    access_token: 'e2e-clio-oauth-access-token',
    refresh_token: 'e2e-clio-oauth-refresh-token',
    token_type: 'Bearer',
    expires_in: 7200,
  },
  crmUserResponse: {
    data: {
      id: 71102,
      name: 'Clio OAuth User',
      time_zone: 'UTC',
    },
  },
};

const clioCoverageCase = {
  identity,
  provider,
  contacts,
  message,
  userMapping,
  oauth,
};

module.exports = {
  clioCoverageCase,
  buildMessageRequest,
};

export {};
