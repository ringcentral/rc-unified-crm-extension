const identity = {
  platform: 'insightly',
  userId: 'e2e-insightly-coverage-user',
  rcAccountId: 'e2e-insightly-coverage-account',
  rcUserNumber: '+14155550640',
  hashedExtensionId: 'e2e-insightly-coverage-extension',
  apiKey: 'e2e-insightly-coverage-api-key',
  agentName: 'Quinn Harper',
};

const provider = {
  hostname: 'app.insightly.com',
  apiBaseUrl: 'https://api.e2e-coverage.insightly.com',
  apiVersion: 'v3.1',
  expectedAuthorization: `Basic ${Buffer.from(`${identity.apiKey}:`).toString('base64')}`,
};

const createNewContactOption = {
  id: 'createNewContact',
  name: 'Create new contact...',
  additionalInfo: null,
  isNewContact: true,
};

const unmatched = {
  phoneNumber: '+14155550641',
  significantPhone: '4155550641',
  searchResponses: {
    contactPhone: [],
    contactMobile: [],
    leadPhone: [],
    leadMobile: [],
  },
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

const contactByPhone = {
  CONTACT_ID: 86401,
  FIRST_NAME: 'Mae',
  LAST_NAME: 'Jemison',
  PHONE: '+14155550642',
  TITLE: 'Director',
  DATE_CREATED_UTC: '2026-07-01T10:00:00Z',
  LAST_ACTIVITY_DATE_UTC: '2026-07-10T11:00:00Z',
  LINKS: [],
};

const contactByMobile = {
  CONTACT_ID: 86402,
  FIRST_NAME: 'Ellen',
  LAST_NAME: 'Ochoa',
  PHONE_MOBILE: '+14155550642',
  TITLE: 'VP Engineering',
  DATE_CREATED_UTC: '2026-07-02T10:00:00Z',
  DATE_UPDATED_UTC: '2026-07-11T12:00:00Z',
  LINKS: [],
};

const leadByPhone = {
  LEAD_ID: 86403,
  FIRST_NAME: 'Kalpana',
  LAST_NAME: 'Chawla',
  PHONE: '+14155550642',
  TITLE: 'Prospect',
  DATE_CREATED_UTC: '2026-07-03T10:00:00Z',
  LAST_ACTIVITY_DATE_UTC: '2026-07-12T13:00:00Z',
  LINKS: [],
};

const multipleMatches = {
  phoneNumber: '+14155550642',
  significantPhone: '4155550642',
  searchResponses: {
    contactPhone: [contactByPhone],
    contactMobile: [contactByMobile],
    leadPhone: [leadByPhone],
    leadMobile: [],
  },
  expectedContacts: [
    {
      id: contactByPhone.CONTACT_ID,
      name: 'Mae Jemison',
      phone: contactByPhone.PHONE,
      title: contactByPhone.TITLE,
      createdDate: contactByPhone.DATE_CREATED_UTC,
      mostRecentActivityDate: contactByPhone.LAST_ACTIVITY_DATE_UTC,
      additionalInfo: {},
      type: 'Contact',
    },
    {
      id: contactByMobile.CONTACT_ID,
      name: 'Ellen Ochoa',
      phone: contactByMobile.PHONE_MOBILE,
      title: contactByMobile.TITLE,
      createdDate: contactByMobile.DATE_CREATED_UTC,
      mostRecentActivityDate: contactByMobile.DATE_UPDATED_UTC,
      additionalInfo: {},
      type: 'Contact',
    },
    {
      id: leadByPhone.LEAD_ID,
      name: 'Kalpana Chawla',
      phone: leadByPhone.PHONE,
      title: leadByPhone.TITLE,
      createdDate: leadByPhone.DATE_CREATED_UTC,
      mostRecentActivityDate: leadByPhone.LAST_ACTIVITY_DATE_UTC,
      additionalInfo: {},
      type: 'Lead',
    },
    createNewContactOption,
  ],
};

const create = {
  phoneNumber: '+14155550643',
  name: 'Mary Jackson',
  contactId: 86404,
  appRequestBody: {
    phoneNumber: '+14155550643',
    newContactName: 'Mary Jackson',
    newContactType: 'contact',
  },
  expectedCrmRequestBody: {
    PHONE: '+14155550643',
    FIRST_NAME: 'Mary',
    LAST_NAME: 'Jackson',
  },
};

const conversation = {
  id: 'insightly-conversation-20260714',
  logId: 'insightly-conversation-20260714-daily',
  eventId: 96401,
  contactId: contactByPhone.CONTACT_ID,
  contactName: 'Mae Jemison',
  contactPhone: '+14155550642',
};

const inbound = {
  uri: 'https://platform.ringcentral.com/restapi/v1.0/account/~/extension/~/message-store/8464001',
  id: 8464001,
  to: [{ phoneNumber: identity.rcUserNumber, name: identity.agentName }],
  from: {
    phoneNumber: conversation.contactPhone,
    name: conversation.contactName,
    location: 'Houston, TX',
  },
  type: 'SMS',
  creationTime: '2026-07-14T09:00:00.000Z',
  readStatus: 'Read',
  priority: 'Normal',
  attachments: [{
    id: 8464001,
    uri: 'https://media.ringcentral.com/restapi/v1.0/account/~/extension/~/message-store/8464001/content/8464001',
    type: 'Text',
    contentType: 'text/plain',
  }],
  direction: 'Inbound',
  availability: 'Alive',
  subject: 'Can we review the proposal tomorrow?',
  messageStatus: 'Received',
  conversationId: conversation.id,
  conversation: {
    id: conversation.id,
    uri: `https://platform.ringcentral.com/restapi/v1.0/conversation/${conversation.id}`,
  },
  lastModifiedTime: '2026-07-14T09:00:01.000Z',
};

const outbound = {
  uri: 'https://platform.ringcentral.com/restapi/v1.0/account/~/extension/~/message-store/8464002',
  id: '8464002',
  to: [{ phoneNumber: conversation.contactPhone, name: conversation.contactName }],
  from: { phoneNumber: identity.rcUserNumber, name: identity.agentName },
  type: 'SMS',
  creationTime: '2026-07-14T09:05:00.000Z',
  readStatus: 'Read',
  priority: 'Normal',
  attachments: [
    {
      id: '8464002',
      uri: 'https://media.ringcentral.com/restapi/v1.0/account/~/extension/~/message-store/8464002/content/8464002',
      type: 'Text',
      contentType: 'text/plain',
    },
    {
      id: '8464002-image',
      uri: 'https://media.ringcentral.com/restapi/v1.0/account/~/extension/~/message-store/8464002/content/8464002-image',
      type: 'MmsAttachment',
      contentType: 'image/png',
      size: 142880,
    },
  ],
  direction: 'Outbound',
  availability: 'Alive',
  subject: 'Yes, I sent a calendar invite and the updated diagram.',
  messageStatus: 'Delivered',
  smsDeliveryTime: '2026-07-14T09:05:02.000Z',
  conversationId: conversation.id,
  conversation: {
    id: conversation.id,
    uri: `https://platform.ringcentral.com/restapi/v1.0/conversation/${conversation.id}`,
  },
  lastModifiedTime: '2026-07-14T09:05:03.000Z',
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
      rcAccessToken: 'e2e-insightly-coverage-media-token',
    },
    contactId: conversation.contactId,
    contactName: conversation.contactName,
    contactType: 'Contact',
    additionalSubmission: {},
  };
}

const insightlyCoverageCase = {
  identity,
  provider,
  contacts: { unmatched, multipleMatches, create },
  messaging: {
    conversation,
    inbound,
    outbound,
    crmUserResponse: {
      USER_ID: 86400,
      FIRST_NAME: 'Quinn',
      LAST_NAME: 'Harper',
    },
  },
};

module.exports = {
  insightlyCoverageCase,
  buildMessageLogRequest,
};

export {};
