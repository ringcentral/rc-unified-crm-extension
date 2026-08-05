const http = require('http');
const nock = require('nock');
const { AccountDataModel } = require('@app-connect/core/models/accountDataModel');
const { CacheModel } = require('@app-connect/core/models/cacheModel');
const { UserModel } = require('@app-connect/core/models/userModel');
const { decoded } = require('@app-connect/core/lib/encode');
const {
  startServer,
  stopServer,
  cleanE2EData,
  generateJwt,
} = require('./support/serverHarness');
const {
  apiKeyManagedAuth,
  managedOAuth,
  buildManagedOAuthValues,
  ringCentralExtensionResponse,
} = require('./support/managedAuthenticationCases');

describe('Managed authentication App-level E2E', () => {
  const pendingCacheId = `${managedOAuth.rcAccountId}-managed-oauth-account`;
  const apiKeyHeaders = {
    'X-RC-Access-Token': apiKeyManagedAuth.adminAccessToken,
    'rc-account-id': 'e2e-managed-api-key-hashed-account',
    'rc-extension-id': apiKeyManagedAuth.user.hashedRcExtensionId,
  };
  const adminHeaders = {
    'X-RC-Access-Token': managedOAuth.adminAccessToken,
    'rc-account-id': 'e2e-managed-oauth-hashed-account',
    'rc-extension-id': managedOAuth.hashedRcExtensionId,
  };
  const userHeaders = {
    ...adminHeaders,
    'X-RC-Access-Token': managedOAuth.userAccessToken,
  };

  let server;
  let client;
  let tokenApiServer;
  let tokenApiUrl;
  let tokenRequest;
  const previousInsightlyApiVersion = process.env.INSIGHTLY_API_VERSION;

  function mockRingCentralExtension({
    accessToken,
    isAdmin,
    times,
    rcAccountId = undefined,
    rcExtensionId = undefined,
  }) {
    return nock('https://platform.ringcentral.com')
      .matchHeader('authorization', `Bearer ${accessToken}`)
      .get('/restapi/v1.0/account/~/extension/~')
      .times(times)
      .reply(200, ringCentralExtensionResponse({
        isAdmin,
        rcAccountId,
        rcExtensionId,
      }));
  }

  function mockDeveloperPortalManifest(times) {
    return nock('https://appconnect.labs.ringcentral.com')
      .get(`/public-api/connectors/${apiKeyManagedAuth.connectorId}/manifest`)
      .times(times)
      .reply(200, apiKeyManagedAuth.developerPortalManifest);
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
      response.end(JSON.stringify({
        access_token: managedOAuth.accessToken,
        refresh_token: managedOAuth.refreshToken,
        token_type: 'Bearer',
        expires_in: 7200,
      }));
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

  async function cleanData() {
    await CacheModel.destroy({ where: { id: pendingCacheId } });
    await cleanE2EData({
      userIds: [apiKeyManagedAuth.user.id, managedOAuth.userId],
      rcAccountIds: [apiKeyManagedAuth.user.rcAccountId, managedOAuth.rcAccountId],
    });
  }

  beforeAll(async () => {
    process.env.INSIGHTLY_API_VERSION = 'v3.1';
    nock.disableNetConnect();
    nock.enableNetConnect('127.0.0.1');
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
          if (previousInsightlyApiVersion === undefined) {
            delete process.env.INSIGHTLY_API_VERSION;
          } else {
            process.env.INSIGHTLY_API_VERSION = previousInsightlyApiVersion;
          }
          nock.cleanAll();
          nock.enableNetConnect();
        }
      }
    }
  });

  beforeEach(async () => {
    nock.cleanAll();
    tokenRequest = null;
    await cleanData();
  });

  afterEach(async () => {
    nock.cleanAll();
    await cleanData();
  });

  test('reports that the built-in Insightly manifest still requires manual API-key fields', async () => {
    await UserModel.create({
      ...apiKeyManagedAuth.user,
      platform: apiKeyManagedAuth.platform,
      refreshToken: null,
      tokenExpiry: null,
      timezoneOffset: '+00:00',
      userSettings: {},
    });
    const jwtToken = generateJwt({
      id: apiKeyManagedAuth.user.id,
      platform: apiKeyManagedAuth.platform,
      rcUserNumber: apiKeyManagedAuth.user.rcUserNumber,
    });
    const rcScope = mockRingCentralExtension({
      accessToken: apiKeyManagedAuth.adminAccessToken,
      isAdmin: true,
      times: 2,
      rcAccountId: apiKeyManagedAuth.user.rcAccountId,
      rcExtensionId: apiKeyManagedAuth.rcExtensionId,
    });

    const stateResponse = await client.get('/apiKeyManagedAuthState', {
      params: { platform: apiKeyManagedAuth.platform },
      headers: apiKeyHeaders,
    });

    expect(stateResponse.status).toBe(200);
    expect(stateResponse.data).toEqual(apiKeyManagedAuth.expectedState);

    const adminResponse = await client.get('/admin/managedAuth', {
      params: { jwtToken },
      headers: apiKeyHeaders,
    });

    expect(adminResponse.status).toBe(200);
    expect(adminResponse.data).toEqual(apiKeyManagedAuth.expectedAdminSettings);
    expect(rcScope.isDone()).toBe(true);
    expect(await AccountDataModel.count({
      where: { rcAccountId: apiKeyManagedAuth.user.rcAccountId },
    })).toBe(0);
  });

  test('resolves Developer Portal managed API-key values into the real Insightly connector', async () => {
    await UserModel.create({
      ...apiKeyManagedAuth.user,
      platform: apiKeyManagedAuth.platform,
      refreshToken: null,
      tokenExpiry: null,
      timezoneOffset: '+00:00',
      userSettings: {},
    });
    const jwtToken = generateJwt({
      id: apiKeyManagedAuth.user.id,
      platform: apiKeyManagedAuth.platform,
      rcUserNumber: apiKeyManagedAuth.user.rcUserNumber,
    });
    const rcScope = mockRingCentralExtension({
      accessToken: apiKeyManagedAuth.adminAccessToken,
      isAdmin: true,
      times: 5,
      rcAccountId: apiKeyManagedAuth.user.rcAccountId,
      rcExtensionId: apiKeyManagedAuth.rcExtensionId,
    });
    const manifestScope = mockDeveloperPortalManifest(4);

    const orgUpdateResponse = await client.post('/admin/managedAuth', {
      scope: 'org',
      values: { apiUrl: apiKeyManagedAuth.managedApiUrl },
    }, {
      params: { jwtToken, connectorId: apiKeyManagedAuth.connectorId },
      headers: apiKeyHeaders,
    });
    expect([orgUpdateResponse.status, orgUpdateResponse.data]).toEqual([
      200,
      'Shared authentication updated',
    ]);

    const userUpdateResponse = await client.post('/admin/managedAuth', {
      scope: 'user',
      rcExtensionId: apiKeyManagedAuth.rcExtensionId,
      rcUserName: 'Managed Insightly User',
      values: { apiKey: apiKeyManagedAuth.managedApiKey },
    }, {
      params: { jwtToken, connectorId: apiKeyManagedAuth.connectorId },
      headers: apiKeyHeaders,
    });
    expect([userUpdateResponse.status, userUpdateResponse.data]).toEqual([
      200,
      'Shared authentication updated',
    ]);

    const adminStateResponse = await client.get('/admin/managedAuth', {
      params: { jwtToken, connectorId: apiKeyManagedAuth.connectorId },
      headers: apiKeyHeaders,
    });
    expect(adminStateResponse.status).toBe(200);
    expect(adminStateResponse.data).toMatchObject({
      hasManagedAuth: true,
      orgFields: [{ const: 'apiUrl', managedScope: 'account' }],
      userFields: [{ const: 'apiKey', managedScope: 'user' }],
      orgValues: {
        apiUrl: { hasValue: true, value: apiKeyManagedAuth.managedApiUrl },
      },
      userValues: [{
        rcExtensionId: apiKeyManagedAuth.rcExtensionId,
        rcUserName: 'Managed Insightly User',
        fields: {
          apiKey: { hasValue: true, value: apiKeyManagedAuth.managedApiKey },
        },
      }],
    });

    const loginStateResponse = await client.get('/apiKeyManagedAuthState', {
      params: {
        platform: apiKeyManagedAuth.platform,
        connectorId: apiKeyManagedAuth.connectorId,
      },
      headers: apiKeyHeaders,
    });
    expect(loginStateResponse.status).toBe(200);
    expect(loginStateResponse.data).toEqual({
      hasManagedAuth: true,
      allRequiredFieldsSatisfied: true,
      visibleFieldConsts: [],
      missingRequiredFieldConsts: [],
      fallbackToManualAuth: false,
    });

    const expectedAuthorization = `Basic ${Buffer.from(`${apiKeyManagedAuth.managedApiKey}:`).toString('base64')}`;
    const crmUserScope = nock(apiKeyManagedAuth.managedApiUrl)
      .matchHeader('authorization', expectedAuthorization)
      .get('/v3.1/users/me')
      .reply(200, apiKeyManagedAuth.crmUserResponse);
    const loginResponse = await client.post('/apiKeyLogin', {
      platform: apiKeyManagedAuth.platform,
      hostname: apiKeyManagedAuth.user.hostname,
      connectorId: apiKeyManagedAuth.connectorId,
    }, { headers: apiKeyHeaders });

    expect(loginResponse.status).toBe(200);
    expect(loginResponse.data).toMatchObject({
      name: 'Managed Insightly User',
      returnMessage: {
        messageType: 'success',
        message: 'Connected to Insightly.',
      },
    });
    expect(loginResponse.data.jwtToken).toEqual(expect.any(String));
    const persistedUser = await UserModel.findByPk(apiKeyManagedAuth.user.id);
    expect(persistedUser).not.toBeNull();
    expect(persistedUser.toJSON()).toMatchObject({
      accessToken: apiKeyManagedAuth.managedApiKey,
      rcAccountId: apiKeyManagedAuth.user.rcAccountId,
      platformAdditionalInfo: {
        apiKey: apiKeyManagedAuth.managedApiKey,
        apiUrl: apiKeyManagedAuth.managedApiUrl,
      },
    });
    const storedManagedRecords = await AccountDataModel.findAll({
      where: {
        rcAccountId: apiKeyManagedAuth.user.rcAccountId,
        platformName: apiKeyManagedAuth.platform,
      },
    });
    expect(storedManagedRecords).toHaveLength(2);
    expect(JSON.stringify(storedManagedRecords.map(record => record.data)))
      .not.toContain(apiKeyManagedAuth.managedApiKey);
    expect(rcScope.isDone()).toBe(true);
    expect(manifestScope.isDone()).toBe(true);
    expect(crmUserScope.isDone()).toBe(true);
    expect(nock.pendingMocks()).toEqual([]);
  });

  test('runs the managed Pipedrive OAuth cache, exchange, account migration, and reset lifecycle', async () => {
    const oauthValues = buildManagedOAuthValues(tokenApiUrl);
    const adminRcScope = mockRingCentralExtension({
      accessToken: managedOAuth.adminAccessToken,
      isAdmin: true,
      times: 12,
    });
    const userRcScope = mockRingCentralExtension({
      accessToken: managedOAuth.userAccessToken,
      isAdmin: false,
      times: 2,
    });

    const cacheResponse = await client.post('/admin/managedOAuth/cache', {
      values: oauthValues,
    }, { headers: adminHeaders });

    expect(cacheResponse.status).toBe(200);
    expect(cacheResponse.data).toEqual({ successful: true });
    const pendingRecord = await CacheModel.findByPk(pendingCacheId);
    expect(pendingRecord).not.toBeNull();
    expect(JSON.stringify(pendingRecord.data)).not.toContain(managedOAuth.clientSecret);

    const pendingStateResponse = await client.get('/oauthManagedAuthState', {
      params: { platform: managedOAuth.platform },
      headers: adminHeaders,
    });

    expect(pendingStateResponse.status).toBe(200);
    expect(pendingStateResponse.data).toEqual({
      isAdmin: true,
      hasAccountOAuth: false,
      hasPendingOAuth: true,
      pendingValues: oauthValues,
    });

    const nonAdminStateResponse = await client.get('/oauthManagedAuthState', {
      params: { platform: managedOAuth.platform },
      headers: userHeaders,
    });

    expect(nonAdminStateResponse.status).toBe(200);
    expect(nonAdminStateResponse.data).toEqual({
      isAdmin: false,
      hasAccountOAuth: false,
      hasPendingOAuth: false,
    });

    const clearCacheResponse = await client.delete('/admin/managedOAuth/cache', {
      headers: adminHeaders,
    });
    expect(clearCacheResponse.status).toBe(200);
    expect(clearCacheResponse.data).toEqual({ successful: true });
    expect(await CacheModel.findByPk(pendingCacheId)).toBeNull();

    const clearedStateResponse = await client.get('/oauthManagedAuthState', {
      params: { platform: managedOAuth.platform },
      headers: adminHeaders,
    });
    expect(clearedStateResponse.data).toEqual({
      isAdmin: true,
      hasAccountOAuth: false,
      hasPendingOAuth: false,
    });

    await client.post('/admin/managedOAuth/cache', {
      values: oauthValues,
    }, { headers: adminHeaders });

    const crmUserScope = nock('https://api.pipedrive.com')
      .matchHeader('authorization', `Bearer ${managedOAuth.accessToken}`)
      .get('/v1/users/me')
      .reply(200, managedOAuth.crmUserResponse);
    const state = new URLSearchParams({
      platform: managedOAuth.platform,
      hostname: 'temp',
    }).toString();
    const callbackUri = `${managedOAuth.redirectUri}?code=${managedOAuth.authorizationCode}&state=${encodeURIComponent(state)}`;

    const callbackResponse = await client.get('/oauth-callback', {
      params: {
        callbackUri,
        rcAccountId: managedOAuth.rcAccountId,
      },
      headers: {
        'rc-extension-id': managedOAuth.hashedRcExtensionId,
      },
    });

    expect(callbackResponse.status).toBe(200);
    expect(callbackResponse.data).toMatchObject({
      name: 'Managed OAuth Admin',
      returnMessage: {
        messageType: 'success',
        message: 'Connected to Pipedrive.',
      },
    });
    expect(callbackResponse.data.jwtToken).toEqual(expect.any(String));
    expect(crmUserScope.isDone()).toBe(true);
    expect(tokenRequest).toMatchObject({ method: 'POST', url: '/oauth/token' });
    expect(tokenRequest.headers.authorization).toBe(
      `Basic ${Buffer.from(`${managedOAuth.clientId}:${managedOAuth.clientSecret}`).toString('base64')}`,
    );
    expect(Object.fromEntries(new URLSearchParams(tokenRequest.body))).toMatchObject({
      code: managedOAuth.authorizationCode,
      grant_type: 'authorization_code',
      redirect_uri: managedOAuth.redirectUri,
    });
    expect(await CacheModel.findByPk(pendingCacheId)).toBeNull();

    const accountRecord = await AccountDataModel.findOne({
      where: {
        rcAccountId: managedOAuth.rcAccountId,
        platformName: managedOAuth.platform,
        dataKey: 'managed-oauth-account',
      },
    });
    expect(accountRecord).not.toBeNull();
    expect(JSON.stringify(accountRecord.data)).not.toContain(managedOAuth.clientSecret);
    expect(JSON.parse(decoded(accountRecord.data.fields.clientSecret.value))).toBe(managedOAuth.clientSecret);

    const accountStateResponse = await client.get('/oauthManagedAuthState', {
      params: { platform: managedOAuth.platform },
      headers: adminHeaders,
    });
    const { clientSecret, ...sanitizedOAuthValues } = oauthValues;
    expect(accountStateResponse.data).toEqual({
      isAdmin: true,
      hasAccountOAuth: true,
      hasPendingOAuth: false,
      oauthValues: sanitizedOAuthValues,
    });

    const resetResponse = await client.delete('/admin/managedOAuth/account', {
      params: { platform: managedOAuth.platform },
      headers: adminHeaders,
    });
    expect(resetResponse.status).toBe(200);
    expect(resetResponse.data).toEqual({ successful: true });
    expect(await AccountDataModel.findOne({
      where: {
        rcAccountId: managedOAuth.rcAccountId,
        platformName: managedOAuth.platform,
        dataKey: 'managed-oauth-account',
      },
    })).toBeNull();

    const resetStateResponse = await client.get('/oauthManagedAuthState', {
      params: { platform: managedOAuth.platform },
      headers: adminHeaders,
    });
    expect(resetStateResponse.data).toEqual({
      isAdmin: true,
      hasAccountOAuth: false,
      hasPendingOAuth: false,
    });
    expect(adminRcScope.isDone()).toBe(true);
    expect(userRcScope.isDone()).toBe(true);
    expect(nock.pendingMocks()).toEqual([]);
  });
});

export {};
