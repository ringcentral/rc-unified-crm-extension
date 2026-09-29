const originalDisableSyncDbTable = process.env.DISABLE_SYNC_DB_TABLE;
process.env.DISABLE_SYNC_DB_TABLE = 'true';

const request = require('supertest');
const nock = require('nock');

const logger = require('@app-connect/core/lib/logger');
const { CacheModel } = require('@app-connect/core/models/cacheModel');
const supportAuth = require('../src/support/auth');
const supportCrm = require('../src/support/crm');
const {
  SupportAllowlistEntryModel,
  SupportIntegrationEventModel,
  SupportIntegrationRecordModel,
} = require('../src/support/models');
const { getServer } = require('../src/index');

const RC_SERVER = 'https://platform.ringcentral.com';
const VIN_API = 'https://api.vinsolutions.com';
const VIN_AUTH = 'https://authentication.vinsolutions.com';
const STAFF_TOKEN = 'staff-token';

const ENV = {
  VINSOLUTIONS_LEAD_MANAGEMENT_CLIENT_ID: 'lm-client',
  VINSOLUTIONS_LEAD_MANAGEMENT_CLIENT_SECRET: 'lm-secret',
  VINSOLUTIONS_LEAD_MANAGEMENT_API_KEY: 'lm-api-key',
  VINSOLUTIONS_CALL_TRACKING_CLIENT_ID: 'ct-client',
  VINSOLUTIONS_CALL_TRACKING_CLIENT_SECRET: 'ct-secret',
  VINSOLUTIONS_CALL_TRACKING_API_KEY: 'ct-api-key',
};
const originalEnv = Object.fromEntries(Object.keys(ENV).map((key) => [key, process.env[key]]));

function mockStaff() {
  return nock(RC_SERVER)
    .persist()
    .get('/restapi/v1.0/account/~/extension/~')
    .matchHeader('authorization', `Bearer ${STAFF_TOKEN}`)
    .reply(200, {
      id: 101,
      name: 'Support Agent',
      status: 'Enabled',
      contact: { email: 'agent@ringcentral.test' },
      account: { id: '37439510' },
    });
}

function mockToken(clientId, accessToken) {
  return nock(VIN_AUTH)
    .post('/connect/token', (body) => body.grant_type === 'client_credentials'
      && body.client_id === clientId
      && body.scope === 'PublicAPI')
    .reply(200, { access_token: accessToken, expires_in: 3600 });
}

function mockDealers(apiKey, accessToken, items, status = 200) {
  return nock(VIN_API)
    .get('/gateway/v1/organization/dealers')
    .matchHeader('api_key', apiKey)
    .matchHeader('authorization', `Bearer ${accessToken}`)
    .reply(status, status === 200 ? { Count: items.length, Items: items } : { Message: 'Boom' });
}

function mockRemove(apiKey, accessToken, dealerId, status = 200) {
  return nock(VIN_API)
    .post(`/gateway/v1/organization/dealers/id/${dealerId}/remove`)
    .matchHeader('api_key', apiKey)
    .matchHeader('authorization', `Bearer ${accessToken}`)
    .matchHeader('content-type', 'application/vnd.coxauto.v1+json')
    .reply(status, status === 200 ? {} : { Message: status === 404 ? 'Not found' : 'Upstream failure' });
}

const dealerA = { DealerId: 12617, Name: 'Data Gateway Motors', City: 'Mission', State: 'KS' };
const dealerB = { DealerId: 6946, Name: 'Gordon Chevrolet of Orange Park', City: 'Orange Park', State: 'FL' };

function api() {
  return request(getServer());
}

function withStaff(req) {
  return req.set('X-RC-Access-Token', STAFF_TOKEN);
}

