const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const nock = require('nock');
const { buildPlan, migrate, createApi } = require('../scripts/mixpanel-raw-ids.cjs');

describe('Mixpanel raw ID profile migration', () => {
  let folder;
  let journal;
  const hash = raw => crypto.createHash('sha256').update(`${raw}:test-key`).digest('hex');
  const row = (overrides = {}) => ({ kind: 'user', source: 'app-connect', hashKeyEnv: 'OLD_KEY',
    profileId: 'canonical-profile', legacyId: hash('101'), legacyAccountId: hash('900'), rcExtensionIdRaw: '101', rcAccountIdRaw: '900', ...overrides });
  const plan = rows => buildPlan(rows, { OLD_KEY: 'test-key' });
  beforeEach(() => { folder = fs.mkdtempSync(path.join(os.tmpdir(), 'mixpanel-raw-')); journal = path.join(folder, 'journal.jsonl'); });
  afterEach(() => { fs.rmSync(folder, { recursive: true, force: true }); nock.cleanAll(); });

  test('validates hashes and quarantines every conflicting target and duplicate', () => {
    expect(plan([row(), row()]).map(item => item.status)).toEqual(['ready', 'duplicate']);
    expect(plan([row(), row({ rcExtensionIdRaw: '202', legacyId: hash('202') })]).map(item => item.status)).toEqual(['conflict', 'conflict']);
    expect(plan([row({ rcExtensionIdRaw: 'undefined' })])[0].status).toBe('invalid');
    expect(plan([row({ legacyId: 'wrong' })])[0].status).toBe('hash-mismatch');
    expect(buildPlan([row()], {})[0].status).toBe('missing-key');
  });

  test('dry-run never writes profiles or checkpoints and reports missing profiles', async () => {
    const api = { read: jest.fn(async () => ({})), update: jest.fn() };
    const report = await migrate({ items: plan([row()]), projectId: 1, api });
    expect(report.counts).toEqual({ 'would-apply': 1 });
    expect(api.update).not.toHaveBeenCalled();
    expect(fs.existsSync(journal)).toBe(false);
    api.read.mockResolvedValue(null);
    expect((await migrate({ items: plan([row()]), projectId: 1, api })).counts).toEqual({ 'profile-missing': 1 });
  });

  test('resumes after a successful write with a lost response and retains the original backup', async () => {
    let properties = {};
    let fail = true;
    const api = { read: jest.fn(async () => properties), update: jest.fn(async (_row, set) => {
      properties = { ...properties, ...set };
      if (fail) { fail = false; throw new Error('lost response'); }
    }) };
    const options = { items: plan([row()]), projectId: 1, api, journal, apply: true };
    await expect(migrate(options)).rejects.toThrow('lost response');
    expect((await migrate(options)).counts).toEqual({ 'already-applied': 1 });
    expect(api.update).toHaveBeenCalledTimes(1);
    const entries = fs.readFileSync(journal, 'utf8').trim().split('\n').map(JSON.parse);
    expect(entries.filter(entry => entry.state === 'prepared')).toHaveLength(1);
    expect(entries[0].before).toEqual({});
  });

  test('rollback unsets only added fields and skips subsequent concurrent changes', async () => {
    let properties: Record<string, unknown> = { other: 'untouched' };
    const api = { read: async () => properties, update: jest.fn(async (_row, set, unset) => {
      properties = { ...properties, ...set }; unset.forEach(field => { delete properties[field]; });
    }) };
    const options = { items: plan([row()]), projectId: 1, api, journal, apply: true };
    await migrate(options);
    expect((await migrate({ ...options, rollback: true, apply: false })).counts).toEqual({ 'would-restore': 1 });
    properties.rcExtensionIdRaw = '202';
    expect((await migrate({ ...options, rollback: true })).counts).toEqual({ 'concurrent-change': 1 });
    properties.rcExtensionIdRaw = '101';
    expect((await migrate({ ...options, rollback: true })).counts).toEqual({ restored: 1 });
    expect(properties).toEqual({ other: 'untouched' });
    await expect(migrate({ ...options, projectId: 2 })).rejects.toThrow('Journal project');
  });

  test('enforces the batch limit and never overwrites conflicting existing raw values', async () => {
    const api = { read: async () => ({ rcExtensionIdRaw: '999' }), update: jest.fn() };
    const report = await migrate({ items: plan([row(), row({ profileId: 'other' })]), projectId: 1, api, limit: 1 });
    expect(report.counts).toEqual({ 'existing-value-conflict': 1, deferred: 1 });
    expect(api.update).not.toHaveBeenCalled();
  });

  test('a resumed batch progresses past acknowledged rows without consuming its limit', async () => {
    const values = new Map();
    const api = { read: jest.fn(async entry => values.get(entry.profileId) || {}),
      update: jest.fn(async (entry, set) => { values.set(entry.profileId, set); }) };
    const options = { items: plan([row(), row({ profileId: 'second' })]), projectId: 1, api, journal, apply: true, limit: 1 };
    expect((await migrate(options)).counts).toEqual({ applied: 1, deferred: 1 });
    expect((await migrate(options)).counts).toEqual({ 'already-applied': 1, applied: 1 });
    expect(api.update).toHaveBeenCalledTimes(2);
  });

  test('uses canonical existing user and group profile APIs and rejects HTTP 200 validation errors', async () => {
    const env = { MIXPANEL_SERVICE_ACCOUNT_USER: 'test-user', MIXPANEL_SERVICE_ACCOUNT_SECRET: 'test-secret', MIXPANEL_PROJECT_TOKEN: 'test-token' };
    const api = createApi(1, 'us', env);
    const scope = nock('https://mixpanel.com').post('/api/query/engage').query({ project_id: 1 })
      .reply(200, { results: [{ $distinct_id: 'canonical-profile', $properties: { version: '1' } }] });
    expect(await api.read(row())).toEqual({ version: '1' });
    scope.done();
    const rejected = nock('https://api.mixpanel.com').post('/engage', body => body[0].$set.rcExtensionIdRaw === '101').query({ verbose: 1 })
      .reply(200, { status: 0, error: 'invalid' });
    await expect(api.update(row(), { rcExtensionIdRaw: '101' }, [])).rejects.toThrow('rejected');
    rejected.done();
    const group = row({ kind: 'group', profileId: hash('900'), legacyId: hash('900'), groupKey: 'rcAccountId', dataGroupId: 'group-key-id' });
    expect(plan([group])[0].status).toBe('ready');
    const groupScope = nock('https://api.mixpanel.com').post('/groups', body => body[0].$group_key === 'rcAccountId' && body[0].$group_id === hash('900'))
      .query({ verbose: 1 }).reply(200, { status: 1 });
    await api.update(group, { rcAccountIdRaw: '900' }, []);
    groupScope.done();
  });
});

export {};
