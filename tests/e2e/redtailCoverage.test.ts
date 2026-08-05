const nock = require('nock');
const jwt = require('@app-connect/core/lib/jwt');
const { UserModel } = require('@app-connect/core/models/userModel');
const { MessageLogModel } = require('@app-connect/core/models/messageLogModel');
const { AdminConfigModel } = require('@app-connect/core/models/adminConfigModel');
const { AccountDataModel } = require('@app-connect/core/models/accountDataModel');
const { getHashValue } = require('@app-connect/core/lib/util');
const {
  startServer,
  stopServer,
  cleanE2EData,
  generateJwt,
} = require('./support/serverHarness');
const {
  redtailCoverageCases,
  buildRedtailMessageLogRequest,
} = require('./support/redtailCoverageCases');

describe('Redtail connector App-level E2E coverage', () => {
  const {
    identity,
    provider,
    categories,
    contacts,
    messageContact,
    conversation,
    messages,
    userMapping,
    authentication,
  } = redtailCoverageCases;
  const hashedRcAccountId = getHashValue(
    identity.rcAccountId,
    process.env.HASH_KEY,
  );
  const environmentKeys = ['REDTAIL_API_KEY', 'REDTAIL_API_SERVER'];
  const previousEnvironment = Object.fromEntries(
    environmentKeys.map(key => [key, process.env[key]]),
  );

  let server;
  let client;
  let jwtToken;

  function requestConfig() {
    return {
      params: { jwtToken },
      headers: provider.requestHeaders,
    };
  }

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
      accessToken: provider.userKey,
      refreshToken: '',
      tokenExpiry: null,
      timezoneOffset: '+00:00',
      platformAdditionalInfo: {
        userResponse: {
          id: provider.authenticatedUserId,
          user_key: provider.userKey,
        },
      },
      userSettings: {
        redtailCustomTimezone: { value: '0' },
      },
      hashedRcExtensionId: identity.hashedExtensionId,
    });
    jwtToken = generateJwt({
      id: identity.userId,
      platform: identity.platform,
      rcUserNumber: identity.rcUserNumber,
    });
  }

  function mockCategories() {
    return nock(provider.apiBaseUrl)
      .matchHeader('authorization', provider.establishedAuthorization)
      .get('/lists/categories')
      .reply(200, { categories });
  }

  function mockContactSearch(phoneNumber, crmResponse) {
    return nock(provider.apiBaseUrl)
      .matchHeader('authorization', provider.establishedAuthorization)
      .get('/contacts/search_basic')
      .query({ phone_number: phoneNumber.replace('+1', '') })
      .reply(200, crmResponse);
  }

  function expectNoPendingExternalRequests(scopes) {
    for (const scope of scopes) {
      expect(scope.isDone()).toBe(true);
    }
    expect(nock.pendingMocks()).toEqual([]);
  }

  beforeAll(async () => {
    process.env.REDTAIL_API_KEY = provider.apiKey;
    process.env.REDTAIL_API_SERVER = provider.apiBaseUrl;
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

  test('returns Redtail create-contact data when no CRM contact matches and exposes appointments as N/A', async () => {
    const interfaces = await client.get('/implementedInterfaces', {
      params: { platform: identity.platform },
    });
    expect(interfaces.status).toBe(200);
    expect(interfaces.data).toMatchObject({
      findContact: true,
      createContact: true,
      createMessageLog: true,
      updateMessageLog: true,
      getUserList: true,
      listAppointments: false,
      createAppointment: false,
      updateAppointment: false,
      refreshAppointment: false,
      confirmAppointment: false,
      cancelAppointment: false,
    });

    const scopes = [
      mockContactSearch(contacts.unmatched.phoneNumber, { contacts: [] }),
      mockCategories(),
    ];
    const response = await client.get('/contact', {
      ...requestConfig(),
      params: {
        jwtToken,
        phoneNumber: contacts.unmatched.phoneNumber,
        isExtension: 'false',
      },
    });

    expect(response.status).toBe(200);
    expect(response.data).toMatchObject({
      successful: true,
      returnMessage: {
        message: 'Contact not found',
        messageType: 'warning',
      },
      contact: [{
        id: 'createNewContact',
        name: 'Create new contact...',
        isNewContact: true,
        additionalInfo: {
          category: [
            { const: 1, title: 'Client' },
            { const: 2, title: 'Prospect' },
          ],
        },
      }],
    });
    expectNoPendingExternalRequests(scopes);
  });

  test('returns every Redtail contact when multiple CRM records match', async () => {
    const scenario = contacts.multiple;
    const scopes = [
      mockContactSearch(scenario.phoneNumber, scenario.crmResponse),
      mockCategories(),
    ];

    const response = await client.get('/contact', {
      ...requestConfig(),
      params: {
        jwtToken,
        phoneNumber: scenario.phoneNumber,
        isExtension: 'false',
      },
    });

    expect(response.status).toBe(200);
    expect(response.data.successful).toBe(true);
    const matchedContacts = response.data.contact.filter(item => !item.isNewContact);
    expect(matchedContacts).toHaveLength(2);
    expect(matchedContacts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 97521,
        name: 'Dana A Client',
        phone: scenario.phoneNumber,
        title: 'Business Owner',
        type: 'contact',
      }),
      expect.objectContaining({
        id: 97522,
        name: 'Dana Prospect',
        phone: scenario.phoneNumber,
        title: 'Controller',
        type: 'contact',
      }),
    ]));
    expect(response.data.contact.at(-1)).toMatchObject({
      id: 'createNewContact',
      isNewContact: true,
    });

    const cachedContacts = await AccountDataModel.findOne({
      where: {
        rcAccountId: identity.rcAccountId,
        platformName: identity.platform,
        dataKey: `contact-${scenario.phoneNumber}`,
      },
    });
    expect(cachedContacts.data).toHaveLength(3);
    expectNoPendingExternalRequests(scopes);
  });

  test('creates a Redtail individual through the root contact endpoint', async () => {
    const scenario = contacts.create;
    let crmRequestBody;
    const createScope = nock(provider.apiBaseUrl)
      .matchHeader('authorization', provider.establishedAuthorization)
      .post('/contacts', body => {
        crmRequestBody = body;
        return true;
      })
      .reply(201, scenario.crmResponse);

    const response = await client.post(
      '/contact',
      scenario.appRequestBody,
      requestConfig(),
    );

    expect(response.status).toBe(200);
    expect(response.data).toMatchObject({
      successful: true,
      contact: {
        id: scenario.crmId,
        name: scenario.appRequestBody.newContactName,
      },
      returnMessage: {
        message: 'Contact created.',
        messageType: 'success',
      },
    });
    expect(crmRequestBody).toEqual(scenario.expectedCrmRequestBody);
    expectNoPendingExternalRequests([createScope]);
  });

  test('creates and updates one Redtail activity from normal RingCentral SMS records', async () => {
    let createdActivityBody;
    const createActivityScope = nock(provider.apiBaseUrl)
      .matchHeader('authorization', provider.establishedAuthorization)
      .post('/activities', body => {
        createdActivityBody = body;
        return true;
      })
      .reply(201, { activity: { id: conversation.activityId } });
    const completeActivityScope = nock(provider.apiBaseUrl)
      .matchHeader('authorization', provider.establishedAuthorization)
      .put(`/activities/${conversation.activityId}`, { completed: true })
      .reply(200, { activity: { id: conversation.activityId } });

    const createResponse = await client.post(
      '/messageLog',
      buildRedtailMessageLogRequest([messages.inbound]),
      requestConfig(),
    );

    expect(createResponse.status).toBe(200);
    expect(createResponse.data).toMatchObject({
      successful: true,
      logIds: [messages.inbound.id],
      returnMessage: {
        message: 'Message logged',
        messageType: 'success',
      },
    });
    expect(createdActivityBody).toMatchObject({
      subject: `SMS conversation with ${messageContact.name} - 26/07/14`,
      start_date: messages.inbound.creationTime,
      end_date: messages.inbound.creationTime,
      activity_code_id: 3,
      repeats: 'never',
      linked_contacts: [{ contact_id: messageContact.id }],
    });
    expect(createdActivityBody.description).toContain('Conversation(1 messages)');
    expect(createdActivityBody.description).toContain(messages.inbound.subject);
    expectNoPendingExternalRequests([createActivityScope, completeActivityScope]);

    const persistedCreate = await MessageLogModel.findByPk(messages.inbound.id);
    expect(persistedCreate).toMatchObject({
      id: messages.inbound.id,
      platform: identity.platform,
      conversationId: conversation.id,
      conversationLogId: conversation.logId,
      thirdPartyLogId: String(conversation.activityId),
      userId: identity.userId,
    });

    const getActivityScope = nock(provider.apiBaseUrl)
      .matchHeader('authorization', provider.establishedAuthorization)
      .matchHeader('include', 'linked_contacts')
      .get(`/activities/${conversation.activityId}`)
      .reply(200, {
        activity: {
          id: conversation.activityId,
          description: createdActivityBody.description,
          linked_contacts: [{
            contact_id: messageContact.id,
            first_name: 'Dana',
            last_name: 'Client',
          }],
        },
      });
    let updatedActivityBody;
    const updateActivityScope = nock(provider.apiBaseUrl)
      .matchHeader('authorization', provider.establishedAuthorization)
      .patch(`/activities/${conversation.activityId}`, body => {
        updatedActivityBody = body;
        return true;
      })
      .reply(200, { activity: { id: conversation.activityId } });

    const updateResponse = await client.post(
      '/messageLog',
      buildRedtailMessageLogRequest([messages.outbound, messages.inbound]),
      requestConfig(),
    );

    expect(updateResponse.status).toBe(200);
    expect(updatedActivityBody).toMatchObject({
      end_date: messages.outbound.creationTime,
    });
    expect(updatedActivityBody.description).toContain('Conversation(2 messages)');
    expect(updatedActivityBody.description).toContain(messages.inbound.subject);
    expect(updatedActivityBody.description).toContain(messages.outbound.subject);
    expectNoPendingExternalRequests([getActivityScope, updateActivityScope]);

    // The App-level contract requires the successfully patched message to be persisted
    // and returned. This assertion intentionally exposes a connector result-envelope bug
    // if updateMessageLog performs the PATCH but returns no result object.
    expect(updateResponse.data).toMatchObject({
      successful: true,
      logIds: [messages.outbound.id],
    });
    const persistedLogs = await MessageLogModel.findAll({
      where: { userId: identity.userId, conversationLogId: conversation.logId },
    });
    expect(persistedLogs).toHaveLength(2);
    expect(persistedLogs.map(log => log.thirdPartyLogId)).toEqual([
      String(conversation.activityId),
      String(conversation.activityId),
    ]);
  });

  test('reads Redtail users and reinitializes persisted RingCentral user mappings', async () => {
    await AdminConfigModel.create({
      id: hashedRcAccountId,
      userMappings: userMapping.initialPersistedMappings,
    });
    const ringCentralScope = nock('https://platform.ringcentral.com')
      .matchHeader('authorization', `Bearer ${identity.rcAccessToken}`)
      .get('/restapi/v1.0/account/~/extension/~')
      .times(2)
      .reply(200, {
        id: identity.rcExtensionId,
        account: { id: identity.rcAccountId },
        permissions: { admin: { enabled: true } },
      });
    const redtailUsersScope = nock(provider.apiBaseUrl)
      .matchHeader('authorization', provider.establishedAuthorization)
      .get('/lists/database_users')
      .times(2)
      .reply(200, userMapping.crmResponse);

    const initialRead = await client.post(
      '/admin/userMapping',
      userMapping.appRequestBody,
      requestConfig(),
    );
    expect(initialRead.status).toBe(200);
    expect(initialRead.data).toEqual(userMapping.expectedInitialRead);

    const reinitializeResponse = await client.post(
      '/admin/reinitializeUserMapping',
      userMapping.appRequestBody,
      requestConfig(),
    );
    expect(reinitializeResponse.status).toBe(200);
    expect(reinitializeResponse.data).toEqual(
      userMapping.expectedReinitializedRead,
    );

    const persistedConfig = await AdminConfigModel.findByPk(hashedRcAccountId);
    expect(persistedConfig.userMappings).toEqual(
      userMapping.expectedPersistedMappings,
    );
    expectNoPendingExternalRequests([ringCentralScope, redtailUsersScope]);
  });

  test('completes the real Redtail API-key login and persists a password-free user session', async () => {
    await cleanData();
    const authenticationScope = nock(provider.apiBaseUrl)
      .matchHeader('authorization', provider.loginAuthorization)
      .get('/authentication')
      .reply(200, authentication.crmResponse);

    const response = await client.post(
      '/apiKeyLogin',
      authentication.appRequestBody,
      {
        headers: {
          'rc-extension-id': identity.hashedExtensionId,
        },
      },
    );

    expect(response.status).toBe(200);
    expect(response.data).toMatchObject({
      name: identity.username,
      returnMessage: {
        messageType: 'success',
        message: 'Connected to Redtail.',
      },
    });
    expect(response.data.jwtToken).toEqual(expect.any(String));
    expect(jwt.decodeJwt(response.data.jwtToken)).toMatchObject({
      id: identity.userId,
      platform: identity.platform,
    });

    const persistedUser = await UserModel.findByPk(identity.userId);
    expect(persistedUser).not.toBeNull();
    const persistedData = persistedUser.toJSON();
    expect(persistedData).toMatchObject({
      id: identity.userId,
      platform: identity.platform,
      hostname: provider.hostname,
      accessToken: provider.userKey,
      hashedRcExtensionId: identity.hashedExtensionId,
      timezoneName: '',
      platformAdditionalInfo: {
        username: identity.username,
        userResponse: authentication.crmResponse.authenticated_user,
      },
      userSettings: {},
    });
    expect(JSON.stringify(persistedData)).not.toContain(identity.password);
    expect(authenticationScope.isDone()).toBe(true);
    expect(nock.pendingMocks()).toEqual([]);
  });
});

export {};
