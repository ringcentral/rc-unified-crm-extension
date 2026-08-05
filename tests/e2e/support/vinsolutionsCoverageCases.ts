const identity = {
  platform: 'vinsolutions',
  userId: '13001-23002-vinsolutions',
  rcAccountId: 'e2e-vinsolutions-coverage-account',
  rcUserNumber: '+14155550170',
  hashedExtensionId: 'e2e-vinsolutions-coverage-extension',
  rcAccessToken: 'e2e-vinsolutions-coverage-rc-access-token',
  dealerId: 23002,
  crmUserId: 13001,
  agentName: 'Morgan Rivera',
};

const provider = {
  hostname: 'vinsolutions.app.coxautoinc.com',
  apiBaseUrl: 'https://api.vinsolutions.com',
  tokenBaseUrl: 'https://authentication.vinsolutions.com',
  connectedSentinel: 'vinsolutions-connected',
  leadManagement: {
    clientId: 'e2e-vinsolutions-lead-client-id',
    clientSecret: 'e2e-vinsolutions-lead-client-secret',
    apiKey: 'e2e-vinsolutions-lead-api-key',
    accessToken: 'e2e-vinsolutions-lead-access-token',
  },
  callTracking: {
    clientId: 'e2e-vinsolutions-call-client-id',
    clientSecret: 'e2e-vinsolutions-call-client-secret',
    apiKey: 'e2e-vinsolutions-call-api-key',
    accessToken: 'e2e-vinsolutions-call-access-token',
  },
};

const createNewContactOption = {
  id: 'createNewContact',
  name: 'Create new contact...',
  isNewContact: true,
};

const unmatchedContact = {
  phoneNumber: '+14155550171',
  crmResponse: [],
  expectedResponse: {
    successful: true,
    returnMessage: {
      message: 'Contact not found',
      messageType: 'warning',
      ttl: 5000,
    },
    contact: [createNewContactOption],
  },
};

const firstMatchedContact = {
  ContactId: 76001,
  ContactInformation: {
    FirstName: 'Avery',
    LastName: 'Chen',
    Phones: [{ PhoneType: 'Cell', Number: '4155550172' }],
  },
};

const secondMatchedContact = {
  ContactId: 76002,
  ContactInformation: {
    FirstName: 'Riley',
    LastName: 'Chen',
    Phones: [{ PhoneType: 'Home', Number: '4155550172' }],
  },
};

const multipleMatches = {
  phoneNumber: '+14155550172',
  crmResponse: [firstMatchedContact, secondMatchedContact],
  leadResponses: [
    {
      contactId: firstMatchedContact.ContactId,
      response: {
        items: [{
          leadId: 96001,
          leadStatus: 'ACTIVE_NEW_LEAD',
          leadSource: { leadSourceName: 'Website' },
        }],
      },
    },
    {
      contactId: secondMatchedContact.ContactId,
      response: {
        items: [{
          leadId: 96002,
          leadStatus: 'ACTIVE_WORKING',
          leadSource: { leadSourceName: 'Phone' },
        }],
      },
    },
  ],
  expectedContacts: [
    {
      id: firstMatchedContact.ContactId,
      name: 'Avery Chen',
      phone: '4155550172',
      additionalInfo: {
        leads: [{
          const: 96001,
          title: 'Lead #96001 (ACTIVE_NEW_LEAD) - Website',
        }],
      },
      type: 'contact',
    },
    {
      id: secondMatchedContact.ContactId,
      name: 'Riley Chen',
      phone: '4155550172',
      additionalInfo: {
        leads: [{
          const: 96002,
          title: 'Lead #96002 (ACTIVE_WORKING) - Phone',
        }],
      },
      type: 'contact',
    },
    createNewContactOption,
  ],
};

const createContact = {
  phoneNumber: '+14155550173',
  name: 'Dorothy Vaughan',
  contactId: 76003,
  appRequestBody: {
    phoneNumber: '+14155550173',
    newContactName: 'Dorothy Vaughan',
    newContactType: 'contact',
  },
  expectedCrmRequestBody: {
    DealerId: identity.dealerId,
    UserId: identity.crmUserId,
    ContactInformation: {
      FirstName: 'Dorothy',
      LastName: 'Vaughan',
      Phones: [{ PhoneType: 'Cell', Number: '4155550173' }],
    },
    LeadInformation: {},
  },
};

const conversation = {
  id: 'vinsolutions-conversation-20260714',
  logId: 'vinsolutions-conversation-20260714-daily',
  leadId: 96001,
  contactId: firstMatchedContact.ContactId,
  contactName: 'Avery Chen',
  contactPhone: '+14155550172',
  mediaAccessToken: 'e2e-vinsolutions-media-access-token',
};

const inboundMessage = {
  uri: 'https://platform.ringcentral.com/restapi/v1.0/account/~/extension/~/message-store/7461001',
  id: 7461001,
  to: [{ phoneNumber: identity.rcUserNumber, name: identity.agentName }],
  from: {
    phoneNumber: conversation.contactPhone,
    name: conversation.contactName,
    location: 'San Francisco, CA',
  },
  type: 'SMS',
  creationTime: '2026-07-14T08:00:00.000Z',
  readStatus: 'Read',
  priority: 'Normal',
  attachments: [{
    id: 7461001,
    uri: 'https://media.ringcentral.com/restapi/v1.0/account/~/extension/~/message-store/7461001/content/7461001',
    type: 'Text',
    contentType: 'text/plain',
  }],
  direction: 'Inbound',
  availability: 'Alive',
  subject: 'Is the blue sedan still available?',
  messageStatus: 'Received',
  conversationId: conversation.id,
  conversation: {
    id: conversation.id,
    uri: `https://platform.ringcentral.com/restapi/v1.0/conversation/${conversation.id}`,
  },
  lastModifiedTime: '2026-07-14T08:00:01.000Z',
};

