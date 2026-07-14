const username = 'riley.advisor.e2e';
const identity = {
  username,
  userId: `${username}-redtail`,
  password: 'e2e-redtail-coverage-password',
  platform: 'redtail',
  rcAccountId: 'e2e-redtail-coverage-account',
  rcExtensionId: 'e2e-redtail-coverage-extension',
  rcUserNumber: '+14155557000',
  hashedAccountId: 'e2e-redtail-coverage-hashed-account',
  hashedExtensionId: 'e2e-redtail-coverage-hashed-extension',
  rcAccessToken: 'e2e-redtail-coverage-rc-access-token',
};

const provider = {
  hostname: 'smf.crm3.redtailtechnology.com',
  apiBaseUrl: 'https://redtail-coverage.e2e.test',
  apiKey: 'e2e-redtail-partner-api-key',
  userKey: 'e2e-redtail-user-key',
  authenticatedUserId: 97501,
};

const categories = [
  { id: 1, name: 'Client', deleted: false },
  { id: 2, name: 'Prospect', deleted: false },
  { id: 9, name: 'Archived', deleted: true },
];

const contacts = {
  unmatched: {
    phoneNumber: '+14155557010',
  },
  multiple: {
    phoneNumber: '+14155557020',
    crmResponse: {
      contacts: [
        {
          id: 97521,
          first_name: 'Dana',
          middle_name: 'A',
          last_name: 'Client',
          full_name: 'Dana A Client',
          job_title: 'Business Owner',
          created_at: '2026-06-01T10:00:00.000Z',
          updated_at: '2026-07-01T10:00:00.000Z',
        },
        {
          id: 97522,
          first_name: 'Dana',
          middle_name: '',
          last_name: 'Prospect',
          full_name: 'Dana Prospect',
          job_title: 'Controller',
          created_at: '2026-06-02T10:00:00.000Z',
          updated_at: '2026-07-02T10:00:00.000Z',
        },
      ],
    },
  },
  create: {
    crmId: 97531,
    appRequestBody: {
      phoneNumber: '+14155557031',
      newContactName: 'Taylor Morgan',
      newContactType: 'contact',
      additionalSubmission: { category: 2 },
    },
    expectedCrmRequestBody: {
      type: 'Crm::Contact::Individual',
      first_name: 'Taylor',
      last_name: 'Morgan',
      phones: [{
        phone_type: 6,
        number: '4155557031',
        country_code: 1,
      }],
    },
    crmResponse: {
      contact: {
        id: 97531,
        first_name: 'Taylor',
        last_name: 'Morgan',
      },
    },
  },
};

const messageContact = {
  id: 97541,
  name: 'Dana Client',
  phoneNumber: '+14155557041',
  type: 'contact',
};

const conversation = {
  id: '9750000000001',
  logId: '9750000000001-2026-07-14',
  activityId: 97551,
  mediaAccessToken: 'e2e-redtail-message-media-token',
};

const inboundMessage = {
  uri: 'https://platform.ringcentral.com/restapi/v1.0/account/~/extension/~/message-store/9750001001',
  id: '9750001001',
  to: [{ phoneNumber: identity.rcUserNumber, name: identity.username }],
  from: {
    phoneNumber: messageContact.phoneNumber,
    name: messageContact.name,
    location: 'Austin, TX',
  },
  type: 'SMS',
  creationTime: '2026-07-14T03:00:00.000Z',
  readStatus: 'Unread',
  priority: 'Normal',
  attachments: [{
    id: '9750001001',
    uri: 'https://media.ringcentral.com/message-store/9750001001/content/9750001001',
    type: 'Text',
    contentType: 'text/plain',
  }],
  direction: 'Inbound',
  availability: 'Alive',
  subject: 'Could we review my retirement contribution?',
  messageStatus: 'Received',
  conversationId: conversation.id,
  conversation: { id: conversation.id },
  lastModifiedTime: '2026-07-14T03:00:01.000Z',
};

