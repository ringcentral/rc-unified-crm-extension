const oauthEnvironment = {
  GOOGLESHEET_CLIENT_ID: 'e2e-google-sheets-coverage-client',
  GOOGLESHEET_CLIENT_SECRET: 'e2e-google-sheets-coverage-secret',
};

const user = {
  id: 'e2e-google-sheets-coverage-user-googleSheets',
  platform: 'googleSheets',
  rcAccountId: 'e2e-google-sheets-coverage-account',
  rcUserNumber: '+14155550601',
  accessToken: 'e2e-google-sheets-coverage-access-token',
  refreshToken: 'e2e-google-sheets-coverage-refresh-token',
  hashedAccountId: 'e2e-google-sheets-coverage-hashed-account',
  hashedExtensionId: 'e2e-google-sheets-coverage-hashed-extension',
  agentName: 'Jordan Lee',
};

const spreadsheetId = 'e2e-google-sheets-coverage-spreadsheet';
const provider = {
  hostname: 'sheets.googleapis.com',
  sheetsApiUrl: 'https://sheets.googleapis.com',
  spreadsheetId,
  sheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit#gid=0`,
  authorization: `Bearer ${user.accessToken}`,
  metadataResponse: {
    sheets: [
      { properties: { title: 'Contacts', sheetId: 0 } },
      { properties: { title: 'Call Logs', sheetId: 1 } },
      { properties: { title: 'Message Logs', sheetId: 2 } },
    ],
  },
};

const contactHeaders = ['ID', 'Sheet Id', 'Contact name', 'Phone', 'Company'];
const createNewContact = {
  id: 'createNewContact',
  name: 'Create new Contact',
  additionalInfo: null,
  isNewContact: true,
};

const unmatched = {
  phoneNumber: '+14155550611',
  crmRows: [
    contactHeaders,
    ['101', spreadsheetId, 'Different Contact', '+14155550999', 'Other Company'],
  ],
  expectedResponse: {
    successful: true,
    returnMessage: {
      message: 'Contact not found',
      messageType: 'warning',
      details: [{
        title: 'Details',
        items: [{
          id: '1',
          type: 'text',
          text: 'A contact with the phone number +14155550611 could not be found in your googleSheets account.',
        }],
      }],
      ttl: 5000,
    },
    contact: [createNewContact],
  },
};

const firstMatchedContact = {
  id: '201',
  name: 'Maya Patel',
  phoneNumber: '+14155550612',
  mostRecentActivityDate: '201',
};
const secondMatchedContact = {
  id: '202',
  name: 'Maya Patel - West',
  phoneNumber: '+14155550612',
  mostRecentActivityDate: '202',
};
const multipleMatches = {
  phoneNumber: '+14155550612',
  crmRows: [
    contactHeaders,
    ['201', spreadsheetId, 'Maya Patel', '+14155550612', 'Northstar Labs'],
    ['202', spreadsheetId, 'Maya Patel - West', '+14155550612', 'Northstar West'],
    ['203', spreadsheetId, 'Unrelated Contact', '+14155550998', 'Other Company'],
  ],
  expectedContacts: [
    firstMatchedContact,
    secondMatchedContact,
    createNewContact,
  ],
  expectedResponse: {
    successful: true,
    contact: [
      firstMatchedContact,
      secondMatchedContact,
      createNewContact,
    ],
  },
};

const createContact = {
  appRequestBody: {
    phoneNumber: '+14155550613',
    newContactName: 'Katherine Johnson',
    newContactType: 'contact',
  },
  existingCrmRows: [
    contactHeaders,
    ['101', spreadsheetId, 'Existing Contact', '+14155550997', 'Existing Company'],
  ],
  expectedCrmRequestBody: {
    values: [[3, spreadsheetId, 'Katherine Johnson', '+14155550613', '']],
  },
  crmResponse: {
    updates: {
      updatedRows: 1,
      updatedRange: "'Contacts'!A3:E3",
    },
  },
  expectedResponse: {
    successful: true,
    returnMessage: {
      message: 'Contact created',
      messageType: 'success',
      ttl: 5000,
    },
    contact: {
      id: 3,
      name: 'Katherine Johnson',
    },
  },
};

const messageHeaders = [
  'ID',
  'Sheet Id',
  'Subject',
  'Contact name',
  'Message',
  'Phone',
  'Message Type',
  'Message Time',
  'Direction',
];

