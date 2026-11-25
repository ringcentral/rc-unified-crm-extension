jest.mock('../../models/dynamo/connectorSchema', () => ({
  Connector: {
    getProxyConfig: jest.fn(),
  },
}));

const calldown = require('../../handlers/calldown');
const { generateJwt } = require('../../lib/jwt');
const oauth = require('../../lib/oauth');
const connectorRegistry = require('../../connector/registry');
const { CallDownListModel } = require('../../models/callDownListModel');
const { UserModel } = require('../../models/userModel');
const { Connector } = require('../../models/dynamo/connectorSchema');
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
      platform: 'testCRM',
      thirdPartyId: null,
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

  function registerCallbackConnector(interfaces, auth: {
    getAuthType?: (...args: any[]) => any;
    getBasicAuth?: (...args: any[]) => any;
    getOauthInfo?: (...args: any[]) => any;
  } = {}) {
    connectorRegistry.registerConnector('testCRM', {
      getAuthType: auth.getAuthType || (() => 'apiKey'),
      getBasicAuth: auth.getBasicAuth || (() => 'encoded-key'),
      getOauthInfo: auth.getOauthInfo || jest.fn(),
      createCallLog: jest.fn(),
      updateCallLog: jest.fn(),
      createCallback: interfaces.createCallback,
      updateCallback: interfaces.updateCallback,
      markCalledCallback: interfaces.markCalledCallback,
      deleteCallback: interfaces.deleteCallback,
    });
  }

  test('schedule does not call CRM when createCallback is absent', async () => {
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
    const record = await CallDownListModel.findByPk(result.id);
    expect(record.platform).toBe('testCRM');
    expect(record.thirdPartyId).toBeNull();
  });

  test('schedule forwards request details to createCallback and stores the CRM id', async () => {
    await createUser('user-1');
    const createCallback = jest.fn(async () => {
      const rows = await CallDownListModel.findAll({ where: { userId: 'user-1' } });
      expect(rows).toHaveLength(0);
      return {
        thirdPartyId: 88001,
        returnMessage: {
          message: 'Task created',
          messageType: 'success',
          ttl: 3000,
        },
      };
    });
    registerCallbackConnector({ createCallback });

    const result = await calldown.schedule({
      jwtToken: tokenFor('user-1'),
      body: scheduledCalldownCase.body,
    });

    const record = await CallDownListModel.findByPk(result.id);
    expect(record.contactName).toBeUndefined();
    expect(record.phoneNumber).toBeUndefined();
    expect(record.note).toBeUndefined();
    expect(record.platform).toBe('testCRM');
    expect(record.thirdPartyId).toBe('88001');
    expect(result.returnMessage).toEqual({
      message: 'Task created',
      messageType: 'success',
      ttl: 3000,
    });
    expect(createCallback).toHaveBeenCalledWith({
      user: expect.objectContaining({ id: 'user-1', platform: 'testCRM' }),
      authHeader: 'Basic encoded-key',
      proxyConfig: null,
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
    const createCallback = jest.fn().mockResolvedValue({
      successful: false,
      thirdPartyId: 'should-not-store',
      returnMessage: {
        message: 'CRM rejected the task',
        messageType: 'warning',
        ttl: 3000,
      },
    });
    registerCallbackConnector({ createCallback });

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
    expect(record.thirdPartyId).toBeNull();
    expect(record.contactName).toBeUndefined();
  });

  test('keeps the local entry when the connector throws', async () => {
    await createUser('user-1');
    const createCallback = jest.fn().mockRejectedValue(new Error('crm down'));
    registerCallbackConnector({ createCallback });

    const result = await calldown.schedule({
      jwtToken: tokenFor('user-1'),
      body: { contactId: 'contact-1' },
    });

    expect(result.id).toEqual(expect.any(String));
    expect(result.returnMessage).toEqual(expect.objectContaining({
      message: 'Error performing createCallback',
      messageType: 'warning',
    }));
    const record = await CallDownListModel.findByPk(result.id);
    expect(record).not.toBeNull();
    expect(record.thirdPartyId).toBeNull();
  });

  test('keeps the local entry when the CRM session cannot be refreshed', async () => {
    await createUser('user-1');
    const createCallback = jest.fn();
    registerCallbackConnector({ createCallback }, {
      getAuthType: async () => 'oauth',
      getOauthInfo: async () => ({ clientId: 'client' }),
    });
    jest.spyOn(oauth, 'getOAuthApp').mockReturnValue({ name: 'app' });
    jest.spyOn(oauth, 'checkAndRefreshAccessToken').mockResolvedValue(null);

    const result = await calldown.schedule({
      jwtToken: tokenFor('user-1'),
      body: { contactId: 'contact-1' },
    });

    expect(createCallback).not.toHaveBeenCalled();
    expect(result.returnMessage).toEqual({
      message: 'Callback saved in App Connect. CRM session expired.',
      messageType: 'warning',
      ttl: 5000,
    });
    await expect(CallDownListModel.findByPk(result.id)).resolves.not.toBeNull();
  });

  test('sends update and delete through their own interfaces with the stored CRM id', async () => {
    await createUser('user-1');
    const createCallback = jest.fn(async (_payload) => ({ thirdPartyId: 'crm-task-9' }));
    const updateCallback = jest.fn(async (_payload) => ({}));
    const markCalledCallback = jest.fn(async (_payload) => ({}));
    const deleteCallback = jest.fn(async (_payload) => ({}));
    registerCallbackConnector({ createCallback, updateCallback, markCalledCallback, deleteCallback });

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

    expect(createCallback).toHaveBeenCalledTimes(1);
    expect(updateCallback).toHaveBeenCalledTimes(1);
    expect(markCalledCallback).toHaveBeenCalledTimes(1);
    expect(deleteCallback).toHaveBeenCalledTimes(1);
    expect(updateCallback.mock.calls[0][0].callback).toEqual({
      id: created.id,
      contactId: 'contact-1',
      contactType: 'contact',
      phoneNumber: '+15550001111',
      status: 'scheduled',
      scheduledAt: '2026-07-03T13:00:00.000Z',
      lastCallAt: null,
    });
    expect(updateCallback.mock.calls[0][0].thirdPartyId).toBe('crm-task-9');
    expect(updateCallback.mock.calls[0][0].previous).toEqual({
      id: created.id,
      contactId: 'contact-1',
      contactType: 'contact',
      status: 'scheduled',
      scheduledAt: '2026-07-02T13:00:00.000Z',
      lastCallAt: null,
    });
    expect(markCalledCallback.mock.calls[0][0].callback).toEqual({
      id: created.id,
      contactId: 'contact-1',
      contactType: 'contact',
      status: 'called',
      scheduledAt: '2026-07-03T13:00:00.000Z',
      lastCallAt: '2026-07-02T14:30:00.000Z',
    });
    expect(markCalledCallback.mock.calls[0][0].thirdPartyId).toBe('crm-task-9');
    expect(markCalledCallback.mock.calls[0][0].previous).toEqual(expect.objectContaining({
      id: created.id,
      status: 'scheduled',
    }));
    expect(deleteCallback.mock.calls[0][0].callback).toEqual({
      id: created.id,
      contactId: 'contact-1',
      contactType: 'contact',
      status: 'called',
      scheduledAt: '2026-07-03T13:00:00.000Z',
      lastCallAt: '2026-07-02T14:30:00.000Z',
    });
    expect(deleteCallback.mock.calls[0][0].thirdPartyId).toBe('crm-task-9');
    expect(deleteCallback.mock.calls[0][0].callback.phoneNumber).toBeUndefined();
    await expect(CallDownListModel.findByPk(created.id)).resolves.toBeNull();
  });

  test('passes null thirdPartyId when createCallback does not return one', async () => {
    await createUser('user-1');
    const createCallback = jest.fn(async () => ({}));
    const updateCallback = jest.fn(async () => ({}));
    const markCalledCallback = jest.fn(async () => ({}));
    const deleteCallback = jest.fn(async () => ({}));
    registerCallbackConnector({ createCallback, updateCallback, markCalledCallback, deleteCallback });

    const created = await calldown.schedule({
      jwtToken: tokenFor('user-1'),
      body: { contactId: 'contact-1', scheduledAt: '2026-07-02T13:00:00.000Z' },
    });

    const record = await CallDownListModel.findByPk(created.id);
    expect(record.thirdPartyId).toBeNull();

    await calldown.update({
      jwtToken: tokenFor('user-1'),
      id: created.id,
      updateData: { scheduledAt: '2026-07-03T13:00:00.000Z' },
    });
    await calldown.markCalled({
      jwtToken: tokenFor('user-1'),
      id: created.id,
      lastCallAt: '2026-07-02T14:30:00.000Z',
    });
    await calldown.remove({
      jwtToken: tokenFor('user-1'),
      id: created.id,
    });

    expect(updateCallback).toHaveBeenCalledWith(expect.objectContaining({
      thirdPartyId: null,
      callback: expect.objectContaining({ id: created.id }),
    }));
    expect(markCalledCallback).toHaveBeenCalledWith(expect.objectContaining({
      thirdPartyId: null,
      callback: expect.objectContaining({ id: created.id, status: 'called' }),
    }));
    expect(deleteCallback).toHaveBeenCalledWith(expect.objectContaining({
      thirdPartyId: null,
      callback: expect.objectContaining({ id: created.id }),
    }));
  });

  test('uses markCalledCallback when an update changes the status to called', async () => {
    await createUser('user-1');
    const updateCallback = jest.fn().mockResolvedValue({});
    const markCalledCallback = jest.fn().mockResolvedValue({});
    registerCallbackConnector({ updateCallback, markCalledCallback });
    await CallDownListModel.create({
      id: 'status-change',
      userId: 'user-1',
      platform: 'testCRM',
      thirdPartyId: 'crm-task-4',
      status: 'scheduled',
    });

    await calldown.update({
      jwtToken: tokenFor('user-1'),
      id: 'status-change',
      updateData: { status: 'called' },
    });

    expect(updateCallback).not.toHaveBeenCalled();
    expect(markCalledCallback).toHaveBeenCalledWith(expect.objectContaining({
      thirdPartyId: 'crm-task-4',
      previous: expect.objectContaining({ id: 'status-change', status: 'scheduled' }),
      callback: expect.objectContaining({ id: 'status-change', status: 'called' }),
    }));
  });

  test('removes the CRM record when the local save fails after createCallback', async () => {
    await createUser('user-1');
    const createCallback = jest.fn(async () => ({ thirdPartyId: 'crm-task-late' }));
    const deleteCallback = jest.fn(async (_payload) => ({}));
    registerCallbackConnector({ createCallback, deleteCallback });
    jest.spyOn(CallDownListModel, 'create').mockRejectedValueOnce(new Error('db down'));

    await expect(calldown.schedule({
      jwtToken: tokenFor('user-1'),
      body: { contactId: 'contact-1', scheduledAt: '2026-07-02T13:00:00.000Z' },
    })).rejects.toThrow('db down');

    expect(createCallback).toHaveBeenCalledTimes(1);
    expect(deleteCallback).toHaveBeenCalledTimes(1);
    expect(deleteCallback).toHaveBeenCalledWith(expect.objectContaining({
      thirdPartyId: 'crm-task-late',
      callback: expect.objectContaining({ contactId: 'contact-1', status: 'scheduled' }),
    }));
    await expect(CallDownListModel.findOne({ where: { userId: 'user-1' } })).resolves.toBeNull();
  });

  test('leaves the CRM untouched when the local save fails and createCallback returned no id', async () => {
    await createUser('user-1');
    const createCallback = jest.fn(async () => ({}));
    const deleteCallback = jest.fn(async (_payload) => ({}));
    registerCallbackConnector({ createCallback, deleteCallback });
    jest.spyOn(CallDownListModel, 'create').mockRejectedValueOnce(new Error('db down'));

    await expect(calldown.schedule({
      jwtToken: tokenFor('user-1'),
      body: { contactId: 'contact-1' },
    })).rejects.toThrow('db down');

    expect(deleteCallback).not.toHaveBeenCalled();
  });

  test('refreshes oauth and forwards proxy config before saving the CRM id', async () => {
    await UserModel.create({
      id: 'user-1',
      platform: 'testCRM',
      accessToken: 'old-token',
      hostname: 'crm.example',
      platformAdditionalInfo: {
        proxyId: 'proxy-1',
        tokenUrl: 'https://crm.example/token',
      },
    });
    const proxyConfig = { id: 'proxy-1' };
    Connector.getProxyConfig.mockResolvedValue(proxyConfig);
    const createCallback = jest.fn(async () => ({ thirdPartyId: 'crm-oauth-1' }));
    registerCallbackConnector({ createCallback }, {
      getAuthType: async () => 'oauth',
      getOauthInfo: async () => ({ clientId: 'client' }),
    });
    const refreshedUser = { id: 'user-1', platform: 'testCRM', accessToken: 'fresh-token' };
    jest.spyOn(oauth, 'getOAuthApp').mockReturnValue({ name: 'app' });
    jest.spyOn(oauth, 'checkAndRefreshAccessToken').mockResolvedValue(refreshedUser);

    const result = await calldown.schedule({
      jwtToken: tokenFor('user-1'),
      body: { contactId: 'contact-1', phoneNumber: '' },
    });

    expect(Connector.getProxyConfig).toHaveBeenCalledWith('proxy-1');
    expect(createCallback).toHaveBeenCalledWith({
      user: refreshedUser,
      authHeader: 'Bearer fresh-token',
      proxyConfig,
      callback: {
        id: result.id,
        contactId: 'contact-1',
        contactType: 'contact',
        status: 'scheduled',
        scheduledAt: null,
        lastCallAt: null,
      },
    });
    const record = await CallDownListModel.findByPk(result.id);
    expect(record.thirdPartyId).toBe('crm-oauth-1');
  });

  test('saves only the local entry when the user has no CRM platform', async () => {
    await UserModel.create({
      id: 'user-1',
      platform: null,
      accessToken: 'token',
    });
    const createCallback = jest.fn();
    registerCallbackConnector({ createCallback });

    const result = await calldown.schedule({
      jwtToken: tokenFor('user-1'),
      body: { contactId: 'contact-1' },
    });

    expect(createCallback).not.toHaveBeenCalled();
    expect(result.returnMessage).toBeUndefined();
    const record = await CallDownListModel.findByPk(result.id);
    expect(record.platform).toBeNull();
    expect(record.thirdPartyId).toBeNull();
  });

  test('uses the generic warning when CRM sync fails without a message', async () => {
    await createUser('user-1');
    const createCallback = jest.fn().mockResolvedValue({
      successful: false,
      thirdPartyId: 'should-not-store',
    });
    registerCallbackConnector({ createCallback });

    const result = await calldown.schedule({
      jwtToken: tokenFor('user-1'),
      body: { contactId: 'contact-1' },
    });

    expect(result.returnMessage).toEqual({
      message: 'Callback saved in App Connect. CRM sync failed.',
      messageType: 'warning',
      ttl: 5000,
    });
    const record = await CallDownListModel.findByPk(result.id);
    expect(record.thirdPartyId).toBeNull();
  });

  test('does not store a blank CRM id', async () => {
    await createUser('user-1');
    const createCallback = jest.fn().mockResolvedValue({ thirdPartyId: '   ' });
    registerCallbackConnector({ createCallback });

    const result = await calldown.schedule({
      jwtToken: tokenFor('user-1'),
      body: { contactId: 'contact-1' },
    });

    const record = await CallDownListModel.findByPk(result.id);
    expect(record.thirdPartyId).toBeNull();
    expect(result.returnMessage).toBeUndefined();
  });

  test('sends a null contact type when the stored callback has none', async () => {
    await createUser('user-1');
    await CallDownListModel.create({
      id: 'no-type',
      userId: 'user-1',
      platform: 'testCRM',
      thirdPartyId: 'crm-1',
      status: 'scheduled',
      contactType: null,
    });
    const updateCallback = jest.fn(async () => ({}));
    registerCallbackConnector({ updateCallback });

    await calldown.update({
      jwtToken: tokenFor('user-1'),
      id: 'no-type',
      updateData: { scheduledAt: '2026-07-03T13:00:00.000Z' },
    });

    expect(updateCallback).toHaveBeenCalledWith(expect.objectContaining({
      thirdPartyId: 'crm-1',
      callback: expect.objectContaining({
        id: 'no-type',
        contactType: null,
        scheduledAt: '2026-07-03T13:00:00.000Z',
      }),
    }));
  });

  test('remove reports not found when the row disappears before delete', async () => {
    await createUser('user-1');
    await CallDownListModel.create({
      id: 'vanishing-delete',
      userId: 'user-1',
      status: 'scheduled',
    });
    jest.spyOn(CallDownListModel, 'destroy').mockResolvedValueOnce(0);

    await expect(calldown.remove({
      jwtToken: tokenFor('user-1'),
      id: 'vanishing-delete',
    })).rejects.toThrow('Not found');
  });

  test('markCalled returns the database warning when the row disappears before the write', async () => {
    await createUser('user-1');
    await CallDownListModel.create({
      id: 'vanishing-called',
      userId: 'user-1',
      status: 'scheduled',
    });
    jest.spyOn(CallDownListModel, 'update').mockResolvedValueOnce([0]);

    const result = await calldown.markCalled({
      jwtToken: tokenFor('user-1'),
      id: 'vanishing-called',
    });

    expect(result).toEqual({
      successful: false,
      returnMessage: {
        message: 'Database operation failed',
        messageType: 'warning',
        ttl: 5000,
      },
    });
  });

  test('serializes string and invalid callback times for the CRM payload', async () => {
    await createUser('user-1');
    await CallDownListModel.create({
      id: 'string-dates',
      userId: 'user-1',
      platform: 'testCRM',
      thirdPartyId: 'crm-1',
      status: 'scheduled',
      contactType: 'contact',
    });
    const stored = await CallDownListModel.findByPk('string-dates');
    stored.setDataValue('scheduledAt', '2026-07-04T13:00:00.000Z');
    stored.setDataValue('lastCallAt', 'not-a-date');
    stored.setDataValue('status', null);
    jest.spyOn(CallDownListModel, 'findOne').mockResolvedValue(stored);
    jest.spyOn(CallDownListModel, 'update').mockResolvedValueOnce([1]);
    const updateCallback = jest.fn(async () => ({}));
    registerCallbackConnector({ updateCallback });

    await calldown.update({
      jwtToken: tokenFor('user-1'),
      id: 'string-dates',
      updateData: { contactId: 'contact-9' },
    });

    expect(updateCallback).toHaveBeenCalledWith(expect.objectContaining({
      callback: expect.objectContaining({
        scheduledAt: '2026-07-04T13:00:00.000Z',
        lastCallAt: null,
        status: null,
      }),
      previous: expect.objectContaining({
        scheduledAt: '2026-07-04T13:00:00.000Z',
        lastCallAt: null,
      }),
    }));
  });

  test('update reports not found when the row disappears before the write', async () => {
    await createUser('user-1');
    await CallDownListModel.create({
      id: 'vanishing-update',
      userId: 'user-1',
      status: 'scheduled',
    });
    jest.spyOn(CallDownListModel, 'update').mockResolvedValueOnce([0]);

    await expect(calldown.update({
      jwtToken: tokenFor('user-1'),
      id: 'vanishing-update',
      updateData: { status: 'called' },
    })).rejects.toThrow('Not found');
  });
});


export {};
