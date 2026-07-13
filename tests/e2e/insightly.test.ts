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

describe('Insightly server E2E', () => {
  const platform = 'insightly';
  const userId = 'e2e-insightly-server-user';
  const rcAccountId = 'e2e-insightly-server-account';
  const rcUserNumber = '+14155550004';
  const hashedExtensionId = 'e2e-insightly-hashed-extension';
  const phoneNumber = '+14155554567';
  const sessionId = 'e2e-insightly-session';
  const telephonySessionId = 'e2e-insightly-telephony-session';
  const extensionNumber = '104';
  const apiBaseUrl = 'https://api.e2e.insightly.com';
  const apiKey = 'e2e-insightly-api-key';
  const expectedAuthorization = `Basic ${Buffer.from(`${apiKey}:`).toString('base64')}`;
  const previousApiVersion = process.env.INSIGHTLY_API_VERSION;

  let server;
  let client;
  let jwtToken;

  function eventResponse(overrides = {}) {
    return {
      EVENT_ID: 201,
      TITLE: 'Insightly E2E call subject',
      DETAILS: '- Agent notes: Insightly e2e agent note\n- Duration: 4 minutes\n- Result: Completed\n',
      LINKS: [{ LINK_OBJECT_NAME: 'contact', LINK_OBJECT_ID: 101 }],
      ...overrides,
    };
  }

  async function seedUser() {
    await UserModel.create({
      id: userId,
      platform,
      hostname: 'app.insightly.com',
      rcAccountId,
      accessToken: apiKey,
      refreshToken: '',
      tokenExpiry: null,
      timezoneOffset: '+00:00',
      platformAdditionalInfo: { apiUrl: apiBaseUrl },
      userSettings: {},
      hashedRcExtensionId: hashedExtensionId,
    });
    jwtToken = generateJwt({ id: userId, platform, rcUserNumber });
  }

  async function cleanData() {
    await cleanE2EData({ userIds: [userId], rcAccountIds: [rcAccountId] });
  }

  beforeAll(async () => {
    process.env.INSIGHTLY_API_VERSION = 'v3.1';
    ({ server, client } = await startServer());
  });

  afterAll(async () => {
    try {
      await cleanData();
      await stopServer(server);
    } finally {
      if (previousApiVersion === undefined) {
        delete process.env.INSIGHTLY_API_VERSION;
      } else {
        process.env.INSIGHTLY_API_VERSION = previousApiVersion;
      }
    }
  });

  beforeEach(async () => {
    nock.cleanAll();
    await cleanData();
    await seedUser();
  });

  afterEach(() => {
    nock.cleanAll();
  });

  test('completes an Insightly contact-to-call-log HTTP flow', async () => {
    const interfaces = await client.get('/implementedInterfaces', { params: { platform } });
    expect(interfaces.status).toBe(200);
    expect(interfaces.data).toMatchObject({
      getAuthType: true,
      getBasicAuth: true,
      findContact: true,
      createCallLog: true,
      updateCallLog: true,
      getCallLog: true,
    });

    const contactSearchScope = nock(apiBaseUrl)
      .matchHeader('authorization', expectedAuthorization)
      .get('/v3.1/contacts/search')
      .query({ field_name: 'PHONE', field_value: '4155554567', brief: 'false' })
      .reply(200, [{
        CONTACT_ID: 101,
        FIRST_NAME: 'Insightly',
        LAST_NAME: 'Contact',
        PHONE: phoneNumber,
        TITLE: 'Engineer',
        DATE_CREATED_UTC: '2026-01-02T02:04:05Z',
        LAST_ACTIVITY_DATE_UTC: '2026-01-02T03:04:05Z',
        DATE_UPDATED_UTC: '2026-01-02T04:04:05Z',
        LINKS: [],
      }]);
    const contactMobileScope = nock(apiBaseUrl)
      .matchHeader('authorization', expectedAuthorization)
      .get('/v3.1/contacts/search')
      .query({ field_name: 'PHONE_MOBILE', field_value: '4155554567', brief: 'false' })
      .reply(200, []);
    const leadPhoneScope = nock(apiBaseUrl)
      .matchHeader('authorization', expectedAuthorization)
      .get('/v3.1/leads/search')
      .query({ field_name: 'PHONE', field_value: '4155554567', brief: 'false' })
      .reply(200, []);
    const leadMobileScope = nock(apiBaseUrl)
      .matchHeader('authorization', expectedAuthorization)
      .get('/v3.1/leads/search')
      .query({ field_name: 'MOBILE', field_value: '4155554567', brief: 'false' })
      .reply(200, []);

    const contact = await client.get('/contact', {
      params: { jwtToken, phoneNumber, overridingFormat: '', isExtension: 'false' },
    });

    expect(contact.status).toBe(200);
    expect(contact.data.successful).toBe(true);
    expect(contact.data.contact[0]).toMatchObject({
      id: 101,
      name: 'Insightly Contact',
      type: 'Contact',
    });
    expect(contactSearchScope.isDone()).toBe(true);
    expect(contactMobileScope.isDone()).toBe(true);
    expect(leadPhoneScope.isDone()).toBe(true);
    expect(leadMobileScope.isDone()).toBe(true);

    const cachedContact = await AccountDataModel.findOne({
      where: {
        rcAccountId,
        platformName: platform,
        dataKey: `contact-${phoneNumber}`,
      },
    });
    expect(cachedContact.data[0]).toMatchObject({ id: 101, name: 'Insightly Contact' });

    const logInfo = {
      id: 'e2e-insightly-call-id',
      sessionId,
      telephonySessionId,
      extensionNumber,
      direction: 'Outbound',
      from: { name: 'Insightly Agent', phoneNumber: rcUserNumber },
      to: { name: 'Insightly Contact', phoneNumber },
      duration: 240,
      result: 'Completed',
      startTime: new Date('2026-01-02T03:04:05.000Z').getTime(),
      recording: { link: 'https://recordings.example.test/insightly-e2e.wav' },
      customSubject: 'Insightly E2E call subject',
    };

    let createdEventBody;
    const createEventScope = nock(apiBaseUrl)
      .matchHeader('authorization', expectedAuthorization)
      .post('/v3.1/events', body => {
        createdEventBody = body;
        return true;
      })
      .reply(201, { EVENT_ID: 201 });
    const linkContactScope = nock(apiBaseUrl)
      .matchHeader('authorization', expectedAuthorization)
      .post('/v3.1/events/201/links', {
        LINK_OBJECT_NAME: 'contact',
        LINK_OBJECT_ID: 101,
      })
      .reply(201, {});

    const createLog = await client.post('/callLog', {
      logInfo,
      contactId: 101,
      contactName: 'Insightly Contact',
      contactType: 'Contact',
      note: 'Insightly e2e agent note',
      additionalSubmission: {},
    }, {
      params: { jwtToken },
      headers: {
        'rc-account-id': 'e2e-insightly-hashed-account',
        'rc-extension-id': hashedExtensionId,
      },
    });

    expect(createLog.status).toBe(200);
    expect(createLog.data).toMatchObject({
      successful: true,
      logId: 201,
      returnMessage: { message: 'Call logged', messageType: 'success' },
    });
    expect(createdEventBody.TITLE).toBe('Insightly E2E call subject');
    expect(createdEventBody.DETAILS).toContain('Insightly e2e agent note');
    expect(createdEventBody.DETAILS).toContain('Call recording link');
    expect(createEventScope.isDone()).toBe(true);
    expect(linkContactScope.isDone()).toBe(true);

    const persistedCallLog = await CallLogModel.findOne({ where: { sessionId, userId } });
    expect(persistedCallLog).toMatchObject({
      id: telephonySessionId,
      sessionId,
      extensionNumber,
      platform,
      thirdPartyLogId: '201',
      userId,
      contactId: '101',
    });

    const getEventScope = nock(apiBaseUrl)
      .matchHeader('authorization', expectedAuthorization)
      .get('/v3.1/events/201')
      .reply(200, eventResponse());
    const getContactScope = nock(apiBaseUrl)
      .matchHeader('authorization', expectedAuthorization)
      .get('/v3.1/contacts/101')
      .reply(200, { CONTACT_ID: 101, FIRST_NAME: 'Insightly', LAST_NAME: 'Contact' });

    const getLog = await client.get('/callLog', {
      params: { jwtToken, sessionIds: sessionId, extensionNumber, requireDetails: 'true' },
    });

    expect(getLog.status).toBe(200);
    expect(getLog.data).toMatchObject({
      successful: true,
      logs: [{
        sessionId,
        matched: true,
        logId: '201',
        logData: {
          subject: 'Insightly E2E call subject',
          note: 'Insightly e2e agent note',
          contactName: 'Insightly Contact',
          dispositions: {},
        },
      }],
    });
    expect(getEventScope.isDone()).toBe(true);
    expect(getContactScope.isDone()).toBe(true);

    const getBeforeUpdateScope = nock(apiBaseUrl)
      .matchHeader('authorization', expectedAuthorization)
      .get('/v3.1/events/201')
      .reply(200, eventResponse());
    const getContactBeforeUpdateScope = nock(apiBaseUrl)
      .matchHeader('authorization', expectedAuthorization)
      .get('/v3.1/contacts/101')
      .reply(200, { CONTACT_ID: 101, FIRST_NAME: 'Insightly', LAST_NAME: 'Contact' });
    let updatedEventBody;
    const updateEventScope = nock(apiBaseUrl)
      .matchHeader('authorization', expectedAuthorization)
      .put('/v3.1/events', body => {
        updatedEventBody = body;
        return true;
      })
      .reply(200, { EVENT_ID: 201 });

    const updateLog = await client.patch('/callLog', {
      sessionId,
      extensionNumber,
      subject: 'Insightly E2E updated subject',
      note: 'Insightly e2e follow-up note',
      startTime: new Date('2026-01-02T03:10:05.000Z').getTime(),
      duration: 360,
      result: 'Completed',
      direction: 'Outbound',
      from: logInfo.from,
      to: logInfo.to,
    }, {
      params: { jwtToken },
      headers: {
        'rc-account-id': 'e2e-insightly-hashed-account',
        'rc-extension-id': hashedExtensionId,
      },
    });

    expect(updateLog.status).toBe(200);
    expect(updateLog.data).toMatchObject({
      successful: true,
      logId: '201',
      returnMessage: { message: 'Call log updated.', messageType: 'success' },
    });
    expect(updateLog.data.updatedNote).toContain('Insightly e2e follow-up note');
    expect(updatedEventBody).toMatchObject({
      EVENT_ID: '201',
      TITLE: 'Insightly E2E updated subject',
    });
    expect(updatedEventBody.DETAILS).toContain('Insightly e2e follow-up note');
    expect(getBeforeUpdateScope.isDone()).toBe(true);
    expect(getContactBeforeUpdateScope.isDone()).toBe(true);
    expect(updateEventScope.isDone()).toBe(true);
    expect(nock.pendingMocks()).toEqual([]);
  });

  test('logs a practical zero-duration no-answer call against an Insightly lead', async () => {
    const practicalLead = practicalContacts.internationalProspect;
    const practicalSessionId = `${sessionId}-practical-lead-no-answer`;
    const practicalTelephonySessionId = `${telephonySessionId}-practical-lead-no-answer`;
    const practicalLeadId = 3302;
    const practicalEventId = 3202;
    const startTime = '2026-03-12T16:05:00.000Z';
    const logInfo = buildPracticalCall({
      id: 'e2e-insightly-practical-no-answer-call-id',
      sessionId: practicalSessionId,
      telephonySessionId: practicalTelephonySessionId,
      extensionNumber,
      direction: 'Outbound',
      contact: practicalLead,
      agent: practicalAgents.accountManager,
      duration: 0,
      result: 'No Answer',
      startTime,
    });

    let createdEventBody;
    const createEventScope = nock(apiBaseUrl)
      .matchHeader('authorization', expectedAuthorization)
      .post('/v3.1/events', body => {
        createdEventBody = body;
        return true;
      })
      .reply(201, { EVENT_ID: practicalEventId });
    let linkedLeadBody;
    const linkLeadScope = nock(apiBaseUrl)
      .matchHeader('authorization', expectedAuthorization)
      .post(`/v3.1/events/${practicalEventId}/links`, body => {
        linkedLeadBody = body;
        return true;
      })
      .reply(201, {});

    const createLog = await client.post('/callLog', {
      logInfo,
      contactId: practicalLeadId,
      contactName: practicalLead.name,
      contactType: 'Lead',
      note: practicalNotes.noAnswer,
    }, {
      params: { jwtToken },
      headers: {
        'rc-account-id': 'e2e-insightly-hashed-account',
        'rc-extension-id': hashedExtensionId,
      },
    });

    expect(createLog.status).toBe(200);
    expect(createLog.data).toMatchObject({
      successful: true,
      logId: practicalEventId,
      returnMessage: { message: 'Call logged', messageType: 'success' },
    });
    expect(logInfo).not.toHaveProperty('recording');
    expect(createdEventBody).toMatchObject({
      TITLE: `Outbound Call to ${practicalLead.name}`,
      START_DATE_UTC: startTime,
      END_DATE_UTC: startTime,
    });
    expect(createdEventBody.DETAILS).toContain(`- Note: ${practicalNotes.noAnswer}`);
    expect(createdEventBody.DETAILS).toContain('- Duration: 0 seconds');
    expect(createdEventBody.DETAILS).toContain('- Result: No Answer');
    expect(createdEventBody.DETAILS).not.toContain('Call recording link');
    expect(linkedLeadBody).toEqual({
      LINK_OBJECT_NAME: 'lead',
      LINK_OBJECT_ID: practicalLeadId,
    });

    const persistedCallLog = await CallLogModel.findOne({
      where: { sessionId: practicalSessionId, userId },
    });
    expect(persistedCallLog).toMatchObject({
      id: practicalTelephonySessionId,
      sessionId: practicalSessionId,
      extensionNumber,
      platform,
      thirdPartyLogId: String(practicalEventId),
      userId,
      contactId: String(practicalLeadId),
    });
    expect(createEventScope.isDone()).toBe(true);
    expect(linkLeadScope.isDone()).toBe(true);
    expect(nock.pendingMocks()).toEqual([]);
  });
});

export {};