const messageContact = {
  id: '301',
  name: 'Maya Patel',
  phoneNumber: '+14155550621',
};
const conversation = {
  id: 'e2e-google-sheets-conversation-50621',
  logId: 'e2e-google-sheets-conversation-50621-2026-07-14',
};

// RingCentral timestamps are UTC instants. Construct them from a stable local
// wall clock so the connector's local-time rendering is deterministic on CI
// and developer machines in different time zones.
function ringCentralUtcTime(hour, minute, second = 0) {
  return new Date(2026, 6, 14, hour, minute, second).toISOString();
}

const inboundMessage = {
  uri: 'https://platform.ringcentral.com/restapi/v1.0/account/~/extension/~/message-store/65062101',
  id: '65062101',
  to: [{ phoneNumber: user.rcUserNumber, name: user.agentName }],
  from: {
    phoneNumber: messageContact.phoneNumber,
    name: messageContact.name,
    location: 'San Francisco, CA',
  },
  type: 'SMS',
  creationTime: ringCentralUtcTime(3, 0),
  readStatus: 'Unread',
  priority: 'Normal',
  attachments: [{
    id: '65062101',
    uri: 'https://media.ringcentral.com/restapi/v1.0/account/~/extension/~/message-store/65062101/content/65062101',
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
  lastModifiedTime: ringCentralUtcTime(3, 0, 1),
};
const outboundMessage = {
  uri: 'https://platform.ringcentral.com/restapi/v1.0/account/~/extension/~/message-store/65062102',
  id: '65062102',
  to: [{ phoneNumber: messageContact.phoneNumber, name: messageContact.name }],
  from: { phoneNumber: user.rcUserNumber, name: user.agentName },
  type: 'SMS',
  creationTime: ringCentralUtcTime(3, 5),
  readStatus: 'Read',
  priority: 'Normal',
  attachments: [{
    id: '65062102',
    uri: 'https://media.ringcentral.com/restapi/v1.0/account/~/extension/~/message-store/65062102/content/65062102',
    type: 'Text',
    contentType: 'text/plain',
  }],
  direction: 'Outbound',
  availability: 'Alive',
  subject: 'Here are the renewal options and plan comparison.',
  messageStatus: 'Delivered',
  smsDeliveryTime: ringCentralUtcTime(3, 5, 2),
  conversationId: conversation.id,
  conversation: {
    id: conversation.id,
    uri: `https://platform.ringcentral.com/restapi/v1.0/conversation/${conversation.id}`,
  },
  lastModifiedTime: ringCentralUtcTime(3, 5, 3),
};

const createdMessageBody =
  '\nConversation summary\n' +
  'Tuesday, July 14, 2026\n' +
  'Participants\n' +
  `    ${user.agentName}\n` +
  `    ${messageContact.name}\n` +
  '\nConversation(1 messages)\n' +
  'BEGIN\n' +
  '------------\n' +
  `${messageContact.name} (${messageContact.phoneNumber}) 03:00 AM\n` +
  `${inboundMessage.subject}\n\n` +
  '------------\n' +
  'END\n\n' +
  '--- Created via RingCentral App Connect';

const updatedMessageBody =
  '\nConversation summary\n' +
  'Tuesday, July 14, 2026\n' +
  'Participants\n' +
  `    ${user.agentName}\n` +
  `    ${messageContact.name}\n` +
  '\nConversation(2 messages)\n' +
  'BEGIN\n' +
  '------------\n' +
  `${messageContact.name} (${messageContact.phoneNumber}) 03:00 AM\n` +
  `${inboundMessage.subject}\n\n` +
  `${user.agentName} 03:05 AM\n` +
  `${outboundMessage.subject}\n\n` +
  '------------\n' +
  'END\n\n' +
  '--- Created via RingCentral App Connect';

const expectedCreatedMessageRow = [
  2,
  spreadsheetId,
  'SMS conversation with Maya Patel - 26/07/14',
  messageContact.name,
  createdMessageBody,
  messageContact.phoneNumber,
  'SMS',
  '2026-07-14 03:00:00',
  'Inbound',
];
const existingMessageRow = [...expectedCreatedMessageRow];
existingMessageRow[0] = '2';

const messageLogging = {
  headers: messageHeaders,
  contact: messageContact,
  conversation,
  messages: {
    inbound: inboundMessage,
    outbound: outboundMessage,
  },
  create: {
    crmRows: [messageHeaders],
    expectedCrmRequestBody: { values: [expectedCreatedMessageRow] },
    crmResponse: {
      updates: {
        updatedRows: 1,
        updatedRange: "'Message Logs'!A2:I2",
      },
    },
    expectedResponse: {
      successful: true,
      logIds: [inboundMessage.id],
      returnMessage: {
        message: 'Message logged',
        messageType: 'success',
        ttl: 1000,
      },
    },
  },
  update: {
    crmRows: [messageHeaders, existingMessageRow],
    expectedCrmRequestBody: {
      valueInputOption: 'RAW',
      data: [{
        range: 'Message Logs!E2',
        values: [[updatedMessageBody]],
      }],
    },
    crmResponse: { responses: [] },
    expectedResponse: {
      successful: true,
      logIds: [outboundMessage.id],
      returnMessage: {
        message: 'Message log updated.',
        messageType: 'success',
        ttl: 2000,
      },
    },
  },
};

const oauth = {
  platform: 'googleSheets',
  hostname: 'sheets.googleapis.com',
  userId: 'e2e-google-sheets-oauth-user-googleSheets',
  subject: 'e2e-google-sheets-oauth-user',
  name: 'Google Sheets OAuth User',
  email: 'google-sheets-oauth@example.test',
  hashedExtensionId: 'e2e-google-sheets-oauth-hashed-extension',
  rcAccountId: 'e2e-google-sheets-oauth-account',
  rcExtensionId: 'e2e-google-sheets-oauth-admin-extension',
  adminAccessToken: 'e2e-google-sheets-oauth-admin-access-token',
  hashedAccountId: 'e2e-google-sheets-oauth-hashed-account',
  authorizationCode: 'e2e-google-sheets-authorization-code',
  redirectUri: 'https://ringcentral.github.io/ringcentral-embeddable/redirect.html',
  userInfoApiUrl: 'https://www.googleapis.com',
  accessToken: 'e2e-google-sheets-oauth-access-token',
  refreshToken: 'e2e-google-sheets-oauth-refresh-token',
  expectedTokenAuthorization: `Basic ${Buffer.from(
    `${oauthEnvironment.GOOGLESHEET_CLIENT_ID}:${oauthEnvironment.GOOGLESHEET_CLIENT_SECRET}`,
  ).toString('base64')}`,
  tokenResponse: {
    access_token: 'e2e-google-sheets-oauth-access-token',
    refresh_token: 'e2e-google-sheets-oauth-refresh-token',
    expires_in: 7200,
    token_type: 'Bearer',
  },
  crmUserResponse: {
    sub: 'e2e-google-sheets-oauth-user',
    name: 'Google Sheets OAuth User',
    email: 'google-sheets-oauth@example.test',
    email_verified: true,
  },
  expectedLoginResponse: {
    name: 'Google Sheets OAuth User',
  },
  expectedPersistedUser: {
    id: 'e2e-google-sheets-oauth-user-googleSheets',
    platform: 'googleSheets',
    hostname: 'sheets.googleapis.com',
    accessToken: 'e2e-google-sheets-oauth-access-token',
    refreshToken: 'e2e-google-sheets-oauth-refresh-token',
    hashedRcExtensionId: 'e2e-google-sheets-oauth-hashed-extension',
    rcAccountId: 'e2e-google-sheets-oauth-account',
    platformAdditionalInfo: {
      email: 'google-sheets-oauth@example.test',
      name: 'Google Sheets OAuth User',
    },
  },
};

function buildGoogleSheetsManagedOAuthValues(accessTokenUri) {
  return {
    clientId: oauthEnvironment.GOOGLESHEET_CLIENT_ID,
    clientSecret: oauthEnvironment.GOOGLESHEET_CLIENT_SECRET,
    accessTokenUri,
    authorizationUri: 'https://accounts.google.com/o/oauth2/v2/auth',
    redirectUri: oauth.redirectUri,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    hostname: oauth.hostname,
  };
}

function googleSheetsOAuthAdminResponse() {
  return {
    id: oauth.rcExtensionId,
    account: { id: oauth.rcAccountId },
    permissions: {
      admin: { enabled: true },
    },
  };
}

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
    },
    contactId: messageContact.id,
    contactName: messageContact.name,
    contactType: 'contact',
  };
}

const googleSheetsCoverageCase = {
  oauthEnvironment,
  user,
  provider,
  contactHeaders,
  scenarios: {
    contacts: {
      unmatched,
      multipleMatches,
      create: createContact,
    },
    messageLogging,
    oauth,
  },
};

module.exports = {
  googleSheetsCoverageCase,
  buildMessageLogRequest,
  buildGoogleSheetsManagedOAuthValues,
  googleSheetsOAuthAdminResponse,
};

export {};
