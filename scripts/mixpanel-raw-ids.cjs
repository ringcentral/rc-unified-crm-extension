#!/usr/bin/env node
// Profile-only migration. No tracking, identity merges or event re-imports.
const fs = require('node:fs');
const crypto = require('node:crypto');
const https = require('node:https');
const path = require('node:path');

const FIELDS = ['rcAccountIdRaw', 'rcExtensionIdRaw'];
const SOURCES = new Set(['app-connect', 'server-side-logging', 'developer-console']);
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const rawId = value => typeof value === 'string' && /^[1-9]\d{0,31}$/.test(value);
const keyOf = row => JSON.stringify([row.kind, row.dataGroupId || '', row.profileId]);
const equal = (left, right) => JSON.stringify(left) === JSON.stringify(right);

function buildPlan(rows, env = process.env) {
  const items = rows.map((row, index) => {
    const item = { index, row, status: 'ready' };
    if (!SOURCES.has(row.source) || !['user', 'group'].includes(row.kind) ||
        typeof row.profileId !== 'string' || !row.profileId || !rawId(row.rcAccountIdRaw) ||
        (row.kind === 'user' && !rawId(row.rcExtensionIdRaw)) ||
        (row.kind === 'group' && (row.groupKey !== 'rcAccountId' || !row.dataGroupId || row.profileId !== row.legacyId))) {
      return { ...item, status: 'invalid' };
    }
    const secret = env[row.hashKeyEnv];
    if (typeof secret !== 'string' || !secret) return { ...item, status: 'missing-key' };
    const raw = row.kind === 'user' ? row.rcExtensionIdRaw : row.rcAccountIdRaw;
    if (hash(`${raw}:${secret}`) !== row.legacyId ||
        (row.kind === 'user' && hash(`${row.rcAccountIdRaw}:${secret}`) !== row.legacyAccountId)) {
      return { ...item, status: 'hash-mismatch' };
    }
    item.after = { rcAccountIdRaw: row.rcAccountIdRaw,
      ...(row.kind === 'user' ? { rcExtensionIdRaw: row.rcExtensionIdRaw } : {}) };
    item.key = keyOf(row);
    item.operationId = hash(JSON.stringify([item.key, item.after]));
    return item;
  });
  // Quarantine every side of a conflict, including aliases resolving to the same profile.
  const targets = new Map();
  const legacy = new Map();
  for (const item of items.filter(item => item.status === 'ready')) {
    for (const [map, key] of [[targets, item.key], [legacy, JSON.stringify([item.row.source, item.row.kind, item.row.legacyId])]]) {
      const group = map.get(key) || [];
      group.push(item);
      map.set(key, group);
    }
  }
  for (const group of [...targets.values(), ...legacy.values()]) {
    if (new Set(group.map(item => JSON.stringify(item.after))).size > 1) group.forEach(item => { item.status = 'conflict'; });
  }
  const seen = new Set();
  for (const item of items.filter(item => item.status === 'ready')) {
    if (seen.has(item.operationId)) item.status = 'duplicate';
    seen.add(item.operationId);
  }
  return items;
}

function readJournal(file, projectId) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map(line => {
    const entry = JSON.parse(line);
    if (entry.projectId !== projectId) throw new Error('Journal project does not match --project-id');
    if (!['prepared', 'applied', 'rolled-back'].includes(entry.state) ||
        (entry.state === 'prepared' && (!entry.after || !entry.before ||
        [...Object.keys(entry.after), ...Object.keys(entry.before)].some(field => !FIELDS.includes(field))))) {
      throw new Error('Invalid profile-only journal');
    }
    return entry;
  });
}

