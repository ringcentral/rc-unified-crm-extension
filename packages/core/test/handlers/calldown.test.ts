const calldown = require('../../handlers/calldown');
const { generateJwt } = require('../../lib/jwt');
const oauth = require('../../lib/oauth');
const connectorRegistry = require('../../connector/registry');
const { CallDownListModel } = require('../../models/callDownListModel');
const { UserModel } = require('../../models/userModel');
const {
  scheduledCalldownCase,
  calldownListRecords,
  calldownStatusRecords,
  calldownStatusFilterCases,
  unauthorizedCalldownOperationCases,
  calldownUpdateCase,
} = require('../data/calldownCases');

describe('Calldown Handler', () => {
  const originalSecret = process.env.APP_SERVER_SECRET_KEY;

  beforeAll(async () => {
    process.env.APP_SERVER_SECRET_KEY = 'test-app-server-secret-key-123456';
    await UserModel.sync({ force: true });
    await CallDownListModel.sync({ force: true });
  });

  afterEach(async () => {
    await CallDownListModel.destroy({ where: {} });
    await UserModel.destroy({ where: {} });
    connectorRegistry.unregisterConnector('testCRM');
    jest.restoreAllMocks();
  });

  afterAll(() => {
    if (originalSecret === undefined) {
      delete process.env.APP_SERVER_SECRET_KEY;
    } else {
      process.env.APP_SERVER_SECRET_KEY = originalSecret;
    }
  });

  function tokenFor(userId) {
    return generateJwt({
      id: userId,
      platform: 'testCRM',
    });
  }

  async function createUser(id = 'user-1') {
    return UserModel.create({
      id,
      platform: 'testCRM',
      accessToken: 'token',
    });
  }

  test('schedule creates a scheduled record for the JWT user', async () => {
    await createUser('user-1');

    const result = await calldown.schedule({
      jwtToken: tokenFor('user-1'),
      body: scheduledCalldownCase.body,
    });

    expect(result.id).toMatch(/^[0-9a-f]{32}$/);
    const record = await CallDownListModel.findByPk(result.id);
    expect(record).toMatchObject({
      id: result.id,
      ...scheduledCalldownCase.expectedRecord,
    });
    expect(record.scheduledAt.toISOString()).toBe(scheduledCalldownCase.body.scheduledAt);
    expect(record.lastCallAt).toBeNull();
  });

  test('schedule uses current defaults for optional body fields', async () => {
    await createUser('user-1');

    const result = await calldown.schedule({
      jwtToken: tokenFor('user-1'),
      body: {},
    });

    const record = await CallDownListModel.findByPk(result.id);
    expect(record.contactId).toBeNull();
    expect(record.contactType).toBe('contact');
    expect(record.contactName).toBeUndefined();
    expect(record.phoneNumber).toBeUndefined();
    expect(record.note).toBeUndefined();
    expect(record.status).toBe('scheduled');
    expect(record.scheduledAt).toBeNull();
  });

  test('schedule rejects missing users', async () => {
    await expect(calldown.schedule({
      jwtToken: tokenFor('missing-user'),
      body: {},
    })).rejects.toThrow('User not found');
  });

  test.each<[any]>(unauthorizedCalldownOperationCases as [any][])(
    '$label rejects an invalid JWT',
    async ({ method, args }) => {
      await expect(calldown[method]({
        jwtToken: 'not-a-valid-token',
        ...args,
      })).rejects.toThrow('Unauthorized');
    },
  );

  test('list returns all records for the JWT user ordered by scheduledAt', async () => {
    await createUser('user-1');
    await createUser('user-2');
    await CallDownListModel.bulkCreate(calldownListRecords);

    const { items } = await calldown.list({
      jwtToken: tokenFor('user-1'),
    });

    expect(items.map((item) => item.id)).toEqual(['earlier', 'later']);
  });

  test.each<[any]>(calldownStatusFilterCases as [any][])(
    'list applies the $label status filter',
    async ({ status, expectedIds }) => {
    await createUser('user-1');
    await CallDownListModel.bulkCreate(calldownStatusRecords);

    const result = await calldown.list({
      jwtToken: tokenFor('user-1'),
      status,
    });

    expect(result.items.map((item) => item.id)).toEqual(expectedIds);
    },
  );

  test('remove physically deletes only records owned by the JWT user', async () => {
    await createUser('user-1');
    await createUser('user-2');
    await CallDownListModel.bulkCreate([
      {
        id: 'owned-record',
        userId: 'user-1',
        status: 'scheduled',
      },
      {
        id: 'other-record',
        userId: 'user-2',
        status: 'scheduled',
      },
    ]);

    await expect(calldown.remove({
      jwtToken: tokenFor('user-1'),
      id: 'other-record',
    })).rejects.toThrow('Not found');

    await expect(calldown.remove({
      jwtToken: tokenFor('user-1'),
      id: 'owned-record',
    })).resolves.toEqual({ successful: true });

    await expect(CallDownListModel.findByPk('owned-record')).resolves.toBeNull();
    await expect(CallDownListModel.findByPk('other-record')).resolves.not.toBeNull();
  });

  test('markCalled updates status and lastCallAt for owned records', async () => {
    await createUser('user-1');
    await CallDownListModel.create({
      id: 'call-to-mark',
      userId: 'user-1',
      status: 'scheduled',
    });

    const result = await calldown.markCalled({
      jwtToken: tokenFor('user-1'),
      id: 'call-to-mark',
      lastCallAt: '2026-07-02T14:30:00.000Z',
    });

    expect(result).toEqual({ successful: true });
    const record = await CallDownListModel.findByPk('call-to-mark');
    expect(record.status).toBe('called');
    expect(record.lastCallAt.toISOString()).toBe('2026-07-02T14:30:00.000Z');
  });

  test('markCalled defaults lastCallAt to the current time', async () => {
    await createUser('user-1');
    await CallDownListModel.create({
      id: 'call-with-default-time',
      userId: 'user-1',
      status: 'scheduled',
    });
    const before = Date.now();

    await calldown.markCalled({
      jwtToken: tokenFor('user-1'),
      id: 'call-with-default-time',
    });

    const after = Date.now();
    const record = await CallDownListModel.findByPk('call-with-default-time');
    expect(record.lastCallAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(record.lastCallAt.getTime()).toBeLessThanOrEqual(after);
  });

  test('markCalled preserves owner isolation and returns the current database error shape', async () => {
    await createUser('user-1');
    await createUser('user-2');
    await CallDownListModel.create({
      id: 'other-user-call',
      userId: 'user-2',
      status: 'scheduled',
    });

    const result = await calldown.markCalled({
      jwtToken: tokenFor('user-1'),
      id: 'other-user-call',
    });

    expect(result).toEqual({
      successful: false,
      returnMessage: {
        message: 'Database operation failed',
        messageType: 'warning',
        ttl: 5000,
      },
    });
    const record = await CallDownListModel.findByPk('other-user-call');
    expect(record.status).toBe('scheduled');
    expect(record.lastCallAt).toBeNull();
  });

  test('update applies allowed fields and ignores disallowed fields', async () => {
    await createUser('user-1');
    await CallDownListModel.create(calldownUpdateCase.existingRecord);

    const result = await calldown.update({
      jwtToken: tokenFor('user-1'),
      id: 'call-to-update',
      updateData: calldownUpdateCase.updateData,
    });

    expect(result).toEqual({ successful: true });
    const record = await CallDownListModel.findByPk('call-to-update');
    expect(record).toMatchObject(calldownUpdateCase.expectedRecord);
    expect(record.scheduledAt.toISOString()).toBe(calldownUpdateCase.updateData.scheduledAt);
    expect(record.lastCallAt.toISOString()).toBe(calldownUpdateCase.updateData.lastCallAt);
    expect(record.unexpectedField).toBeUndefined();
  });

  test('keeps a numeric CRM contact id stable when a callback is edited', async () => {
    await createUser('user-1');
    await CallDownListModel.create({
      id: 'clio-callback',
      userId: 'user-1',
      contactId: '2211989267.0',
      contactType: 'Person',
      status: 'scheduled',
    });

    const listed = await calldown.list({ jwtToken: tokenFor('user-1') });
    expect(listed.items.map((item) => item.contactId)).toEqual(['2211989267']);

    await calldown.update({
      jwtToken: tokenFor('user-1'),
      id: 'clio-callback',
      updateData: {
        contactId: 2211989267,
        scheduledAt: '2026-11-28T07:16:00.000Z',
      },
    });

    const record = await CallDownListModel.findByPk('clio-callback');
    expect(record.contactId).toBe('2211989267');
  });

  test('update rejects no-op and cross-owner updates', async () => {
    await createUser('user-1');
    await createUser('user-2');
    await CallDownListModel.create({
      id: 'other-user-update',
      userId: 'user-2',
      status: 'scheduled',
    });

    await expect(calldown.update({
      jwtToken: tokenFor('user-1'),
      id: 'other-user-update',
      updateData: {
        status: 'called',
      },
    })).rejects.toThrow('Not found');

    await expect(calldown.update({
      jwtToken: tokenFor('user-1'),
      id: 'other-user-update',
      updateData: {
        unexpectedField: 'ignored',
        contactName: 'Ada',
        note: 'Try again tomorrow',
      },
    })).rejects.toThrow('No valid fields to update');

    const record = await CallDownListModel.findByPk('other-user-update');
    expect(record.status).toBe('scheduled');
  });

  function registerSyncConnector(syncCallback, auth = {}) {
    connectorRegistry.registerConnector('testCRM', {
      getAuthType: auth.getAuthType || (() => 'apiKey'),
      getBasicAuth: auth.getBasicAuth || (() => 'encoded-key'),
      getOauthInfo: auth.getOauthInfo || jest.fn(),
      createCallLog: jest.fn(),
      updateCallLog: jest.fn(),
      syncCallback,
    });
  }

  test('schedule does not call CRM when syncCallback is absent', async () => {
    await createUser('user-1');
    connectorRegistry.registerConnector('testCRM', {
      getAuthType: () => 'apiKey',
      createCallLog: jest.fn(),
      updateCallLog: jest.fn(),
    });

    const result = await calldown.schedule({
      jwtToken: tokenFor('user-1'),
      body: scheduledCalldownCase.body,
    });

    expect(result).toEqual({ id: result.id });
    expect(result.returnMessage).toBeUndefined();
  });

  test('schedule forwards request details to syncCallback without storing them', async () => {
    await createUser('user-1');
    const syncCallback = jest.fn().mockResolvedValue({
      returnMessage: {
        message: 'Task created',
        messageType: 'success',
        ttl: 3000,
      },
    });
    registerSyncConnector(syncCallback);

    const result = await calldown.schedule({
      jwtToken: tokenFor('user-1'),
      body: scheduledCalldownCase.body,
    });

    const record = await CallDownListModel.findByPk(result.id);
    expect(record.contactName).toBeUndefined();
    expect(record.phoneNumber).toBeUndefined();
    expect(record.note).toBeUndefined();
    expect(result.returnMessage).toEqual({
      message: 'Task created',
      messageType: 'success',
      ttl: 3000,
    });
    expect(syncCallback).toHaveBeenCalledWith({
      user: expect.objectContaining({ id: 'user-1', platform: 'testCRM' }),
      authHeader: 'Basic encoded-key',
      proxyConfig: null,
      event: 'created',
      previous: null,
      callback: {
        id: result.id,
        contactId: '12345',
        contactType: 'Lead',
        phoneNumber: '+15551234567',
        status: 'scheduled',
        scheduledAt: '2026-07-02T13:00:00.000Z',
        lastCallAt: null,
      },
    });
  });

  test('keeps the local entry and returns the connector warning when CRM sync fails', async () => {
    await createUser('user-1');
    const syncCallback = jest.fn().mockResolvedValue({
      successful: false,
      returnMessage: {
        message: 'CRM rejected the task',
        messageType: 'warning',
        ttl: 3000,
      },
    });
    registerSyncConnector(syncCallback);

    const result = await calldown.schedule({
      jwtToken: tokenFor('user-1'),
      body: scheduledCalldownCase.body,
    });

    expect(result.returnMessage).toEqual({
      message: 'CRM rejected the task',
      messageType: 'warning',
      ttl: 3000,
    });
    const record = await CallDownListModel.findByPk(result.id);
    expect(record.status).toBe('scheduled');
    expect(record.contactName).toBeUndefined();
  });

  test('keeps the local entry when the connector throws', async () => {
    await createUser('user-1');
    const syncCallback = jest.fn().mockRejectedValue(new Error('crm down'));
    registerSyncConnector(syncCallback);

    const result = await calldown.schedule({
      jwtToken: tokenFor('user-1'),
      body: { contactId: 'contact-1' },
    });

    expect(result.id).toEqual(expect.any(String));
    expect(result.returnMessage).toEqual(expect.objectContaining({
      message: 'Error performing syncCallback',
      messageType: 'warning',
    }));
    await expect(CallDownListModel.findByPk(result.id)).resolves.not.toBeNull();
  });

  test('keeps the local entry when the CRM session cannot be refreshed', async () => {
    await createUser('user-1');
    const syncCallback = jest.fn();
    registerSyncConnector(syncCallback, {
      getAuthType: async () => 'oauth',
      getOauthInfo: async () => ({ clientId: 'client' }),
    });
    jest.spyOn(oauth, 'getOAuthApp').mockReturnValue({ name: 'app' });
    jest.spyOn(oauth, 'checkAndRefreshAccessToken').mockResolvedValue(null);

    const result = await calldown.schedule({
      jwtToken: tokenFor('user-1'),
      body: { contactId: 'contact-1' },
    });

    expect(syncCallback).not.toHaveBeenCalled();
    expect(result.returnMessage).toEqual({
      message: 'Callback saved in App Connect. CRM session expired.',
      messageType: 'warning',
      ttl: 5000,
    });
    await expect(CallDownListModel.findByPk(result.id)).resolves.not.toBeNull();
  });

  test('sends updated, called, and deleted events using the request details and App Connect id', async () => {
    await createUser('user-1');
    const syncCallback = jest.fn(async () => ({}));
    registerSyncConnector(syncCallback);

    const created = await calldown.schedule({
      jwtToken: tokenFor('user-1'),
      body: {
        contactId: 'contact-1',
        contactName: 'Ada',
        phoneNumber: '+15550001111',
        scheduledAt: '2026-07-02T13:00:00.000Z',
      },
    });

    const updated = await calldown.update({
      jwtToken: tokenFor('user-1'),
      id: created.id,
      updateData: {
        phoneNumber: '+15550001111',
        scheduledAt: '2026-07-03T13:00:00.000Z',
      },
    });
    expect(updated).toEqual({ successful: true });

    const called = await calldown.markCalled({
      jwtToken: tokenFor('user-1'),
      id: created.id,
      lastCallAt: '2026-07-02T14:30:00.000Z',
    });
    expect(called).toEqual({ successful: true });

    const removed = await calldown.remove({
      jwtToken: tokenFor('user-1'),
      id: created.id,
    });
    expect(removed).toEqual({ successful: true });

    const events = syncCallback.mock.calls.map(([payload]) => payload.event);
    expect(events).toEqual(['created', 'updated', 'called', 'deleted']);
    expect(syncCallback.mock.calls[0][0].callback).toEqual({
      id: created.id,
      contactId: 'contact-1',
      contactType: 'contact',
      phoneNumber: '+15550001111',
      status: 'scheduled',
      scheduledAt: '2026-07-02T13:00:00.000Z',
      lastCallAt: null,
    });
    expect(syncCallback.mock.calls[1][0].callback).toEqual({
      id: created.id,
      contactId: 'contact-1',
      contactType: 'contact',
      phoneNumber: '+15550001111',
      status: 'scheduled',
      scheduledAt: '2026-07-03T13:00:00.000Z',
      lastCallAt: null,
    });
    expect(syncCallback.mock.calls[1][0].previous).toEqual({
      id: created.id,
      contactId: 'contact-1',
      contactType: 'contact',
      status: 'scheduled',
      scheduledAt: '2026-07-02T13:00:00.000Z',
      lastCallAt: null,
    });
    expect(syncCallback.mock.calls[2][0].callback).toEqual({
      id: created.id,
      contactId: 'contact-1',
      contactType: 'contact',
      status: 'called',
      scheduledAt: '2026-07-03T13:00:00.000Z',
      lastCallAt: '2026-07-02T14:30:00.000Z',
    });
    expect(syncCallback.mock.calls[3][0].callback).toEqual({
      id: created.id,
      contactId: 'contact-1',
      contactType: 'contact',
      status: 'called',
      scheduledAt: '2026-07-03T13:00:00.000Z',
      lastCallAt: '2026-07-02T14:30:00.000Z',
    });
    expect(syncCallback.mock.calls[3][0].previous.phoneNumber).toBeUndefined();
    await expect(CallDownListModel.findByPk(created.id)).resolves.toBeNull();
  });

  test('uses called when an update changes the status to called', async () => {
    await createUser('user-1');
    const syncCallback = jest.fn().mockResolvedValue({});
    registerSyncConnector(syncCallback);
    await CallDownListModel.create({
      id: 'status-change',
      userId: 'user-1',
      status: 'scheduled',
    });

    await calldown.update({
      jwtToken: tokenFor('user-1'),
      id: 'status-change',
      updateData: { status: 'called' },
    });

    expect(syncCallback).toHaveBeenCalledWith(expect.objectContaining({
      event: 'called',
      previous: expect.objectContaining({ id: 'status-change', status: 'scheduled' }),
      callback: expect.objectContaining({ id: 'status-change', status: 'called' }),
    }));
  });
});


export {};
