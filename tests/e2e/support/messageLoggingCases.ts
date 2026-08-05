const user = {
  id: '987654-pipedrive-e2e-message',
  platform: 'pipedrive',
  rcAccountId: 'e2e-pipedrive-message-account',
  rcUserNumber: '+14155550101',
  hashedExtensionId: 'e2e-pipedrive-message-extension',
  accessToken: 'e2e-pipedrive-message-access-token',
  refreshToken: 'e2e-pipedrive-message-refresh-token',
  timezoneOffset: '+00:00',
  agentName: 'Jordan Lee',
};

const contact = {
  id: 77001,
  name: 'Maya Patel',
  phoneNumber: '+14155550142',
  location: 'San Francisco, CA',
  organizationId: 88002,
};

const provider = {
  hostname: 'message-logging-e2e.pipedrive.com',
  activityId: 99001,
  dealId: 88001,
  rateLimitHeaders: {
    'x-ratelimit-remaining': '99',
    'x-ratelimit-limit': '100',
    'x-ratelimit-reset': '60',
  },
};

const conversation = {
  id: '8031152018338945901',
  logId: '8031152018338945901-2026-07-14',
  mediaAccessToken: 'e2e-ringcentral-media-access-token',
};

const inboundMessageId = 6424569101;
const inboundMessage = {
  uri: `https://platform.ringcentral.com/restapi/v1.0/account/~/extension/~/message-store/${inboundMessageId}`,
  id: inboundMessageId,
  to: [{ phoneNumber: user.rcUserNumber, name: user.agentName }],
  from: {
    phoneNumber: contact.phoneNumber,
    name: contact.name,
    location: contact.location,
  },
  type: 'SMS',
  creationTime: '2026-07-14T03:00:00.000Z',
  readStatus: 'Unread',
  priority: 'Normal',
  attachments: [{
    id: inboundMessageId,
    uri: `https://media.ringcentral.com/restapi/v1.0/account/~/extension/~/message-store/${inboundMessageId}/content/${inboundMessageId}`,
    type: 'Text',
    contentType: 'text/plain',
  }],
  direction: 'Inbound',
  availability: 'Alive',
  subject: 'Can you send the renewal options?',
  messageStatus: 'Received',
  conversationId: conversation.id,
  conversation: {
    id: conversation.id,
    uri: `https://platform.ringcentral.com/restapi/v1.0/conversation/${conversation.id}`,
  },
  lastModifiedTime: '2026-07-14T03:00:01.000Z',
};

// RingCentral represents MMS records as type=SMS with MmsAttachment entries.
const outboundMessageId = '6424569102';
const outboundMessage = {
  uri: `https://platform.ringcentral.com/restapi/v1.0/account/~/extension/~/message-store/${outboundMessageId}`,
  id: outboundMessageId,
  to: [{ phoneNumber: contact.phoneNumber, name: contact.name }],
  from: { phoneNumber: user.rcUserNumber, name: user.agentName },
  type: 'SMS',
  creationTime: '2026-07-14T03:05:00.000Z',
  readStatus: 'Read',
  priority: 'Normal',
  attachments: [
    {
      id: outboundMessageId,
      uri: `https://media.ringcentral.com/restapi/v1.0/account/~/extension/~/message-store/${outboundMessageId}/content/${outboundMessageId}`,
      type: 'Text',
      contentType: 'text/plain',
    },
    {
      id: '675981076101',
      uri: `https://media.ringcentral.com/restapi/v1.0/account/~/extension/~/message-store/${outboundMessageId}/content/675981076101`,
      type: 'MmsAttachment',
      contentType: 'image/jpeg',
      size: 461020,
    },
  ],
  direction: 'Outbound',
  availability: 'Alive',
  subject: 'Here are the renewal options and plan comparison.',
  messageStatus: 'Delivered',
  smsDeliveryTime: '2026-07-14T03:05:02.000Z',
  conversationId: conversation.id,
  conversation: {
    id: conversation.id,
    uri: `https://platform.ringcentral.com/restapi/v1.0/conversation/${conversation.id}`,
  },
  lastModifiedTime: '2026-07-14T03:05:03.000Z',
};

const pipedriveMessageLoggingCase = {
  user,
  contact,
  provider: {
    ...provider,
    baseUrl: `https://${provider.hostname}`,
    globalBaseUrl: 'https://api.pipedrive.com',
    authorization: `Bearer ${user.accessToken}`,
  },
  conversation,
  messages: {
    inbound: inboundMessage,
    outbound: outboundMessage,
  },
  expectedCreateActivity: {
    owner_id: Number(user.id.split('-')[0]),
    subject: `SMS conversation with ${contact.name} - 26/07/14`,
    deal_id: provider.dealId,
    done: true,
    due_date: '2026-07-14',
    due_time: '03:00',
    type: 'sms',
    participants: [{ person_id: contact.id, primary: true }],
    org_id: contact.organizationId,
  },
};

function buildPipedriveMessageLogRequest(messages) {
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
    contactType: 'contact',
    additionalSubmission: { deals: provider.dealId },
  };
}

module.exports = {
  pipedriveMessageLoggingCase,
  buildPipedriveMessageLogRequest,
};

export {};
