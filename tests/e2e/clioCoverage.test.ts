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
  clioCoverageCase,
  buildMessageRequest,
} = require('./support/clioCoverageCases');

describe('Clio expanded App-level E2E', () => {
  const {
    identity,
    provider,
    contacts,
    message,
    userMapping,
    oauth,
  } = clioCoverageCase;
  const requestHeaders = {
    'X-RC-Access-Token': identity.rcAccessToken,
    'rc-account-id': identity.hashedAccountId,
    'rc-extension-id': identity.hashedExtensionId,
  };
  const hashedRcAccountId = getHashValue(identity.rcAccountId, process.env.HASH_KEY);
  const environmentKeys = ['CLIO_CLIENT_ID', 'CLIO_CLIENT_SECRET'];
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
      if (request.method !== 'POST' || request.url !== '/oauth/token') {
        response.writeHead(404).end();
        return;
      }
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
      timezoneName: 'UTC',
      timezoneOffset: '0',
      platformAdditionalInfo: {},
      userSettings: {
        clioSeeClosedMatters: { value: false },
        clioTimeEntriesEnabled: { value: false },
        smsTimeTrackingEnabled: { value: false },
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

  function matchesPhoneQuery(query, phoneNumber) {
    const receivedPhone = query.query;
    return (
      query.fields === 'type,id,name,created_at,updated_at'
      && (
        receivedPhone === phoneNumber
        || receivedPhone === phoneNumber.replace(/^\+/, ' ')
      )
    );
  }

  function mockContactSearch(testCase) {
    return nock(provider.baseUrl)
      .matchHeader('authorization', provider.authorization)
      .get('/api/v4/contacts.json')
      .query(query => matchesPhoneQuery(query, testCase.phoneNumber))
      .reply(200, testCase.crmResponse, provider.rateLimitHeaders);
  }

  function mockRingCentralAdmin(times = 1) {
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
    process.env.CLIO_CLIENT_ID = identity.clientId;
    process.env.CLIO_CLIENT_SECRET = identity.clientSecret;
    await MessageLogModel.sync();
    await AdminConfigModel.sync();
    await CacheModel.sync();
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

  test('returns an unmatched contact from the real Clio contact search', async () => {
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
    expect(nock.pendingMocks()).toEqual([]);
  });

  test('maps and caches multiple Clio contacts with their matters', async () => {
    const contactScope = mockContactSearch(contacts.multiple);
    const enrichmentScopes = contacts.multiple.enrichments.flatMap(enrichment => [
      nock(provider.baseUrl)
        .matchHeader('authorization', provider.authorization)
        .get('/api/v4/matters.json')
        .query({
          client_id: String(enrichment.contactId),
          fields: 'id,display_number,description,status',
        })
        .reply(200, enrichment.mattersResponse, provider.rateLimitHeaders),
      nock(provider.baseUrl)
        .matchHeader('authorization', provider.authorization)
        .get('/api/v4/relationships.json')
        .query({
          contact_id: String(enrichment.contactId),
          fields: 'matter{id,display_number,description,status}',
        })
        .reply(200, enrichment.relationshipsResponse, provider.rateLimitHeaders),
    ]);

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
    expect(contactScope.isDone()).toBe(true);
    expect(enrichmentScopes.every(scope => scope.isDone())).toBe(true);
    expect(nock.pendingMocks()).toEqual([]);
  });

  test('creates a Clio contact through the root contact route', async () => {
    let crmBody;
    const scope = nock(provider.baseUrl)
      .matchHeader('authorization', provider.authorization)
      .post('/api/v4/contacts.json', body => {
        crmBody = body;
        return true;
      })
      .reply(201, {
        data: {
          id: contacts.create.contactId,
          name: contacts.create.name,
        },
      }, provider.rateLimitHeaders);

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
    expect(crmBody).toEqual(contacts.create.expectedCrmBody);
    expect(scope.isDone()).toBe(true);
    expect(nock.pendingMocks()).toEqual([]);
  });

  test('creates and updates a normal RingCentral SMS in Clio and persists both messages', async () => {
    const createUserScope = nock(provider.baseUrl)
      .matchHeader('authorization', provider.authorization)
      .get('/api/v4/users/who_am_i.json')
      .query({ fields: 'name' })
      .reply(200, { data: { name: message.agentName } });
    let createdBody;
    const createCommunicationScope = nock(provider.baseUrl)
      .matchHeader('authorization', provider.authorization)
      .post('/api/v4/communications.json', body => {
        createdBody = body;
        return true;
      })
      .reply(201, {
        data: { id: message.providerLogId },
      }, provider.rateLimitHeaders);

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
    expect(createdBody.data).toMatchObject({
      subject: `SMS conversation with ${message.contact.name} - 07/14/2026`,
      type: 'PhoneCommunication',
      received_at: message.inbound.creationTime,
      senders: [{ id: message.contact.id, type: 'Contact' }],
      receivers: [{ id: '71101', type: 'User' }],
      notification_event_subscribers: [{ user_id: '71101' }],
      matter: { id: message.matterId },
    });
    expect(createdBody.data.body).toContain('Conversation(1 messages)');
    expect(createdBody.data.body).toContain(message.inbound.subject);
    expect(createdBody.data.body).toContain(message.contact.phoneNumber);
    expect(createUserScope.isDone()).toBe(true);
    expect(createCommunicationScope.isDone()).toBe(true);

    const getCommunicationScope = nock(provider.baseUrl)
      .matchHeader('authorization', provider.authorization)
      .get(`/api/v4/communications/${message.providerLogId}.json`)
      .query({ fields: 'body' })
      .reply(200, { data: { body: createdBody.data.body } });
    const updateUserScope = nock(provider.baseUrl)
      .matchHeader('authorization', provider.authorization)
      .get('/api/v4/users/who_am_i.json')
      .query({ fields: 'name' })
      .reply(200, { data: { name: message.agentName } });
    let updatedBody;
    const updateCommunicationScope = nock(provider.baseUrl)
      .matchHeader('authorization', provider.authorization)
      .patch(`/api/v4/communications/${message.providerLogId}.json`, body => {
        updatedBody = body;
        return true;
      })
      .reply(200, {
        data: { id: message.providerLogId },
      }, provider.rateLimitHeaders);

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
    expect(updatedBody.data.body).toContain('Conversation(2 messages)');
    expect(updatedBody.data.body).toContain(message.inbound.subject);
    expect(updatedBody.data.body).toContain(message.outbound.subject);
    expect(getCommunicationScope.isDone()).toBe(true);
    expect(updateUserScope.isDone()).toBe(true);
    expect(updateCommunicationScope.isDone()).toBe(true);

    const persisted = await MessageLogModel.findAll({
      where: {
        userId: identity.userId,
        conversationLogId: message.conversationLogId,
      },
      order: [['id', 'ASC']],
    });
    expect(persisted).toHaveLength(2);
    expect(persisted.map(log => log.toJSON())).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: String(message.inbound.id),
        thirdPartyLogId: String(message.providerLogId),
      }),
      expect.objectContaining({
        id: message.outbound.id,
        thirdPartyLogId: String(message.providerLogId),
      }),
    ]));
    expect(nock.pendingMocks()).toEqual([]);
  });

  test('reinitializes user mapping through the real Clio user-list request', async () => {
    const rcScope = mockRingCentralAdmin();
    const usersScope = nock(provider.baseUrl)
      .matchHeader('authorization', provider.authorization)
      .get('/api/v4/users.json')
      .query({
        enabled: 'true',
        order: 'name(asc)',
        fields: 'id,name,email',
      })
      .reply(200, userMapping.crmResponse);

    const response = await client.post(
      '/admin/reinitializeUserMapping',
      userMapping.requestBody,
      jwtConfig(),
    );

    expect(response.status).toBe(200);
    expect(response.data).toEqual(userMapping.expectedResponse);
    const persisted = await AdminConfigModel.findByPk(hashedRcAccountId);
    expect(persisted).not.toBeNull();
    expect(persisted.userMappings).toEqual(userMapping.expectedPersistedMappings);
    expect(rcScope.isDone()).toBe(true);
    expect(usersScope.isDone()).toBe(true);
    expect(nock.pendingMocks()).toEqual([]);
  });

  test('completes managed Clio OAuth and persists the authenticated CRM user', async () => {
    const rcScope = mockRingCentralAdmin();
    const redirectUri = 'https://ringcentral.github.io/ringcentral-embeddable/redirect.html';
    const cacheResponse = await client.post('/admin/managedOAuth/cache', {
      values: {
        clientId: identity.clientId,
        clientSecret: identity.clientSecret,
        accessTokenUri: tokenApiUrl,
        authorizationUri: 'https://app.clio.com/oauth/authorize',
        redirectUri,
        scopes: [],
        hostname: provider.hostname,
      },
    }, { headers: requestHeaders });
    expect(cacheResponse.status).toBe(200);
    expect(cacheResponse.data).toEqual({ successful: true });
    expect(rcScope.isDone()).toBe(true);

    const userInfoScope = nock(provider.baseUrl)
      .matchHeader('authorization', `Bearer ${oauth.accessToken}`)
      .get('/api/v4/users/who_am_i.json')
      .query({ fields: 'id,name,time_zone' })
      .reply(200, oauth.crmUserResponse);
    const state = new URLSearchParams({
      platform: identity.platform,
      hostname: provider.hostname,
    }).toString();
    const callbackUri = `${redirectUri}?code=${oauth.authorizationCode}`
      + `&state=${encodeURIComponent(state)}`;

    const response = await client.get('/oauth-callback', {
      params: { callbackUri, rcAccountId: identity.rcAccountId },
      headers: { 'rc-extension-id': identity.hashedExtensionId },
    });

    expect(response.status).toBe(200);
    expect(response.data).toMatchObject({
      name: oauth.crmUserResponse.data.name,
      returnMessage: {
        message: 'Connected to Clio.',
        messageType: 'success',
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
    expect(Object.fromEntries(new URLSearchParams(tokenRequest.body))).toMatchObject({
      code: oauth.authorizationCode,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    });

    const persisted = await UserModel.findByPk(identity.oauthUserId);
    expect(persisted).not.toBeNull();
    expect(persisted.toJSON()).toMatchObject({
      id: identity.oauthUserId,
      platform: identity.platform,
      hostname: provider.hostname,
      timezoneName: 'UTC',
      timezoneOffset: '0',
      accessToken: oauth.accessToken,
      refreshToken: oauth.refreshToken,
      rcAccountId: identity.rcAccountId,
      hashedRcExtensionId: identity.hashedExtensionId,
    });
    expect(persisted.tokenExpiry).toBeInstanceOf(Date);
    expect(await CacheModel.findByPk(
      `${identity.rcAccountId}-managed-oauth-account`,
    )).toBeNull();
    expect(await AccountDataModel.findOne({
      where: {
        rcAccountId: identity.rcAccountId,
        platformName: identity.platform,
        dataKey: 'managed-oauth-account',
      },
    })).not.toBeNull();
    expect(userInfoScope.isDone()).toBe(true);
    expect(nock.pendingMocks()).toEqual([]);
  });
});

export {};
