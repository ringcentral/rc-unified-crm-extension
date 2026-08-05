const FIXED_MESSAGE_TIME = '2026-07-14T03:00:00.000Z';
const FIXED_MESSAGE_MODIFIED_TIME = '2026-07-14T03:00:01.000Z';
const FIXED_MESSAGE_DELIVERY_TIME = '2026-07-14T03:00:02.000Z';

const RC_ACCOUNT_ID = '178009004';
const RC_EXTENSION_ID = '178009004';
const RC_MESSAGE_STORE_BASE_URI =
  `https://platform.ringcentral.com/restapi/v1.0/account/${RC_ACCOUNT_ID}`
  + `/extension/${RC_EXTENSION_ID}/message-store`;
const RC_MEDIA_MESSAGE_STORE_BASE_URI =
  `https://media.ringcentral.com/restapi/v1.0/account/${RC_ACCOUNT_ID}`
  + `/extension/${RC_EXTENSION_ID}/message-store`;
const RC_MEDIA_ACCESS_TOKEN = 'rc-media-access-token';

const RC_AGENT = {
  phoneNumber: '+14155550101',
  name: 'Test Agent',
};
const RC_CONTACT = {
  phoneNumber: '+14155550199',
  name: 'Message Contact',
  location: 'San Mateo, CA',
};

// RingCentral Message Store record shape and lifecycle values:
// https://developers.ringcentral.com/guide/messaging/message-store/working-with-message-store
// https://developers.ringcentral.com/guide/messaging/message-store/messaging

function cloneTestData<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => cloneTestData(item)) as T;
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .map(([key, item]) => [key, cloneTestData(item)]),
    ) as T;
  }
  return value;
}

function cloneRingCentralMessageRecord<T>(record: T): T {
  return cloneTestData(record);
}

function enrichMessageAttachmentsForAC(
  record: any,
  attachmentOverridesById: Record<string, any> = {},
) {
  const enrichedRecord = cloneRingCentralMessageRecord(record);
  if (!Array.isArray(enrichedRecord.attachments)) {
    return enrichedRecord;
  }

  enrichedRecord.attachments = enrichedRecord.attachments.map((attachment: any) => ({
    ...attachment,
    ...(attachmentOverridesById[String(attachment.id)] || {}),
  }));
  return enrichedRecord;
}

function isCompleteRingCentralMessageRecord(message: any): boolean {
  return !!message && (
    Object.prototype.hasOwnProperty.call(message, 'uri')
    || (
      Object.prototype.hasOwnProperty.call(message, 'availability')
      && !Object.prototype.hasOwnProperty.call(message, 'type')
    )
  );
}

function buildRingCentralSMSRecord(overrides: any = {}) {
  const id = Object.prototype.hasOwnProperty.call(overrides, 'id')
    ? overrides.id
    : 6424569004;
  const conversationId = Object.prototype.hasOwnProperty.call(overrides, 'conversationId')
    ? overrides.conversationId
    : '8031152018338945839';
  const messageUri = `${RC_MESSAGE_STORE_BASE_URI}/${id}`;
  const baseRecord = {
    uri: messageUri,
    id,
    to: [cloneTestData(RC_AGENT)],
    from: cloneTestData(RC_CONTACT),
    type: 'SMS',
    creationTime: FIXED_MESSAGE_TIME,
    readStatus: 'Unread',
    priority: 'Normal',
    attachments: [{
      id,
      uri: `${messageUri}/content/${id}`,
      type: 'Text',
      contentType: 'text/plain',
    }],
    direction: 'Inbound',
    availability: 'Alive',
    subject: 'Deterministic message',
    messageStatus: 'Received',
    conversationId,
    conversation: {
      id: String(conversationId),
      uri: `https://platform.ringcentral.com/restapi/v1.0/conversation/${conversationId}`,
    },
    lastModifiedTime: FIXED_MESSAGE_MODIFIED_TIME,
  };

  const record = {
    ...baseRecord,
    ...cloneTestData(overrides),
    from: cloneTestData(overrides.from || baseRecord.from),
    to: cloneTestData(overrides.to || baseRecord.to),
    attachments: cloneTestData(overrides.attachments || baseRecord.attachments),
    conversation: {
      ...baseRecord.conversation,
      ...(overrides.conversation || {}),
    },
  };

  return record;
}

