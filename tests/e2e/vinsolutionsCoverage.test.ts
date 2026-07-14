const nock = require('nock');
const jwt = require('@app-connect/core/lib/jwt');
const { getHashValue } = require('@app-connect/core/lib/util');
const { UserModel } = require('@app-connect/core/models/userModel');
const { MessageLogModel } = require('@app-connect/core/models/messageLogModel');
const { AdminConfigModel } = require('@app-connect/core/models/adminConfigModel');
const {
  startServer,
  stopServer,
  cleanE2EData,
  generateJwt,
} = require('./support/serverHarness');
const {
  vinsolutionsCoverageCase,
  buildMessageLogRequest,
} = require('./support/vinsolutionsCoverageCases');

describe('VinSolutions remaining App-level coverage', () => {
  const {
    identity,
    provider,
    requestHeaders,
    ringCentralAdminResponse,
    contacts,
    messaging,
    userMapping,
    authentication,
  } = vinsolutionsCoverageCase;
  const hashedRcAccountId = getHashValue(identity.rcAccountId, process.env.HASH_KEY);
  const environment = {
    VINSOLUTIONS_LEAD_MANAGEMENT_CLIENT_ID: provider.leadManagement.clientId,
    VINSOLUTIONS_LEAD_MANAGEMENT_CLIENT_SECRET: provider.leadManagement.clientSecret,
    VINSOLUTIONS_CALL_TRACKING_CLIENT_ID: provider.callTracking.clientId,
    VINSOLUTIONS_CALL_TRACKING_CLIENT_SECRET: provider.callTracking.clientSecret,
    VINSOLUTIONS_LEAD_MANAGEMENT_API_KEY: provider.leadManagement.apiKey,
    VINSOLUTIONS_CALL_TRACKING_API_KEY: provider.callTracking.apiKey,
  };
  const previousEnvironment = Object.fromEntries(
    Object.keys(environment).map(key => [key, process.env[key]]),
  );

  let server;
  let client;
  let jwtToken;

  function restoreEnvironment() {
    for (const key of Object.keys(environment)) {
      const previousValue = previousEnvironment[key];
      if (previousValue === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previousValue;
      }
    }
  }

  async function cleanData() {
    await MessageLogModel.destroy({ where: { userId: identity.userId } });
    await AdminConfigModel.destroy({ where: { id: hashedRcAccountId } });
    await cleanE2EData({
      userIds: [identity.userId],
      rcAccountIds: [identity.rcAccountId],
    });
  }

  async function seedUser() {
    await UserModel.create({
      id: identity.userId,
      platform: identity.platform,
      hostname: provider.hostname,
      rcAccountId: identity.rcAccountId,
      rcUserNumber: identity.rcUserNumber,
      accessToken: provider.connectedSentinel,
      refreshToken: '',
      tokenExpiry: null,
      timezoneOffset: '+00:00',
      platformAdditionalInfo: {
        dealerId: identity.dealerId,
        crmUserId: identity.crmUserId,
        vinsLeadManagementAccessToken: provider.leadManagement.accessToken,
        vinsLeadManagementTokenExpiry: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        vinsCallTrackingAccessToken: provider.callTracking.accessToken,
        vinsCallTrackingTokenExpiry: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      },
      userSettings: {},
      hashedRcExtensionId: identity.hashedExtensionId,
    });
    jwtToken = generateJwt({
      id: identity.userId,
      platform: identity.platform,
      rcUserNumber: identity.rcUserNumber,
    });
  }

  function appConfig() {
    return {
      params: { jwtToken },
      headers: requestHeaders,
    };
  }

  function mockPhoneSearch(testCase) {
    return nock(provider.apiBaseUrl)
      .matchHeader('authorization', `Bearer ${provider.leadManagement.accessToken}`)
      .matchHeader('api_key', provider.leadManagement.apiKey)
      .get('/gateway/v1/contact')
      .query(query => (
        query.dealerId === String(identity.dealerId)
        && query.userId === String(identity.crmUserId)
        && query.pageSize === '100'
        && typeof query.phone === 'string'
      ))
      .times(4)
      .reply(200, testCase.crmResponse);
  }

  async function findContact(phoneNumber) {
    return client.get('/contact', {
      params: {
        jwtToken,
        phoneNumber,
        isExtension: 'false',
      },
    });
  }

  function parseTokenForm(requestBody) {
    if (typeof requestBody === 'string') {
      return Object.fromEntries(new URLSearchParams(requestBody));
    }
    return requestBody;
  }

  beforeAll(async () => {
    Object.assign(process.env, environment);
    nock.disableNetConnect();
    nock.enableNetConnect('127.0.0.1');
    await MessageLogModel.sync();
    await AdminConfigModel.sync();
    ({ server, client } = await startServer());
  });

  afterAll(async () => {
    try {
      await cleanData();
    } finally {
      try {
        await stopServer(server);
      } finally {
        restoreEnvironment();
        nock.cleanAll();
        nock.enableNetConnect();
      }
    }
  });

  beforeEach(async () => {
    nock.cleanAll();
    await cleanData();
    await seedUser();
  });

  afterEach(async () => {
    nock.cleanAll();
    await cleanData();
  });

  test('returns unmatched and multiple contact results through the real connector', async () => {
    const unmatchedScope = mockPhoneSearch(contacts.unmatched);
    const unmatchedResponse = await findContact(contacts.unmatched.phoneNumber);

    expect(unmatchedResponse.status).toBe(200);
    expect(unmatchedResponse.data).toMatchObject(contacts.unmatched.expectedResponse);
    expect(unmatchedScope.isDone()).toBe(true);

    const multipleScope = mockPhoneSearch(contacts.multipleMatches);
    const leadScopes = contacts.multipleMatches.leadResponses.map(({ contactId, response }) => (
      nock(provider.apiBaseUrl)
        .matchHeader('authorization', `Bearer ${provider.leadManagement.accessToken}`)
        .matchHeader('api_key', provider.leadManagement.apiKey)
        .get('/leads')
        .query({
          dealerId: String(identity.dealerId),
          userId: String(identity.crmUserId),
          contactId: String(contactId),
          limit: '100',
        })
        .reply(200, response)
    ));

    const multipleResponse = await findContact(contacts.multipleMatches.phoneNumber);

    expect(multipleResponse.status).toBe(200);
    expect(multipleResponse.data).toEqual({
      successful: true,
      contact: contacts.multipleMatches.expectedContacts,
    });
    expect(multipleScope.isDone()).toBe(true);
    expect(leadScopes.every(scope => scope.isDone())).toBe(true);
    expect(nock.pendingMocks()).toEqual([]);
  });

  test('creates a contact through the real connector', async () => {
    let crmRequestBody;
    const createScope = nock(provider.apiBaseUrl)
      .matchHeader('authorization', `Bearer ${provider.leadManagement.accessToken}`)
      .matchHeader('api_key', provider.leadManagement.apiKey)
      .post('/gateway/v1/contact', body => {
        crmRequestBody = body;
        return true;
      })
      .reply(201, { ContactId: contacts.create.contactId });

    const response = await client.post(
      '/contact',
      contacts.create.appRequestBody,
      { params: { jwtToken } },
    );

    expect(response.status).toBe(200);
    expect(response.data).toEqual({
      successful: true,
      returnMessage: {
        message: 'Contact created in VinSolutions.',
        messageType: 'success',
        ttl: 2000,
      },
      contact: {
        id: contacts.create.contactId,
        name: contacts.create.name,
      },
    });
    expect(crmRequestBody).toEqual(contacts.create.expectedCrmRequestBody);
    expect(createScope.isDone()).toBe(true);
  });

  test('creates and updates an SMS log through VinSolutions lead APIs', async () => {
    let createdLeadBody;
    const createScope = nock(provider.apiBaseUrl)
      .matchHeader('authorization', `Bearer ${provider.leadManagement.accessToken}`)
      .matchHeader('api_key', provider.leadManagement.apiKey)
      .put(`/leads/id/${messaging.conversation.leadId}`, body => {
        createdLeadBody = body;
        return true;
      })
      .reply(200, {});

    const createResponse = await client.post(
      '/messageLog',
      buildMessageLogRequest([messaging.inbound]),
      appConfig(),
    );

    expect(createResponse.status).toBe(200);
    expect(createResponse.data).toMatchObject({
      successful: true,
      logIds: [String(messaging.inbound.id)],
      returnMessage: {
        message: 'Message logged to VinSolutions lead.',
        messageType: 'success',
      },
    });
    expect(createdLeadBody).toMatchObject({
      isHot: false,
      coBuyerContact: null,
      trades: null,
      vehiclesOfInterest: null,
    });
    expect(createdLeadBody.notes).toContain(messaging.inbound.subject);
    expect(createScope.isDone()).toBe(true);

    const persistedCreate = await MessageLogModel.findByPk(String(messaging.inbound.id));
    expect(persistedCreate).toMatchObject({
      platform: identity.platform,
      conversationId: messaging.conversation.id,
      conversationLogId: messaging.conversation.logId,
      thirdPartyLogId: String(messaging.conversation.leadId),
      userId: identity.userId,
    });

    const getLeadScope = nock(provider.apiBaseUrl)
      .matchHeader('authorization', `Bearer ${provider.leadManagement.accessToken}`)
      .matchHeader('api_key', provider.leadManagement.apiKey)
      .get(`/leads/id/${messaging.conversation.leadId}`)
      .query({
        dealerId: String(identity.dealerId),
        userId: String(identity.crmUserId),
      })
      .reply(200, { notes: createdLeadBody.notes });
    let updatedLeadBody;
    const updateScope = nock(provider.apiBaseUrl)
      .matchHeader('authorization', `Bearer ${provider.leadManagement.accessToken}`)
      .matchHeader('api_key', provider.leadManagement.apiKey)
      .put(`/leads/id/${messaging.conversation.leadId}`, body => {
        updatedLeadBody = body;
        return true;
      })
      .reply(200, {});

    const updateResponse = await client.post(
      '/messageLog',
      buildMessageLogRequest([messaging.outbound, messaging.inbound]),
      appConfig(),
    );

    expect(updateResponse.status).toBe(200);
    expect(updateResponse.data).toMatchObject({
      successful: true,
      logIds: [String(messaging.outbound.id)],
    });
    expect(updatedLeadBody.notes).toContain(messaging.inbound.subject);
    expect(updatedLeadBody.notes).toContain(messaging.outbound.subject);
    expect(updatedLeadBody.notes).toContain('Updated via RingCentral App Connect');
    expect(getLeadScope.isDone()).toBe(true);
    expect(updateScope.isDone()).toBe(true);

    const persistedLogs = await MessageLogModel.findAll({
      where: {
        userId: identity.userId,
        conversationLogId: messaging.conversation.logId,
      },
    });
    expect(persistedLogs).toHaveLength(2);
    expect(persistedLogs.map(log => log.id)).toEqual(expect.arrayContaining([
      String(messaging.inbound.id),
      String(messaging.outbound.id),
    ]));
    expect(nock.pendingMocks()).toEqual([]);
  });

  test('reads and reinitializes user mapping through the real connector', async () => {
    await AdminConfigModel.create({
      id: hashedRcAccountId,
      userMappings: userMapping.initialPersistedMappings,
    });
    const ringCentralScope = nock('https://platform.ringcentral.com')
      .matchHeader('authorization', `Bearer ${identity.rcAccessToken}`)
      .get('/restapi/v1.0/account/~/extension/~')
      .times(2)
      .reply(200, ringCentralAdminResponse);
    const crmUserScope = nock(provider.apiBaseUrl)
      .matchHeader('authorization', `Bearer ${provider.leadManagement.accessToken}`)
      .matchHeader('api_key', provider.leadManagement.apiKey)
      .get('/gateway/v1/tenant/user')
      .query({ dealerId: String(identity.dealerId) })
      .times(2)
      .reply(200, userMapping.crmResponse);
    const config = {
      params: { jwtToken },
      headers: {
        ...requestHeaders,
        'X-RC-Access-Token': identity.rcAccessToken,
      },
    };

    const initialRead = await client.post(
      '/admin/userMapping',
      userMapping.appRequestBody,
      config,
    );
    expect(initialRead.status).toBe(200);
    expect(initialRead.data).toEqual(userMapping.expectedInitialRead);

    const reinitialized = await client.post(
      '/admin/reinitializeUserMapping',
      userMapping.appRequestBody,
      config,
    );
    expect(reinitialized.status).toBe(200);
    expect(reinitialized.data).toEqual(userMapping.expectedReinitializedRead);

    const persistedConfig = await AdminConfigModel.findByPk(hashedRcAccountId);
    expect(persistedConfig.userMappings).toEqual(userMapping.expectedPersistedMappings);
    expect(ringCentralScope.isDone()).toBe(true);
    expect(crmUserScope.isDone()).toBe(true);
    expect(nock.pendingMocks()).toEqual([]);
  });

  test('logs in through the real client-credentials connector flow', async () => {
    await cleanData();
    const tokenRequests = [];
    const tokenScope = nock(provider.tokenBaseUrl)
      .post('/connect/token', body => {
        tokenRequests.push(parseTokenForm(body));
        return true;
      })
      .times(2)
      .reply((_uri, body) => {
        const form = parseTokenForm(body);
        return [200, authentication.tokenResponses[form.client_id]];
      });
    const userScope = nock(provider.apiBaseUrl)
      .matchHeader('authorization', `Bearer ${provider.leadManagement.accessToken}`)
      .matchHeader('api_key', provider.leadManagement.apiKey)
      .get(`/gateway/v1/tenant/user/id/${identity.crmUserId}`)
      .query({ dealerId: String(identity.dealerId) })
      .reply(200, authentication.crmUserResponse);
    const dealerScope = nock(provider.apiBaseUrl)
      .matchHeader('authorization', `Bearer ${provider.leadManagement.accessToken}`)
      .matchHeader('api_key', provider.leadManagement.apiKey)
      .get('/gateway/v1/organization/dealers')
      .reply(200, authentication.dealersResponse);

    const response = await client.post(
      '/apiKeyLogin',
      authentication.appRequestBody,
      { headers: requestHeaders },
    );

    expect(response.status).toBe(200);
    expect(response.data).toMatchObject({
      name: identity.agentName,
      returnMessage: {
        message: 'Connected to VinSolutions (Coverage Motors).',
        messageType: 'success',
      },
    });
    expect(response.data.jwtToken).toEqual(expect.any(String));
    expect(jwt.decodeJwt(response.data.jwtToken)).toMatchObject({
      id: identity.userId,
      platform: identity.platform,
    });
    expect(tokenRequests).toEqual(expect.arrayContaining([
      {
        grant_type: 'client_credentials',
        client_id: provider.leadManagement.clientId,
        client_secret: provider.leadManagement.clientSecret,
        scope: 'PublicAPI',
      },
      {
        grant_type: 'client_credentials',
        client_id: provider.callTracking.clientId,
        client_secret: provider.callTracking.clientSecret,
        scope: 'PublicAPI',
      },
    ]));
    expect(tokenScope.isDone()).toBe(true);
    expect(userScope.isDone()).toBe(true);
    expect(dealerScope.isDone()).toBe(true);

    const persistedUser = await UserModel.findByPk(identity.userId);
    expect(persistedUser).not.toBeNull();
    expect(persistedUser.toJSON()).toMatchObject({
      id: identity.userId,
      platform: identity.platform,
      hostname: provider.hostname,
      accessToken: provider.connectedSentinel,
      hashedRcExtensionId: identity.hashedExtensionId,
      platformAdditionalInfo: {
        dealerId: identity.dealerId,
        crmUserId: identity.crmUserId,
        dealerName: 'Coverage Motors',
        email: authentication.crmUserResponse.EmailAddress,
        vinsLeadManagementApiKey: provider.leadManagement.apiKey,
        vinsCallTrackingApiKey: provider.callTracking.apiKey,
        vinsLeadManagementAccessToken: provider.leadManagement.accessToken,
        vinsCallTrackingAccessToken: provider.callTracking.accessToken,
      },
    });
    expect(nock.pendingMocks()).toEqual([]);
  });
});

export {};
