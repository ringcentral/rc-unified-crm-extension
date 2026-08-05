const http = require('http');
const nock = require('nock');
const jwt = require('@app-connect/core/lib/jwt');
const { UserModel } = require('@app-connect/core/models/userModel');
const { MessageLogModel } = require('@app-connect/core/models/messageLogModel');
const { AccountDataModel } = require('@app-connect/core/models/accountDataModel');
const { AdminConfigModel } = require('@app-connect/core/models/adminConfigModel');
const { CacheModel } = require('@app-connect/core/models/cacheModel');
const { getHashValue } = require('@app-connect/core/lib/util');
const {
  startServer,
  stopServer,
  cleanE2EData,
  generateJwt,
} = require('./support/serverHarness');
const {
  netsuiteCoverageCase,
  buildMessageRequest,
} = require('./support/netsuiteCoverageCases');

describe('NetSuite expanded App-level E2E', () => {
  const {
    identity,
    provider,
    contacts,
    message,
    appointments,
    userMapping,
    oauth,
  } = netsuiteCoverageCase;
  const requestHeaders = {
    'X-RC-Access-Token': identity.rcAccessToken,
    'rc-account-id': identity.hashedAccountId,
    'rc-extension-id': identity.hashedExtensionId,
  };
  const hashedRcAccountId = getHashValue(identity.rcAccountId, process.env.HASH_KEY);
  const environmentKeys = [
    'NETSUITE_CRM_CLIENT_ID',
    'NETSUITE_CRM_CLIENT_SECRET',
  ];
  const previousEnvironment = Object.fromEntries(
    environmentKeys.map(key => [key, process.env[key]]),
  );

  let server;
  let client;
  let jwtToken;
  let tokenApiServer;
  let tokenApiUrl;
  let tokenRequest;

  function restoreEnvironment() {
    for (const key of environmentKeys) {
      const value = previousEnvironment[key];
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }

  async function cleanData() {
    await CacheModel.destroy({
      where: { id: `${identity.rcAccountId}-managed-oauth-account` },
    });
    await AdminConfigModel.destroy({ where: { id: hashedRcAccountId } });
    await MessageLogModel.destroy({
      where: { userId: [identity.userId, identity.oauthUserId] },
    });
    await cleanE2EData({
      userIds: [identity.userId, identity.oauthUserId],
      rcAccountIds: [identity.rcAccountId],
    });
  }

  async function startTokenApi() {
    tokenApiServer = http.createServer(async (request, response) => {
      const chunks = [];
      for await (const chunk of request) {
        chunks.push(Buffer.from(chunk));
      }
      tokenRequest = {
        method: request.method,
        url: request.url,
        headers: request.headers,
        body: Buffer.concat(chunks).toString('utf8'),
      };
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify(oauth.tokenResponse));
    });
    await new Promise(resolve => tokenApiServer.listen(0, '127.0.0.1', resolve));
    const { port } = tokenApiServer.address();
    tokenApiUrl = `http://127.0.0.1:${port}/oauth/token`;
  }

  async function stopTokenApi() {
    if (tokenApiServer) {
      await new Promise((resolve, reject) => tokenApiServer.close(error => {
        if (error) {
          reject(error);
          return;
        }
        resolve(undefined);
      }));
    }
  }

  async function seedUser() {
    await UserModel.create({
      id: identity.userId,
      platform: identity.platform,
      hostname: provider.hostname,
      rcAccountId: identity.rcAccountId,
      rcUserNumber: identity.rcUserNumber,
      accessToken: identity.accessToken,
      refreshToken: identity.refreshToken,
      tokenExpiry: new Date(Date.now() + 60 * 60 * 1000),
      timezoneName: 'America/New_York',
      timezoneOffset: '-05:00',
      platformAdditionalInfo: {
        accountId: identity.accountId,
        name: message.agentName,
        subsidiaryId: '1',
        oneWorldEnabled: false,
      },
      userSettings: {
        contactsSearchId: { value: ['contact'] },
        phoneFieldsId: { value: ['phone'] },
        enableSalesOrderLogging: { value: false },
        enableOpportunityLogging: { value: false },
      },
      hashedRcExtensionId: identity.hashedExtensionId,
    });
    jwtToken = generateJwt({
      id: identity.userId,
      platform: identity.platform,
      rcUserNumber: identity.rcUserNumber,
    });
  }

  function jwtConfig() {
    return {
      params: { jwtToken },
      headers: requestHeaders,
    };
  }

  function mockContactSearch(testCase) {
    return nock(provider.suiteTalkBaseUrl)
      .matchHeader('authorization', provider.authorization)
      .post('/services/rest/query/v1/suiteql', body => (
        body.q.includes('FROM contact')
        && body.q.includes(testCase.queryPhone)
      ))
      .reply(200, testCase.crmResponse);
  }

  function mockRingCentralAdmin(times) {
    return nock('https://platform.ringcentral.com')
      .matchHeader('authorization', `Bearer ${identity.rcAccessToken}`)
      .get('/restapi/v1.0/account/~/extension/~')
      .times(times)
      .reply(200, {
        id: identity.rcExtensionId,
        account: { id: identity.rcAccountId },
        permissions: { admin: { enabled: true } },
      });
  }

  beforeAll(async () => {
    process.env.NETSUITE_CRM_CLIENT_ID = identity.clientId;
    process.env.NETSUITE_CRM_CLIENT_SECRET = identity.clientSecret;
    await AdminConfigModel.sync();
    await startTokenApi();
    ({ server, client } = await startServer());
  });

  afterAll(async () => {
    try {
      await cleanData();
    } finally {
      try {
        await stopServer(server);
      } finally {
        try {
          await stopTokenApi();
        } finally {
          restoreEnvironment();
          nock.cleanAll();
        }
      }
    }
  });

  beforeEach(async () => {
    nock.cleanAll();
    tokenRequest = null;
    await cleanData();
    await seedUser();
  });

  afterEach(async () => {
    nock.cleanAll();
    await cleanData();
  });

  test('returns an unmatched contact result from the real NetSuite SuiteQL search', async () => {
    const scope = mockContactSearch(contacts.unmatched);

    const response = await client.get('/contact', {
      params: {
        jwtToken,
        phoneNumber: contacts.unmatched.phoneNumber,
        isExtension: 'false',
        overridingFormat: '',
      },
    });

    expect(response.status).toBe(200);
    expect(response.data).toMatchObject({
      successful: true,
      contact: contacts.unmatched.expectedContacts,
      returnMessage: {
        message: 'Contact not found',
        messageType: 'warning',
      },
    });
    expect(scope.isDone()).toBe(true);
    expect(await AccountDataModel.findOne({
      where: {
        rcAccountId: identity.rcAccountId,
        platformName: identity.platform,
        dataKey: `contact-${contacts.unmatched.phoneNumber}`,
      },
    })).toBeNull();
  });

  test('maps and caches multiple contacts returned by the real NetSuite connector', async () => {
    const scope = mockContactSearch(contacts.multiple);

    const response = await client.get('/contact', {
      params: {
        jwtToken,
        phoneNumber: contacts.multiple.phoneNumber,
        isExtension: 'false',
        overridingFormat: '',
      },
    });

    expect(response.status).toBe(200);
    expect(response.data).toMatchObject({
      successful: true,
      contact: contacts.multiple.expectedContacts,
    });
    const cached = await AccountDataModel.findOne({
      where: {
        rcAccountId: identity.rcAccountId,
        platformName: identity.platform,
        dataKey: `contact-${contacts.multiple.phoneNumber}`,
      },
    });
    expect(cached).not.toBeNull();
    expect(cached.data).toEqual(contacts.multiple.expectedContacts);
    expect(scope.isDone()).toBe(true);
  });

  test('creates a NetSuite customer through the real contact route', async () => {
    let crmBody;
    const scope = nock(provider.suiteTalkBaseUrl)
      .matchHeader('authorization', provider.authorization)
      .post('/services/rest/record/v1/customer', body => {
        crmBody = body;
        return true;
      })
      .reply(201, {}, {
        location: `/services/rest/record/v1/customer/${contacts.create.customerId}`,
      });

    const response = await client.post(
      '/contact',
      contacts.create.appRequestBody,
      { params: { jwtToken } },
    );

    expect(response.status).toBe(200);
    expect(response.data).toEqual({
      successful: true,
      returnMessage: {
        message: 'Customer created',
        messageType: 'success',
        ttl: 5000,
      },
      contact: {
        id: contacts.create.customerId,
        name: contacts.create.newContactName,
      },
    });
    expect(crmBody).toEqual(contacts.create.expectedCrmBody);
    expect(scope.isDone()).toBe(true);
  });

  test('creates and updates a NetSuite SMS activity through the real message route', async () => {
    let createdBody;
    const createScope = nock(provider.suiteTalkBaseUrl)
      .matchHeader('authorization', provider.authorization)
      .post('/services/rest/record/v1/phonecall', body => {
        createdBody = body;
        return true;
      })
      .reply(201, {}, {
        location: `/services/rest/record/v1/phonecall/${message.providerLogId}`,
      });

    const createResponse = await client.post(
      '/messageLog',
      buildMessageRequest([message.inbound]),
      jwtConfig(),
    );

    expect(createResponse.status).toBe(200);
    expect(createResponse.data).toMatchObject({
      successful: true,
      logIds: [String(message.inbound.id)],
      returnMessage: {
        message: 'Message logged',
        messageType: 'success',
      },
    });
    expect(createdBody).toMatchObject({
      title: `SMS conversation with ${message.contact.name} - 26/07/14`,
      phone: message.contact.phoneNumber,
      status: 'COMPLETE',
      company: { id: message.contact.id },
    });
    expect(createdBody.message).toContain('Conversation(1 messages)');
    expect(createdBody.message).toContain(message.inbound.subject);
    expect(createScope.isDone()).toBe(true);

    const getScope = nock(provider.suiteTalkBaseUrl)
      .matchHeader('authorization', provider.authorization)
      .get(`/services/rest/record/v1/phonecall/${message.providerLogId}`)
      .reply(200, { id: message.providerLogId, message: createdBody.message });
    let updatedBody;
    const updateScope = nock(provider.suiteTalkBaseUrl)
      .matchHeader('authorization', provider.authorization)
      .patch(`/services/rest/record/v1/phoneCall/${message.providerLogId}`, body => {
        updatedBody = body;
        return true;
      })
      .reply(204);

    const updateResponse = await client.post(
      '/messageLog',
      buildMessageRequest([message.outbound, message.inbound]),
      jwtConfig(),
    );

    expect(updateResponse.status).toBe(200);
    expect(updateResponse.data).toMatchObject({
      successful: true,
      logIds: [message.outbound.id],
    });
    expect(updatedBody.message).toContain('Conversation(2 messages)');
    expect(updatedBody.message).toContain(message.inbound.subject);
    expect(updatedBody.message).toContain(message.outbound.subject);
    expect(getScope.isDone()).toBe(true);
    expect(updateScope.isDone()).toBe(true);

    const persisted = await MessageLogModel.findAll({
      where: { userId: identity.userId, conversationLogId: message.conversationLogId },
    });
    expect(persisted).toHaveLength(2);
    expect(persisted.map(log => log.thirdPartyLogId)).toEqual([
      message.providerLogId,
      message.providerLogId,
    ]);
  });

  test('runs every supported NetSuite appointment operation through provider HTTP', async () => {
    const interfaces = await client.get('/implementedInterfaces', {
      params: { platform: identity.platform },
    });
    expect(interfaces.data).toMatchObject({
      listAppointments: true,
      createAppointment: true,
      updateAppointment: true,
      refreshAppointment: true,
      confirmAppointment: true,
      cancelAppointment: true,
    });

    const listScope = nock(provider.restletsBaseUrl)
      .matchHeader('authorization', provider.authorization)
      .get('/app/site/hosting/restlet.nl')
      .query(query => (
        query.script === 'customscript_rcfetchcalendarevents'
        && query.deploy === 'customdeploy_rcfetchcalendarevents'
        && query.startDate === appointments.list.requestQuery.startDate
        && query.endDate === appointments.list.requestQuery.endDate
        && query.page === '0'
        && query.pageSize === '1000'
      ))
      .reply(200, appointments.list.crmResponse);
    const listResponse = await client.get('/appointments', {
      ...jwtConfig(),
      params: { jwtToken, ...appointments.list.requestQuery },
    });
    expect([listResponse.status, listResponse.data]).toEqual([
      200,
      expect.objectContaining({
        successful: true,
        appointments: [expect.objectContaining({
          id: '7031',
          title: 'NetSuite case review',
          description: 'Review evidence\nand next steps',
          startTimeUtc: '2026-07-20T15:00:00.000Z',
          durationMinutes: 45,
          status: 'CONFIRMED',
        })],
      }),
    ]);
    expect(listScope.isDone()).toBe(true);

    let createBody;
    const createScope = nock(provider.suiteTalkBaseUrl)
      .matchHeader('authorization', provider.authorization)
      .post('/services/rest/record/v1/calendarEvent', body => {
        createBody = body;
        return true;
      })
      .reply(201, {}, {
        location: `/services/rest/record/v1/calendarEvent/${appointments.create.appointmentId}`,
      });
    const getCreatedScope = nock(provider.suiteTalkBaseUrl)
      .matchHeader('authorization', provider.authorization)
      .get(`/services/rest/record/v1/calendarEvent/${appointments.create.appointmentId}`)
      .reply(200, appointments.create.crmRecord);
    const createResponse = await client.post(
      '/appointments',
      appointments.create.requestBody,
      jwtConfig(),
    );
    expect(createResponse.status).toBe(200);
    expect(createResponse.data).toMatchObject({
      successful: true,
      appointmentId: appointments.create.appointmentId,
      appointment: {
        id: appointments.create.appointmentId,
        title: appointments.create.requestBody.payload.title,
      },
    });
    expect(createBody).toEqual(appointments.create.expectedCrmBody);
    expect(createScope.isDone()).toBe(true);
    expect(getCreatedScope.isDone()).toBe(true);

    let updateBody;
    const updateScope = nock(provider.suiteTalkBaseUrl)
      .matchHeader('authorization', provider.authorization)
      .patch(
        `/services/rest/record/v1/calendarEvent/${appointments.update.appointmentId}`,
        body => {
          updateBody = body;
          return true;
        },
      )
      .query({ replace: 'attendee' })
      .reply(204);
    const getUpdatedScope = nock(provider.suiteTalkBaseUrl)
      .matchHeader('authorization', provider.authorization)
      .get(`/services/rest/record/v1/calendarEvent/${appointments.update.appointmentId}`)
      .reply(200, appointments.update.crmRecord);
    const updateResponse = await client.patch(
      `/appointments/${appointments.update.appointmentId}`,
      appointments.update.requestBody,
      jwtConfig(),
    );
    expect(updateResponse.status).toBe(200);
    expect(updateResponse.data).toMatchObject({
      successful: true,
      appointment: {
        id: appointments.update.appointmentId,
        title: appointments.update.requestBody.title,
        status: 'CONFIRMED',
      },
    });
    expect(updateBody).toEqual(appointments.update.expectedCrmBody);
    expect(updateScope.isDone()).toBe(true);
    expect(getUpdatedScope.isDone()).toBe(true);

    const refreshScope = nock(provider.suiteTalkBaseUrl)
      .matchHeader('authorization', provider.authorization)
      .get(`/services/rest/record/v1/calendarEvent/${appointments.refresh.appointmentId}`)
      .reply(200, appointments.refresh.crmRecord);
    const refreshResponse = await client.get(
      `/appointments/${appointments.refresh.appointmentId}/refresh`,
      jwtConfig(),
    );
    expect(refreshResponse.status).toBe(200);
    expect(refreshResponse.data).toMatchObject({
      successful: true,
      appointment: {
        id: appointments.refresh.appointmentId,
        title: 'NetSuite refreshed event',
      },
    });
    expect(refreshScope.isDone()).toBe(true);

    let confirmBody;
    const confirmScope = nock(provider.suiteTalkBaseUrl)
      .matchHeader('authorization', provider.authorization)
      .patch(`/services/rest/record/v1/calendarEvent/${appointments.confirm.appointmentId}`, body => {
        confirmBody = body;
        return true;
      })
      .reply(204);
    const confirmResponse = await client.post(
      `/appointments/${appointments.confirm.appointmentId}/confirm`,
      undefined,
      jwtConfig(),
    );
    expect(confirmResponse.status).toBe(200);
    expect(confirmResponse.data).toMatchObject({
      successful: true,
      returnMessage: { message: 'Appointment confirmed successfully' },
    });
    expect(confirmBody).toEqual({ status: { id: 'CONFIRMED' } });
    expect(confirmScope.isDone()).toBe(true);

    let cancelBody;
    const cancelScope = nock(provider.suiteTalkBaseUrl)
      .matchHeader('authorization', provider.authorization)
      .patch(`/services/rest/record/v1/calendarEvent/${appointments.cancel.appointmentId}`, body => {
        cancelBody = body;
        return true;
      })
      .reply(204);
    const cancelResponse = await client.post(
      `/appointments/${appointments.cancel.appointmentId}/cancel`,
      undefined,
      jwtConfig(),
    );
    expect(cancelResponse.status).toBe(200);
    expect(cancelResponse.data).toMatchObject({
      successful: true,
      returnMessage: { message: 'Appointment cancelled successfully' },
    });
    expect(cancelBody).toEqual({ status: { id: 'CANCELLED' } });
    expect(cancelScope.isDone()).toBe(true);
    expect(nock.pendingMocks()).toEqual([]);
  });

  test('reinitializes user mapping through the real NetSuite employee query', async () => {
    const rcScope = mockRingCentralAdmin(1);
    let suiteQl;
    const usersScope = nock(provider.suiteTalkBaseUrl)
      .matchHeader('authorization', provider.authorization)
      .post('/services/rest/query/v1/suiteql', body => {
        suiteQl = body.q;
        return true;
      })
      .reply(200, userMapping.crmResponse);

    const response = await client.post(
      '/admin/reinitializeUserMapping',
      userMapping.requestBody,
      jwtConfig(),
    );

    expect(response.status).toBe(200);
    expect(response.data).toEqual(userMapping.expectedResponse);
    expect(suiteQl).toBe(
      'SELECT id, firstname,middlename, lastname, email, giveaccess, isinactive FROM employee',
    );
    const persisted = await AdminConfigModel.findByPk(hashedRcAccountId);
    expect(persisted.userMappings).toEqual(userMapping.expectedPersistedMappings);
    expect(rcScope.isDone()).toBe(true);
    expect(usersScope.isDone()).toBe(true);
  });

  test('completes real NetSuite OAuth and persists the CRM user', async () => {
    const rcScope = mockRingCentralAdmin(1);
    const managedOAuthValues = {
      clientId: identity.clientId,
      clientSecret: identity.clientSecret,
      accessTokenUri: tokenApiUrl,
      authorizationUri: 'https://system.netsuite.com/app/login/oauth2/authorize.nl',
      redirectUri: 'https://ringcentral.github.io/ringcentral-embeddable/redirect.html',
      scopes: [],
      hostname: provider.loginHostname,
    };
    const cacheResponse = await client.post('/admin/managedOAuth/cache', {
      values: managedOAuthValues,
    }, { headers: requestHeaders });
    expect(cacheResponse.status).toBe(200);
    const oauthAuthorization = `Bearer ${oauth.accessToken}`;
    const currentUserScope = nock(provider.restletsBaseUrl)
      .matchHeader('authorization', oauthAuthorization)
      .get('/app/site/hosting/restlet.nl')
      .query({
        script: 'customscript_getcurrentuser',
        deploy: 'customdeploy_getcurrentuser',
      })
      .reply(200, oauth.currentUserResponse);
    const oneWorldScope = nock(provider.restletsBaseUrl)
      .matchHeader('authorization', oauthAuthorization)
      .get('/app/site/hosting/restlet.nl')
      .query({
        script: 'customscript_getoneworldlicense_scriptid',
        deploy: 'customdeploy_getoneworldlicense_deployid',
      })
      .reply(200, oauth.oneWorldResponse);
    const permissionsScope = nock(provider.restletsBaseUrl)
      .matchHeader('authorization', oauthAuthorization)
      .post('/app/site/hosting/restlet.nl', body => (
        Array.isArray(body.requiredPermissions)
        && body.requiredPermissions.includes('ADMI_RESTWEBSERVICES')
      ))
      .query({
        script: 'customscript_checkrolepermissionscriptid',
        deploy: 'customdeploy_checkrolepermissiondeployid',
      })
      .reply(200, oauth.permissionResponse);
    const state = new URLSearchParams({
      platform: identity.platform,
      hostname: provider.loginHostname,
    }).toString();
    const callbackUri = [
      'https://ringcentral.github.io/ringcentral-embeddable/redirect.html',
      `?code=${oauth.authorizationCode}`,
      `&entity=${oauth.entity}`,
      `&company=${oauth.company}`,
      `&role=${oauth.role}`,
      `&state=${encodeURIComponent(state)}`,
    ].join('');

    const response = await client.get('/oauth-callback', {
      params: {
        callbackUri,
        hostname: provider.loginHostname,
        rcAccountId: identity.rcAccountId,
      },
      headers: { 'rc-extension-id': identity.hashedExtensionId },
    });

    expect(response.status).toBe(200);
    expect(response.data).toMatchObject({
      name: oauth.currentUserResponse.name,
      returnMessage: {
        messageType: 'success',
        message: 'Connected to NetSuite.',
      },
    });
    expect(response.data.jwtToken).toEqual(expect.any(String));
    expect(jwt.decodeJwt(response.data.jwtToken)).toMatchObject({
      id: identity.oauthUserId,
      platform: identity.platform,
    });
    expect(tokenRequest).toMatchObject({ method: 'POST', url: '/oauth/token' });
    expect(tokenRequest.headers.authorization).toBe(
      `Basic ${Buffer.from(`${identity.clientId}:${identity.clientSecret}`).toString('base64')}`,
    );
    const tokenForm = Object.fromEntries(new URLSearchParams(tokenRequest.body));
    expect(tokenForm).toMatchObject({
      code: oauth.authorizationCode,
      grant_type: 'authorization_code',
      redirect_uri: 'https://ringcentral.github.io/ringcentral-embeddable/redirect.html',
    });
    const persisted = await UserModel.findByPk(identity.oauthUserId);
    expect(persisted).not.toBeNull();
    expect(persisted.toJSON()).toMatchObject({
      id: identity.oauthUserId,
      platform: identity.platform,
      hostname: provider.loginHostname,
      accessToken: oauth.accessToken,
      refreshToken: oauth.refreshToken,
      hashedRcExtensionId: identity.hashedExtensionId,
      platformAdditionalInfo: {
        email: oauth.currentUserResponse.email,
        name: oauth.currentUserResponse.name,
        subsidiaryId: oauth.currentUserResponse.subsidiary,
        oneWorldEnabled: true,
      },
    });
    expect(persisted.tokenExpiry).toBeInstanceOf(Date);
    expect(rcScope.isDone()).toBe(true);
    expect(currentUserScope.isDone()).toBe(true);
    expect(oneWorldScope.isDone()).toBe(true);
    expect(permissionsScope.isDone()).toBe(true);
    expect(nock.pendingMocks()).toEqual([]);
  });
});

export {};
