const nock = require('nock');
const http = require('http');
const jwt = require('@app-connect/core/lib/jwt');
const { UserModel } = require('@app-connect/core/models/userModel');
const {
  startServer,
  stopServer,
  cleanE2EData,
} = require('./support/serverHarness');
const {
  insightlyAuthenticationCase,
  pipedriveAuthenticationCase,
} = require('./support/authenticationCases');

describe('Authentication App-level E2E', () => {
  const insightly = insightlyAuthenticationCase;
  const pipedrive = pipedriveAuthenticationCase;

  const environmentKeys = [
    'INSIGHTLY_API_VERSION',
    'PIPEDRIVE_CLIENT_ID',
    'PIPEDRIVE_CLIENT_SECRET',
    'PIPEDRIVE_ACCESS_TOKEN_URI',
  ];
  const previousEnvironment = Object.fromEntries(
    environmentKeys.map(key => [key, process.env[key]]),
  );

  let server;
  let client;
  let tokenApiServer;
  let pipedriveTokenUrl;
  let tokenRequest;

  async function cleanData() {
    await cleanE2EData({
      userIds: [insightly.userId, pipedrive.userId],
    });
  }

  function mockInsightlyLogin({ rcAccountId = insightly.rcAccountId, apiKey = insightly.apiKey, instanceId = insightly.crmUserResponse.INSTANCE_ID } = {}) {
    const rc = nock('https://platform.ringcentral.com')
      .matchHeader('authorization', `Bearer ${insightly.rcAccessToken}`)
      .get('/restapi/v1.0/account/~/extension/~')
      .reply(200, { id: '101', account: { id: rcAccountId } });
    const crm = nock(insightly.apiBaseUrl)
      .matchHeader('authorization', `Basic ${Buffer.from(`${apiKey}:`).toString('base64')}`)
      .get('/v3.1/users/me')
      .reply(200, { ...insightly.crmUserResponse, INSTANCE_ID: instanceId });
    return { rc, crm };
  }

  function loginToInsightly(apiKey = insightly.apiKey, rcAccessToken = insightly.rcAccessToken) {
    return client.post('/apiKeyLogin', {
      platform: insightly.platform,
      hostname: insightly.hostname,
      apiKey,
      rcAccessToken,
      additionalInfo: { apiUrl: `${insightly.apiBaseUrl}/v3.1/` },
    }, { headers: { 'rc-extension-id': insightly.hashedExtensionId } });
  }

  function restoreEnvironment() {
    for (const key of environmentKeys) {
      const previousValue = previousEnvironment[key];
      if (previousValue === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previousValue;
      }
    }
  }

  async function startTokenApiServer() {
    tokenApiServer = http.createServer(async (request: any, response: any) => {
      const chunks: Buffer[] = [];
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
      response.end(JSON.stringify(pipedrive.tokenResponse));
    });
    await new Promise(resolve => tokenApiServer.listen(0, '127.0.0.1', resolve));
    const { port } = tokenApiServer.address();
    pipedriveTokenUrl = `http://127.0.0.1:${port}/oauth/token`;
  }

  async function stopTokenApiServer() {
    if (tokenApiServer) {
      await new Promise((resolve, reject) => tokenApiServer.close((error: any) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(undefined);
      }));
    }
  }

  beforeAll(async () => {
    await startTokenApiServer();
    process.env.INSIGHTLY_API_VERSION = insightly.apiVersion;
    process.env.PIPEDRIVE_CLIENT_ID = pipedrive.clientId;
    process.env.PIPEDRIVE_CLIENT_SECRET = pipedrive.clientSecret;
    process.env.PIPEDRIVE_ACCESS_TOKEN_URI = pipedriveTokenUrl;
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
          await stopTokenApiServer();
        } finally {
          restoreEnvironment();
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

  test('logs in through the real Insightly API-key connector and persists the user', async () => {
    const { rc, crm } = mockInsightlyLogin();
    const response = await loginToInsightly();

    expect(response.status).toBe(200);
    expect(response.data).toMatchObject(insightly.expectedLoginResponse);
    expect(response.data.jwtToken).toEqual(expect.any(String));
    expect(jwt.decodeJwt(response.data.jwtToken)).toMatchObject({
      id: insightly.userId,
      platform: insightly.platform,
    });
    rc.done();
    crm.done();

    const persistedUser = await UserModel.findByPk(insightly.userId);
    expect(persistedUser).not.toBeNull();
    expect(persistedUser.toJSON()).toMatchObject(insightly.expectedPersistedUser);
  });

  test('requires a verified RingCentral session before contacting Insightly', async () => {
    const crm = nock(insightly.apiBaseUrl).get('/v3.1/users/me').reply(200, insightly.crmUserResponse);
    const response = await loginToInsightly(insightly.apiKey, '');
    expect(response.status).toBe(400);
    expect(response.data.jwtToken).toBeUndefined();
    expect(crm.isDone()).toBe(false);
    expect(await UserModel.findByPk(insightly.userId)).toBeNull();
  });

  test('links an owned legacy record with its existing key, then supports key rotation', async () => {
    const settings = { language: { value: 'en-US' } };
    await UserModel.create({
      ...insightly.expectedPersistedUser,
      platformAdditionalInfo: { apiUrl: insightly.apiBaseUrl },
      userSettings: settings,
    });
    const legacy = mockInsightlyLogin();
    const first = await loginToInsightly();
    expect(first.status).toBe(200);
    legacy.rc.done();
    legacy.crm.done();

    const apiKey = 'e2e-insightly-replacement-key';
    const rotated = mockInsightlyLogin({ apiKey });
    const response = await loginToInsightly(apiKey);
    expect(response.status).toBe(200);
    expect(jwt.decodeJwt(response.data.jwtToken).id).toBe(insightly.userId);
    rotated.rc.done();
    rotated.crm.done();
    expect((await UserModel.findByPk(insightly.userId)).toJSON()).toMatchObject({
      accessToken: apiKey,
      rcAccountId: insightly.rcAccountId,
      platformAdditionalInfo: { insightlyInstanceId: insightly.crmUserResponse.INSTANCE_ID },
      userSettings: settings,
    });
  });

  test.each([
    ['different RingCentral account', 'another-account', insightly.crmUserResponse.INSTANCE_ID, insightly.rcAccountId],
    ['different Insightly instance', insightly.rcAccountId, 91919, insightly.rcAccountId],
    ['missing legacy owner', insightly.rcAccountId, insightly.crmUserResponse.INSTANCE_ID, null],
  ])('rejects an existing identity with a %s before writing credentials or issuing a session', async (_reason, rcAccountId, instanceId, savedAccountId) => {
    const settings = { language: { value: 'en-US' } };
    await UserModel.create({ ...insightly.expectedPersistedUser, rcAccountId: savedAccountId, userSettings: settings });
    const apiKey = 'e2e-insightly-unaccepted-key';
    const { rc, crm } = mockInsightlyLogin({ apiKey, rcAccountId, instanceId });
    const response = await loginToInsightly(apiKey);
    expect(response.status).toBe(400);
    expect(response.data.jwtToken).toBeUndefined();
    expect((await UserModel.findByPk(insightly.userId)).toJSON()).toMatchObject({
      accessToken: insightly.apiKey,
      rcAccountId: savedAccountId,
      platformAdditionalInfo: { insightlyInstanceId: insightly.crmUserResponse.INSTANCE_ID },
      userSettings: settings,
    });
    rc.done();
    crm.done();
  });

  test('completes the real Pipedrive OAuth exchange and persists tokens and user details', async () => {
    const expectedBasicAuthorization = `Basic ${Buffer.from(`${pipedrive.clientId}:${pipedrive.clientSecret}`).toString('base64')}`;
    const state = new URLSearchParams({
      platform: pipedrive.platform,
      hostname: 'temp',
    }).toString();
    const callbackUri = `${pipedrive.redirectUri}?code=${pipedrive.authorizationCode}&state=${encodeURIComponent(state)}`;
    const userInfoScope = nock(pipedrive.apiBaseUrl)
      .matchHeader('authorization', `Bearer ${pipedrive.accessToken}`)
      .get('/v1/users/me')
      .reply(200, pipedrive.crmUserResponse);
    const tokenExchangeStartedAt = Date.now();

    const response = await client.get('/oauth-callback', {
      params: { callbackUri, rcAccountId: 'unverified-legacy-account' },
      headers: {
        'rc-extension-id': pipedrive.hashedExtensionId,
      },
    });

    expect(response.status).toBe(200);
    expect(response.data).toMatchObject(pipedrive.expectedLoginResponse);
    expect(response.data.jwtToken).toEqual(expect.any(String));
    expect(jwt.decodeJwt(response.data.jwtToken)).toMatchObject({
      id: pipedrive.userId,
      platform: pipedrive.platform,
    });
    expect(userInfoScope.isDone()).toBe(true);
    expect(tokenRequest).toMatchObject({
      method: 'POST',
      url: '/oauth/token',
    });
    const tokenForm = Object.fromEntries(new URLSearchParams(tokenRequest.body));
    expect(tokenRequest.headers.authorization).toBe(expectedBasicAuthorization);
    expect(tokenRequest.headers['content-type']).toMatch(/application\/x-www-form-urlencoded/);
    expect(tokenForm).toMatchObject({
      code: pipedrive.authorizationCode,
      grant_type: 'authorization_code',
      redirect_uri: pipedrive.redirectUri,
    });

    const persistedUser = await UserModel.findByPk(pipedrive.userId);
    expect(persistedUser).not.toBeNull();
    const persistedData = persistedUser.toJSON();
    expect(persistedData).toMatchObject({
      ...pipedrive.expectedPersistedUser,
      rcAccountId: null,
      hashedRcExtensionId: null,
    });
    expect(persistedData.tokenExpiry).toBeInstanceOf(Date);
    expect(persistedData.tokenExpiry.getTime()).toBeGreaterThan(tokenExchangeStartedAt + 7190 * 1000);
    expect(persistedData.tokenExpiry.getTime()).toBeLessThan(Date.now() + 7210 * 1000);
  });
});

export {};
