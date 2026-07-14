const nock = require('nock');
const { getHashValue } = require('@app-connect/core/lib/util');
const { UserModel } = require('@app-connect/core/models/userModel');
const { AdminConfigModel } = require('@app-connect/core/models/adminConfigModel');
const {
  startServer,
  stopServer,
  cleanE2EData,
  generateJwt,
} = require('./support/serverHarness');
const {
  pipedriveUserMappingCase,
} = require('./support/pipedriveUserMappingCases');

describe('Pipedrive user mapping App-level E2E', () => {
  const {
    identity,
    provider,
    requestHeaders,
    ringCentralAdminResponse,
    crmResponse,
    initialPersistedMappings,
    appRequestBody,
    expectedInitialRead,
    expectedReinitializedRead,
    expectedPersistedMappings,
  } = pipedriveUserMappingCase;
  const hashedRcAccountId = getHashValue(identity.rcAccountId, process.env.HASH_KEY);
  const environment = {
    PIPEDRIVE_CLIENT_ID: 'e2e-pipedrive-mapping-client-id',
    PIPEDRIVE_CLIENT_SECRET: 'e2e-pipedrive-mapping-client-secret',
    PIPEDRIVE_ACCESS_TOKEN_URI: 'https://oauth.pipedrive.com/oauth/token',
  };
  const previousEnvironment = Object.fromEntries(
    Object.keys(environment).map(key => [key, process.env[key]]),
  );

  let server;
  let client;
  let jwtToken;

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
      accessToken: identity.accessToken,
      refreshToken: 'e2e-pipedrive-mapping-refresh-token',
      tokenExpiry: new Date(Date.now() + 60 * 60 * 1000),
      timezoneOffset: '+00:00',
      platformAdditionalInfo: {},
      userSettings: {},
      hashedRcExtensionId: identity.hashedExtensionId,
    });
    jwtToken = generateJwt({
      id: identity.userId,
      platform: identity.platform,
      rcUserNumber: identity.rcUserNumber,
    });
  }

  function restoreEnvironment() {
    for (const key of Object.keys(environment)) {
      const previousValue = previousEnvironment[key];
      if (previousValue === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previousValue;
      }
    }
  }

  beforeAll(async () => {
    Object.assign(process.env, environment);
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
        restoreEnvironment();
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

  test('reads and reinitializes mapping through the real Pipedrive connector', async () => {
    await AdminConfigModel.create({
      id: hashedRcAccountId,
      userMappings: initialPersistedMappings,
    });
    const ringCentralScope = nock('https://platform.ringcentral.com')
      .matchHeader('authorization', `Bearer ${identity.rcAccessToken}`)
      .get('/restapi/v1.0/account/~/extension/~')
      .times(2)
      .reply(200, ringCentralAdminResponse);
    const pipedriveScope = nock(provider.apiBaseUrl)
      .matchHeader('authorization', provider.authorization)
      .get('/api/v1/users')
      .times(2)
      .reply(200, crmResponse);
    const config = {
      params: { jwtToken },
      headers: requestHeaders,
    };

    const initialRead = await client.post('/admin/userMapping', appRequestBody, config);
    expect(initialRead.status).toBe(200);
    expect(initialRead.data).toEqual(expectedInitialRead);

    const reinitialized = await client.post(
      '/admin/reinitializeUserMapping',
      appRequestBody,
      config,
    );
    expect(reinitialized.status).toBe(200);
    expect(reinitialized.data).toEqual(expectedReinitializedRead);

    const persistedConfig = await AdminConfigModel.findByPk(hashedRcAccountId);
    expect(persistedConfig.userMappings).toEqual(expectedPersistedMappings);
    expect(ringCentralScope.isDone()).toBe(true);
    expect(pipedriveScope.isDone()).toBe(true);
    expect(nock.pendingMocks()).toEqual([]);
  });
});

export {};
