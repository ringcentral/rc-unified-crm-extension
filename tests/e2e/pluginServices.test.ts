const { pluginServiceCase } = require('./support/pluginServiceCases');
const nock = require('nock');
const { UserModel } = require('@app-connect/core/models/userModel');
const { startServer, stopServer, cleanE2EData, generateJwt } = require('./support/serverHarness');

describe('Plugin services App-level E2E', () => {
  const { identity, scenarios } = pluginServiceCase;
  let server;
  let client;
  let jwtToken;

  async function cleanData() {
    await cleanE2EData({
      userIds: [identity.userId],
      rcAccountIds: [identity.rcAccountId],
    });
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
    ({ server, client } = await startServer());
  });

  afterAll(async () => {
    try {
      await cleanData();
    } finally {
      await stopServer(server);
      nock.cleanAll();
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
});

export {};
