const nock = require('nock');
const {
  startServer,
  stopServer,
  cleanE2EData,
  generateJwt,
} = require('./support/serverHarness');
const { clioAppointmentCases } = require('./support/appointmentCases');
const { UserModel } = require('@app-connect/core/models/userModel');

describe('Clio appointment App-level E2E', () => {
  const {
    user,
    provider,
    expectedCapabilities,
    scenarios,
  } = clioAppointmentCases;

  let server;
  let client;
  let jwtToken;

  function authConfig() {
    return {
      params: { jwtToken },
      headers: provider.requestHeaders,
    };
  }

  function expectNoPendingCrmRequests() {
    expect(nock.pendingMocks()).toEqual([]);
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
      platformAdditionalInfo: user.platformAdditionalInfo,
      userSettings: {},
      hashedRcExtensionId: user.hashedExtensionId,
    });
    jwtToken = generateJwt({
      id: user.id,
      platform: user.platform,
      rcUserNumber: user.rcUserNumber,
    });
  }

  async function cleanData() {
    await cleanE2EData({
      userIds: [user.id],
      rcAccountIds: [user.rcAccountId],
    });
  }

  beforeAll(async () => {
    nock.disableNetConnect();
    nock.enableNetConnect('127.0.0.1');
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

  test('advertises real Clio appointment capabilities and lists mapped appointments', async () => {
    const interfaces = await client.get('/implementedInterfaces', {
      params: { platform: user.platform },
    });

    expect(interfaces.status).toBe(200);
    expect(interfaces.data).toMatchObject(expectedCapabilities);

    const listScope = nock(provider.apiBaseUrl)
      .matchHeader('authorization', provider.expectedAuthorization)
      .get('/api/v4/calendar_entries.json')
      .query({ fields: provider.listFields })
      .reply(200, scenarios.list.crmResponse);

    const response = await client.get('/appointments', {
      ...authConfig(),
      params: {
        jwtToken,
        ...scenarios.list.appRequestQuery,
      },
    });

    expect(response.status).toBe(200);
    expect(response.data).toEqual(scenarios.list.expectedResponse);
    expect(listScope.isDone()).toBe(true);
    expectNoPendingCrmRequests();
  });

  test('creates an appointment through the real Clio connector', async () => {
    let calendarQuery;
    const calendarScope = nock(provider.apiBaseUrl)
      .matchHeader('authorization', provider.expectedAuthorization)
      .get('/api/v4/calendars.json')
      .query(query => {
        calendarQuery = query;
        return true;
      })
      .reply(200, scenarios.create.calendarResponse);

    let createQuery;
    let createBody;
    const createScope = nock(provider.apiBaseUrl)
      .matchHeader('authorization', provider.expectedAuthorization)
      .post('/api/v4/calendar_entries.json', body => {
        createBody = body;
        return true;
      })
      .query(query => {
        createQuery = query;
        return true;
      })
      .reply(201, scenarios.create.crmResponse);

    const response = await client.post(
      '/appointments',
      scenarios.create.appRequestBody,
      authConfig(),
    );

    expect(response.status).toBe(200);
    expect(response.data).toMatchObject(scenarios.create.expectedResponse);
    expect(calendarQuery).toEqual(scenarios.create.expectedCalendarQuery);
    expect(createQuery).toEqual({ fields: provider.mutationFields });
    expect(createBody).toEqual(scenarios.create.expectedCrmRequestBody);
    expect(calendarScope.isDone()).toBe(true);
    expect(createScope.isDone()).toBe(true);
    expectNoPendingCrmRequests();
  });

  test('updates an appointment through the real Clio connector', async () => {
    const { appointmentId } = scenarios.update;
    const getExistingScope = nock(provider.apiBaseUrl)
      .matchHeader('authorization', provider.expectedAuthorization)
      .get(`/api/v4/calendar_entries/${appointmentId}.json`)
      .query({ fields: provider.calendarEntryFields })
      .reply(200, scenarios.update.existingCrmResponse);

    let updateBody;
    const updateScope = nock(provider.apiBaseUrl)
      .matchHeader('authorization', provider.expectedAuthorization)
      .patch(`/api/v4/calendar_entries/${appointmentId}.json`, body => {
        updateBody = body;
        return true;
      })
      .query({ fields: provider.mutationFields })
      .reply(200, scenarios.update.crmResponse);

    const response = await client.patch(
      `/appointments/${appointmentId}`,
      scenarios.update.appRequestBody,
      authConfig(),
    );

    expect(response.status).toBe(200);
    expect(response.data).toMatchObject(scenarios.update.expectedResponse);
    expect(updateBody).toEqual(scenarios.update.expectedCrmRequestBody);
    expect(getExistingScope.isDone()).toBe(true);
    expect(updateScope.isDone()).toBe(true);
    expectNoPendingCrmRequests();
  });

  test('refreshes and normalizes an appointment through the real Clio connector', async () => {
    const { appointmentId } = scenarios.refresh;
    const refreshScope = nock(provider.apiBaseUrl)
      .matchHeader('authorization', provider.expectedAuthorization)
      .get(`/api/v4/calendar_entries/${appointmentId}.json`)
      .query({ fields: provider.calendarEntryFields })
      .reply(200, scenarios.refresh.crmResponse);

    const response = await client.get(
      `/appointments/${appointmentId}/refresh`,
      authConfig(),
    );

    expect(response.status).toBe(200);
    expect(response.data).toEqual(scenarios.refresh.expectedResponse);
    expect(refreshScope.isDone()).toBe(true);
    expectNoPendingCrmRequests();
  });

  test('cancels an appointment through Clio and exposes confirm as unsupported', async () => {
    const interfaces = await client.get('/implementedInterfaces', {
      params: { platform: user.platform },
    });
    expect(interfaces.data.confirmAppointment).toBe(false);
    expect(interfaces.data.cancelAppointment).toBe(true);

    const { appointmentId } = scenarios.cancel;
    const cancelScope = nock(provider.apiBaseUrl)
      .matchHeader('authorization', provider.expectedAuthorization)
      .delete(`/api/v4/calendar_entries/${appointmentId}.json`)
      .reply(204);

    const response = await client.post(
      `/appointments/${appointmentId}/cancel`,
      undefined,
      authConfig(),
    );

    expect(response.status).toBe(200);
    expect(response.data).toEqual(scenarios.cancel.expectedResponse);
    expect(cancelScope.isDone()).toBe(true);
    expectNoPendingCrmRequests();
  });
});

export {};
