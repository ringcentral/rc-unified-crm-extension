const { CacheModel } = require('../../models/cacheModel');
const {
  createAuthSession,
  getAuthSession,
  updateAuthSession,
} = require('../../lib/authSession');
const tsAuthSession = require('../../lib/authSession.ts');

describe('authSession', () => {
  const baseTime = new Date(Date.now() + (60 * 60 * 1000));

  beforeEach(async () => {
    await CacheModel.destroy({ where: {} });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('creates a pending auth session record with generated id and expiry', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(baseTime.getTime());

    await createAuthSession('session-1', {
      platform: 'clio',
      hostname: 'https://example.clio.com',
    });

    const record = await CacheModel.findByPk('auth-session-session-1');
    expect(record).not.toBeNull();
    expect(record.userId).toBe('session-1');
    expect(record.cacheKey).toBe('auth-session');
    expect(record.status).toBe('pending');
    expect(record.expiry.getTime()).toBe(baseTime.getTime() + (5 * 60 * 1000));
    expect(record.data).toMatchObject({
      platform: 'clio',
      hostname: 'https://example.clio.com',
    });
    expect(new Date(record.data.createdAt).toString()).not.toBe('Invalid Date');

    await expect(getAuthSession('session-1')).resolves.toMatchObject({
      sessionId: 'session-1',
      status: 'pending',
      platform: 'clio',
      hostname: 'https://example.clio.com',
    });
  });

  test('creates with an empty hostname when hostname is missing', async () => {
    await createAuthSession('session-no-hostname', {
      platform: 'googleSheets',
    });

    const session = await getAuthSession('session-no-hostname');

    expect(session).toMatchObject({
      sessionId: 'session-no-hostname',
      status: 'pending',
      platform: 'googleSheets',
      hostname: '',
    });
  });

  test('resets an existing session record to pending with new session data', async () => {
    await createAuthSession('retry-session', {
      platform: 'clio',
      hostname: 'old-host',
    });
    const existing = await CacheModel.findByPk('auth-session-retry-session');
    await existing.update({
      status: 'completed',
      data: {
        platform: 'clio',
        hostname: 'old-host',
        jwtToken: 'old-token',
      },
    });

    await createAuthSession('retry-session', {
      platform: 'bullhorn',
    });

    const record = await CacheModel.findByPk('auth-session-retry-session');
    expect(record.status).toBe('pending');
    expect(record.data).toMatchObject({
      platform: 'bullhorn',
      hostname: '',
    });
    expect(record.data.jwtToken).toBeUndefined();
  });

  test('returns null for missing sessions', async () => {
    await expect(getAuthSession('missing-session')).resolves.toBeNull();
  });

  test('marks expired sessions as expired and returns current session data', async () => {
    await CacheModel.create({
      id: 'auth-session-expired-session',
      cacheKey: 'auth-session',
      userId: 'expired-session',
      status: 'pending',
      data: {
        platform: 'pipedrive',
        hostname: 'pipedrive-host',
      },
      expiry: new Date(Date.now() - 1000),
    });

    const session = await getAuthSession('expired-session');

    expect(session).toEqual({
      sessionId: 'expired-session',
      status: 'expired',
      platform: 'pipedrive',
      hostname: 'pipedrive-host',
    });
    const record = await CacheModel.findByPk('auth-session-expired-session');
    expect(record.status).toBe('expired');
  });

  test('updates an existing session by merging data and extending settled expiry', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(baseTime.getTime());
    await createAuthSession('update-session', {
      platform: 'netsuite',
      hostname: 'netsuite-host',
    });
    jest.spyOn(Date, 'now').mockReturnValue(baseTime.getTime() + 1000);

    await updateAuthSession('update-session', {
      status: 'completed',
      jwtToken: 'jwt-token',
      rcExtensionId: 'extension-1',
    });

    const record = await CacheModel.findByPk('auth-session-update-session');
    expect(record.status).toBe('completed');
    expect(record.expiry.getTime()).toBe(baseTime.getTime() + 1000 + (15 * 60 * 1000));
    expect(record.data).toMatchObject({
      platform: 'netsuite',
      hostname: 'netsuite-host',
      status: 'completed',
      jwtToken: 'jwt-token',
      rcExtensionId: 'extension-1',
    });
    expect(new Date(record.data.updatedAt).toString()).not.toBe('Invalid Date');
  });

  test('keeps pending expiry when update does not settle the session', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(baseTime.getTime());
    await createAuthSession('pending-session', {
      platform: 'redtail',
    });
    jest.spyOn(Date, 'now').mockReturnValue(baseTime.getTime() + 2000);

    await updateAuthSession('pending-session', {
      hostname: 'new-host',
    });

    const record = await CacheModel.findByPk('auth-session-pending-session');
    expect(record.status).toBe('pending');
    expect(record.expiry.getTime()).toBe(baseTime.getTime() + 2000 + (5 * 60 * 1000));
    expect(record.data).toMatchObject({
      platform: 'redtail',
      hostname: 'new-host',
    });
  });

  test('does nothing when updating a missing session', async () => {
    await expect(updateAuthSession('missing-session', {
      status: 'completed',
    })).resolves.toBeUndefined();

    await expect(CacheModel.findByPk('auth-session-missing-session')).resolves.toBeNull();
  });

  test('TypeScript implementation creates, reads, and updates auth sessions', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(baseTime.getTime());

    await tsAuthSession.createAuthSession('ts-session', {
      platform: 'clio',
      hostname: 'ts-host',
    });
    await tsAuthSession.updateAuthSession('ts-session', {
      status: 'completed',
      jwtToken: 'ts-jwt-token',
    });

    const session = await tsAuthSession.getAuthSession('ts-session');
    const record = await CacheModel.findByPk('auth-session-ts-session');

    expect(session).toMatchObject({
      sessionId: 'ts-session',
      status: 'completed',
      platform: 'clio',
      hostname: 'ts-host',
      jwtToken: 'ts-jwt-token',
    });
    expect(record.status).toBe('completed');
  });
});
