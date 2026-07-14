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
    const expectedAuthorization = `Basic ${Buffer.from(`${insightly.apiKey}:`).toString('base64')}`;
    const userInfoScope = nock(insightly.apiBaseUrl)
      .matchHeader('authorization', expectedAuthorization)
      .get('/v3.1/users/me')
      .reply(200, insightly.crmUserResponse);

    const response = await client.post('/apiKeyLogin', {
      platform: insightly.platform,
      hostname: insightly.hostname,
      apiKey: insightly.apiKey,
      additionalInfo: {
        apiUrl: insightly.apiBaseUrl,
      },
    }, {
      headers: {
        'rc-extension-id': insightly.hashedExtensionId,
      },
    });

    expect(response.status).toBe(200);
    expect(response.data).toMatchObject(insightly.expectedLoginResponse);
    expect(response.data.jwtToken).toEqual(expect.any(String));
    expect(jwt.decodeJwt(response.data.jwtToken)).toMatchObject({
      id: insightly.userId,
      platform: insightly.platform,
    });
    expect(userInfoScope.isDone()).toBe(true);

    const persistedUser = await UserModel.findByPk(insightly.userId);
    expect(persistedUser).not.toBeNull();
    expect(persistedUser.toJSON()).toMatchObject(insightly.expectedPersistedUser);
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
      params: { callbackUri },
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
    expect(persistedData).toMatchObject(pipedrive.expectedPersistedUser);
    expect(persistedData.tokenExpiry).toBeInstanceOf(Date);
    expect(persistedData.tokenExpiry.getTime()).toBeGreaterThan(tokenExchangeStartedAt + 7190 * 1000);
    expect(persistedData.tokenExpiry.getTime()).toBeLessThan(Date.now() + 7210 * 1000);
  });
});

export {};