function appendJournal(file, entry) {
  fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  const fd = fs.openSync(file, 'a', 0o600);
  try { fs.writeSync(fd, `${JSON.stringify(entry)}\n`); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
}

function snapshot(properties, fields) {
  return Object.fromEntries(fields.filter(field => Object.hasOwn(properties, field)).map(field => [field, properties[field]]));
}

async function migrate({ items, projectId, api, journal, apply = false, rollback = false, limit = 100 }) {
  const history = apply || rollback ? readJournal(journal, projectId) : [];
  const report = [];
  let attempts = 0;
  const operations = rollback ? [...new Map(history.filter(entry => entry.state === 'prepared').map(entry => [entry.operationId, entry])).values()] : items;
  for (const operation of operations) {
    if (!rollback && operation.status !== 'ready') { report.push({ index: operation.index, status: operation.status }); continue; }
    const { operationId, row, after } = operation;
    const entries = history.filter(entry => entry.operationId === operationId);
    if (entries.some(entry => entry.state === 'rolled-back')) {
      report.push({ operationId, status: 'rolled-back' }); continue;
    }
    if (!rollback && entries.some(entry => entry.state === 'applied')) {
      report.push({ operationId, status: 'already-applied' }); continue;
    }
    if (attempts >= limit) { report.push({ operationId, status: 'deferred' }); continue; }
    attempts++;
    const current = await api.read(row);
    if (!current) { report.push({ operationId, status: 'profile-missing' }); continue; }
    const fields = Object.keys(after);
    const currentValues = snapshot(current, fields);
    const prepared = entries.find(entry => entry.state === 'prepared');
    if (rollback) {
      const before = operation.before;
      if (equal(currentValues, before)) {
        if (apply) appendJournal(journal, { projectId, operationId, state: 'rolled-back' });
        report.push({ operationId, status: 'already-restored' }); continue;
      }
      if (!equal(currentValues, after)) { report.push({ operationId, status: 'concurrent-change' }); continue; }
      if (apply) {
        await api.update(row, before, fields.filter(field => !Object.hasOwn(before, field)));
        appendJournal(journal, { projectId, operationId, state: 'rolled-back' });
      }
      report.push({ operationId, status: apply ? 'restored' : 'would-restore' });
      continue;
    }
    if (prepared && equal(currentValues, after)) {
      if (apply) appendJournal(journal, { projectId, operationId, state: 'applied' });
      report.push({ operationId, status: 'already-applied' }); continue;
    }
    if (prepared && !equal(currentValues, prepared.before)) {
      report.push({ operationId, status: 'concurrent-change' }); continue;
    }
    if (fields.some(field => Object.hasOwn(current, field) && !equal(current[field], after[field]))) {
      report.push({ operationId, status: 'existing-value-conflict' }); continue;
    }
    if (equal(currentValues, after)) { report.push({ operationId, status: 'unchanged' }); continue; }
    if (apply) {
      if (!prepared) appendJournal(journal, { projectId, operationId, state: 'prepared', row: {
        kind: row.kind, profileId: row.profileId, groupKey: row.groupKey, dataGroupId: row.dataGroupId
      }, before: currentValues, after });
      await api.update(row, after, []);
      appendJournal(journal, { projectId, operationId, state: 'applied' });
    }
    report.push({ operationId, status: apply ? 'applied' : 'would-apply' });
  }
  return { total: operations.length, counts: report.reduce((counts, item) => {
    counts[item.status] = (counts[item.status] || 0) + 1; return counts;
  }, {}), rows: report };
}

function requestJson(url, options, body, attempt = 0) {
  return new Promise((resolve, reject) => {
    const request = https.request(url, { ...options, timeout: 30000 }, response => {
      let data = '';
      response.setEncoding('utf8');
      response.on('data', chunk => { data += chunk; });
      response.on('end', () => {
        if ((response.statusCode === 429 || response.statusCode >= 500) && attempt < 3) {
          setTimeout(() => requestJson(url, options, body, attempt + 1).then(resolve, reject), 1000 * 2 ** attempt);
          return;
        }
        try {
          const result = JSON.parse(data);
          if (response.statusCode !== 200 || result === 0 || result.error || result.status === 0) {
            reject(new Error(`Mixpanel request rejected (HTTP ${response.statusCode})`));
          } else resolve(result);
        } catch { reject(new Error(`Invalid Mixpanel response (HTTP ${response.statusCode})`)); }
      });
    });
    request.on('timeout', () => request.destroy(new Error('Mixpanel request timed out')));
    request.on('error', () => reject(new Error('Mixpanel connection failed')));
    request.end(body);
  });
}

function createApi(projectId, region, env = process.env) {
  const hosts = { us: ['mixpanel.com', 'api.mixpanel.com'], eu: ['eu.mixpanel.com', 'api-eu.mixpanel.com'], in: ['in.mixpanel.com', 'api-in.mixpanel.com'] };
  if (!hosts[region]) throw new Error('--region must be us, eu or in');
  const [queryHost, ingestHost] = hosts[region];
  if (!env.MIXPANEL_SERVICE_ACCOUNT_USER || !env.MIXPANEL_SERVICE_ACCOUNT_SECRET) throw new Error('Mixpanel service account credentials required');
  const authorization = `Basic ${Buffer.from(`${env.MIXPANEL_SERVICE_ACCOUNT_USER}:${env.MIXPANEL_SERVICE_ACCOUNT_SECRET}`).toString('base64')}`;
  return {
    async read(row) {
      const body = new URLSearchParams({ distinct_ids: JSON.stringify([row.profileId]), ...(row.kind === 'group' ? { data_group_id: row.dataGroupId } : {}) }).toString();
      const result = await requestJson(`https://${queryHost}/api/query/engage?project_id=${projectId}`, {
        method: 'POST', headers: { Authorization: authorization, 'Content-Type': 'application/x-www-form-urlencoded' }
      }, body);
      if (!Array.isArray(result.results) || result.results.length > 1) throw new Error('Unexpected profile query response');
      const profile = result.results[0];
      if (!profile) return null;
      if (String(profile.$distinct_id) !== row.profileId || !profile.$properties) throw new Error('Use an existing canonical profile ID, not a legacy alias');
      return profile.$properties;
    },
    async update(row, set, unset) {
      if (!env.MIXPANEL_PROJECT_TOKEN) throw new Error('MIXPANEL_PROJECT_TOKEN required for writes');
      const identity = row.kind === 'group' ? { $group_key: row.groupKey, $group_id: row.profileId } : { $distinct_id: row.profileId, $ip: '0', $ignore_time: true };
      const operations = [];
      if (Object.keys(set).length) operations.push({ $token: env.MIXPANEL_PROJECT_TOKEN, ...identity, $set: set });
      if (unset.length) operations.push({ $token: env.MIXPANEL_PROJECT_TOKEN, ...identity, $unset: unset });
      if (operations.length) await requestJson(`https://${ingestHost}/${row.kind === 'group' ? 'groups' : 'engage'}?verbose=1`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }
      }, JSON.stringify(operations));
    }
  };
}

