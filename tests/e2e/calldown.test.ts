const nock = require('nock');
const {
  startServer,
  stopServer,
  cleanE2EData,
  generateJwt,
} = require('./support/serverHarness');
const { UserModel } = require('@app-connect/core/models/userModel');
const { CallDownListModel } = require('@app-connect/core/models/callDownListModel');

describe('Calldown App-level E2E', () => {
  const platform = 'insightly';
  const userId = 'e2e-calldown-insightly-user';
  const rcAccountId = 'e2e-calldown-insightly-account';
  const rcUserNumber = '+14155550991';
  const rcAccessToken = 'e2e-calldown-rc-access-token';
  const requestHeaders = {
    'X-RC-Access-Token': rcAccessToken,
    'rc-account-id': 'e2e-calldown-hashed-account',
    'rc-extension-id': 'e2e-calldown-hashed-extension',
  };

  let server;
  let client;
  let jwtToken;

  function authConfig() {
    return {
      params: { jwtToken },
      headers: requestHeaders,
    };
  }

  async function cleanData() {
    await CallDownListModel.destroy({ where: { userId } });
    await cleanE2EData({ userIds: [userId], rcAccountIds: [rcAccountId] });
  }

  async function seedUser() {
    await UserModel.create({
      id: userId,
      platform,
      rcAccountId,
      rcUserNumber,
      accessToken: 'e2e-calldown-insightly-access-token',
      refreshToken: 'e2e-calldown-insightly-refresh-token',
      tokenExpiry: new Date(Date.now() + 60 * 60 * 1000),
      userSettings: {},
      hashedRcExtensionId: requestHeaders['rc-extension-id'],
    });
    jwtToken = generateJwt({ id: userId, platform, rcUserNumber });
  }

  async function scheduleCalldown({ contactId, contactType, scheduledAt }) {
    return client.post('/calldown', {
      contactId,
      contactType,
      scheduledAt,
    }, authConfig());
  }

  beforeAll(async () => {
    nock.disableNetConnect();
    nock.enableNetConnect('127.0.0.1');
    await CallDownListModel.sync();
    ({ server, client } = await startServer());
  });

  afterAll(async () => {
    try {
      await cleanData();
    } finally {
      try {
        await stopServer(server);
      } finally {
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

  afterEach(() => {
    nock.cleanAll();
  });

  test('schedules and lists persisted calldowns through the real server', async () => {
    const laterResponse = await scheduleCalldown({
      contactId: 'insightly-contact-902',
      contactType: 'Contact',
      scheduledAt: '2026-08-12T15:00:00.000Z',
    });
    const earlierResponse = await scheduleCalldown({
      contactId: 'insightly-lead-901',
      contactType: 'Lead',
      scheduledAt: '2026-08-12T14:00:00.000Z',
    });

    expect(laterResponse.status).toBe(200);
    expect(laterResponse.data).toEqual({
      successful: true,
      id: expect.stringMatching(/^[0-9a-f]{32}$/),
    });
    expect(earlierResponse.status).toBe(200);
    expect(earlierResponse.data).toEqual({
      successful: true,
      id: expect.stringMatching(/^[0-9a-f]{32}$/),
    });

    const persistedEarlier = await CallDownListModel.findByPk(earlierResponse.data.id);
    expect(persistedEarlier).toMatchObject({
      id: earlierResponse.data.id,
      userId,
      contactId: 'insightly-lead-901',
      contactType: 'Lead',
      status: 'scheduled',
      lastCallAt: null,
    });
    expect(persistedEarlier.scheduledAt.toISOString()).toBe('2026-08-12T14:00:00.000Z');

    const listResponse = await client.get('/calldown', authConfig());

    expect(listResponse.status).toBe(200);
    expect(listResponse.data.successful).toBe(true);
    expect(listResponse.data.items.map(item => item.id)).toEqual([
      earlierResponse.data.id,
      laterResponse.data.id,
    ]);
    expect(listResponse.data.items[0]).toMatchObject({
      userId,
      contactId: 'insightly-lead-901',
      contactType: 'Lead',
      status: 'scheduled',
      scheduledAt: '2026-08-12T14:00:00.000Z',
      lastCallAt: null,
    });

    // Calldown is currently a local scheduling feature. With all non-local
    // network disabled, an unexpected RingCentral or CRM request fails the test.
    expect(nock.pendingMocks()).toEqual([]);
  });

  test('updates the status lifecycle and exposes it through list filters', async () => {
    const scheduleResponse = await scheduleCalldown({
      contactId: 'insightly-lead-903',
      contactType: 'Lead',
      scheduledAt: '2026-08-13T14:00:00.000Z',
    });
    const id = scheduleResponse.data.id;

    const updateResponse = await client.patch(`/calldown/${id}`, {
      contactId: 'insightly-contact-903',
      contactType: 'Contact',
      status: 'called',
      scheduledAt: '2026-08-13T14:30:00.000Z',
      lastCallAt: '2026-08-13T14:35:00.000Z',
    }, authConfig());

    expect(updateResponse.status).toBe(200);
    expect(updateResponse.data).toEqual({ successful: true });

    const persisted = await CallDownListModel.findByPk(id);
    expect(persisted).toMatchObject({
      id,
      userId,
      contactId: 'insightly-contact-903',
      contactType: 'Contact',
      status: 'called',
    });
    expect(persisted.scheduledAt.toISOString()).toBe('2026-08-13T14:30:00.000Z');
    expect(persisted.lastCallAt.toISOString()).toBe('2026-08-13T14:35:00.000Z');

    const calledResponse = await client.get('/calldown', {
      ...authConfig(),
      params: { jwtToken, status: 'called' },
    });
    const notCalledResponse = await client.get('/calldown', {
      ...authConfig(),
      params: { jwtToken, status: 'not called' },
    });

    expect(calledResponse.status).toBe(200);
    expect(calledResponse.data.items).toHaveLength(1);
    expect(calledResponse.data.items[0]).toMatchObject({
      id,
      contactId: 'insightly-contact-903',
      status: 'called',
      lastCallAt: '2026-08-13T14:35:00.000Z',
    });
    expect(notCalledResponse.status).toBe(200);
    expect(notCalledResponse.data).toEqual({ successful: true, items: [] });

    const deleteResponse = await client.delete(`/calldown/${id}`, authConfig());

    expect(deleteResponse.status).toBe(200);
    expect(deleteResponse.data).toEqual({ successful: true });
    expect(await CallDownListModel.findByPk(id)).toBeNull();

    const listAfterDeleteResponse = await client.get('/calldown', authConfig());
    expect(listAfterDeleteResponse.data).toEqual({ successful: true, items: [] });
    expect(nock.pendingMocks()).toEqual([]);
  });
});

export {};
