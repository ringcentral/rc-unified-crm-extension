const nock = require('nock');
const { AdminConfigModel } = require('@app-connect/core/models/adminConfigModel');
const { UserModel } = require('@app-connect/core/models/userModel');
const { getHashValue } = require('@app-connect/core/lib/util');
const {
  startServer,
  stopServer,
  cleanE2EData,
  generateJwt,
} = require('./support/serverHarness');
const {
  settingsAndUserMappingCase,
} = require('./support/settingsAndUserMappingCases');

describe('Settings and user mapping App-level E2E', () => {
  const {
    identity,
    provider,
    requestHeaders,
    externalApiResponses,
    scenarios,
  } = settingsAndUserMappingCase;
  const hashedRcAccountId = getHashValue(
    identity.rcAccountId,
    process.env.HASH_KEY,
  );
  const previousInsightlyApiVersion = process.env.INSIGHTLY_API_VERSION;

  let server;
  let client;
  let jwtToken;

  function mockRingCentralAdminValidation(times) {
    return nock('https://platform.ringcentral.com')
      .matchHeader('authorization', `Bearer ${identity.rcAccessToken}`)
      .get('/restapi/v1.0/account/~/extension/~')
      .times(times)
      .reply(200, externalApiResponses.ringCentralAdmin);
  }

  function mockInsightlyUserList(times) {
    return nock(provider.apiBaseUrl)
      .matchHeader('authorization', provider.expectedAuthorization)
      .get(`/${provider.apiVersion}/users`)
      .times(times)
      .reply(200, scenarios.userMapping.insightlyUsersResponse);
  }

  async function cleanData() {
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
      accessToken: identity.insightlyApiKey,
      refreshToken: null,
      tokenExpiry: null,
      timezoneOffset: '+00:00',
      platformAdditionalInfo: {
        apiUrl: provider.apiBaseUrl,
      },
      userSettings: {},
      hashedRcExtensionId: requestHeaders['rc-extension-id'],
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

  beforeAll(async () => {
    process.env.INSIGHTLY_API_VERSION = provider.apiVersion;
    nock.disableNetConnect();
    nock.enableNetConnect('127.0.0.1');
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
        if (previousInsightlyApiVersion === undefined) {
          delete process.env.INSIGHTLY_API_VERSION;
        } else {
          process.env.INSIGHTLY_API_VERSION = previousInsightlyApiVersion;
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

  test('persists admin and user settings and applies an uncustomizable admin override on user GET', async () => {
    const settings = scenarios.settings;

    const updateUserResponse = await client.post('/user/settings', {
      userSettings: settings.userSettings,
    }, jwtConfig());

    expect(updateUserResponse.status).toBe(200);
    expect(updateUserResponse.data).toEqual({
      userSettings: settings.userSettings,
    });

    const persistedUser = await UserModel.findByPk(identity.userId);
    expect(persistedUser.userSettings).toEqual(settings.userSettings);

    const ringCentralScope = mockRingCentralAdminValidation(3);
    const updateAdminResponse = await client.post('/admin/settings', {
      adminSettings: { userSettings: settings.adminUserSettings },
    }, {
      headers: requestHeaders,
    });

    expect(updateAdminResponse.status).toBe(200);
    expect(updateAdminResponse.data).toBe('Admin settings updated');

    const persistedAdminConfig = await AdminConfigModel.findByPk(hashedRcAccountId);
    expect(persistedAdminConfig.userSettings).toEqual(settings.adminUserSettings);

    const getAdminResponse = await client.get('/admin/settings', jwtConfig());

    expect(getAdminResponse.status).toBe(200);
    expect(getAdminResponse.data).toMatchObject({
      id: hashedRcAccountId,
      userSettings: settings.adminUserSettings,
    });

    const getUserResponse = await client.get('/user/settings', jwtConfig());

    expect(getUserResponse.status).toBe(200);
    expect(getUserResponse.data).toEqual(settings.expectedMergedUserSettings);
    expect(ringCentralScope.isDone()).toBe(true);
    expect(nock.pendingMocks()).toEqual([]);
  });

  test('reads, reinitializes, and persists user mappings through the real Insightly connector', async () => {
    const userMapping = scenarios.userMapping;
    await AdminConfigModel.create({
      id: hashedRcAccountId,
      userMappings: userMapping.initialPersistedMappings,
    });
    const ringCentralScope = mockRingCentralAdminValidation(3);
    const insightlyScope = mockInsightlyUserList(3);

    const initialRead = await client.post(
      '/admin/userMapping',
      userMapping.appRequestBody,
      jwtConfig(),
    );

    expect(initialRead.status).toBe(200);
    expect(initialRead.data).toEqual(userMapping.expectedInitialRead);

    const reinitializeResponse = await client.post(
      '/admin/reinitializeUserMapping',
      userMapping.appRequestBody,
      jwtConfig(),
    );

    expect(reinitializeResponse.status).toBe(200);
    expect(reinitializeResponse.data).toEqual(userMapping.expectedReinitializedRead);

    const persistedAfterReinitialize = await AdminConfigModel.findByPk(
      hashedRcAccountId,
    );
    expect(persistedAfterReinitialize.userMappings).toEqual(
      userMapping.expectedPersistedMappings,
    );

    const updatedRead = await client.post(
      '/admin/userMapping',
      userMapping.appRequestBody,
      jwtConfig(),
    );

    expect(updatedRead.status).toBe(200);
    expect(updatedRead.data[0].rcUser).toEqual(
      userMapping.expectedUpdatedRcUsers,
    );
    expect(ringCentralScope.isDone()).toBe(true);
    expect(insightlyScope.isDone()).toBe(true);
    expect(nock.pendingMocks()).toEqual([]);
  });
});

export {};
