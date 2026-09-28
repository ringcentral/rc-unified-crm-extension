const originalDisableSyncDbTable = process.env.DISABLE_SYNC_DB_TABLE;
process.env.DISABLE_SYNC_DB_TABLE = 'true';

const request = require('supertest');
const nock = require('nock');

const logger = require('@app-connect/core/lib/logger');
const supportAuth = require('../src/support/auth');
const { getServer } = require('../src/index');

const RC_SERVER = 'https://platform.ringcentral.com';
const EXTENSION_PATH = '/restapi/v1.0/account/~/extension/~';

function mockExtensionInfo(token, status, body) {
  return nock(RC_SERVER, {
    reqheaders: { authorization: `Bearer ${token}` },
  })
    .get(EXTENSION_PATH)
    .reply(status, body);
}

function staffExtension(overrides = {}) {
  return {
    id: 101,
    name: 'Support Agent',
    status: 'Enabled',
    contact: { email: 'agent@ringcentral.test' },
    account: { id: '37439510' },
    ...overrides,
  };
}

describe('Support console routes', () => {
  let warnSpy;
  let errorSpy;

  afterAll(() => {
    if (originalDisableSyncDbTable === undefined) {
      delete process.env.DISABLE_SYNC_DB_TABLE;
    } else {
      process.env.DISABLE_SYNC_DB_TABLE = originalDisableSyncDbTable;
    }
  });

  beforeEach(() => {
    supportAuth.clearSupportSessionCache();
    warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => {});
    errorSpy = jest.spyOn(logger, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    nock.cleanAll();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  test('GET /support/session returns the staff identity for an enabled corporate extension', async () => {
    const scope = mockExtensionInfo('staff-token', 200, staffExtension());

    const response = await request(getServer())
      .get('/support/session')
      .set('X-RC-Access-Token', 'staff-token');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      accountId: '37439510',
      extensionId: '101',
      name: 'Support Agent',
      email: 'agent@ringcentral.test',
    });
    expect(scope.isDone()).toBe(true);
  });

  test('GET /support/session caches a successful validation per token', async () => {
    const scope = mockExtensionInfo('cached-token', 200, staffExtension());

    const first = await request(getServer())
      .get('/support/session')
      .set('X-RC-Access-Token', 'cached-token');
    const second = await request(getServer())
      .get('/support/session')
      .set('X-RC-Access-Token', 'cached-token');

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.body).toEqual(first.body);
    expect(scope.isDone()).toBe(true);
  });

  test('GET /support/session revalidates after the cache TTL expires', async () => {
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(1_000_000);
    mockExtensionInfo('ttl-token', 200, staffExtension());
    await request(getServer()).get('/support/session').set('X-RC-Access-Token', 'ttl-token');

    nowSpy.mockReturnValue(1_000_000 + 5 * 60 * 1000);
    const scope = mockExtensionInfo('ttl-token', 200, staffExtension({ account: { id: '999' } }));
    const response = await request(getServer())
      .get('/support/session')
      .set('X-RC-Access-Token', 'ttl-token');

    expect(response.status).toBe(403);
    expect(scope.isDone()).toBe(true);
    nowSpy.mockRestore();
  });

  test('GET /support/session rejects a missing token without calling RingCentral', async () => {
    const response = await request(getServer()).get('/support/session');

    expect(response.status).toBe(401);
    expect(response.body.error).toEqual(expect.any(String));
  });

  test('GET /support/session ignores a token passed in the query string', async () => {
    const response = await request(getServer())
      .get('/support/session')
      .query({ rcAccessToken: 'staff-token' });

    expect(response.status).toBe(401);
  });

  test('GET /support/session returns 401 when RingCentral rejects the token', async () => {
    mockExtensionInfo('expired-token', 401, { errorCode: 'TokenExpired' });

    const response = await request(getServer())
      .get('/support/session')
      .set('X-RC-Access-Token', 'expired-token');

    expect(response.status).toBe(401);
  });

  test('GET /support/session returns 403 for an extension outside the corporate account', async () => {
    mockExtensionInfo('customer-token', 200, staffExtension({ id: 202, account: { id: '12345' } }));

    const response = await request(getServer())
      .get('/support/session')
      .set('X-RC-Access-Token', 'customer-token');

    expect(response.status).toBe(403);
    expect(warnSpy).toHaveBeenCalledWith('Support console access denied', {
      accountId: '12345',
      extensionId: '202',
      extensionStatus: 'Enabled',
    });
    expect(JSON.stringify(warnSpy.mock.calls)).not.toContain('customer-token');
  });

  test('GET /support/session returns 403 for a disabled corporate extension and does not cache it', async () => {
    const scope = mockExtensionInfo('disabled-token', 200, staffExtension({ status: 'Disabled' }))
      .get(EXTENSION_PATH)
      .reply(200, staffExtension({ status: 'Disabled' }));

    const first = await request(getServer())
      .get('/support/session')
      .set('X-RC-Access-Token', 'disabled-token');
    const second = await request(getServer())
      .get('/support/session')
      .set('X-RC-Access-Token', 'disabled-token');

    expect(first.status).toBe(403);
    expect(second.status).toBe(403);
    expect(scope.isDone()).toBe(true);
  });

  test('GET /support/session returns 500 without leaking details when RingCentral fails', async () => {
    mockExtensionInfo('staff-token', 503, { message: 'Service unavailable' });

    const response = await request(getServer())
      .get('/support/session')
      .set('X-RC-Access-Token', 'staff-token');

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'Internal server error' });
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain('staff-token');
  });
});

export {};