const rcMessageInboundReceived = buildRingCentralSMSRecord();

const rcMessageOutboundQueued = buildRingCentralSMSRecord({
  id: '6424569005',
  direction: 'Outbound',
  from: RC_AGENT,
  to: [RC_CONTACT],
  readStatus: 'Read',
  subject: 'Queued outbound SMS',
  messageStatus: 'Queued',
  conversationId: '8031152018338945840',
});

const rcMessageOutboundSentToGroup = buildRingCentralSMSRecord({
  id: 6424569006,
  direction: 'Outbound',
  from: RC_AGENT,
  to: [
    RC_CONTACT,
    { phoneNumber: '+14155550200', name: 'Second Message Contact' },
  ],
  readStatus: 'Read',
  priority: 'High',
  subject: 'Sent group SMS',
  messageStatus: 'Sent',
  conversationId: '8031152018338945841',
});

const rcMessageOutboundDelivered = buildRingCentralSMSRecord({
  id: '6424569007',
  direction: 'Outbound',
  from: RC_AGENT,
  to: [RC_CONTACT],
  readStatus: 'Read',
  subject: 'Delivered outbound SMS',
  messageStatus: 'Delivered',
  smsDeliveryTime: FIXED_MESSAGE_DELIVERY_TIME,
  conversationId: '8031152018338945842',
});

// MMS records use type=SMS in Message Store and expose media as MmsAttachment entries.
const rcMessageInboundMMS = buildRingCentralSMSRecord({
  id: 6424569008,
  subject: 'Inbound MMS with image and video',
  conversationId: '8031152018338945843',
  attachments: [
    {
      id: 6424569008,
      uri: `${RC_MEDIA_MESSAGE_STORE_BASE_URI}/6424569008/content/6424569008`,
      type: 'Text',
      contentType: 'text/plain',
    },
    {
      id: '675981076016',
      uri: `${RC_MEDIA_MESSAGE_STORE_BASE_URI}/6424569008/content/675981076016`,
      type: 'MmsAttachment',
      contentType: 'image/jpeg',
      size: 461020,
    },
    {
      id: '675981076017',
      uri: `${RC_MEDIA_MESSAGE_STORE_BASE_URI}/6424569008/content/675981076017`,
      type: 'MmsAttachment',
      contentType: 'video/mp4',
      size: 1048576,
    },
  ],
});

// Raw VoiceMail shape follows the Message Store example. The non-RC `link`
// consumed by AC is added later via enrichMessageAttachmentsForAC.
const rcMessageInboundVoiceMail = {
  uri: `${RC_MESSAGE_STORE_BASE_URI}/6424569014`,
  id: 6424569014,
  to: [{ name: RC_AGENT.name, phoneNumber: RC_AGENT.phoneNumber }],
  from: cloneTestData(RC_CONTACT),
  type: 'VoiceMail',
  creationTime: FIXED_MESSAGE_TIME,
  readStatus: 'Unread',
  priority: 'Normal',
  attachments: [{
    id: 6424569014,
    uri: `${RC_MEDIA_MESSAGE_STORE_BASE_URI}/6424569014/content/6424569014`,
    type: 'AudioRecording',
    contentType: 'audio/x-wav',
    vmDuration: 25,
  }],
  direction: 'Inbound',
  availability: 'Alive',
  subject: 'Voice message',
  messageStatus: 'Received',
  lastModifiedTime: FIXED_MESSAGE_MODIFIED_TIME,
  vmTranscriptionStatus: 'NotAvailable',
};

