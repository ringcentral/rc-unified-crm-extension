const nock = require('nock');
const { UserModel } = require('@app-connect/core/models/userModel');
const { MessageLogModel } = require('@app-connect/core/models/messageLogModel');
const {
  startServer,
  stopServer,
  cleanE2EData,
  generateJwt,
} = require('./support/serverHarness');
const {
  insightlyCoverageCase,
  buildMessageLogRequest,
} = require('./support/insightlyCoverageCases');

describe('Insightly remaining App-level coverage', () => {
  const { identity, provider, contacts, messaging } = insightlyCoverageCase;
  const previousApiVersion = process.env.INSIGHTLY_API_VERSION;
  let server;
  let client;
  let jwtToken;

  async function cleanData() {
    await MessageLogModel.destroy({ where: { userId: identity.userId } });
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
      accessToken: identity.apiKey,
      refreshToken: '',
      tokenExpiry: null,
      timezoneOffset: '+00:00',
      platformAdditionalInfo: { apiUrl: provider.apiBaseUrl },
      userSettings: {},
      hashedRcExtensionId: identity.hashedExtensionId,
    });
    jwtToken = generateJwt({
      id: identity.userId,
      platform: identity.platform,
      rcUserNumber: identity.rcUserNumber,
    });
  }

  function mockSearch(testCase) {
    const baseScope = () => nock(provider.apiBaseUrl)
      .matchHeader('authorization', provider.expectedAuthorization);
    const query = fieldName => ({
      field_name: fieldName,
      field_value: testCase.significantPhone,
      brief: 'false',
    });
    return [
      baseScope()
        .get(`/${provider.apiVersion}/contacts/search`)
        .query(query('PHONE'))
        .reply(200, testCase.searchResponses.contactPhone),
      baseScope()
        .get(`/${provider.apiVersion}/contacts/search`)
        .query(query('PHONE_MOBILE'))
        .reply(200, testCase.searchResponses.contactMobile),
      baseScope()
        .get(`/${provider.apiVersion}/leads/search`)
        .query(query('PHONE'))
        .reply(200, testCase.searchResponses.leadPhone),
      baseScope()
        .get(`/${provider.apiVersion}/leads/search`)
        .query(query('MOBILE'))
        .reply(200, testCase.searchResponses.leadMobile),
    ];
  }

  async function findContact(phoneNumber) {
    return client.get('/contact', {
      params: {
        jwtToken,
        phoneNumber,
        overridingFormat: '',
        isExtension: 'false',
      },
    });
  }

  function appConfig() {
    return {
      params: { jwtToken },
      headers: {
        'rc-account-id': identity.rcAccountId,
        'rc-extension-id': identity.hashedExtensionId,
      },
    };
  }

  beforeAll(async () => {
    process.env.INSIGHTLY_API_VERSION = provider.apiVersion;
    nock.disableNetConnect();
    nock.enableNetConnect('127.0.0.1');
    await MessageLogModel.sync();
    ({ server, client } = await startServer());
  });

  afterAll(async () => {
    try {
      await cleanData();
    } finally {
      try {
        await stopServer(server);
      } finally {
        if (previousApiVersion === undefined) {
          delete process.env.INSIGHTLY_API_VERSION;
        } else {
          process.env.INSIGHTLY_API_VERSION = previousApiVersion;
        }
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
    const unmatchedScopes = mockSearch(contacts.unmatched);
    const unmatchedResponse = await findContact(contacts.unmatched.phoneNumber);
    expect(unmatchedResponse.status).toBe(200);
    expect(unmatchedResponse.data).toMatchObject(contacts.unmatched.expectedResponse);
    expect(unmatchedScopes.every(scope => scope.isDone())).toBe(true);

    const multipleScopes = mockSearch(contacts.multipleMatches);
    const multipleResponse = await findContact(contacts.multipleMatches.phoneNumber);
    expect(multipleResponse.status).toBe(200);
    expect(multipleResponse.data).toEqual({
      successful: true,
      contact: contacts.multipleMatches.expectedContacts,
    });
    expect(multipleScopes.every(scope => scope.isDone())).toBe(true);
    expect(nock.pendingMocks()).toEqual([]);
  });

  test('creates a contact through the real connector', async () => {
    let crmRequestBody;
    const createScope = nock(provider.apiBaseUrl)
      .matchHeader('authorization', provider.expectedAuthorization)
      .post(`/${provider.apiVersion}/contacts`, body => {
        crmRequestBody = body;
        return true;
      })
      .reply(201, {
        CONTACT_ID: contacts.create.contactId,
        FIRST_NAME: 'Mary',
        LAST_NAME: 'Jackson',
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
        message: 'Contact created.',
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

  test('creates and updates an SMS event through the real connector', async () => {
    const userInfoScope = nock(provider.apiBaseUrl)
      .matchHeader('authorization', provider.expectedAuthorization)
      .get(`/${provider.apiVersion}/users/me`)
      .reply(200, messaging.crmUserResponse);
    let createdEventBody;
    const createEventScope = nock(provider.apiBaseUrl)
      .matchHeader('authorization', provider.expectedAuthorization)
      .post(`/${provider.apiVersion}/events`, body => {
        createdEventBody = body;
        return true;
      })
      .reply(201, { EVENT_ID: messaging.conversation.eventId });
    const linkScope = nock(provider.apiBaseUrl)
      .matchHeader('authorization', provider.expectedAuthorization)
      .post(`/${provider.apiVersion}/events/${messaging.conversation.eventId}/links`, {
        LINK_OBJECT_NAME: 'contact',
        LINK_OBJECT_ID: messaging.conversation.contactId,
      })
      .reply(201, {});

    const createResponse = await client.post(
      '/messageLog',
      buildMessageLogRequest([messaging.inbound]),
      appConfig(),
    );

    expect(createResponse.status).toBe(200);
    expect(createResponse.data).toMatchObject({
      successful: true,
      logIds: [String(messaging.inbound.id)],
      returnMessage: { message: 'Message logged', messageType: 'success' },
    });
    expect(createdEventBody.TITLE).toContain(messaging.conversation.contactName);
    expect(createdEventBody.DETAILS).toContain(messaging.inbound.subject);
    expect(createdEventBody.DETAILS).toContain('Conversation(1 messages)');
    expect(userInfoScope.isDone()).toBe(true);
    expect(createEventScope.isDone()).toBe(true);
    expect(linkScope.isDone()).toBe(true);

    const persistedCreate = await MessageLogModel.findByPk(String(messaging.inbound.id));
    expect(persistedCreate).toMatchObject({
      platform: identity.platform,
      conversationId: messaging.conversation.id,
      conversationLogId: messaging.conversation.logId,
      thirdPartyLogId: String(messaging.conversation.eventId),
      userId: identity.userId,
    });

    const getEventScope = nock(provider.apiBaseUrl)
      .matchHeader('authorization', provider.expectedAuthorization)
      .get(`/${provider.apiVersion}/events/${messaging.conversation.eventId}`)
      .reply(200, {
        EVENT_ID: messaging.conversation.eventId,
        DETAILS: createdEventBody.DETAILS,
      });
    const updateUserInfoScope = nock(provider.apiBaseUrl)
      .matchHeader('authorization', provider.expectedAuthorization)
      .get(`/${provider.apiVersion}/users/me`)
      .reply(200, messaging.crmUserResponse);
    let updatedEventBody;
    const updateEventScope = nock(provider.apiBaseUrl)
      .matchHeader('authorization', provider.expectedAuthorization)
      .put(`/${provider.apiVersion}/events`, body => {
        updatedEventBody = body;
        return true;
      })
      .reply(200, { EVENT_ID: messaging.conversation.eventId });

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
    expect(updatedEventBody).toMatchObject({
      EVENT_ID: String(messaging.conversation.eventId),
    });
    expect(updatedEventBody.DETAILS).toContain(messaging.inbound.subject);
    expect(updatedEventBody.DETAILS).toContain(messaging.outbound.subject);
    expect(updatedEventBody.DETAILS).toContain('Conversation(2 messages)');
    expect(getEventScope.isDone()).toBe(true);
    expect(updateUserInfoScope.isDone()).toBe(true);
    expect(updateEventScope.isDone()).toBe(true);

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
});

export {};
