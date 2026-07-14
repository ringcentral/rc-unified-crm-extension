const calldown = require('../../handlers/calldown');
const { generateJwt } = require('../../lib/jwt');
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
      },
    })).rejects.toThrow('No valid fields to update');

    const record = await CallDownListModel.findByPk('other-user-update');
    expect(record.status).toBe('scheduled');
  });
});


export {};