// Raw Fax shape:
// https://developers.ringcentral.com/guide/messaging/fax/receiving-faxes
const rcMessageInboundFax = {
  uri: `${RC_MESSAGE_STORE_BASE_URI}/6424569015`,
  id: '6424569015',
  to: [{ phoneNumber: RC_AGENT.phoneNumber, name: RC_AGENT.name }],
  from: { phoneNumber: RC_CONTACT.phoneNumber, location: RC_CONTACT.location },
  type: 'Fax',
  creationTime: FIXED_MESSAGE_TIME,
  readStatus: 'Unread',
  priority: 'Normal',
  attachments: [{
    id: '6424569015',
    uri: `${RC_MEDIA_MESSAGE_STORE_BASE_URI}/6424569015/content/6424569015`,
    type: 'RenderedDocument',
    contentType: 'application/pdf',
    size: 183204,
  }],
  direction: 'Inbound',
  availability: 'Alive',
  subject: RC_CONTACT.phoneNumber,
  messageStatus: 'Received',
  faxResolution: 'High',
  faxPageCount: 2,
  lastModifiedTime: FIXED_MESSAGE_MODIFIED_TIME,
};

const rcVoiceMailAttachmentUri = rcMessageInboundVoiceMail.attachments[0].uri;
const rcFaxAttachmentUri = rcMessageInboundFax.attachments[0].uri;
const rcMMSImageAttachment = rcMessageInboundMMS.attachments.find(
  (attachment: any) => attachment.type === 'MmsAttachment'
    && attachment.contentType.startsWith('image/'),
);
const rcMMSVideoAttachment = rcMessageInboundMMS.attachments.find(
  (attachment: any) => attachment.type === 'MmsAttachment'
    && attachment.contentType.startsWith('video/'),
);

const rcMessageMediaCases = [
  {
    label: 'VoiceMail derives a recording link from AC attachment enrichment',
    rawMessage: cloneRingCentralMessageRecord(rcMessageInboundVoiceMail),
    acMessage: enrichMessageAttachmentsForAC(rcMessageInboundVoiceMail, {
      [String(rcMessageInboundVoiceMail.attachments[0].id)]: {
        link: rcVoiceMailAttachmentUri,
      },
    }),
    logInfoOverrides: {},
    expectedDerivedMediaFields: {
      recordingLink: rcVoiceMailAttachmentUri,
    },
  },
  {
    label: 'Fax derives document and authenticated download links',
    rawMessage: cloneRingCentralMessageRecord(rcMessageInboundFax),
    acMessage: enrichMessageAttachmentsForAC(rcMessageInboundFax, {
      [String(rcMessageInboundFax.attachments[0].id)]: {
        link: rcFaxAttachmentUri,
      },
    }),
    logInfoOverrides: { rcAccessToken: RC_MEDIA_ACCESS_TOKEN },
    expectedDerivedMediaFields: {
      faxDocLink: rcFaxAttachmentUri,
      faxDownloadLink: `${rcFaxAttachmentUri}?access_token=${RC_MEDIA_ACCESS_TOKEN}`,
    },
  },
  {
    label: 'MMS derives image, image download, content type, and video links',
    rawMessage: cloneRingCentralMessageRecord(rcMessageInboundMMS),
    acMessage: cloneRingCentralMessageRecord(rcMessageInboundMMS),
    logInfoOverrides: { rcAccessToken: RC_MEDIA_ACCESS_TOKEN },
    expectedDerivedMediaFields: {
      imageLink: `https://ringcentral.github.io/ringcentral-media-reader/?media=${encodeURIComponent(rcMMSImageAttachment.uri)}`,
      imageDownloadLink: `${rcMMSImageAttachment.uri}?access_token=${RC_MEDIA_ACCESS_TOKEN}`,
      imageContentType: rcMMSImageAttachment.contentType,
      videoLink: `https://ringcentral.github.io/ringcentral-media-reader/?media=${encodeURIComponent(rcMMSVideoAttachment.uri)}`,
    },
  },
];

const rcMessageOutboundSendingFailed = buildRingCentralSMSRecord({
  id: '6424569009',
  direction: 'Outbound',
  from: RC_AGENT,
  to: [RC_CONTACT],
  readStatus: 'Read',
  subject: 'Outbound SMS rejected before carrier delivery',
  messageStatus: 'SendingFailed',
  deliveryErrorCode: 'SMS-RC-413',
  conversationId: '8031152018338945844',
});

