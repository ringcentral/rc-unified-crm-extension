const calldown = require('../../handlers/calldown');
const { generateJwt } = require('../../lib/jwt');
const { CallDownListModel } = require('../../models/callDownListModel');
const { UserModel } = require('../../models/userModel');

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
      body: {
        contactId: 12345,
        contactType: 'Lead',
        contactName: 'Ignored By Current Schema',
        phoneNumber: '+15551234567',
        scheduledAt: '2026-07-02T13:00:00.000Z',
      },
    });

    expect(result.id).toMatch(/^[0-9a-f]{32}$/);
    const record = await CallDownListModel.findByPk(result.id);
    expect(record).toMatchObject({
      id: result.id,
      userId: 'user-1',
      contactId: '12345',
      contactType: 'Lead',
      status: 'scheduled',
    });
    expect(record.scheduledAt.toISOString()).toBe('2026-07-02T13:00:00.000Z');
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

  test('schedule rejects invalid jwt and missing users', async () => {
    await expect(calldown.schedule({
      jwtToken: 'not-a-valid-token',
      body: {},
    })).rejects.toThrow('Unauthorized');

    await expect(calldown.schedule({
      jwtToken: tokenFor('missing-user'),
      body: {},
    })).rejects.toThrow('User not found');
  });

  test('list returns all records for the JWT user ordered by scheduledAt', async () => {
    await createUser('user-1');
    await createUser('user-2');
    await CallDownListModel.bulkCreate([
      {
        id: 'later',
        userId: 'user-1',
        contactId: 'contact-2',
        status: 'called',
        scheduledAt: new Date('2026-07-02T14:00:00.000Z'),
      },
      {
        id: 'earlier',
        userId: 'user-1',
        contactId: 'contact-1',
        status: 'scheduled',
        scheduledAt: new Date('2026-07-02T13:00:00.000Z'),
      },
      {
        id: 'other-user',
        userId: 'user-2',
        contactId: 'contact-3',
        status: 'scheduled',
        scheduledAt: new Date('2026-07-02T12:00:00.000Z'),
      },
    ]);

    const { items } = await calldown.list({
      jwtToken: tokenFor('user-1'),
    });

    expect(items.map((item) => item.id)).toEqual(['earlier', 'later']);
  });

  test('list filters called and not-called statuses according to current implementation', async () => {
    await createUser('user-1');
    await CallDownListModel.bulkCreate([
      {
        id: 'called',
        userId: 'user-1',
        status: 'called',
        scheduledAt: new Date('2026-07-02T13:00:00.000Z'),
      },
      {
        id: 'scheduled',
        userId: 'user-1',
        status: 'scheduled',
        scheduledAt: new Date('2026-07-02T14:00:00.000Z'),
      },
      {
        id: 'removed-status',
        userId: 'user-1',
        status: 'removed',
        scheduledAt: new Date('2026-07-02T15:00:00.000Z'),
      },
    ]);

    const called = await calldown.list({
      jwtToken: tokenFor('user-1'),
      status: 'called',
    });
    const notCalled = await calldown.list({
      jwtToken: tokenFor('user-1'),
      status: 'not_called',
    });

    expect(called.items.map((item) => item.id)).toEqual(['called']);
    expect(notCalled.items.map((item) => item.id)).toEqual(['scheduled', 'removed-status']);
  });

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
    await CallDownListModel.create({
      id: 'call-to-update',
      userId: 'user-1',
      contactId: 'old-contact',
      contactType: 'Lead',
      status: 'scheduled',
      scheduledAt: new Date('2026-07-02T13:00:00.000Z'),
    });

    const result = await calldown.update({
      jwtToken: tokenFor('user-1'),
      id: 'call-to-update',
      updateData: {
        contactId: 'new-contact',
        contactType: 'Contact',
        status: 'called',
        scheduledAt: '2026-07-02T15:00:00.000Z',
        lastCallAt: '2026-07-02T15:10:00.000Z',
        unexpectedField: 'ignored',
      },
    });

    expect(result).toEqual({ successful: true });
    const record = await CallDownListModel.findByPk('call-to-update');
    expect(record).toMatchObject({
      contactId: 'new-contact',
      contactType: 'Contact',
      status: 'called',
    });
    expect(record.scheduledAt.toISOString()).toBe('2026-07-02T15:00:00.000Z');
    expect(record.lastCallAt.toISOString()).toBe('2026-07-02T15:10:00.000Z');
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