async function main(argv = process.argv.slice(2)) {
  const options = {};
  const switches = new Set(['apply', 'rollback']);
  const names = new Set(['input', 'project-id', 'region', 'journal', 'report', 'limit', 'profiles']);
  for (let i = 0; i < argv.length; i++) {
    const name = argv[i].replace(/^--/, '');
    if (!argv[i].startsWith('--') || (!switches.has(name) && !names.has(name))) throw new Error('Unknown CLI option');
    if (switches.has(name)) options[name] = true;
    else { if (!argv[i + 1] || argv[i + 1].startsWith('--')) throw new Error(`Missing --${name} value`); options[name] = argv[++i]; }
  }
  const projectId = Number(options['project-id']);
  const limit = Number(options.limit || 100);
  if (!Number.isSafeInteger(projectId) || projectId <= 0 || !Number.isSafeInteger(limit) || limit <= 0) throw new Error('Valid --project-id and positive --limit required');
  if (!options.report || (!options.rollback && !options.input) || ((options.apply || options.rollback) && !options.journal)) throw new Error('--report and --input required; apply/rollback also require --journal');
  if (options.apply && options.profiles) throw new Error('--apply always re-reads live profiles; remove --profiles');
  const files = ['input', 'profiles', 'report', 'journal'].filter(name => options[name]).map(name => path.resolve(options[name]));
  if (new Set(files).size !== files.length) throw new Error('Input, snapshot, report and journal paths must differ');
  let items = [];
  if (!options.rollback) {
    const input = JSON.parse(fs.readFileSync(options.input, 'utf8'));
    if (input.projectId !== projectId || !Array.isArray(input.rows)) throw new Error('Input must contain matching projectId and rows');
    items = buildPlan(input.rows);
  }
  let api;
  if (options.profiles) {
    const profiles = JSON.parse(fs.readFileSync(options.profiles, 'utf8'));
    if (profiles.projectId !== projectId || !Array.isArray(profiles.rows)) throw new Error('Snapshot projectId and rows required');
    api = { read: async row => profiles.rows.find(profile => keyOf(profile) === keyOf(row))?.properties || null };
  } else api = createApi(projectId, options.region || 'us');
  const report = await migrate({ items, projectId, api, journal: options.journal, apply: !!options.apply, rollback: !!options.rollback, limit });
  fs.writeFileSync(options.report, JSON.stringify({ projectId, mode: options.rollback ? options.apply ? 'rollback' : 'rollback-dry-run' : options.apply ? 'apply' : 'dry-run', ...report }, null, 2), { mode: 0o600 });
  console.log(JSON.stringify({ total: report.total, counts: report.counts }));
}

module.exports = { buildPlan, migrate, createApi, main };
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