const rcMessageOutboundDeliveryFailed = buildRingCentralSMSRecord({
  id: 6424569010,
  direction: 'Outbound',
  from: RC_AGENT,
  to: [RC_CONTACT],
  readStatus: 'Read',
  subject: 'Outbound SMS rejected by recipient carrier',
  messageStatus: 'DeliveryFailed',
  deliveryErrorCode: 'SMS-CAR-411',
  conversationId: '8031152018338945845',
});

const rcMessageDeleted = buildRingCentralSMSRecord({
  id: '6424569011',
  availability: 'Deleted',
  conversationId: '8031152018338945846',
});

// Message Sync returns only these fields after content has been purged.
const rcMessagePurged = {
  id: 6424569012,
  availability: 'Purged',
};

// A normal SMS may omit enrichment such as names, attachments, conversation URI,
// delivery metadata and lastModifiedTime.
const rcMessageWithOptionalFieldsOmitted = {
  uri: `${RC_MESSAGE_STORE_BASE_URI}/6424569013`,
  id: '6424569013',
  to: [{ phoneNumber: RC_AGENT.phoneNumber }],
  from: { phoneNumber: RC_CONTACT.phoneNumber },
  type: 'SMS',
  creationTime: FIXED_MESSAGE_TIME,
  direction: 'Inbound',
  subject: 'SMS without optional enrichment',
  messageStatus: 'Received',
  conversationId: '8031152018338945847',
};

const rcMessageStatusCases = [
  { label: 'Inbound Received', message: cloneTestData(rcMessageInboundReceived) },
  { label: 'Outbound Queued', message: cloneTestData(rcMessageOutboundQueued) },
  { label: 'Outbound Sent', message: cloneTestData(rcMessageOutboundSentToGroup) },
  { label: 'Outbound Delivered', message: cloneTestData(rcMessageOutboundDelivered) },
  { label: 'Outbound SendingFailed', message: cloneTestData(rcMessageOutboundSendingFailed) },
  { label: 'Outbound DeliveryFailed', message: cloneTestData(rcMessageOutboundDeliveryFailed) },
];

const rcMessageAvailabilityCases = [
  { label: 'Alive', message: cloneTestData(rcMessageInboundReceived) },
  { label: 'Deleted', message: cloneTestData(rcMessageDeleted) },
  { label: 'Purged', message: cloneTestData(rcMessagePurged), isLoggable: false },
];

const rcMessageReadStatusCases = [
  { label: 'Unread inbound SMS', message: cloneTestData(rcMessageInboundReceived) },
  { label: 'Read outbound SMS', message: cloneTestData(rcMessageOutboundDelivered) },
];

const rcMessagePriorityCases = [
  { label: 'Normal priority SMS', message: cloneTestData(rcMessageInboundReceived) },
  { label: 'High priority SMS', message: cloneTestData(rcMessageOutboundSentToGroup) },
];

const rcMessageFormatCases = [
  {
    label: 'Inbound SMS with a numeric id and complete metadata',
    message: cloneTestData(rcMessageInboundReceived),
  },
  {
    label: 'Outbound SMS with a string id and delivery metadata',
    message: cloneTestData(rcMessageOutboundDelivered),
  },
  {
    label: 'Outbound group SMS with multiple recipients',
    message: cloneTestData(rcMessageOutboundSentToGroup),
  },
  {
    label: 'Inbound MMS with text, image, and video attachments',
    message: cloneTestData(rcMessageInboundMMS),
  },
  {
    label: 'SMS with optional enrichment omitted',
    message: cloneTestData(rcMessageWithOptionalFieldsOmitted),
  },
];

function buildMessageLogUser(overrides: any = {}) {
  const baseUser = {
    id: 'message-log-user',
    platform: 'testCRM',
    accessToken: 'message-log-access-token',
    rcAccountId: 'message-log-account',
    hostname: 'crm.example.test',
    timezoneOffset: '+00:00',
    platformAdditionalInfo: {},
  };

  return {
    ...baseUser,
    ...overrides,
    platformAdditionalInfo: {
      ...baseUser.platformAdditionalInfo,
      ...(overrides.platformAdditionalInfo || {}),
    },
  };
}