const outboundMessage = {
  uri: 'https://platform.ringcentral.com/restapi/v1.0/account/~/extension/~/message-store/7461002',
  id: '7461002',
  to: [{ phoneNumber: conversation.contactPhone, name: conversation.contactName }],
  from: { phoneNumber: identity.rcUserNumber, name: identity.agentName },
  type: 'SMS',
  creationTime: '2026-07-14T08:05:00.000Z',
  readStatus: 'Read',
  priority: 'Normal',
  attachments: [
    {
      id: '7461002',
      uri: 'https://media.ringcentral.com/restapi/v1.0/account/~/extension/~/message-store/7461002/content/7461002',
      type: 'Text',
      contentType: 'text/plain',
    },
    {
      id: '7461002-image',
      uri: 'https://media.ringcentral.com/restapi/v1.0/account/~/extension/~/message-store/7461002/content/7461002-image',
      type: 'MmsAttachment',
      contentType: 'image/jpeg',
      size: 288120,
    },
  ],
  direction: 'Outbound',
  availability: 'Alive',
  subject: 'Yes. I attached the latest photos and pricing.',
  messageStatus: 'Delivered',
  smsDeliveryTime: '2026-07-14T08:05:02.000Z',
  conversationId: conversation.id,
  conversation: {
    id: conversation.id,
    uri: `https://platform.ringcentral.com/restapi/v1.0/conversation/${conversation.id}`,
  },
  lastModifiedTime: '2026-07-14T08:05:03.000Z',
};

function buildMessageLogRequest(messages) {
  return {
    logInfo: {
      conversationId: conversation.id,
      conversationLogId: conversation.logId,
      correspondents: [{
        phoneNumber: conversation.contactPhone,
        name: conversation.contactName,
      }],
      messages,
      rcAccessToken: conversation.mediaAccessToken,
    },
    contactId: conversation.contactId,
    contactName: conversation.contactName,
    contactType: 'contact',
    additionalSubmission: { leads: conversation.leadId },
  };
}

const legacyExtension = {
  id: 'vinsolutions-legacy-extension',
  name: 'Legacy Sales Agent',
  extensionNumber: '701',
  email: 'legacy.vinsolutions@example.test',
};

const currentExtension = {
  id: 'vinsolutions-current-extension',
  firstName: 'Taylor',
  lastName: 'Sales',
  extensionNumber: '702',
  email: 'taylor.sales@example.test',
};

const mappingCrmUser = {
  id: 13002,
  name: 'Taylor Sales',
  email: currentExtension.email,
};

const userMapping = {
  crmResponse: [
    {
      UserId: mappingCrmUser.id,
      FullName: mappingCrmUser.name,
      EmailAddress: mappingCrmUser.email,
    },
    {
      UserId: 13003,
      FullName: 'No Email User',
      EmailAddress: '',
    },
  ],
  initialPersistedMappings: [{
    crmUserId: String(mappingCrmUser.id),
    rcExtensionId: [legacyExtension.id],
  }],
  appRequestBody: {
    rcExtensionList: [legacyExtension, currentExtension],
  },
  expectedInitialRead: [{
    crmUser: mappingCrmUser,
    rcUser: [{
      extensionId: legacyExtension.id,
      name: legacyExtension.name,
      extensionNumber: legacyExtension.extensionNumber,
      email: legacyExtension.email,
    }],
  }],
  expectedReinitializedRead: [{
    crmUser: mappingCrmUser,
    rcUser: [{
      extensionId: currentExtension.id,
      name: `${currentExtension.firstName} ${currentExtension.lastName}`,
      extensionNumber: currentExtension.extensionNumber,
      email: currentExtension.email,
    }],
  }],
  expectedPersistedMappings: [{
    crmUserId: String(mappingCrmUser.id),
    rcExtensionId: [currentExtension.id],
  }],
};

const authentication = {
  tokenResponses: {
    [provider.leadManagement.clientId]: {
      access_token: provider.leadManagement.accessToken,
      expires_in: 3600,
      scope: 'PublicAPI',
    },
    [provider.callTracking.clientId]: {
      access_token: provider.callTracking.accessToken,
      expires_in: 3600,
      scope: 'PublicAPI',
    },
  },
  crmUserResponse: {
    UserId: identity.crmUserId,
    FullName: identity.agentName,
    EmailAddress: 'morgan.rivera@example.test',
  },
  dealersResponse: {
    Items: [{ DealerId: identity.dealerId, Name: 'Coverage Motors' }],
  },
  appRequestBody: {
    platform: identity.platform,
    hostname: provider.hostname,
    apiKey: '',
    additionalInfo: {
      dealerId: identity.dealerId,
      crmUserId: identity.crmUserId,
    },
  },
};

const vinsolutionsCoverageCase = {
  identity,
  provider,
  requestHeaders: {
    'rc-account-id': 'e2e-vinsolutions-coverage-hashed-account',
    'rc-extension-id': identity.hashedExtensionId,
  },
  ringCentralAdminResponse: {
    id: 'e2e-vinsolutions-admin-extension',
    account: { id: identity.rcAccountId },
    permissions: { admin: { enabled: true } },
  },
  contacts: {
    unmatched: unmatchedContact,
    multipleMatches,
    create: createContact,
  },
  messaging: {
    conversation,
    inbound: inboundMessage,
    outbound: outboundMessage,
  },
  userMapping,
  authentication,
};

module.exports = {
  vinsolutionsCoverageCase,
  buildMessageLogRequest,
};

export {};
