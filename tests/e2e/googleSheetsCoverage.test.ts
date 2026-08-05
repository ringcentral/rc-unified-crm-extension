const {
  googleSheetsCoverageCase,
  buildMessageLogRequest,
  buildGoogleSheetsManagedOAuthValues,
  googleSheetsOAuthAdminResponse,
} = require('./support/googleSheetsCoverageCases');

const oauthEnvironment = { ...googleSheetsCoverageCase.oauthEnvironment };
const originalOAuthEnvironment = Object.fromEntries(
  Object.keys(oauthEnvironment).map(key => [key, process.env[key]]),
);
Object.assign(process.env, oauthEnvironment);

// The real connector reads OAuth configuration from the environment.
// Keep app loading below the test configuration and do not replace connector code.
const nock = require('nock');
const http = require('http');
const jwt = require('@app-connect/core/lib/jwt');
const { UserModel } = require('@app-connect/core/models/userModel');
const { MessageLogModel } = require('@app-connect/core/models/messageLogModel');
const { AccountDataModel } = require('@app-connect/core/models/accountDataModel');
const { CacheModel } = require('@app-connect/core/models/cacheModel');
const {
  startServer,
  stopServer,
  cleanE2EData,
  generateJwt,
} = require('./support/serverHarness');

describe('Google Sheets additional App-level coverage', () => {
  const { user, provider, scenarios } = googleSheetsCoverageCase;
  const requestHeaders = {
    'rc-account-id': user.hashedAccountId,
    'rc-extension-id': user.hashedExtensionId,
  };

  let server;
  let client;
  let jwtToken;
  let tokenApiServer;
  let tokenApiUrl;
  let tokenRequest;

  function restoreOAuthEnvironment() {
    for (const [key, value] of Object.entries(originalOAuthEnvironment)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }

  function mockSpreadsheetMetadata() {
    return nock(provider.sheetsApiUrl)
      .matchHeader('authorization', provider.authorization)
      .get(`/v4/spreadsheets/${provider.spreadsheetId}`)
      .reply(200, provider.metadataResponse);
  }

  function mockSheetRows(sheetName, rows) {
    return nock(provider.sheetsApiUrl)
      .matchHeader('authorization', provider.authorization)
      .get(`/v4/spreadsheets/${provider.spreadsheetId}/values/${encodeURIComponent(sheetName)}`)
      .reply(200, { values: rows });
  }

  function mockSheetHeaders(sheetName, headers) {
    return nock(provider.sheetsApiUrl)
      .matchHeader('authorization', provider.authorization)
      .get(`/v4/spreadsheets/${provider.spreadsheetId}/values/${encodeURIComponent(sheetName)}!1:1`)
      .reply(200, { values: [headers] });
  }

  async function cleanData() {
    await MessageLogModel.destroy({ where: { userId: user.id } });
    await CacheModel.destroy({
      where: { id: `${scenarios.oauth.rcAccountId}-managed-oauth-account` },
    });
    await cleanE2EData({
      userIds: [user.id, scenarios.oauth.userId],
      rcAccountIds: [user.rcAccountId, scenarios.oauth.rcAccountId],
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
      response.end(JSON.stringify(scenarios.oauth.tokenResponse));
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
      id: user.id,
      platform: user.platform,
      hostname: provider.hostname,
      rcAccountId: user.rcAccountId,
      rcUserNumber: user.rcUserNumber,
      accessToken: user.accessToken,
      refreshToken: user.refreshToken,
      tokenExpiry: new Date(Date.now() + 60 * 60 * 1000),
      timezoneOffset: '+00:00',
      platformAdditionalInfo: {
        email: 'google-sheets-coverage@example.test',
        name: user.agentName,
      },
      userSettings: {
        googleSheetsUrl: { value: provider.sheetUrl },
      },
      hashedRcExtensionId: user.hashedExtensionId,
    });
    jwtToken = generateJwt({
      id: user.id,
      platform: user.platform,
      rcUserNumber: user.rcUserNumber,
    });
  }

  function authConfig() {
    return {
      params: { jwtToken },
      headers: requestHeaders,
    };
  }

  async function findContact(phoneNumber) {
    return client.get('/contact', {
      ...authConfig(),
      params: {
        jwtToken,
        phoneNumber,
        isExtension: 'false',
      },
    });
  }

  async function findCachedContact(phoneNumber) {
    return AccountDataModel.findOne({
      where: {
        rcAccountId: user.rcAccountId,
        platformName: user.platform,
        dataKey: `contact-${phoneNumber}`,
      },
    });
  }

  function formBodyToObject(body) {
    if (typeof body === 'string') {
      return Object.fromEntries(new URLSearchParams(body));
    }
    return body;
  }

  beforeAll(async () => {
    await MessageLogModel.sync();
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
          nock.cleanAll();
          restoreOAuthEnvironment();
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

  afterEach(() => {
    nock.cleanAll();
  });

  test('returns an unmatched contact and advertises unsupported user-mapping and appointment interfaces', async () => {
    const interfaces = await client.get('/implementedInterfaces', {
      params: { platform: user.platform },
    });
    expect(interfaces.status).toBe(200);
    expect(interfaces.data).toMatchObject({
      findContact: true,
      createContact: true,
      createMessageLog: true,
      updateMessageLog: true,
      getUserList: false,
      listAppointments: false,
      createAppointment: false,
      updateAppointment: false,
      refreshAppointment: false,
      confirmAppointment: false,
      cancelAppointment: false,
    });

    const testCase = scenarios.contacts.unmatched;
    const metadataScope = mockSpreadsheetMetadata();
    const rowsScope = mockSheetRows('Contacts', testCase.crmRows);

    const response = await findContact(testCase.phoneNumber);

    expect(response.status).toBe(200);
    expect(response.data).toEqual(testCase.expectedResponse);
    expect(metadataScope.isDone()).toBe(true);
    expect(rowsScope.isDone()).toBe(true);
    expect(await findCachedContact(testCase.phoneNumber)).toBeNull();
    expect(nock.pendingMocks()).toEqual([]);
  });

  test('returns and persists multiple contacts from the real Google Sheets connector', async () => {
    const testCase = scenarios.contacts.multipleMatches;
    const metadataScope = mockSpreadsheetMetadata();
    const rowsScope = mockSheetRows('Contacts', testCase.crmRows);

    const response = await findContact(testCase.phoneNumber);

    expect(response.status).toBe(200);
    expect(response.data).toEqual(testCase.expectedResponse);
    expect(metadataScope.isDone()).toBe(true);
    expect(rowsScope.isDone()).toBe(true);

    const cachedContact = await findCachedContact(testCase.phoneNumber);
    expect(cachedContact).not.toBeNull();
    expect(cachedContact.data).toEqual(testCase.expectedContacts);
    expect(nock.pendingMocks()).toEqual([]);
  });

  test('creates a contact by appending the mapped row through the real connector', async () => {
    const testCase = scenarios.contacts.create;
    const metadataScope = mockSpreadsheetMetadata();
    const rowsScope = mockSheetRows('Contacts', testCase.existingCrmRows);
    const headersScope = mockSheetHeaders('Contacts', googleSheetsCoverageCase.contactHeaders);
    let crmRequestBody;
    const appendScope = nock(provider.sheetsApiUrl)
      .matchHeader('authorization', provider.authorization)
      .post(
        `/v4/spreadsheets/${provider.spreadsheetId}/values/Contacts!A1:append`,
        body => {
          crmRequestBody = body;
          return true;
        },
      )
      .query({ valueInputOption: 'RAW' })
      .reply(200, testCase.crmResponse);

    const response = await client.post(
      '/contact',
      testCase.appRequestBody,
      authConfig(),
    );

    expect(response.status).toBe(200);
    expect(response.data).toEqual(testCase.expectedResponse);
    expect(crmRequestBody).toEqual(testCase.expectedCrmRequestBody);
    expect(metadataScope.isDone()).toBe(true);
    expect(rowsScope.isDone()).toBe(true);
    expect(headersScope.isDone()).toBe(true);
    expect(appendScope.isDone()).toBe(true);
    expect(await findCachedContact(testCase.appRequestBody.phoneNumber)).toBeNull();
    expect(nock.pendingMocks()).toEqual([]);
  });

  test('creates a message row and updates it for the next RingCentral SMS', async () => {
    const messageCase = scenarios.messageLogging;
    const createMetadataScope = mockSpreadsheetMetadata();
    const createRowsScope = mockSheetRows('Message Logs', messageCase.create.crmRows);
    const createHeadersScope = mockSheetHeaders('Message Logs', messageCase.headers);
    let createCrmRequestBody;
    const appendScope = nock(provider.sheetsApiUrl)
      .matchHeader('authorization', provider.authorization)
      .post(
        `/v4/spreadsheets/${provider.spreadsheetId}/values/Message%20Logs!A1:append`,
        body => {
          createCrmRequestBody = body;
          return true;
        },
      )
      .query({ valueInputOption: 'RAW' })
      .reply(200, messageCase.create.crmResponse);

    const createResponse = await client.post(
      '/messageLog',
      buildMessageLogRequest([messageCase.messages.inbound]),
      authConfig(),
    );

    expect(createResponse.status).toBe(200);
    expect(createResponse.data).toEqual(messageCase.create.expectedResponse);
    expect(createCrmRequestBody).toEqual(messageCase.create.expectedCrmRequestBody);
    expect(createMetadataScope.isDone()).toBe(true);
    expect(createRowsScope.isDone()).toBe(true);
    expect(createHeadersScope.isDone()).toBe(true);
    expect(appendScope.isDone()).toBe(true);

    const persistedCreate = await MessageLogModel.findByPk(
      messageCase.messages.inbound.id,
    );
    expect(persistedCreate).toMatchObject({
      platform: user.platform,
      conversationId: messageCase.conversation.id,
      conversationLogId: messageCase.conversation.logId,
      thirdPartyLogId: '2',
      userId: user.id,
    });

    const updateMetadataScope = mockSpreadsheetMetadata();
    const updateRowsScope = mockSheetRows('Message Logs', messageCase.update.crmRows);
    let updateCrmRequestBody;
    const updateScope = nock(provider.sheetsApiUrl)
      .matchHeader('authorization', provider.authorization)
      .post(`/v4/spreadsheets/${provider.spreadsheetId}/values:batchUpdate`, body => {
        updateCrmRequestBody = body;
        return true;
      })
      .reply(200, messageCase.update.crmResponse);

    const updateResponse = await client.post(
      '/messageLog',
      buildMessageLogRequest([
        messageCase.messages.outbound,
        messageCase.messages.inbound,
      ]),
      authConfig(),
    );

    expect(updateResponse.status).toBe(200);
    expect(updateResponse.data).toEqual(messageCase.update.expectedResponse);
    expect(updateCrmRequestBody).toEqual(messageCase.update.expectedCrmRequestBody);
    expect(updateMetadataScope.isDone()).toBe(true);
    expect(updateRowsScope.isDone()).toBe(true);
    expect(updateScope.isDone()).toBe(true);

    const persistedLogs = await MessageLogModel.findAll({
      where: {
        userId: user.id,
        conversationLogId: messageCase.conversation.logId,
      },
      order: [['id', 'ASC']],
    });
    expect(persistedLogs).toHaveLength(2);
    expect(persistedLogs.map(log => log.toJSON())).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: messageCase.messages.inbound.id,
        thirdPartyLogId: '2',
      }),
      expect.objectContaining({
        id: messageCase.messages.outbound.id,
        thirdPartyLogId: '2',
      }),
    ]));
    expect(nock.pendingMocks()).toEqual([]);
  });

  test('completes the real Google Sheets OAuth exchange and persists the user', async () => {
    const oauth = scenarios.oauth;
    const managedOAuthValues = buildGoogleSheetsManagedOAuthValues(tokenApiUrl);
    const ringCentralScope = nock('https://platform.ringcentral.com')
      .matchHeader('authorization', `Bearer ${oauth.adminAccessToken}`)
      .get('/restapi/v1.0/account/~/extension/~')
      .reply(200, googleSheetsOAuthAdminResponse());

    const cacheResponse = await client.post('/admin/managedOAuth/cache', {
      values: managedOAuthValues,
    }, {
      headers: {
        'X-RC-Access-Token': oauth.adminAccessToken,
        'rc-account-id': oauth.hashedAccountId,
        'rc-extension-id': oauth.hashedExtensionId,
      },
    });
    expect(cacheResponse.status).toBe(200);
    expect(cacheResponse.data).toEqual({ successful: true });
    expect(ringCentralScope.isDone()).toBe(true);

    const userInfoScope = nock(oauth.userInfoApiUrl)
      .matchHeader('authorization', `Bearer ${oauth.accessToken}`)
      .get('/oauth2/v3/userinfo')
      .reply(200, oauth.crmUserResponse);
    const state = new URLSearchParams({
      platform: oauth.platform,
      hostname: oauth.hostname,
    }).toString();
    const callbackUri =
      `${oauth.redirectUri}?code=${oauth.authorizationCode}&state=${encodeURIComponent(state)}`;
    const exchangeStartedAt = Date.now();

    const response = await client.get('/oauth-callback', {
      params: { callbackUri, rcAccountId: oauth.rcAccountId },
      headers: { 'rc-extension-id': oauth.hashedExtensionId },
    });

    expect(response.status).toBe(200);
    expect(response.data).toMatchObject(oauth.expectedLoginResponse);
    expect(response.data.jwtToken).toEqual(expect.any(String));
    expect(jwt.decodeJwt(response.data.jwtToken)).toMatchObject({
      id: oauth.userId,
      platform: oauth.platform,
    });
    expect(tokenRequest).toMatchObject({
      method: 'POST',
      url: '/oauth/token',
    });
    expect(tokenRequest.headers.authorization).toBe(
      oauth.expectedTokenAuthorization,
    );
    expect(formBodyToObject(tokenRequest.body)).toMatchObject({
      code: oauth.authorizationCode,
      grant_type: 'authorization_code',
      redirect_uri: oauth.redirectUri,
    });
    expect(userInfoScope.isDone()).toBe(true);

    const persistedUser = await UserModel.findByPk(oauth.userId);
    expect(persistedUser).not.toBeNull();
    const persistedData = persistedUser.toJSON();
    expect(persistedData).toMatchObject(oauth.expectedPersistedUser);
    expect(persistedData.tokenExpiry).toBeInstanceOf(Date);
    expect(persistedData.tokenExpiry.getTime()).toBeGreaterThan(
      exchangeStartedAt + 7190 * 1000,
    );
    expect(persistedData.tokenExpiry.getTime()).toBeLessThan(
      Date.now() + 7210 * 1000,
    );
    expect(nock.pendingMocks()).toEqual([]);
  });
});

export {};
