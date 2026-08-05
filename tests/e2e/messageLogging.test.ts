const nock = require('nock');
const {
  startServer,
  stopServer,
  cleanE2EData,
  generateJwt,
} = require('./support/serverHarness');
const { UserModel } = require('@app-connect/core/models/userModel');
const { MessageLogModel } = require('@app-connect/core/models/messageLogModel');
const {
  pipedriveMessageLoggingCase,
  buildPipedriveMessageLogRequest,
} = require('./support/messageLoggingCases');

describe('Pipedrive message logging App-level E2E', () => {
  const {
    user,
    contact,
    provider,
    conversation,
    messages,
    expectedCreateActivity,
  } = pipedriveMessageLoggingCase;

  let server;
  let client;
  let jwtToken;

  async function cleanData() {
    await MessageLogModel.destroy({ where: { userId: user.id } });
    await cleanE2EData({ userIds: [user.id], rcAccountIds: [user.rcAccountId] });
  }

  async function seedUser() {
    await UserModel.create({
      id: user.id,
      platform: user.platform,
      hostname: provider.hostname,
      rcAccountId: user.rcAccountId,
      rcUserNumber: user.rcUserNumber,
      accessToken: user.accessToken,
      refreshToken: user.refreshToken,
      tokenExpiry: new Date(Date.now() + 60 * 60 * 1000),
      timezoneOffset: user.timezoneOffset,
      platformAdditionalInfo: {},
      userSettings: {},
      hashedRcExtensionId: user.hashedExtensionId,
    });
    jwtToken = generateJwt({
      id: user.id,
      platform: user.platform,
      rcUserNumber: user.rcUserNumber,
    });
  }

  beforeAll(async () => {
    await MessageLogModel.sync();
    ({ server, client } = await startServer());
  });

  afterAll(async () => {
    try {
      await cleanData();
    } finally {
      await stopServer(server);
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

  test('creates a CRM activity and appends the next RingCentral message to the same activity', async () => {
    const userInfoScope = nock(provider.baseUrl)
      .matchHeader('authorization', provider.authorization)
      .get('/v1/users/me')
      .reply(200, { data: { name: user.agentName } }, provider.rateLimitHeaders);
    const personScope = nock(provider.baseUrl)
      .matchHeader('authorization', provider.authorization)
      .get(`/api/v2/persons/${contact.id}`)
      .reply(200, {
        data: { id: contact.id, org_id: contact.organizationId },
      }, provider.rateLimitHeaders);
    const activityTypesScope = nock(provider.baseUrl)
      .matchHeader('authorization', provider.authorization)
      .get('/v1/activityTypes')
      .reply(200, {
        data: [{ name: 'SMS', key_string: 'sms', active_flag: true }],
      }, provider.rateLimitHeaders);

    let createdActivityBody;
    const createActivityScope = nock(provider.baseUrl)
      .matchHeader('authorization', provider.authorization)
      .post('/api/v2/activities', body => {
        createdActivityBody = body;
        return true;
      })
      .reply(201, { data: { id: provider.activityId } }, provider.rateLimitHeaders);

    const createResponse = await client.post(
      '/messageLog',
      buildPipedriveMessageLogRequest([messages.inbound]),
      {
        params: { jwtToken },
        headers: {
          'rc-account-id': user.rcAccountId,
          'rc-extension-id': user.hashedExtensionId,
        },
      },
    );

    expect(createResponse.status).toBe(200);
    expect(createResponse.data).toMatchObject({
      successful: true,
      logIds: [String(messages.inbound.id)],
      returnMessage: {
        message: 'Message logged',
        messageType: 'success',
      },
    });
    expect(createdActivityBody).toMatchObject(expectedCreateActivity);
    expect(createdActivityBody.note).toContain('Conversation(1 messages)');
    expect(createdActivityBody.note).toContain(`${contact.name} (${contact.phoneNumber})`);
    expect(createdActivityBody.note).toContain(messages.inbound.subject);
    expect(userInfoScope.isDone()).toBe(true);
    expect(personScope.isDone()).toBe(true);
    expect(activityTypesScope.isDone()).toBe(true);
    expect(createActivityScope.isDone()).toBe(true);

    const persistedCreate = await MessageLogModel.findByPk(String(messages.inbound.id));
    expect(persistedCreate).toMatchObject({
      id: String(messages.inbound.id),
      platform: user.platform,
      conversationId: conversation.id,
      conversationLogId: conversation.logId,
      thirdPartyLogId: String(provider.activityId),
      userId: user.id,
    });

    const updateUserInfoScope = nock(provider.globalBaseUrl)
      .matchHeader('authorization', provider.authorization)
      .get('/v1/users/me')
      .reply(200, { data: { name: user.agentName } }, provider.rateLimitHeaders);
    const getActivityScope = nock(provider.baseUrl)
      .matchHeader('authorization', provider.authorization)
      .get(`/api/v2/activities/${provider.activityId}`)
      .reply(200, {
        data: { id: provider.activityId, note: createdActivityBody.note },
      }, provider.rateLimitHeaders);

    let updatedActivityBody;
    const updateActivityScope = nock(provider.baseUrl)
      .matchHeader('authorization', provider.authorization)
      .patch(`/api/v2/activities/${provider.activityId}`, body => {
        updatedActivityBody = body;
        return true;
      })
      .reply(200, { data: { id: provider.activityId } }, provider.rateLimitHeaders);

    // Message Store conversations are newest-first; the existing inbound message must be
    // skipped while the new outbound message is appended to the existing CRM activity.
    const updateResponse = await client.post(
      '/messageLog',
      buildPipedriveMessageLogRequest([messages.outbound, messages.inbound]),
      {
        params: { jwtToken },
        headers: {
          'rc-account-id': user.rcAccountId,
          'rc-extension-id': user.hashedExtensionId,
        },
      },
    );

    expect(updateResponse.status).toBe(200);
    expect(updateResponse.data).toMatchObject({
      successful: true,
      logIds: [messages.outbound.id],
    });
    expect(updatedActivityBody).toMatchObject({
      deal_id: provider.dealId,
    });
    expect(updatedActivityBody.note).toContain('Conversation(2 messages)');
    expect(updatedActivityBody.note).toContain(messages.inbound.subject);
    expect(updatedActivityBody.note).toContain(messages.outbound.subject);
    expect(updatedActivityBody.note).toContain(`${user.agentName} 03:05 AM`);
    expect(updateUserInfoScope.isDone()).toBe(true);
    expect(getActivityScope.isDone()).toBe(true);
    expect(updateActivityScope.isDone()).toBe(true);

    const persistedLogs = await MessageLogModel.findAll({
      where: { userId: user.id, conversationLogId: conversation.logId },
      order: [['id', 'ASC']],
    });
    expect(persistedLogs).toHaveLength(2);
    expect(persistedLogs.map(log => log.toJSON())).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: String(messages.inbound.id),
        thirdPartyLogId: String(provider.activityId),
        conversationId: conversation.id,
      }),
      expect.objectContaining({
        id: messages.outbound.id,
        thirdPartyLogId: String(provider.activityId),
        conversationId: conversation.id,
      }),
    ]));
    expect(nock.pendingMocks()).toEqual([]);
  });
});

export {};
