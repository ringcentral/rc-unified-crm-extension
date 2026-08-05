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

describe('NetSuite App-level E2E', () => {
  const platform = 'netsuite';
  const userId = 'e2e-netsuite-user';
  const rcAccountId = 'e2e-netsuite-rc-account';
  const rcUserNumber = '+14155550006';
  const accountId = '9876543';
  const hostname = `${accountId}.suitetalk.api.netsuite.com`;
  const providerBaseUrl = `https://${hostname}`;
  const restletsBaseUrl = `https://${accountId}.restlets.api.netsuite.com`;
  const phoneNumber = '+14155554567';
  const sessionId = 'e2e-netsuite-session-1';
  const telephonySessionId = 'e2e-netsuite-telephony-session-1';
  const extensionNumber = '106';
  const providerLogId = '9201';
  const accessToken = 'e2e-netsuite-access-token';
  const authHeader = `Bearer ${accessToken}`;
  const e2eData = {
    userIds: [userId],
    rcAccountIds: [rcAccountId],
  };

  let server;
  let client;
  let jwtToken;
  let previousClientId;
  let previousClientSecret;

  function restoreEnv(name, value) {
    if (value === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = value;
    }
  }

  function providerCallLogResponse(overrides = {}) {
    return {
      id: providerLogId,
      title: 'NetSuite E2E call subject',
      message: [
        '- Note: NetSuite e2e agent note',
        '- Summary: NetSuite E2E call subject',
        `- Contact Number: ${phoneNumber}`,
        '- Result: Completed',
        '- Duration: 5 minutes',
        `- Session Id: ${sessionId}`,
      ].join('\n'),
      ...overrides,
    };
  }

  async function seedUser() {
    await UserModel.create({
      id: userId,
      platform,
      hostname,
      rcAccountId,
      rcUserNumber,
      accessToken,
      refreshToken: 'e2e-netsuite-refresh-token',
      tokenExpiry: new Date(Date.now() + 60 * 60 * 1000),
      timezoneName: 'America/New_York',
      timezoneOffset: '-05:00',
      platformAdditionalInfo: {
        accountId,
        oneWorldEnabled: false,
      },
      userSettings: {
        contactsSearchId: { value: ['contact'] },
        phoneFieldsId: { value: ['phone'] },
        enableSalesOrderLogging: { value: false },
        enableOpportunityLogging: { value: false },
        addCallLogDateTime: { value: false },
      },
      hashedRcExtensionId: 'e2e-netsuite-hashed-extension',
    });

    jwtToken = generateJwt({
      id: userId,
      platform,
      rcUserNumber,
    });
  }

  beforeAll(async () => {
    previousClientId = process.env.NETSUITE_CRM_CLIENT_ID;
    previousClientSecret = process.env.NETSUITE_CRM_CLIENT_SECRET;
    process.env.NETSUITE_CRM_CLIENT_ID = 'e2e-netsuite-client-id';
    process.env.NETSUITE_CRM_CLIENT_SECRET = 'e2e-netsuite-client-secret';

    ({ server, client } = await startServer());
  });

  afterAll(async () => {
    await cleanE2EData(e2eData);
    await stopServer(server);
    restoreEnv('NETSUITE_CRM_CLIENT_ID', previousClientId);
    restoreEnv('NETSUITE_CRM_CLIENT_SECRET', previousClientSecret);
  });

  beforeEach(async () => {
    nock.cleanAll();
    await cleanE2EData(e2eData);
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

    let contactQuery;
    const contactSearchScope = nock(providerBaseUrl)
      .matchHeader('authorization', authHeader)
      .post('/services/rest/query/v1/suiteql', body => {
        contactQuery = body.q;
        return true;
      })
      .reply(200, {
        items: [{
          id: 6101,
          firstname: 'NetSuite',
          middlename: 'E2E',
          lastname: 'Contact',
          entitytitle: 'NetSuite Contact',
          phone: phoneNumber,
          datecreated: '2026-01-01T10:00:00Z',
          lastmodifieddate: '2026-01-02T10:00:00Z',
        }],
      });

    const contact = await client.get('/contact', {
      params: {
        jwtToken,
        phoneNumber,
        isExtension: 'false',
        overridingFormat: '',
      },
    });

    expect(contact.status).toBe(200);
    expect(contact.data.successful).toBe(true);
    expect(contact.data.contact[0]).toMatchObject({
      id: 6101,
      name: 'NetSuite E2E Contact',
      phone: phoneNumber,
      type: 'contact',
    });
    expect(contactQuery).toContain('FROM contact');
    expect(contactQuery).toContain('4155554567');
    expect(contactSearchScope.isDone()).toBe(true);

    const cachedContact = await AccountDataModel.findOne({
      where: {
        rcAccountId,
        platformName: platform,
        dataKey: `contact-${phoneNumber}`,
      },
    });
    expect(cachedContact.data[0]).toMatchObject({
      id: 6101,
      name: 'NetSuite E2E Contact',
      type: 'contact',
    });

    const logInfo = {
      id: 'e2e-netsuite-call-id',
      sessionId,
      telephonySessionId,
      extensionNumber,
      direction: 'Outbound',
      from: {
        name: 'NetSuite Agent',
        phoneNumber: rcUserNumber,
      },
      to: {
        name: 'NetSuite E2E Contact',
        phoneNumber,
      },
      duration: 300,
      result: 'Completed',
      startTime: new Date('2026-01-02T03:04:05.000Z').getTime(),
      recording: {
        link: 'https://recordings.example.test/netsuite-e2e.wav',
      },
      customSubject: 'NetSuite E2E call subject',
    };

    const timezoneScope = nock(restletsBaseUrl)
      .matchHeader('authorization', authHeader)
      .get('/app/site/hosting/restlet.nl')
      .query({
        script: 'customscript_gettimezone',
        deploy: 'customdeploy_gettimezone',
      })
      .reply(200, { userTimezone: 'America/New_York' });

    const contactDetailsScope = nock(providerBaseUrl)
      .matchHeader('authorization', authHeader)
      .get('/services/rest/record/v1/contact/6101')
      .reply(200, {
        id: 6101,
        company: { id: 6201 },
      });

    let createdPhoneCallBody;
    const createPhoneCallScope = nock(providerBaseUrl)
      .matchHeader('authorization', authHeader)
      .post('/services/rest/record/v1/phonecall', body => {
        createdPhoneCallBody = body;
        return true;
      })
      .reply(201, {}, {
        location: `/services/rest/record/v1/phonecall/${providerLogId}`,
      });

    const createLog = await client.post('/callLog', {
      logInfo,
      contactId: 6101,
      contactName: 'NetSuite E2E Contact',
      contactType: 'contact',
      note: 'NetSuite e2e agent note',
    }, {
      params: { jwtToken },
      headers: {
        'rc-account-id': 'e2e-netsuite-hashed-account',
        'rc-extension-id': 'e2e-netsuite-hashed-extension',
      },
    });

    expect(createLog.status).toBe(200);
    expect(createLog.data).toMatchObject({
      successful: true,
      logId: providerLogId,
      returnMessage: {
        message: 'Call logged',
        messageType: 'success',
      },
    });
    expect(createdPhoneCallBody).toMatchObject({
      title: 'NetSuite E2E call subject',
      phone: phoneNumber,
      priority: 'MEDIUM',
      status: 'COMPLETE',
      contact: { id: 6101 },
      company: { id: 6201 },
    });
    expect(createdPhoneCallBody.message).toContain('NetSuite e2e agent note');
    expect(createdPhoneCallBody.message).toContain('Call recording link');
    expect(timezoneScope.isDone()).toBe(true);
    expect(contactDetailsScope.isDone()).toBe(true);
    expect(createPhoneCallScope.isDone()).toBe(true);

    const persistedCallLog = await CallLogModel.findOne({
      where: { sessionId, userId },
    });
    expect(persistedCallLog).toMatchObject({
      id: telephonySessionId,
      sessionId,
      extensionNumber,
      platform,
      thirdPartyLogId: providerLogId,
      userId,
      contactId: '6101',
    });

    const getPhoneCallScope = nock(providerBaseUrl)
      .matchHeader('authorization', authHeader)
      .get(`/services/rest/record/v1/phonecall/${providerLogId}`)
      .reply(200, providerCallLogResponse());

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
    expect(getLog.data.logs).toHaveLength(1);
    expect(getLog.data.logs[0]).toMatchObject({
      sessionId,
      matched: true,
      logId: providerLogId,
      logData: {
        subject: 'NetSuite E2E call subject',
        note: 'NetSuite e2e agent note',
        additionalSubmission: {},
      },
    });
    expect(getPhoneCallScope.isDone()).toBe(true);

    const getBeforeUpdateScope = nock(providerBaseUrl)
      .matchHeader('authorization', authHeader)
      .get(`/services/rest/record/v1/phonecall/${providerLogId}`)
      .reply(200, providerCallLogResponse());

    const updateTimezoneScope = nock(restletsBaseUrl)
      .matchHeader('authorization', authHeader)
      .get('/app/site/hosting/restlet.nl')
      .query({
        script: 'customscript_gettimezone',
        deploy: 'customdeploy_gettimezone',
      })
      .reply(200, { userTimezone: 'America/New_York' });

    let patchedPhoneCallBody;
    const updatePhoneCallScope = nock(providerBaseUrl)
      .matchHeader('authorization', authHeader)
      .patch(`/services/rest/record/v1/phoneCall/${providerLogId}`, body => {
        patchedPhoneCallBody = body;
        return true;
      })
      .reply(200, {});

    const updateLog = await client.patch('/callLog', {
      sessionId,
      extensionNumber,
      subject: 'NetSuite E2E updated subject',
      note: 'NetSuite e2e follow-up note',
      startTime: new Date('2026-01-02T03:10:05.000Z').getTime(),
      duration: 360,
      result: 'Completed',
      direction: 'Outbound',
      from: logInfo.from,
      to: logInfo.to,
    }, {
      params: { jwtToken },
      headers: {
        'rc-account-id': 'e2e-netsuite-hashed-account',
        'rc-extension-id': 'e2e-netsuite-hashed-extension',
      },
    });

    expect(updateLog.status).toBe(200);
    expect(updateLog.data).toMatchObject({
      successful: true,
      logId: providerLogId,
      updatedNote: 'NetSuite e2e follow-up note',
      returnMessage: {
        message: 'Call log updated',
        messageType: 'success',
      },
    });
    expect(patchedPhoneCallBody.title).toBe('NetSuite E2E updated subject');
    expect(patchedPhoneCallBody.message).toContain('NetSuite e2e follow-up note');
    expect(patchedPhoneCallBody.startTime).toBeTruthy();
    expect(patchedPhoneCallBody.endTime).toBeTruthy();
    expect(getBeforeUpdateScope.isDone()).toBe(true);
    expect(updateTimezoneScope.isDone()).toBe(true);
    expect(updatePhoneCallScope.isDone()).toBe(true);
    expect(nock.pendingMocks()).toEqual([]);
  });

  test('logs a practical inbound support call for an international customer without a recording', async () => {
    const customer = {
      ...practicalContacts.internationalProspect,
      phoneNumber: '+442079460958',
    };
    const providerFormattedPhone = '+44 20 7946 0958';
    const netSuiteFormattedPhone = '020 7946 0958';
    const customerId = 6102;
    const practicalProviderLogId = '9202';
    const practicalSessionId = 'e2e-netsuite-practical-customer-session';
    const practicalTelephonySessionId = 'e2e-netsuite-practical-customer-telephony-session';
    const practicalExtensionNumber = '206';
    const subject = 'Inbound support call - routing restored';

    const seededUser = await UserModel.findByPk(userId);
    seededUser.userSettings = {
      ...seededUser.userSettings,
      contactsSearchId: { value: ['customer'] },
      phoneFieldsId: { value: ['phone'] },
    };
    await seededUser.save();

    const e164CustomerSearchScope = nock(providerBaseUrl)
      .matchHeader('authorization', authHeader)
      .post('/services/rest/query/v1/suiteql', body => (
        body.q.includes('FROM customer')
        && body.q.includes(`phone='${customer.phoneNumber}'`)
      ))
      .reply(200, { items: [] });
    const formattedCustomerSearchScope = nock(providerBaseUrl)
      .matchHeader('authorization', authHeader)
      .post('/services/rest/query/v1/suiteql', body => (
        body.q.includes('FROM customer')
        && body.q.includes(`phone='${netSuiteFormattedPhone}'`)
      ))
      .reply(200, {
        items: [{
          id: customerId,
          entitytitle: customer.name,
          phone: netSuiteFormattedPhone,
          datecreated: '2025-11-14T09:20:00Z',
          lastmodifieddate: '2026-03-11T16:45:00Z',
        }],
      });

    const contact = await client.get('/contact', {
      params: {
        jwtToken,
        phoneNumber: customer.phoneNumber,
        isExtension: 'false',
        overridingFormat: '0## #### ####',
      },
    });

    expect(contact.status).toBe(200);
    expect(contact.data.successful).toBe(true);
    expect(contact.data.contact[0]).toMatchObject({
      id: customerId,
      name: customer.name,
      phone: netSuiteFormattedPhone,
      type: 'custjob',
    });
    expect(e164CustomerSearchScope.isDone()).toBe(true);
    expect(formattedCustomerSearchScope.isDone()).toBe(true);

    const cachedCustomer = await AccountDataModel.findOne({
      where: {
        rcAccountId,
        platformName: platform,
        dataKey: `contact-${customer.phoneNumber}`,
      },
    });
    expect(cachedCustomer.data[0]).toMatchObject({
      id: customerId,
      name: customer.name,
      phone: netSuiteFormattedPhone,
      type: 'custjob',
    });

    const practicalHashedExtensionId = 'e2e-netsuite-hashed-extension';
    const logInfo = {
      ...buildPracticalCall({
        id: 'e2e-netsuite-practical-customer-call-id',
        sessionId: practicalSessionId,
        telephonySessionId: practicalTelephonySessionId,
        extensionNumber: practicalExtensionNumber,
        direction: 'Inbound',
        contact: {
          ...customer,
          phoneNumber: providerFormattedPhone,
        },
        agent: {
          ...practicalAgents.supportSpecialist,
          phoneNumber: rcUserNumber,
        },
        duration: 487,
        result: 'Completed',
        startTime: '2026-03-12T14:35:20.000Z',
        customSubject: subject,
      }),
      hashedExtensionId: practicalHashedExtensionId,
    };

    expect(logInfo.recording).toBeUndefined();

    const timezoneScope = nock(restletsBaseUrl)
      .matchHeader('authorization', authHeader)
      .get('/app/site/hosting/restlet.nl')
      .query({
        script: 'customscript_gettimezone',
        deploy: 'customdeploy_gettimezone',
      })
      .reply(200, { userTimezone: 'America/New_York' });

    let createdPhoneCallBody;
    const createPhoneCallScope = nock(providerBaseUrl)
      .matchHeader('authorization', authHeader)
      .post('/services/rest/record/v1/phonecall', body => {
        createdPhoneCallBody = body;
        return true;
      })
      .reply(201, {}, {
        location: `/services/rest/record/v1/phonecall/${practicalProviderLogId}`,
      });

    const createLog = await client.post('/callLog', {
      logInfo,
      contactId: customerId,
      contactName: customer.name,
      contactType: 'custjob',
      note: practicalNotes.supportResolution,
    }, {
      params: { jwtToken },
      headers: {
        'rc-account-id': 'e2e-netsuite-hashed-account',
        'rc-extension-id': practicalHashedExtensionId,
      },
    });

    expect(createLog.status).toBe(200);
    expect(createLog.data).toMatchObject({
      successful: true,
      logId: practicalProviderLogId,
      returnMessage: {
        message: 'Call logged',
        messageType: 'success',
      },
    });
    expect(createdPhoneCallBody).toMatchObject({
      title: subject,
      phone: providerFormattedPhone,
      priority: 'MEDIUM',
      status: 'COMPLETE',
      company: { id: customerId },
      startDate: '2026-03-12',
      startTime: '10:35',
      endTime: '10:43',
      completedDate: '2026-03-12',
    });
    expect(createdPhoneCallBody.contact).toBeUndefined();
    expect(createdPhoneCallBody.message).toContain(practicalNotes.supportResolution);
    expect(createdPhoneCallBody.message).toContain('- Result: Completed');
    expect(createdPhoneCallBody.message).not.toContain('Call recording link');
    expect(timezoneScope.isDone()).toBe(true);
    expect(createPhoneCallScope.isDone()).toBe(true);

    const persistedCallLog = await CallLogModel.findOne({
      where: { sessionId: practicalSessionId, userId },
    });
    expect(persistedCallLog).toMatchObject({
      id: practicalTelephonySessionId,
      sessionId: practicalSessionId,
      extensionNumber: practicalExtensionNumber,
      hashedExtensionId: practicalHashedExtensionId,
      platform,
      thirdPartyLogId: practicalProviderLogId,
      userId,
      contactId: String(customerId),
    });
    expect(nock.pendingMocks()).toEqual([]);
  });
});

export {};