const outboundMessage = {
  uri: 'https://platform.ringcentral.com/restapi/v1.0/account/~/extension/~/message-store/9750001002',
  id: '9750001002',
  to: [{ phoneNumber: messageContact.phoneNumber, name: messageContact.name }],
  from: { phoneNumber: identity.rcUserNumber, name: identity.username },
  type: 'SMS',
  creationTime: '2026-07-14T03:05:00.000Z',
  readStatus: 'Read',
  priority: 'Normal',
  attachments: [
    {
      id: '9750001002',
      uri: 'https://media.ringcentral.com/message-store/9750001002/content/9750001002',
      type: 'Text',
      contentType: 'text/plain',
    },
    {
      id: '9750001002-image',
      uri: 'https://media.ringcentral.com/message-store/9750001002/content/image',
      type: 'MmsAttachment',
      contentType: 'image/jpeg',
      size: 96000,
    },
  ],
  direction: 'Outbound',
  availability: 'Alive',
  subject: 'Yes, I sent the available review times.',
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
      correspondents: [{
        phoneNumber: messageContact.phoneNumber,
        name: messageContact.name,
      }],
      messages,
      rcAccessToken: conversation.mediaAccessToken,
    },
    contactId: messageContact.id,
    contactName: messageContact.name,
    contactType: messageContact.type,
    additionalSubmission: { category: 2 },
  };
}

const legacyExtension = {
  id: 'e2e-redtail-legacy-extension',
  name: 'Legacy Redtail User',
  extensionNumber: '9700',
  email: 'legacy.redtail@example.test',
};
const currentExtension = {
  id: identity.rcExtensionId,
  firstName: 'Riley',
  lastName: 'Advisor',
  extensionNumber: '9750',
  email: 'riley.advisor@example.test',
};
const crmUser = {
  id: 97561,
  name: 'Riley Advisor',
  email: '',
};

const userMapping = {
  initialPersistedMappings: [{
    crmUserId: String(crmUser.id),
    rcExtensionId: [legacyExtension.id],
  }],
  appRequestBody: {
    rcExtensionList: [legacyExtension, currentExtension],
  },
  crmResponse: {
    database_users: [{
      id: crmUser.id,
      first_name: 'Riley',
      last_name: 'Advisor',
    }],
  },
  expectedInitialRead: [{
    crmUser,
    rcUser: [{
      extensionId: legacyExtension.id,
      name: legacyExtension.name,
      extensionNumber: legacyExtension.extensionNumber,
      email: legacyExtension.email,
    }],
  }],
  expectedReinitializedRead: [{
    crmUser,
    rcUser: [{
      extensionId: currentExtension.id,
      name: 'Riley Advisor',
      extensionNumber: currentExtension.extensionNumber,
      email: currentExtension.email,
    }],
  }],
  expectedPersistedMappings: [{
    crmUserId: String(crmUser.id),
    rcExtensionId: [currentExtension.id],
  }],
};

const authentication = {
  appRequestBody: {
    platform: identity.platform,
    hostname: provider.hostname,
    additionalInfo: {
      username: identity.username,
      password: identity.password,
    },
  },
  crmResponse: {
    authenticated_user: {
      id: provider.authenticatedUserId,
      user_key: provider.userKey,
      first_name: 'Riley',
      last_name: 'Advisor',
      email: 'riley.advisor@example.test',
    },
  },
};

const redtailCoverageCases = {
  identity,
  provider: {
    ...provider,
    establishedAuthorization: Buffer.from(
      `${provider.apiKey}:${provider.userKey}`,
    ).toString('base64'),
    loginAuthorization: `Basic ${Buffer.from(
      `${provider.apiKey}:${identity.username}:${identity.password}`,
    ).toString('base64')}`,
    requestHeaders: {
      'X-RC-Access-Token': identity.rcAccessToken,
      'rc-account-id': identity.hashedAccountId,
      'rc-extension-id': identity.hashedExtensionId,
    },
  },
  categories,
  contacts,
  messageContact,
  conversation,
  messages: {
    inbound: inboundMessage,
    outbound: outboundMessage,
  },
  userMapping,
  authentication,
};

module.exports = {
  redtailCoverageCases,
  buildRedtailMessageLogRequest: buildMessageLogRequest,
};

export {};
