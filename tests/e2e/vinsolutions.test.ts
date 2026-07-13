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

describe('VinSolutions server E2E', () => {
  const testEnv = {
    VINSOLUTIONS_LEAD_MANAGEMENT_CLIENT_ID: 'e2e-lead-client-id',
    VINSOLUTIONS_LEAD_MANAGEMENT_CLIENT_SECRET: 'e2e-lead-client-secret',
    VINSOLUTIONS_CALL_TRACKING_CLIENT_ID: 'e2e-call-client-id',
    VINSOLUTIONS_CALL_TRACKING_CLIENT_SECRET: 'e2e-call-client-secret',
    VINSOLUTIONS_LEAD_MANAGEMENT_API_KEY: 'e2e-lead-api-key',
    VINSOLUTIONS_CALL_TRACKING_API_KEY: 'e2e-call-api-key',
  };
  const previousEnv: Record<string, string | undefined> = {};
  const platform = 'vinsolutions';
  const userId = '1001-2002-vinsolutions-e2e';
  const rcAccountId = 'e2e-rc-account-vinsolutions';
  const rcUserNumber = '+14155550008';
  const phoneNumber = '+15551234567';
  const sessionId = 'e2e-vinsolutions-session-1';
  const telephonySessionId = 'e2e-vinsolutions-telephony-session-1';
  const extensionNumber = '108';
  const apiBaseUrl = 'https://api.vinsolutions.com';

  let server;
  let client;
  let jwtToken;

  function callDetailResponse(overrides = {}) {
    return {
      callDetailId: 4321,
      callDirection: 'OUTBOUND',
      transcriptFull: '- Note: VinSolutions e2e agent note\n- Session Id: e2e-vinsolutions-session-1\n- Result: Completed\n',
      marketingSource: 'RingCentral',
      vinProperties: {
        contactId: 501,
        leadId: 9001,
      },
      ...overrides,
    };
  }

  async function seedUser() {
    await UserModel.create({
      id: userId,
      platform,
      hostname: 'vinsolutions.app.coxautoinc.com',
      rcAccountId,
      rcUserNumber,
      accessToken: 'vinsolutions-connected',
      refreshToken: '',
      tokenExpiry: null,
      timezoneOffset: '+00:00',
      platformAdditionalInfo: {
        dealerId: 2002,
        crmUserId: 1001,
        vinsLeadManagementAccessToken: 'e2e-lead-access-token',
        vinsLeadManagementTokenExpiry: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        vinsCallTrackingAccessToken: 'e2e-call-access-token',
        vinsCallTrackingTokenExpiry: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      },
      userSettings: {},
      hashedRcExtensionId: 'e2e-vinsolutions-hashed-extension',
    });
    jwtToken = generateJwt({ id: userId, platform, rcUserNumber });
  }

  async function cleanData() {
    await cleanE2EData({ userIds: [userId], rcAccountIds: [rcAccountId] });
  }

  beforeAll(async () => {
    for (const [name, value] of Object.entries(testEnv)) {
      previousEnv[name] = process.env[name];
      process.env[name] = value;
    }
    ({ server, client } = await startServer());
  });

  afterAll(async () => {
    await cleanData();
    await stopServer(server);
    for (const name of Object.keys(testEnv)) {
      if (previousEnv[name] === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = previousEnv[name];
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

    let contactSearchQuery;
    const contactSearchScope = nock(apiBaseUrl)
      .matchHeader('authorization', 'Bearer e2e-lead-access-token')
      .matchHeader('api_key', 'e2e-lead-api-key')
      .get('/gateway/v1/contact')
      .query(query => {
        contactSearchQuery = query;
        return true;
      })
      .reply(200, [{
        ContactId: 501,
        ContactInformation: {
          FirstName: 'Jane',
          LastName: 'Buyer',
          Phones: [{ PhoneType: 'Cell', Number: '5551234567' }],
        },
      }]);

    const leadSearchScope = nock(apiBaseUrl)
      .matchHeader('authorization', 'Bearer e2e-lead-access-token')
      .matchHeader('api_key', 'e2e-lead-api-key')
      .get('/leads')
      .query(true)
      .reply(200, {
        items: [{
          leadId: 9001,
          leadStatus: 'ACTIVE_NEW_LEAD',
          leadSource: { leadSourceName: 'Internet' },
        }],
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
      id: 501,
      name: 'Jane Buyer',
    });
    expect(contact.data.contact[0].additionalInfo.leads).toEqual([{
      const: 9001,
      title: 'Lead #9001 (ACTIVE_NEW_LEAD) - Internet',
    }]);
    expect(contactSearchQuery).toMatchObject({
      dealerId: '2002',
      userId: '1001',
      phone: '15551234567',
      pageSize: '100',
    });
    expect(contactSearchScope.isDone()).toBe(true);
    expect(leadSearchScope.isDone()).toBe(true);

    const cachedContact = await AccountDataModel.findOne({
      where: {
        rcAccountId,
        platformName: platform,
        dataKey: `contact-${phoneNumber}`,
      },
    });
    expect(cachedContact.data[0].name).toBe('Jane Buyer');

    const logInfo = {
      id: 'e2e-vinsolutions-call-id',
      sessionId,
      telephonySessionId,
      extensionNumber,
      direction: 'Outbound',
      from: {
        name: 'VinSolutions Agent',
        phoneNumber: rcUserNumber,
      },
      to: {
        name: 'Jane Buyer',
        phoneNumber,
      },
      duration: 300,
      result: 'Completed',
      startTime: new Date('2026-01-02T03:04:05.000Z').getTime(),
      recording: {
        link: 'https://recordings.example.test/vinsolutions-e2e.wav',
      },
      customSubject: 'VinSolutions E2E call subject',
    };

    let createdCallBody;
    const createCallScope = nock(apiBaseUrl)
      .matchHeader('authorization', 'Bearer e2e-call-access-token')
      .matchHeader('api_key', 'e2e-call-api-key')
      .post('/calldetails', body => {
        createdCallBody = body;
        return true;
      })
      .reply(201, {}, {
        Location: `${apiBaseUrl}/calldetails/id/4321`,
      });

    const createLog = await client.post('/callLog', {
      logInfo,
      contactId: 501,
      contactName: 'Jane Buyer',
      contactType: 'Contact',
      note: 'VinSolutions e2e agent note',
      additionalSubmission: { leads: 9001 },
    }, {
      params: { jwtToken },
      headers: {
        'rc-account-id': 'e2e-vinsolutions-hashed-account',
        'rc-extension-id': 'e2e-vinsolutions-hashed-extension',
      },
    });

    expect(createLog.status).toBe(200);
    expect(createLog.data).toMatchObject({
      successful: true,
      logId: '4321',
      returnMessage: {
        message: 'Call logged to VinSolutions.',
        messageType: 'success',
      },
    });
    expect(createdCallBody).toMatchObject({
      providerName: 'RingCentral',
      accountId: '2002',
      providerUserId: '1001',
      communicationType: 'PHONE',
      callDirection: 'OUTBOUND',
      providerReferenceId: sessionId,
      recordingHref: 'https://recordings.example.test/vinsolutions-e2e.wav',
      vinProperties: {
        dealerId: 2002,
        userId: 1001,
        contactId: 501,
        leadId: 9001,
      },
    });
    expect(createdCallBody.transcriptFull).toContain('VinSolutions e2e agent note');
    expect(createdCallBody.transcriptFull).toContain('VinSolutions E2E call subject');
    expect(createCallScope.isDone()).toBe(true);

    const persistedCallLog = await CallLogModel.findOne({
      where: { sessionId, userId },
    });
    expect(persistedCallLog).toMatchObject({
      id: telephonySessionId,
      sessionId,
      extensionNumber,
      platform,
      thirdPartyLogId: '4321',
      userId,
      contactId: '501',
    });

    const getCallScope = nock(apiBaseUrl)
      .matchHeader('authorization', 'Bearer e2e-call-access-token')
      .matchHeader('api_key', 'e2e-call-api-key')
      .get('/calldetails/id/4321')
      .query({ accountId: '2002', providerName: 'RingCentral' })
      .reply(200, callDetailResponse());

    const getContactScope = nock(apiBaseUrl)
      .matchHeader('authorization', 'Bearer e2e-lead-access-token')
      .matchHeader('api_key', 'e2e-lead-api-key')
      .get('/gateway/v1/contact')
      .query(true)
      .reply(200, [{
        ContactId: 501,
        ContactInformation: {
          FirstName: 'Jane',
          LastName: 'Buyer',
        },
      }]);

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
      logId: '4321',
      logData: {
        subject: 'Outbound call',
        note: 'VinSolutions e2e agent note',
        contactName: 'Jane Buyer',
        dispositions: { leads: 9001 },
      },
    });
    expect(getCallScope.isDone()).toBe(true);
    expect(getContactScope.isDone()).toBe(true);

    const getBeforeUpdateCallScope = nock(apiBaseUrl)
      .get('/calldetails/id/4321')
      .query({ accountId: '2002', providerName: 'RingCentral' })
      .reply(200, callDetailResponse());

    const getBeforeUpdateContactScope = nock(apiBaseUrl)
      .get('/gateway/v1/contact')
      .query(true)
      .reply(200, [{
        ContactId: 501,
        ContactInformation: {
          FirstName: 'Jane',
          LastName: 'Buyer',
        },
      }]);

    let patchedCallBody;
    const updateCallScope = nock(apiBaseUrl)
      .matchHeader('authorization', 'Bearer e2e-call-access-token')
      .matchHeader('api_key', 'e2e-call-api-key')
      .patch('/calldetails/id/4321', body => {
        patchedCallBody = body;
        return true;
      })
      .reply(204);

    const updateLog = await client.patch('/callLog', {
      sessionId,
      extensionNumber,
      subject: 'VinSolutions E2E updated subject',
      note: 'VinSolutions e2e follow-up note',
      startTime: new Date('2026-01-02T03:10:05.000Z').getTime(),
      duration: 420,
      result: 'Completed',
      direction: 'Outbound',
      from: logInfo.from,
      to: logInfo.to,
      additionalSubmission: { leads: 9002 },
    }, {
      params: { jwtToken },
      headers: {
        'rc-account-id': 'e2e-vinsolutions-hashed-account',
        'rc-extension-id': 'e2e-vinsolutions-hashed-extension',
      },
    });

    expect(updateLog.status).toBe(200);
    expect(updateLog.data).toMatchObject({
      successful: true,
      logId: '4321',
      returnMessage: {
        message: 'Call log updated in VinSolutions.',
        messageType: 'success',
      },
    });
    expect(updateLog.data.updatedNote).toContain('VinSolutions e2e follow-up note');
    expect(patchedCallBody).toMatchObject({
      providerName: 'RingCentral',
      callDurationSeconds: 420,
      vinProperties: {
        dealerId: 2002,
        userId: 1001,
        leadId: 9002,
      },
    });
    expect(patchedCallBody.transcriptFull).toContain('VinSolutions e2e follow-up note');
    expect(patchedCallBody.transcriptFull).toContain('VinSolutions E2E updated subject');
    expect(getBeforeUpdateCallScope.isDone()).toBe(true);
    expect(getBeforeUpdateContactScope.isDone()).toBe(true);
    expect(updateCallScope.isDone()).toBe(true);
    expect(nock.pendingMocks()).toEqual([]);
  });

  test('logs a realistic inbound no-answer call without optional lead or recording data', async () => {
    const contactInfo = practicalContacts.smallBusinessOwner;
    const practicalSessionId = 'e2e-vinsolutions-practical-inbound';
    const practicalTelephonySessionId = 'e2e-vinsolutions-practical-telephony';
    const practicalExtensionNumber = '208';
    const searchedPhones = [];

    const contactSearchScope = nock(apiBaseUrl)
      .matchHeader('authorization', 'Bearer e2e-lead-access-token')
      .matchHeader('api_key', 'e2e-lead-api-key')
      .get('/gateway/v1/contact')
      .query(query => {
        searchedPhones.push(query.phone);
        return true;
      })
      .times(4)
      .reply(200, [{
        ContactId: 777,
        ContactInformation: {
          FirstName: 'José',
          LastName: 'Álvarez',
          Phones: [{ PhoneType: 'Cell', Number: '4155550176' }],
        },
      }]);

    const leadSearchScope = nock(apiBaseUrl)
      .matchHeader('authorization', 'Bearer e2e-lead-access-token')
      .matchHeader('api_key', 'e2e-lead-api-key')
      .get('/leads')
      .query(true)
      .reply(200, { items: [] });

    const contact = await client.get('/contact', {
      params: {
        jwtToken,
        phoneNumber: contactInfo.phoneNumber,
        isExtension: 'false',
      },
    });

    expect(contact.status).toBe(200);
    expect(contact.data.successful).toBe(true);
    expect(contact.data.contact[0]).toMatchObject({
      id: 777,
      name: contactInfo.name,
      phone: '4155550176',
      additionalInfo: null,
      type: 'contact',
    });
    expect(searchedPhones).toEqual(expect.arrayContaining([
      '4155550176',
      '+14155550176',
      '+1415-555-0176',
      '14155550176',
    ]));
    expect(contactSearchScope.isDone()).toBe(true);
    expect(leadSearchScope.isDone()).toBe(true);

    const logInfo = buildPracticalCall({
      id: 'e2e-vinsolutions-practical-call',
      sessionId: practicalSessionId,
      telephonySessionId: practicalTelephonySessionId,
      extensionNumber: practicalExtensionNumber,
      direction: 'Inbound',
      contact: contactInfo,
      agent: practicalAgents.supportSpecialist,
      duration: 0,
      result: 'No Answer',
      startTime: '2026-11-01T09:15:00.000Z',
      customSubject: 'Missed inbound sales call',
    });

    let createdCallBody;
    const createCallScope = nock(apiBaseUrl)
      .matchHeader('authorization', 'Bearer e2e-call-access-token')
      .matchHeader('api_key', 'e2e-call-api-key')
      .post('/calldetails', body => {
        createdCallBody = body;
        return true;
      })
      .reply(201, {}, {
        Location: `${apiBaseUrl}/calldetails/id/4330`,
      });

    const createLog = await client.post('/callLog', {
      logInfo,
      contactId: 777,
      contactName: contactInfo.name,
      contactType: 'contact',
      note: practicalNotes.noAnswer,
    }, {
      params: { jwtToken },
      headers: {
        'rc-account-id': 'e2e-vinsolutions-hashed-account',
        'rc-extension-id': 'e2e-vinsolutions-hashed-extension',
      },
    });

    expect(createLog.status).toBe(200);
    expect(createLog.data).toMatchObject({
      successful: true,
      logId: '4330',
    });
    expect(createdCallBody).toMatchObject({
      callDirection: 'INBOUND',
      fromNumber: contactInfo.phoneNumber,
      toNumber: practicalAgents.supportSpecialist.phoneNumber,
      callDurationSeconds: 0,
      callResult: 'NO_ANSWER',
      recordingHref: '',
      vinProperties: {
        dealerId: 2002,
        userId: 1001,
        contactId: 777,
      },
    });
    expect(createdCallBody.vinProperties).not.toHaveProperty('leadId');
    expect(createdCallBody.transcriptFull).toContain(practicalNotes.noAnswer);
    expect(createdCallBody.transcriptFull).toContain('Missed inbound sales call');
    expect(createCallScope.isDone()).toBe(true);

    const persistedCallLog = await CallLogModel.findOne({
      where: { sessionId: practicalSessionId, userId },
    });
    expect(persistedCallLog).toMatchObject({
      id: practicalTelephonySessionId,
      sessionId: practicalSessionId,
      extensionNumber: practicalExtensionNumber,
      platform,
      thirdPartyLogId: '4330',
      contactId: '777',
    });
    expect(nock.pendingMocks()).toEqual([]);
  });
});

export {};
