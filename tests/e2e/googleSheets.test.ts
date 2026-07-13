const nock = require('nock');
const {
  startServer,
  stopServer,
  cleanE2EData,
  generateJwt,
} = require('./support/serverHarness');
const { UserModel } = require('@app-connect/core/models/userModel');
const { CallLogModel } = require('@app-connect/core/models/callLogModel');
const { AccountDataModel } = require('@app-connect/core/models/accountDataModel');
const {
  practicalContacts,
  practicalAgents,
  practicalNotes,
  buildPracticalCall,
} = require('./support/practicalData');

describe('Google Sheets server E2E', () => {
  const platform = 'googleSheets';
  const userId = 'e2e-google-sheets-user-googleSheets';
  const rcAccountId = 'e2e-google-sheets-rc-account';
  const spreadsheetId = 'e2e-google-sheets-spreadsheet';
  const sheetUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit#gid=0`;
  const phoneNumber = '+14155557777';
  const sessionId = 'e2e-google-sheets-session';
  const telephonySessionId = 'e2e-google-sheets-telephony-session';
  const extensionNumber = '107';
  const sheetsApiUrl = 'https://sheets.googleapis.com';
  const contactId = '101';
  const callLogId = '2';
  const callLogHeaders = [
    'ID',
    'Sheet Id',
    'Subject',
    'Notes',
    'Contact name',
    'Phone',
    'Start time',
    'End time',
    'Duration',
    'Session Id',
    'Direction',
    'Incoming Phone Number',
    'Outgoing Phone Number',
    'Transcript',
    'Smart summary',
    'ACE Summary',
    'ACE Transcript',
    'ACE AI Score',
    'ACE Bulleted Summary',
    'ACE Link',
    'Call Result',
    'Call Recording',
  ];

  let server;
  let client;
  let jwtToken;

  function mockSpreadsheetMetadata() {
    return nock(sheetsApiUrl)
      .get(`/v4/spreadsheets/${spreadsheetId}`)
      .reply(200, {
        sheets: [
          { properties: { title: 'Contacts', sheetId: 0 } },
          { properties: { title: 'Call Logs', sheetId: 1 } },
        ],
      });
  }

  function mockCallLogRead(subject, note) {
    const metadataScope = mockSpreadsheetMetadata();
    const valuesScope = nock(sheetsApiUrl)
      .get(`/v4/spreadsheets/${spreadsheetId}/values/Call%20Logs`)
      .reply(200, {
        values: [
          callLogHeaders,
          [
            callLogId,
            spreadsheetId,
            subject,
            note,
            'Google Sheets Contact',
            phoneNumber,
            '2026-06-01T01:02:03.000Z',
            '2026-06-01T01:04:08.000Z',
            '125',
            sessionId,
            'Outbound',
            phoneNumber,
            '+14155550007',
            'Google Sheets transcript',
            'Google Sheets summary',
            '',
            '',
            '',
            '',
            '',
            'Completed',
            'https://recordings.example.test/google-sheets-e2e.wav',
          ],
        ],
      });
    const detailsScope = nock(sheetsApiUrl)
      .get(`/v4/spreadsheets/${spreadsheetId}/values:batchGet`)
      .query(true)
      .reply(200, {
        valueRanges: [
          { values: [[subject]] },
          { values: [[note]] },
        ],
      });

    return { metadataScope, valuesScope, detailsScope };
  }

  async function seedUser() {
    await UserModel.create({
      id: userId,
      platform,
      hostname: 'sheets.googleapis.com',
      rcAccountId,
      rcUserNumber: '+14155550007',
      accessToken: 'e2e-google-sheets-access-token',
      refreshToken: 'e2e-google-sheets-refresh-token',
      tokenExpiry: new Date(Date.now() + 60 * 60 * 1000),
      timezoneOffset: '+00:00',
      platformAdditionalInfo: {
        email: 'google-sheets-e2e@example.test',
        name: 'Google Sheets E2E User',
      },
      userSettings: {
        googleSheetsUrl: { value: sheetUrl },
      },
      hashedRcExtensionId: 'e2e-google-sheets-hashed-extension',
    });

    jwtToken = generateJwt({
      id: userId,
      platform,
      rcUserNumber: '+14155550007',
    });
  }

  beforeAll(async () => {
    ({ server, client } = await startServer());
  });

  afterAll(async () => {
    await cleanE2EData({ userIds: [userId], rcAccountIds: [rcAccountId] });
    await stopServer(server);
  });

  beforeEach(async () => {
    nock.cleanAll();
    await cleanE2EData({ userIds: [userId], rcAccountIds: [rcAccountId] });
    await seedUser();
  });

  afterEach(() => {
    nock.cleanAll();
  });

  test('completes a contact-to-call-log HTTP flow', async () => {
    const interfaces = await client.get('/implementedInterfaces', {
      params: { platform },
    });

    expect(interfaces.status).toBe(200);
    expect(interfaces.data).toMatchObject({
      getAuthType: true,
      getOauthInfo: true,
      findContact: true,
      createCallLog: true,
      updateCallLog: true,
      getCallLog: true,
    });

    const contactMetadataScope = mockSpreadsheetMetadata();
    const contactValuesScope = nock(sheetsApiUrl)
      .get(`/v4/spreadsheets/${spreadsheetId}/values/Contacts`)
      .reply(200, {
        values: [
          ['ID', 'Sheet Id', 'Contact name', 'Phone', 'Company'],
          [contactId, spreadsheetId, 'Google Sheets Contact', phoneNumber, 'E2E Company'],
        ],
      });

    const contact = await client.get('/contact', {
      params: {
        jwtToken,
        phoneNumber,
        isExtension: 'false',
      },
    });

    expect(contact.status).toBe(200);
    expect(contact.data.successful).toBe(true);
    expect(contact.data.contact[0]).toMatchObject({
      id: contactId,
      name: 'Google Sheets Contact',
      phoneNumber,
    });
    expect(contactMetadataScope.isDone()).toBe(true);
    expect(contactValuesScope.isDone()).toBe(true);

    const cachedContact = await AccountDataModel.findOne({
      where: {
        rcAccountId,
        platformName: platform,
        dataKey: `contact-${phoneNumber}`,
      },
    });
    expect(cachedContact).not.toBeNull();
    expect(cachedContact.data[0]).toMatchObject({
      id: contactId,
      name: 'Google Sheets Contact',
      phoneNumber,
    });

    const createMetadataScope = mockSpreadsheetMetadata();
    const existingRowsScope = nock(sheetsApiUrl)
      .get(`/v4/spreadsheets/${spreadsheetId}/values/Call%20Logs`)
      .reply(200, { values: [callLogHeaders] });
    const headerScope = nock(sheetsApiUrl)
      .get(`/v4/spreadsheets/${spreadsheetId}/values/Call%20Logs!1:1`)
      .reply(200, { values: [callLogHeaders] });
    let appendedValues;
    const appendScope = nock(sheetsApiUrl)
      .post(`/v4/spreadsheets/${spreadsheetId}/values/Call%20Logs!A1:append`, body => {
        appendedValues = body.values;
        return true;
      })
      .query({ valueInputOption: 'RAW' })
      .reply(200, {
        updates: {
          updatedRows: 1,
          updatedRange: "'Call Logs'!A2:V2",
        },
      });

    const logInfo = {
      id: 'e2e-google-sheets-call-id',
      sessionId,
      telephonySessionId,
      extensionNumber,
      direction: 'Outbound',
      from: {
        name: 'Google Sheets E2E Agent',
        phoneNumber: '+14155550007',
      },
      to: {
        name: 'Google Sheets Contact',
        phoneNumber,
      },
      duration: 125,
      result: 'Completed',
      startTime: new Date('2026-06-01T01:02:03.000Z').getTime(),
      recording: {
        link: 'https://recordings.example.test/google-sheets-e2e.wav',
      },
      customSubject: 'Google Sheets E2E call subject',
    };

    const createLog = await client.post('/callLog', {
      logInfo,
      contactId,
      contactName: 'Google Sheets Contact',
      contactType: 'contact',
      note: 'Google Sheets E2E agent note',
      aiNote: 'Google Sheets E2E summary',
      transcript: 'Google Sheets E2E transcript',
    }, {
      params: { jwtToken },
      headers: {
        'rc-account-id': 'e2e-google-sheets-hashed-account',
        'rc-extension-id': 'e2e-google-sheets-hashed-extension',
      },
    });

    expect(createLog.status).toBe(200);
    expect(createLog.data).toMatchObject({
      successful: true,
      logId: Number(callLogId),
      returnMessage: {
        message: 'Call logged',
        messageType: 'success',
      },
    });
    expect(appendedValues).toHaveLength(1);
    const appendedRow = appendedValues[0];
    expect(appendedRow[callLogHeaders.indexOf('ID')]).toBe(Number(callLogId));
    expect(appendedRow[callLogHeaders.indexOf('Sheet Id')]).toBe(spreadsheetId);
    expect(appendedRow[callLogHeaders.indexOf('Subject')]).toBe('Google Sheets E2E call subject');
    expect(appendedRow[callLogHeaders.indexOf('Notes')]).toBe('Google Sheets E2E agent note');
    expect(appendedRow[callLogHeaders.indexOf('Contact name')]).toBe('Google Sheets Contact');
    expect(appendedRow[callLogHeaders.indexOf('Incoming Phone Number')]).toBe(phoneNumber);
    expect(appendedRow[callLogHeaders.indexOf('Outgoing Phone Number')]).toBe('+14155550007');
    expect(appendedRow[callLogHeaders.indexOf('Transcript')]).toBe('Google Sheets E2E transcript');
    expect(appendedRow[callLogHeaders.indexOf('Smart summary')]).toBe('Google Sheets E2E summary');
    expect(appendedRow[callLogHeaders.indexOf('Call Recording')]).toBe('https://recordings.example.test/google-sheets-e2e.wav');
    expect(createMetadataScope.isDone()).toBe(true);
    expect(existingRowsScope.isDone()).toBe(true);
    expect(headerScope.isDone()).toBe(true);
    expect(appendScope.isDone()).toBe(true);

    const persistedCallLog = await CallLogModel.findOne({
      where: { sessionId, userId },
    });
    expect(persistedCallLog).toMatchObject({
      id: telephonySessionId,
      sessionId,
      extensionNumber,
      platform,
      thirdPartyLogId: callLogId,
      userId,
      contactId,
    });

    const detailedRead = mockCallLogRead(
      'Google Sheets E2E call subject',
      'Google Sheets E2E agent note',
    );
    const getLog = await client.get('/callLog', {
      params: {
        jwtToken,
        sessionIds: sessionId,
        extensionNumber,
        requireDetails: 'true',
      },
    });

    expect(getLog.status).toBe(200);
    expect(getLog.data.successful).toBe(true);
    expect(getLog.data.logs).toEqual([
      expect.objectContaining({
        sessionId,
        matched: true,
        logId: callLogId,
        logData: expect.objectContaining({
          subject: 'Google Sheets E2E call subject',
          note: 'Google Sheets E2E agent note',
        }),
      }),
    ]);
    expect(detailedRead.metadataScope.isDone()).toBe(true);
    expect(detailedRead.valuesScope.isDone()).toBe(true);
    expect(detailedRead.detailsScope.isDone()).toBe(true);

    const updatePrefetch = mockCallLogRead(
      'Google Sheets E2E call subject',
      'Google Sheets E2E agent note',
    );
    const updateMetadataScope = mockSpreadsheetMetadata();
    const updateRowsScope = nock(sheetsApiUrl)
      .get(`/v4/spreadsheets/${spreadsheetId}/values/Call%20Logs`)
      .reply(200, {
        values: [
          callLogHeaders,
          [
            callLogId,
            spreadsheetId,
            'Google Sheets E2E call subject',
            'Google Sheets E2E agent note',
            'Google Sheets Contact',
            phoneNumber,
            '2026-06-01T01:02:03.000Z',
            '2026-06-01T01:04:08.000Z',
            '125',
            sessionId,
            'Outbound',
            phoneNumber,
            '+14155550007',
            'Google Sheets E2E transcript',
            'Google Sheets E2E summary',
            '',
            '',
            '',
            '',
            '',
            'Completed',
            'https://recordings.example.test/google-sheets-e2e.wav',
          ],
        ],
      });
    let updateBody;
    const updateScope = nock(sheetsApiUrl)
      .post(`/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`, body => {
        updateBody = body;
        return true;
      })
      .reply(200, { responses: [] });

    const updateLog = await client.patch('/callLog', {
      sessionId,
      extensionNumber,
      subject: 'Google Sheets E2E updated subject',
      note: 'Google Sheets E2E follow-up note',
      startTime: new Date('2026-06-01T01:10:03.000Z').getTime(),
      duration: 240,
      result: 'Completed',
      direction: 'Outbound',
      from: logInfo.from,
      to: logInfo.to,
      recordingLink: 'https://recordings.example.test/google-sheets-e2e-updated.wav',
      aiNote: 'Google Sheets E2E updated summary',
      transcript: 'Google Sheets E2E updated transcript',
    }, {
      params: { jwtToken },
      headers: {
        'rc-account-id': 'e2e-google-sheets-hashed-account',
        'rc-extension-id': 'e2e-google-sheets-hashed-extension',
      },
    });

    expect(updateLog.status).toBe(200);
    expect(updateLog.data).toMatchObject({
      successful: true,
      logId: callLogId,
      updatedNote: 'Google Sheets E2E follow-up note',
      returnMessage: {
        message: 'Call log updated.',
        messageType: 'success',
      },
    });
    expect(updateBody.valueInputOption).toBe('RAW');
    expect(updateBody.data).toEqual(expect.arrayContaining([
      { range: 'Call Logs!C2', values: [['Google Sheets E2E updated subject']] },
      { range: 'Call Logs!D2', values: [['Google Sheets E2E follow-up note']] },
      { range: 'Call Logs!I2', values: [[240]] },
      { range: 'Call Logs!U2', values: [['Completed']] },
      { range: 'Call Logs!V2', values: [['https://recordings.example.test/google-sheets-e2e-updated.wav']] },
      { range: 'Call Logs!N2', values: [['Google Sheets E2E updated transcript']] },
      { range: 'Call Logs!O2', values: [['Google Sheets E2E updated summary']] },
    ]));
    expect(updatePrefetch.metadataScope.isDone()).toBe(true);
    expect(updatePrefetch.valuesScope.isDone()).toBe(true);
    expect(updatePrefetch.detailsScope.isDone()).toBe(true);
    expect(updateMetadataScope.isDone()).toBe(true);
    expect(updateRowsScope.isDone()).toBe(true);
    expect(updateScope.isDone()).toBe(true);
    expect(nock.pendingMocks()).toEqual([]);
  });

  test('logs a practical inbound customer call with multiline Unicode data', async () => {
    const practicalContact = practicalContacts.smallBusinessOwner;
    const practicalSessionId = `${sessionId}-practical-inbound`;
    const practicalTelephonySessionId = `${telephonySessionId}-practical-inbound`;
    const practicalContactId = '176';
    const practicalSubject = `Support routing check-in — ${practicalContact.name}`;
    const logInfo = buildPracticalCall({
      id: 'e2e-google-sheets-practical-inbound-call-id',
      sessionId: practicalSessionId,
      telephonySessionId: practicalTelephonySessionId,
      extensionNumber,
      direction: 'Inbound',
      contact: practicalContact,
      agent: practicalAgents.supportSpecialist,
      duration: 193,
      result: 'Completed',
      startTime: '2026-03-13T15:42:10.000Z',
      customSubject: practicalSubject,
    });

    const metadataScope = mockSpreadsheetMetadata();
    const existingRowsScope = nock(sheetsApiUrl)
      .get(`/v4/spreadsheets/${spreadsheetId}/values/Call%20Logs`)
      .reply(200, { values: [callLogHeaders] });
    const headerScope = nock(sheetsApiUrl)
      .get(`/v4/spreadsheets/${spreadsheetId}/values/Call%20Logs!1:1`)
      .reply(200, { values: [callLogHeaders] });
    let appendedValues;
    const appendScope = nock(sheetsApiUrl)
      .post(`/v4/spreadsheets/${spreadsheetId}/values/Call%20Logs!A1:append`, body => {
        appendedValues = body.values;
        return true;
      })
      .query({ valueInputOption: 'RAW' })
      .reply(200, {
        updates: {
          updatedRows: 1,
          updatedRange: "'Call Logs'!A2:V2",
        },
      });

    const createLog = await client.post('/callLog', {
      logInfo,
      contactId: practicalContactId,
      contactName: practicalContact.name,
      contactType: 'contact',
      note: practicalNotes.supportResolution,
    }, {
      params: { jwtToken },
      headers: {
        'rc-account-id': 'e2e-google-sheets-hashed-account',
        'rc-extension-id': 'e2e-google-sheets-hashed-extension',
      },
    });

    expect(createLog.status).toBe(200);
    expect(createLog.data).toMatchObject({
      successful: true,
      logId: Number(callLogId),
      returnMessage: {
        message: 'Call logged',
        messageType: 'success',
      },
    });
    expect(logInfo).not.toHaveProperty('recording');
    expect(appendedValues).toHaveLength(1);
    const appendedRow = appendedValues[0];
    expect(appendedRow[callLogHeaders.indexOf('ID')]).toBe(Number(callLogId));
    expect(appendedRow[callLogHeaders.indexOf('Subject')]).toBe(practicalSubject);
    expect(appendedRow[callLogHeaders.indexOf('Notes')]).toBe(practicalNotes.supportResolution);
    expect(appendedRow[callLogHeaders.indexOf('Contact name')]).toBe(practicalContact.name);
    expect(appendedRow[callLogHeaders.indexOf('Phone')]).toBe(practicalContact.phoneNumber);
    expect(appendedRow[callLogHeaders.indexOf('Duration')]).toBe(193);
    expect(appendedRow[callLogHeaders.indexOf('Session Id')]).toBe(practicalSessionId);
    expect(appendedRow[callLogHeaders.indexOf('Direction')]).toBe('Inbound');
    expect(appendedRow[callLogHeaders.indexOf('Incoming Phone Number')]).toBe(
      practicalAgents.supportSpecialist.phoneNumber,
    );
    expect(appendedRow[callLogHeaders.indexOf('Outgoing Phone Number')]).toBe(
      practicalContact.phoneNumber,
    );
    expect(appendedRow[callLogHeaders.indexOf('Call Result')]).toBe('Completed');
    expect(appendedRow[callLogHeaders.indexOf('Call Recording')]).toBe('');
    expect(appendedRow[callLogHeaders.indexOf('Transcript')]).toBe('');
    expect(appendedRow[callLogHeaders.indexOf('Smart summary')]).toBe('');

    const persistedCallLog = await CallLogModel.findOne({
      where: { sessionId: practicalSessionId, userId },
    });
    expect(persistedCallLog).toMatchObject({
      id: practicalTelephonySessionId,
      sessionId: practicalSessionId,
      extensionNumber,
      platform,
      thirdPartyLogId: callLogId,
      userId,
      contactId: practicalContactId,
    });
    expect(metadataScope.isDone()).toBe(true);
    expect(existingRowsScope.isDone()).toBe(true);
    expect(headerScope.isDone()).toBe(true);
    expect(appendScope.isDone()).toBe(true);
    expect(nock.pendingMocks()).toEqual([]);
  });
});

export {};