describe('Support console CRM routes', () => {
  let warnSpy;
  let errorSpy;

  beforeAll(async () => {
    await supportCrm.syncSupportCrmModels();
  });

  afterAll(() => {
    if (originalDisableSyncDbTable === undefined) {
      delete process.env.DISABLE_SYNC_DB_TABLE;
    } else {
      process.env.DISABLE_SYNC_DB_TABLE = originalDisableSyncDbTable;
    }
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  beforeEach(async () => {
    Object.assign(process.env, ENV);
    supportAuth.clearSupportSessionCache();
    await Promise.all([
      SupportAllowlistEntryModel.destroy({ where: {} }),
      SupportIntegrationEventModel.destroy({ where: {} }),
      SupportIntegrationRecordModel.destroy({ where: {} }),
      CacheModel.destroy({ where: { userId: 'support' } }),
    ]);
    mockStaff();
    warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => {});
    errorSpy = jest.spyOn(logger, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    nock.cleanAll();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  test('every CRM route requires a Support staff token', async () => {
    const responses = await Promise.all([
      api().get('/support/crm/vinsolutions/integrations'),
      api().post('/support/crm/vinsolutions/integrations/12617/remove'),
      api().get('/support/crm/vinsolutions/history'),
      api().get('/support/crm/vinsolutions/allowlist'),
      api().put('/support/crm/vinsolutions/allowlist/12617'),
      api().delete('/support/crm/vinsolutions/allowlist/12617'),
    ]);
    expect(responses.map((response) => response.status)).toEqual([401, 401, 401, 401, 401, 401]);
  });

  test('rejects an unsupported CRM platform', async () => {
    const response = await withStaff(api().get('/support/crm/bullhorn/integrations'));
    expect(response.status).toBe(404);
    expect(response.body.error).toContain('Unsupported CRM platform');
  });

  test('merges dealers from both services, flags the allowlist, and records history', async () => {
    mockToken('lm-client', 'lm-token');
    mockToken('ct-client', 'ct-token');
    mockDealers('lm-api-key', 'lm-token', [dealerA, dealerB]);
    mockDealers('ct-api-key', 'ct-token', [dealerA]);
    await withStaff(api().put('/support/crm/vinsolutions/allowlist/6946')).send({ note: 'Paid customer' });

    const response = await withStaff(api().get('/support/crm/vinsolutions/integrations'));

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      platform: 'vinsolutions',
      services: ['leadManagement', 'callTracking'],
      serviceErrors: {},
      integrations: [
        {
          id: '6946',
          name: 'Gordon Chevrolet of Orange Park',
          details: { city: 'Orange Park', state: 'FL' },
          services: { leadManagement: 'active', callTracking: 'inactive' },
          allowlisted: true,
        },
        {
          id: '12617',
          name: 'Data Gateway Motors',
          details: { city: 'Mission', state: 'KS' },
          services: { leadManagement: 'active', callTracking: 'active' },
          allowlisted: false,
        },
      ],
    });

    const record = await SupportIntegrationRecordModel.findByPk('vinsolutions-6946');
    expect(Object.keys(record.services)).toEqual(['leadManagement']);
    expect(record.services.leadManagement.firstSeenAt).toEqual(record.services.leadManagement.lastSeenAt);
  });

  test('reuses the cached service token and mints a new one when VinSolutions rejects it', async () => {
    mockToken('lm-client', 'lm-token');
    mockToken('ct-client', 'ct-token');
    mockDealers('lm-api-key', 'lm-token', [dealerA]);
    mockDealers('ct-api-key', 'ct-token', []);
    await withStaff(api().get('/support/crm/vinsolutions/integrations'));

    // Cached tokens are reused; the Lead Management one is then rejected and replaced once.
    mockDealers('lm-api-key', 'lm-token', [], 401);
    mockToken('lm-client', 'lm-token-2');
    mockDealers('lm-api-key', 'lm-token-2', [dealerA]);
    mockDealers('ct-api-key', 'ct-token', [dealerA]);
    const response = await withStaff(api().get('/support/crm/vinsolutions/integrations'));

    expect(response.status).toBe(200);
    expect(response.body.integrations[0].services).toEqual({ leadManagement: 'active', callTracking: 'active' });
    expect(nock.isDone()).toBe(true);
    const cached = await CacheModel.findByPk('support-vinsolutions-leadManagement-token');
    expect(cached.data.accessToken).toBe('lm-token-2');
  });

  test('keeps first-seen times and updates last-seen times on later listings', async () => {
    mockToken('lm-client', 'lm-token');
    mockToken('ct-client', 'ct-token');
    mockDealers('lm-api-key', 'lm-token', [dealerA]);
    mockDealers('ct-api-key', 'ct-token', []);
    await withStaff(api().get('/support/crm/vinsolutions/integrations'));
    const first = (await SupportIntegrationRecordModel.findByPk('vinsolutions-12617')).services;

    await new Promise((resolve) => setTimeout(resolve, 5));
    mockDealers('lm-api-key', 'lm-token', [{ ...dealerA, Name: 'Renamed Motors' }]);
    mockDealers('ct-api-key', 'ct-token', [dealerA]);
    await withStaff(api().get('/support/crm/vinsolutions/integrations'));
    const record = await SupportIntegrationRecordModel.findByPk('vinsolutions-12617');

    expect(record.name).toBe('Renamed Motors');
    expect(record.services.leadManagement.firstSeenAt).toBe(first.leadManagement.firstSeenAt);
    expect(record.services.leadManagement.lastSeenAt > first.leadManagement.lastSeenAt).toBe(true);
    expect(record.services.callTracking.firstSeenAt).toBeTruthy();
  });

  test('reports a service that cannot be listed without hiding the other one', async () => {
    mockToken('lm-client', 'lm-token');
    mockToken('ct-client', 'ct-token');
    mockDealers('lm-api-key', 'lm-token', [dealerA]);
    mockDealers('ct-api-key', 'ct-token', [], 503);

    const response = await withStaff(api().get('/support/crm/vinsolutions/integrations'));

    expect(response.status).toBe(200);
    expect(response.body.serviceErrors).toEqual({ callTracking: 'VinSolutions returned 503: Boom' });
    expect(response.body.integrations[0].services).toEqual({ leadManagement: 'active', callTracking: 'unknown' });
  });

  test('reports missing credentials per service without calling VinSolutions', async () => {
    delete process.env.VINSOLUTIONS_CALL_TRACKING_API_KEY;
    mockToken('lm-client', 'lm-token');
    mockDealers('lm-api-key', 'lm-token', []);

    const response = await withStaff(api().get('/support/crm/vinsolutions/integrations'));

    expect(response.body.serviceErrors).toEqual({
      callTracking: 'VinSolutions callTracking credentials are not configured',
    });
    expect(JSON.stringify(response.body)).not.toContain('secret');
  });

  test('removes a dealer from both services and records who did it', async () => {
    mockToken('lm-client', 'lm-token');
    mockToken('ct-client', 'ct-token');
    mockRemove('lm-api-key', 'lm-token', 12617);
    mockRemove('ct-api-key', 'ct-token', 12617, 404);

    const response = await withStaff(api().post('/support/crm/vinsolutions/integrations/12617/remove'));

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      platform: 'vinsolutions',
      integrationId: '12617',
      results: {
        leadManagement: { status: 'removed' },
        callTracking: { status: 'alreadyRemoved' },
      },
    });
    const events = await SupportIntegrationEventModel.findAll({ order: [['service', 'ASC']] });
    expect(events.map((event) => [event.service, event.result, event.actorName, event.actorExtensionId])).toEqual([
      ['callTracking', 'alreadyRemoved', 'Support Agent', '101'],
      ['leadManagement', 'removed', 'Support Agent', '101'],
    ]);
  });

  test('returns per-service failures from remove', async () => {
    mockToken('lm-client', 'lm-token');
    mockToken('ct-client', 'ct-token');
    mockRemove('lm-api-key', 'lm-token', 12617, 500);
    mockRemove('ct-api-key', 'ct-token', 12617);

    const response = await withStaff(api().post('/support/crm/vinsolutions/integrations/12617/remove'));

    expect(response.body.results).toEqual({
      leadManagement: { status: 'failed', message: 'VinSolutions returned 500: Upstream failure' },
      callTracking: { status: 'removed' },
    });
    const failed = await SupportIntegrationEventModel.findOne({ where: { service: 'leadManagement' } });
    expect(failed.errorMessage).toBe('VinSolutions returned 500: Upstream failure');
  });

  test('requires explicit confirmation to remove an allowlisted dealer', async () => {
    await withStaff(api().put('/support/crm/vinsolutions/allowlist/12617'));

    const refused = await withStaff(api().post('/support/crm/vinsolutions/integrations/12617/remove'));
    expect(refused.status).toBe(409);
    expect(await SupportIntegrationEventModel.count()).toBe(0);

    mockToken('lm-client', 'lm-token');
    mockToken('ct-client', 'ct-token');
    mockRemove('lm-api-key', 'lm-token', 12617);
    mockRemove('ct-api-key', 'ct-token', 12617);
    const confirmed = await withStaff(api().post('/support/crm/vinsolutions/integrations/12617/remove'))
      .send({ confirmAllowlisted: true });
    expect(confirmed.status).toBe(200);
  });

  test.each(['abc', '0', '12.5', '-1'])('rejects the invalid dealer ID %s', async (id) => {
    const response = await withStaff(api().post(`/support/crm/vinsolutions/integrations/${id}/remove`));
    expect(response.status).toBe(400);
  });

  test('manages allowlist entries', async () => {
    const created = await withStaff(api().put('/support/crm/vinsolutions/allowlist/12617')).send({ note: 'Pilot' });
    expect(created.status).toBe(200);
    expect(created.body).toMatchObject({
      integrationId: '12617',
      note: 'Pilot',
      addedByExtensionId: '101',
      addedByName: 'Support Agent',
    });

    const updated = await withStaff(api().put('/support/crm/vinsolutions/allowlist/12617')).send({ note: 'Paid' });
    expect(updated.body).toMatchObject({ note: 'Paid', addedByName: 'Support Agent' });
    const kept = await withStaff(api().put('/support/crm/vinsolutions/allowlist/12617')).send({});
    expect(kept.body.note).toBe('Paid');

    const listed = await withStaff(api().get('/support/crm/vinsolutions/allowlist'));
    expect(listed.body.entries.map((entry) => entry.integrationId)).toEqual(['12617']);

    expect((await withStaff(api().delete('/support/crm/vinsolutions/allowlist/12617'))).status).toBe(204);
    expect((await withStaff(api().delete('/support/crm/vinsolutions/allowlist/12617'))).status).toBe(404);
  });

  test('rejects a non-string allowlist note', async () => {
    const response = await withStaff(api().put('/support/crm/vinsolutions/allowlist/12617')).send({ note: 42 });
    expect(response.status).toBe(400);
  });

  test('returns history with removal events, including removals of dealers never listed', async () => {
    mockToken('lm-client', 'lm-token');
    mockToken('ct-client', 'ct-token');
    mockDealers('lm-api-key', 'lm-token', [dealerA]);
    mockDealers('ct-api-key', 'ct-token', []);
    await withStaff(api().get('/support/crm/vinsolutions/integrations'));
    mockRemove('lm-api-key', 'lm-token', 12617);
    mockRemove('ct-api-key', 'ct-token', 12617, 404);
    await withStaff(api().post('/support/crm/vinsolutions/integrations/12617/remove'));
    mockRemove('lm-api-key', 'lm-token', 999, 404);
    mockRemove('ct-api-key', 'ct-token', 999, 404);
    await withStaff(api().post('/support/crm/vinsolutions/integrations/999/remove'));
    await withStaff(api().put('/support/crm/vinsolutions/allowlist/999'));

    const response = await withStaff(api().get('/support/crm/vinsolutions/history'));

    expect(response.status).toBe(200);
    const [listed, unlisted] = response.body.history;
    expect(listed).toMatchObject({ id: '12617', name: 'Data Gateway Motors', allowlisted: false });
    expect(listed.firstSeenAt).toBeTruthy();
    expect(listed.services.leadManagement.firstSeenAt).toBeTruthy();
    expect(listed.events).toHaveLength(2);
    expect(listed.events[0]).toMatchObject({ action: 'remove', actorName: 'Support Agent', actorEmail: 'agent@ringcentral.test' });
    expect(unlisted).toMatchObject({ id: '999', name: '', firstSeenAt: null, allowlisted: true });
    expect(unlisted.events.map((event) => event.result)).toEqual(['alreadyRemoved', 'alreadyRemoved']);
  });

  test('hides internal failures', async () => {
    const spy = jest.spyOn(SupportAllowlistEntryModel, 'findAll').mockRejectedValue(new Error('db down'));
    const response = await withStaff(api().get('/support/crm/vinsolutions/allowlist'));
    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'Internal server error' });
    spy.mockRestore();
  });
});

export {};