function buildMessage(overrides: any = {}) {
  return buildRingCentralSMSRecord(overrides);
}

function buildMessageConversation(overrides: any = {}) {
  const baseConversation = {
    conversationId: 'message-log-conversation',
    conversationLogId: 'message-log-conversation-log',
    correspondents: [{ phoneNumber: '+14155550199', name: 'Message Contact' }],
    messages: [buildMessage()],
  };

  return {
    ...baseConversation,
    ...overrides,
    correspondents: (overrides.correspondents || baseConversation.correspondents)
      .map((correspondent: any) => cloneTestData(correspondent)),
    messages: (overrides.messages || baseConversation.messages)
      .map((message: any) => (
        isCompleteRingCentralMessageRecord(message)
          ? cloneRingCentralMessageRecord(message)
          : buildMessage(message)
      )),
    ...(overrides.entities
      ? { entities: overrides.entities.map((entity: any) => cloneTestData(entity)) }
      : {}),
  };
}

function buildMessageIncomingData(overrides: any = {}) {
  const baseIncomingData = {
    logInfo: buildMessageConversation(),
    contactId: 'message-log-contact',
    contactType: 'Contact',
    contactName: 'Message Contact',
    additionalSubmission: {},
  };

  return {
    ...baseIncomingData,
    ...overrides,
    logInfo: buildMessageConversation(overrides.logInfo || {}),
    additionalSubmission: {
      ...baseIncomingData.additionalSubmission,
      ...(overrides.additionalSubmission || {}),
    },
  };
}

const messageLogLifecycleCases = [
  {
    label: 'Lookup misses and creates a normal message log',
    incomingOverrides: {
      logInfo: {
        conversationId: 'normal-create-conversation',
        conversationLogId: 'normal-create-conversation-log',
        messages: [{ id: 'normal-create-message' }],
      },
    },
    seedLogs: [],
    expectedOperation: 'create',
    expectedLogIds: ['normal-create-message'],
    expectedPersistedId: 'normal-create-message',
    providerLogId: 'provider-normal-create',
  },
  {
    label: 'Lookup finds a conversation and updates it for a new message',
    incomingOverrides: {
      logInfo: {
        conversationId: 'normal-update-conversation',
        conversationLogId: 'normal-update-conversation-log',
        messages: [{ id: 'normal-update-new-message' }],
      },
    },
    seedLogs: [{
      id: 'normal-update-existing-message',
      platform: 'testCRM',
      conversationId: 'normal-update-conversation',
      conversationLogId: 'normal-update-conversation-log',
      thirdPartyLogId: 'provider-normal-update',
      userId: 'message-log-user',
    }],
    expectedOperation: 'update',
    expectedLogIds: ['normal-update-new-message'],
    expectedPersistedId: 'normal-update-new-message',
    providerLogId: 'provider-normal-update',
  },
  {
    label: 'Duplicate lookup produces a no-op',
    incomingOverrides: {
      logInfo: {
        conversationId: 'duplicate-conversation',
        conversationLogId: 'duplicate-conversation-log',
        messages: [{ id: 'duplicate-message' }],
      },
    },
    seedLogs: [{
      id: 'duplicate-message',
      platform: 'testCRM',
      conversationId: 'duplicate-conversation',
      conversationLogId: 'duplicate-conversation-log',
      thirdPartyLogId: 'provider-duplicate',
      userId: 'message-log-user',
    }],
    expectedOperation: 'none',
    expectedLogIds: [],
    expectedPersistedId: 'duplicate-message',
    providerLogId: 'provider-duplicate',
  },
  {
    label: 'Lookup misses and creates a shared SMS conversation log',
    incomingOverrides: {
      logInfo: {
        conversationId: 'shared-create-conversation',
        conversationLogId: 'shared-create-conversation-log',
        owner: { name: 'Shared Inbox Owner' },
        assignee: { name: 'Assigned Agent' },
        messages: [{ id: 'shared-create-message', lastModifiedTime: FIXED_MESSAGE_TIME }],
        entities: [{
          recordType: 'AliveMessage',
          direction: 'Inbound',
          from: { name: 'Shared Inbox Owner' },
          creationTime: FIXED_MESSAGE_TIME,
          lastModifiedTime: FIXED_MESSAGE_TIME,
          subject: 'Shared message body',
        }],
        creationTime: FIXED_MESSAGE_TIME,
      },
    },
    seedLogs: [],
    expectedOperation: 'create',
    expectedLogIds: ['shared-create-conversation-log'],
    expectedPersistedId: 'shared-create-conversation-log',
    providerLogId: 'provider-shared-create',
    isShared: true,
  },
];

