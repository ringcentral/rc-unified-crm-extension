const { pluginServiceCase } = require('./support/pluginServiceCases');

const oauthEnvironment = { ...pluginServiceCase.oauthEnvironment };
const originalOAuthEnvironment = Object.fromEntries(
  Object.keys(oauthEnvironment).map(key => [key, process.env[key]]),
);
Object.assign(process.env, oauthEnvironment);

// Keep app and plugin modules below the OAuth environment initialization.
const nock = require('nock');
const http = require('http');
const { UserModel } = require('@app-connect/core/models/userModel');
const { PluginUserModel } = require('../../src/plugins/models/pluginUserModel');
const { GoogleDriveFileModel } = require('../../src/plugins/models/googleDriveFileModel');

describe('Plugin services App-level E2E', () => {
  const { identity, scenarios } = pluginServiceCase;

  let server;
  let client;
  let jwtToken;
  let oauthServer;
  let startServer;
  let stopServer;
  let cleanE2EData;
  let generateJwt;
  let tokenRequestBody;
  let tokenAuthorizationHeader;
  let tokenRequestCount;
  let pluginModelsReady = false;

  async function cleanData() {
    if (pluginModelsReady) {
      await GoogleDriveFileModel.destroy({ where: { userId: identity.userId } });
      await PluginUserModel.destroy({ where: { id: identity.userId } });
    }
    if (cleanE2EData) {
      await cleanE2EData({
        userIds: [identity.userId],
        rcAccountIds: [identity.rcAccountId],
      });
    }
  }

  async function seedUser() {
    await UserModel.create({
      id: identity.userId,
      platform: identity.platform,
      hostname: identity.hostname,
      rcAccountId: identity.rcAccountId,
      accessToken: identity.crmAccessToken,
      refreshToken: identity.crmRefreshToken,
      tokenExpiry: new Date(Date.now() + 60 * 60 * 1000),
      timezoneOffset: '+00:00',
      platformAdditionalInfo: {},
      hashedRcExtensionId: identity.hashedRcExtensionId,
      userSettings: scenarios.allCap.userSettings,
    });
    jwtToken = generateJwt({
      id: identity.userId,
      platform: identity.platform,
      rcUserNumber: identity.rcUserNumber,
    });
  }

  beforeAll(async () => {
    oauthServer = http.createServer((request, response) => {
      let body = '';
      request.on('data', chunk => {
        body += chunk.toString();
      });
      request.on('end', () => {
        if (request.method !== 'POST' || request.url !== '/token') {
          response.writeHead(404).end();
          return;
        }

        tokenRequestCount += 1;
        tokenRequestBody = new URLSearchParams(body);
        tokenAuthorizationHeader = request.headers.authorization;
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(JSON.stringify(scenarios.googleDrive.tokenResponse));
      });
    });
    oauthServer.listen(0, '127.0.0.1');
    await new Promise(resolve => oauthServer.once('listening', resolve));
    const { port } = oauthServer.address();
    oauthEnvironment.GOOGLE_DRIVE_PLUGIN_TOKEN_URI = `http://127.0.0.1:${port}/token`;
    process.env.GOOGLE_DRIVE_PLUGIN_TOKEN_URI =
      oauthEnvironment.GOOGLE_DRIVE_PLUGIN_TOKEN_URI;

    ({
      startServer,
      stopServer,
      cleanE2EData,
      generateJwt,
    } = require('./support/serverHarness'));
    await PluginUserModel.sync();
    await GoogleDriveFileModel.sync();
    pluginModelsReady = true;
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
          if (oauthServer) {
            await new Promise(resolve => oauthServer.close(resolve));
          }
        } finally {
          nock.cleanAll();
          for (const [key, value] of Object.entries(originalOAuthEnvironment)) {
            if (value === undefined) {
              delete process.env[key];
            } else {
              process.env[key] = value;
            }
          }
        }
      }
    }
  });

  beforeEach(async () => {
    nock.cleanAll();
    tokenRequestBody = undefined;
    tokenAuthorizationHeader = undefined;
    tokenRequestCount = 0;
    await cleanData();
    await seedUser();
  });

  afterEach(() => {
    nock.cleanAll();
  });

  test('dispatches to the real all-cap plugin with persisted user configuration', async () => {
    const response = await client.post(
      '/plugin/all_cap',
      scenarios.allCap.appRequestBody,
      { params: { jwtToken } },
    );

    expect(response.status).toBe(200);
    expect(response.data).toEqual(scenarios.allCap.expectedResponse);
    expect(nock.pendingMocks()).toEqual([]);
  });

  test('completes the real Google Drive OAuth, auth-check, and logout lifecycle', async () => {
    const googleDrive = scenarios.googleDrive;
    const oauthUrlResponse = await client.get('/googleDrive/oauthUrl', {
      params: { jwtToken, pluginId: googleDrive.pluginId },
    });

    expect(oauthUrlResponse.status).toBe(200);
    const oauthUrl = new URL(oauthUrlResponse.data);
    expect(`${oauthUrl.origin}${oauthUrl.pathname}`).toBe(
      oauthEnvironment.GOOGLE_DRIVE_PLUGIN_AUTHORIZATION_URI,
    );
    expect(Object.fromEntries(oauthUrl.searchParams.entries())).toMatchObject({
      client_id: oauthEnvironment.GOOGLE_DRIVE_PLUGIN_CLIENT_ID,
      redirect_uri: oauthEnvironment.GOOGLE_DRIVE_PLUGIN_REDIRECT_URI,
      ...googleDrive.expectedAuthorizationQuery,
    });

    const encodedState = oauthUrl.searchParams.get('state');
    const state = JSON.parse(decodeURIComponent(encodedState));
    expect(state).toEqual({
      jwtToken,
      ...googleDrive.expectedState,
    });

    const callbackResponse = await client.get('/googleDrive/oauthCallback', {
      params: {
        callbackUri: `${oauthEnvironment.GOOGLE_DRIVE_PLUGIN_REDIRECT_URI}?state=${encodedState}`,
        code: googleDrive.authorizationCode,
        scope: googleDrive.scope,
      },
    });

    expect(callbackResponse.status).toBe(200);
    expect(callbackResponse.data).toEqual(googleDrive.expectedCallbackResponse);
    expect(tokenRequestCount).toBe(1);
    expect(tokenAuthorizationHeader).toBe(
      googleDrive.expectedTokenAuthorization,
    );
    expect(Object.fromEntries(tokenRequestBody.entries())).toEqual(
      googleDrive.expectedTokenRequest,
    );

    const pluginUser = await PluginUserModel.findByPk(identity.userId);
    expect(pluginUser).toMatchObject(googleDrive.expectedPersistedUser);
    expect(pluginUser.tokenExpiry).toBeInstanceOf(Date);
    expect(pluginUser.tokenExpiry.getTime()).toBeGreaterThan(Date.now());

    const checkAuthResponse = await client.get('/googleDrive/checkAuth', {
      params: { jwtToken },
    });
    expect(checkAuthResponse.status).toBe(200);
    expect(checkAuthResponse.data).toEqual(
      googleDrive.expectedCheckAuthResponse,
    );

    const logoutResponse = await client.post('/googleDrive/logout', { jwtToken });
    expect(logoutResponse.status).toBe(200);
    expect(logoutResponse.data).toEqual(googleDrive.expectedLogoutResponse);
    expect(await PluginUserModel.findByPk(identity.userId)).toBeNull();
    expect(await GoogleDriveFileModel.count({
      where: { userId: identity.userId },
    })).toBe(0);
    expect(nock.pendingMocks()).toEqual([]);
  });
});

export {};
