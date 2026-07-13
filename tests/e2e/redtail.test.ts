const nock = require('nock');
const {
  startServer,
  stopServer,
  cleanE2EData,
  generateJwt,
} = require('./support/serverHarness');
const {
  practicalContacts,
  practicalAgents,
  practicalNotes,
  buildPracticalCall,
} = require('./support/practicalData');
const { UserModel } = require('@app-connect/core/models/userModel');
const { CallLogModel } = require('@app-connect/core/models/callLogModel');
const { AccountDataModel } = require('@app-connect/core/models/accountDataModel');

describe('Redtail server E2E', () => {
  const platform = 'redtail';
  const userId = 'e2e-redtail-server-user';
  const rcAccountId = 'e2e-redtail-server-account';
  const rcUserNumber = '+14155550005';
  const hashedExtensionId = 'e2e-redtail-hashed-extension';
  const phoneNumber = '+14155555678';
  const sessionId = 'e2e-redtail-session';
  const telephonySessionId = 'e2e-redtail-telephony-session';
  const extensionNumber = '105';
  const apiBaseUrl = 'https://redtail.e2e.test';
  const apiKey = 'e2e-redtail-api-key';
  const userKey = 'e2e-redtail-user-key';
  const expectedAuthorization = Buffer.from(`${apiKey}:${userKey}`).toString('base64');
  const previousApiKey = process.env.REDTAIL_API_KEY;
  const previousApiServer = process.env.REDTAIL_API_SERVER;

  let server;
  let client;
  let jwtToken;

  function activityResponse(overrides = {}) {
    return {
      activity: {
        id: 301,
        subject: 'Redtail E2E call subject',
        description: '<b>Agent notes</b><br>Redtail e2e agent note<br><br><b>Call details</b><br>Call metadata',
        category_id: 1,
        linked_contacts: [{
          contact_id: 201,
          first_name: 'Redtail',
          last_name: 'Contact',
        }],
        ...overrides,
      },
    };
  }

  async function seedUser() {
    await UserModel.create({
      id: userId,
      platform,
      hostname: 'smf.crm3.redtailtechnology.com',
      rcAccountId,
      accessToken: userKey,
      refreshToken: '',
      tokenExpiry: null,
      timezoneOffset: '+00:00',
      platformAdditionalInfo: {
        userResponse: { user_key: userKey },
      },
      userSettings: {},
      hashedRcExtensionId: hashedExtensionId,
    });
    jwtToken = generateJwt({ id: userId, platform, rcUserNumber });
  }

  async function cleanData() {
    await cleanE2EData({ userIds: [userId], rcAccountIds: [rcAccountId] });
  }

  beforeAll(async () => {
    process.env.REDTAIL_API_KEY = apiKey;
    process.env.REDTAIL_API_SERVER = apiBaseUrl;
    ({ server, client } = await startServer());
  });

  afterAll(async () => {
    try {
      await cleanData();
      await stopServer(server);
    } finally {
      if (previousApiKey === undefined) {
        delete process.env.REDTAIL_API_KEY;
      } else {
        process.env.REDTAIL_API_KEY = previousApiKey;
      }
      if (previousApiServer === undefined) {
        delete process.env.REDTAIL_API_SERVER;
      } else {
        process.env.REDTAIL_API_SERVER = previousApiServer;
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

  test('completes a Redtail contact-to-call-log HTTP flow', async () => {
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
      .get('/contacts/search_basic')
      .query({ phone_number: '4155555678' })
      .reply(200, {
        contacts: [{
          id: 201,
          first_name: 'Redtail',
          middle_name: '',
          last_name: 'Contact',
          full_name: 'Redtail Contact',
          job_title: 'Advisor',
          created_at: '2026-01-02T02:04:05Z',
          updated_at: '2026-01-02T03:04:05Z',
        }],
      });
    const contactCategoriesScope = nock(apiBaseUrl)
      .matchHeader('authorization', expectedAuthorization)
      .get('/lists/categories')
      .reply(200, {
        categories: [
          { id: 1, name: 'Client', deleted: false },
          { id: 2, name: 'Prospect', deleted: false },
        ],
      });

    const contact = await client.get('/contact', {
      params: { jwtToken, phoneNumber, isExtension: 'false' },
    });

    expect(contact.status).toBe(200);
    expect(contact.data.successful).toBe(true);
    expect(contact.data.contact[0]).toMatchObject({
      id: 201,
      name: 'Redtail Contact',
      type: 'contact',
      additionalInfo: {
        category: [
          { const: 1, title: 'Client' },
          { const: 2, title: 'Prospect' },
        ],
      },
    });
    expect(contactSearchScope.isDone()).toBe(true);
    expect(contactCategoriesScope.isDone()).toBe(true);

    const cachedContact = await AccountDataModel.findOne({
      where: {
        rcAccountId,
        platformName: platform,
        dataKey: `contact-${phoneNumber}`,
      },
    });
    expect(cachedContact.data[0]).toMatchObject({ id: 201, name: 'Redtail Contact' });

    const logInfo = {
      id: 'e2e-redtail-call-id',
      sessionId,
      telephonySessionId,
      extensionNumber,
      direction: 'Outbound',
      from: { name: 'Redtail Agent', phoneNumber: rcUserNumber },
      to: { name: 'Redtail Contact', phoneNumber },
      duration: 300,
      result: 'Completed',
      startTime: new Date('2026-01-02T03:04:05.000Z').getTime(),
      recording: { link: 'https://recordings.example.test/redtail-e2e.wav' },
      customSubject: 'Redtail E2E call subject',
    };

    let createdActivityBody;
    const createActivityScope = nock(apiBaseUrl)
      .matchHeader('authorization', expectedAuthorization)
      .post('/activities', body => {
        createdActivityBody = body;
        return true;
      })
      .reply(201, { activity: { id: 301 } });
    let createdNoteBody;
    const createNoteScope = nock(apiBaseUrl)
      .matchHeader('authorization', expectedAuthorization)
      .post('/activities/301/notes', body => {
        createdNoteBody = body;
        return true;
      })
      .reply(201, { note: { id: 401 } });
    const completeActivityScope = nock(apiBaseUrl)
      .matchHeader('authorization', expectedAuthorization)
      .put('/activities/301', { completed: true })
      .reply(200, { activity: { id: 301 } });
    const updateSettingsCategoriesScope = nock(apiBaseUrl)
      .matchHeader('authorization', expectedAuthorization)
      .get('/lists/categories')
      .reply(200, {
        categories: [
          { id: 1, name: 'Client', deleted: false },
          { id: 2, name: 'Prospect', deleted: false },
        ],
      });

    const createLog = await client.post('/callLog', {
      logInfo,
      contactId: 201,
      contactName: 'Redtail Contact',
      contactType: 'contact',
      note: 'Redtail e2e agent note',
      additionalSubmission: { category: 1 },
    }, {
      params: { jwtToken },
      headers: {
        'rc-account-id': 'e2e-redtail-hashed-account',
        'rc-extension-id': hashedExtensionId,
      },
    });

    expect(createLog.status).toBe(200);
    expect(createLog.data).toMatchObject({
      successful: true,
      logId: 301,
      returnMessage: { message: 'Call logged', messageType: 'success' },
    });
    expect(createdActivityBody).toMatchObject({
      subject: 'Redtail E2E call subject',
      category_id: 1,
      linked_contacts: [{ contact_id: 201 }],
    });
    expect(createdActivityBody.description).toContain('Redtail e2e agent note');
    expect(createdActivityBody.description).toContain('Call details');
    expect(createdNoteBody).toMatchObject({ category_id: 1, body: 'Redtail e2e agent note' });
    expect(createActivityScope.isDone()).toBe(true);
    expect(createNoteScope.isDone()).toBe(true);
    expect(completeActivityScope.isDone()).toBe(true);
    expect(updateSettingsCategoriesScope.isDone()).toBe(true);

    const persistedCallLog = await CallLogModel.findOne({ where: { sessionId, userId } });
    expect(persistedCallLog).toMatchObject({
      id: telephonySessionId,
      sessionId,
      extensionNumber,
      platform,
      thirdPartyLogId: '301',
      userId,
      contactId: '201',
    });

    const getActivityScope = nock(apiBaseUrl)
      .matchHeader('authorization', expectedAuthorization)
      .get('/activities/301')
      .reply(200, activityResponse());

    const getLog = await client.get('/callLog', {
      params: { jwtToken, sessionIds: sessionId, extensionNumber, requireDetails: 'true' },
    });

    expect(getLog.status).toBe(200);
    expect(getLog.data).toMatchObject({
      successful: true,
      logs: [{
        sessionId,
        matched: true,
        logId: '301',
        logData: {
          subject: 'Redtail E2E call subject',
          note: 'Redtail e2e agent note',
          contactName: 'Redtail Contact',
          dispositions: { category: 1 },
        },
      }],
    });
    expect(getActivityScope.isDone()).toBe(true);

    const getBeforeUpdateScope = nock(apiBaseUrl)
      .matchHeader('authorization', expectedAuthorization)
      .get('/activities/301')
      .reply(200, activityResponse());
    let updatedActivityBody;
    const updateActivityScope = nock(apiBaseUrl)
      .matchHeader('authorization', expectedAuthorization)
      .put('/activities/301', body => {
        updatedActivityBody = body;
        return true;
      })
      .reply(200, { activity: { id: 301 } });

    const updateLog = await client.patch('/callLog', {
      sessionId,
      extensionNumber,
      subject: 'Redtail E2E updated subject',
      note: 'Redtail e2e follow-up note',
      startTime: new Date('2026-01-02T03:10:05.000Z').getTime(),
      duration: 420,
      result: 'Completed',
      direction: 'Outbound',
      from: logInfo.from,
      to: logInfo.to,
    }, {
      params: { jwtToken },
      headers: {
        'rc-account-id': 'e2e-redtail-hashed-account',
        'rc-extension-id': hashedExtensionId,
      },
    });

    expect(updateLog.status).toBe(200);
    expect(updateLog.data).toMatchObject({
      successful: true,
      logId: '301',
      returnMessage: { message: 'Call log updated.', messageType: 'success' },
    });
    expect(updateLog.data.updatedNote).toContain('Redtail e2e follow-up note');
    expect(updatedActivityBody.subject).toBe('Redtail E2E updated subject');
    expect(updatedActivityBody.description).toContain('Redtail e2e follow-up note');
    expect(getBeforeUpdateScope.isDone()).toBe(true);
    expect(updateActivityScope.isDone()).toBe(true);
    expect(nock.pendingMocks()).toEqual([]);
  });

  test('logs a practical zero-duration no-answer call for a Unicode contact', async () => {
    const practicalContact = practicalContacts.recruitingCandidate;
    const contactId = 202;
    const activityId = 302;
    const categoryId = 7;
    const practicalSessionId = 'e2e-redtail-practical-no-answer-session';
    const practicalTelephonySessionId = 'e2e-redtail-practical-no-answer-telephony-session';
    const practicalExtensionNumber = '205';
    const subject = 'Candidate interview follow-up - no answer';
    const categories = [
      { id: 1, name: 'Client', deleted: false },
      { id: categoryId, name: 'Recruiting prospect', deleted: false },
      { id: 9, name: 'Former prospect', deleted: true },
    ];

    const contactSearchScope = nock(apiBaseUrl)
      .matchHeader('authorization', expectedAuthorization)
      .get('/contacts/search_basic')
      .query({ phone_number: '4155550165' })
      .reply(200, {
        contacts: [{
          id: contactId,
          first_name: 'Siobh\u00e1n',
          middle_name: '',
          last_name: "O'Connor",
          full_name: practicalContact.name,
          job_title: 'Warehouse operations lead',
          created_at: '2025-10-21T09:15:00Z',
          updated_at: '2026-03-12T12:05:00Z',
        }],
      });
    const contactCategoriesScope = nock(apiBaseUrl)
      .matchHeader('authorization', expectedAuthorization)
      .get('/lists/categories')
      .reply(200, { categories });

    const contact = await client.get('/contact', {
      params: {
        jwtToken,
        phoneNumber: practicalContact.phoneNumber,
        isExtension: 'false',
      },
    });

    expect(contact.status).toBe(200);
    expect(contact.data.successful).toBe(true);
    expect(contact.data.contact[0]).toMatchObject({
      id: contactId,
      name: practicalContact.name,
      phone: practicalContact.phoneNumber,
      title: 'Warehouse operations lead',
      type: 'contact',
      additionalInfo: {
        category: [
          { const: 1, title: 'Client' },
          { const: categoryId, title: 'Recruiting prospect' },
        ],
      },
    });
    expect(contactSearchScope.isDone()).toBe(true);
    expect(contactCategoriesScope.isDone()).toBe(true);

    const cachedContact = await AccountDataModel.findOne({
      where: {
        rcAccountId,
        platformName: platform,
        dataKey: `contact-${practicalContact.phoneNumber}`,
      },
    });
    expect(cachedContact.data[0]).toMatchObject({
      id: contactId,
      name: practicalContact.name,
      phone: practicalContact.phoneNumber,
    });

    const logInfo = {
      ...buildPracticalCall({
        id: 'e2e-redtail-practical-no-answer-call-id',
        sessionId: practicalSessionId,
        telephonySessionId: practicalTelephonySessionId,
        extensionNumber: practicalExtensionNumber,
        direction: 'Outbound',
        contact: practicalContact,
        agent: {
          ...practicalAgents.accountManager,
          phoneNumber: rcUserNumber,
        },
        duration: 0,
        result: 'No Answer',
        startTime: '2026-03-12T16:40:00.000Z',
        customSubject: subject,
      }),
      hashedExtensionId,
    };

    let createdActivityBody;
    const createActivityScope = nock(apiBaseUrl)
      .matchHeader('authorization', expectedAuthorization)
      .post('/activities', body => {
        createdActivityBody = body;
        return true;
      })
      .reply(201, { activity: { id: activityId } });
    let createdNoteBody;
    const createNoteScope = nock(apiBaseUrl)
      .matchHeader('authorization', expectedAuthorization)
      .post(`/activities/${activityId}/notes`, body => {
        createdNoteBody = body;
        return true;
      })
      .reply(201, { note: { id: 402 } });
    const completeActivityScope = nock(apiBaseUrl)
      .matchHeader('authorization', expectedAuthorization)
      .put(`/activities/${activityId}`, { completed: true })
      .reply(200, { activity: { id: activityId } });
    const updateSettingsCategoriesScope = nock(apiBaseUrl)
      .matchHeader('authorization', expectedAuthorization)
      .get('/lists/categories')
      .reply(200, { categories });

    const createLog = await client.post('/callLog', {
      logInfo,
      contactId,
      contactName: practicalContact.name,
      contactType: 'contact',
      note: practicalNotes.recruitingFollowUp,
      additionalSubmission: { category: categoryId },
    }, {
      params: { jwtToken },
      headers: {
        'rc-account-id': 'e2e-redtail-hashed-account',
        'rc-extension-id': hashedExtensionId,
      },
    });

    expect(createLog.status).toBe(200);
    expect(createLog.data).toMatchObject({
      successful: true,
      logId: activityId,
      returnMessage: { message: 'Call logged', messageType: 'success' },
    });
    expect(createdActivityBody).toMatchObject({
      subject,
      start_date: '2026-03-12T16:40:00.000Z',
      end_date: '2026-03-12T16:40:00.000Z',
      activity_code_id: 3,
      category_id: categoryId,
      repeats: 'never',
      linked_contacts: [{ contact_id: contactId }],
    });
    expect(createdActivityBody.description).toContain(practicalNotes.recruitingFollowUp);
    expect(createdActivityBody.description).toContain('<b>Duration</b>: 0 seconds');
    expect(createdActivityBody.description).toContain('<b>Result</b>: No Answer');
    expect(createdActivityBody.description).not.toContain('Call recording link');
    expect(createdNoteBody).toEqual({
      category_id: categoryId,
      note_type: 1,
      body: practicalNotes.recruitingFollowUp,
    });
    expect(createActivityScope.isDone()).toBe(true);
    expect(createNoteScope.isDone()).toBe(true);
    expect(completeActivityScope.isDone()).toBe(true);
    expect(updateSettingsCategoriesScope.isDone()).toBe(true);

    const persistedCallLog = await CallLogModel.findOne({
      where: { sessionId: practicalSessionId, userId },
    });
    expect(persistedCallLog).toMatchObject({
      id: practicalTelephonySessionId,
      sessionId: practicalSessionId,
      extensionNumber: practicalExtensionNumber,
      hashedExtensionId,
      platform,
      thirdPartyLogId: String(activityId),
      userId,
      contactId: String(contactId),
    });
    expect(nock.pendingMocks()).toEqual([]);
  });
});

export {};