const messageLogAuthCases = [
  {
    label: 'OAuth refresh with connector proxy configuration',
    proxyId: 'proxy-message-log',
    refreshedAccessToken: 'fresh-message-log-token',
    incomingOverrides: {
      logInfo: {
        conversationId: 'oauth-message-conversation',
        conversationLogId: 'oauth-message-conversation-log',
        messages: [{ id: 'oauth-message' }],
      },
    },
  },
];

const messageLogDatabaseFailureCases = [
  { label: 'user lookup', target: 'userLookup' },
  { label: 'message-id lookup', target: 'messageLookup' },
  { label: 'conversation lookup', target: 'conversationLookup' },
  { label: 'message persistence', target: 'persistence' },
];

const messageLogResultCases = [
  {
    label: 'provider omits the log id',
    connectorResult: {
      returnMessage: { message: 'Provider accepted no log', messageType: 'warning', ttl: 3000 },
      extraDataTracking: { providerAccepted: false },
    },
    expectedSuccessful: true,
    expectedLogIds: [],
  },
];

const oldestFirstMessageCase = {
  label: 'newest-first input is sent to the provider oldest-first',
  incomingOverrides: {
    logInfo: {
      conversationId: 'ordered-conversation',
      conversationLogId: 'ordered-conversation-log',
      messages: [
        { id: 'ordered-newest', creationTime: '2026-07-14T03:02:00.000Z' },
        { id: 'ordered-middle', creationTime: '2026-07-14T03:01:00.000Z' },
        { id: 'ordered-oldest', creationTime: '2026-07-14T03:00:00.000Z' },
      ],
    },
  },
  expectedProviderOrder: ['ordered-oldest', 'ordered-middle', 'ordered-newest'],
};

module.exports = {
  FIXED_MESSAGE_TIME,
  FIXED_MESSAGE_MODIFIED_TIME,
  FIXED_MESSAGE_DELIVERY_TIME,
  RC_MESSAGE_STORE_BASE_URI,
  RC_MEDIA_MESSAGE_STORE_BASE_URI,
  RC_MEDIA_ACCESS_TOKEN,
  buildRingCentralSMSRecord,
  cloneRingCentralMessageRecord,
  enrichMessageAttachmentsForAC,
  rcMessageInboundReceived,
  rcMessageOutboundQueued,
  rcMessageOutboundSentToGroup,
  rcMessageOutboundDelivered,
  rcMessageInboundMMS,
  rcMessageInboundVoiceMail,
  rcMessageInboundFax,
  rcMessageMediaCases,
  rcMessageOutboundSendingFailed,
  rcMessageOutboundDeliveryFailed,
  rcMessageDeleted,
  rcMessagePurged,
  rcMessageWithOptionalFieldsOmitted,
  rcMessageStatusCases,
  rcMessageAvailabilityCases,
  rcMessageReadStatusCases,
  rcMessagePriorityCases,
  rcMessageFormatCases,
  buildMessageLogUser,
  buildMessage,
  buildMessageConversation,
  buildMessageIncomingData,
  messageLogLifecycleCases,
  messageLogAuthCases,
  messageLogDatabaseFailureCases,
  messageLogResultCases,
  oldestFirstMessageCase,
};

export {};
