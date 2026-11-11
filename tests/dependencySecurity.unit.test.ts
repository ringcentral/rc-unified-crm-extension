const { createRequire } = require('module');
const { Readable } = require('stream');
const request = require('supertest');
const nock = require('nock');
const express = require('express');
const bodyParser = require('body-parser');
const { Sequelize, DataTypes } = require('sequelize');

describe.each(['sequelize', 'googleapis-common', 'gaxios'])('%s UUID compatibility', (parent: string) => {
  const uuid = createRequire(require.resolve(parent))('uuid');

  test.each(['v3', 'v5'])('%s rejects undersized or out-of-range output buffers', (method: string) => {
    for (const [length, offset] of [[8, 0], [16, 1], [24, 20]]) {
      expect(() => uuid[method]('boundary-test', uuid[method].DNS, new Uint8Array(length), offset))
        .toThrow(RangeError);
    }
  });

  test('preserves v1/v4 and valid namespace-buffer APIs', () => {
    expect(uuid.version(uuid.v1())).toBe(1);
    expect(uuid.version(uuid.v4())).toBe(4);
    const buffer = new Uint8Array(24);
    expect(uuid.v5('boundary-test', uuid.v5.DNS, buffer, 4)).toBe(buffer);
    expect(uuid.stringify(buffer, 4)).toBe(uuid.v5('boundary-test', uuid.v5.DNS));
  });
});

describe.each(['express', 'body-parser', 'send', 'finalhandler'])('%s debug compatibility', (parent: string) => {
  const debug = createRequire(require.resolve(parent))('debug');
  const originalDebug = process.env.DEBUG;

  afterEach(() => {
    debug.disable();
    if (originalDebug === undefined) delete process.env.DEBUG;
    else debug.enable(originalDebug);
  });

  test('treats regex syntax as literal namespace data', () => {
    expect(() => debug.enable('boundary:(')).not.toThrow();
    expect(debug.enabled('boundary:(')).toBe(true);
    debug.enable('boundary:(a+)+$');
    expect(debug.enabled('boundary:aaaa')).toBe(false);
    expect(debug.enabled('boundary:(a+)+$')).toBe(true);
  });

  test('preserves exclusions and formatted messages', () => {
    debug.enable('boundary:*,-boundary:skip');
    expect(debug.enabled('boundary:skip')).toBe(false);
    const logger = debug('boundary:request');
    logger.log = jest.fn();
    logger('record %d %o', 7, { answer: 42 });
    expect(logger.log).toHaveBeenCalledTimes(1);
    const message = require('util').format(...logger.log.mock.calls[0]);
    expect(message).toContain('record 7');
    expect(message).toContain('answer: 42');
  });
});

test('preserves Sequelize UUID defaults, commits and rollbacks', async () => {
  const db = new Sequelize('sqlite::memory:', { logging: false });
  const Row = db.define('security_uuid_rows', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    legacyId: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV1 },
    label: DataTypes.STRING,
  });
  const uuid = createRequire(require.resolve('sequelize'))('uuid');
  try {
    await Row.sync({ force: true });
    await db.transaction(async (transaction: any) => {
      const row = await Row.create({ label: 'committed' }, { transaction });
      expect(uuid.version(row.id)).toBe(4);
      expect(uuid.version(row.legacyId)).toBe(1);
    });
    await expect(db.transaction(async (transaction: any) => {
      await Row.create({ label: 'rolled-back' }, { transaction });
      throw new Error('rollback-control');
    })).rejects.toThrow('rollback-control');
    expect(await Row.count()).toBe(1);
    expect((await Row.findOne()).label).toBe('committed');
  } finally {
    await db.close();
  }
});

test('preserves Google multipart upload boundaries without contacting Google', async () => {
  const { google } = require('googleapis');
  let boundary = '';
  let body = '';
  const scope = nock('https://www.googleapis.com')
    .post('/upload/drive/v3/files', (value: any) => { body = String(value); return true; })
    .query((query: any) => query.uploadType === 'multipart' && query.key === 'boundary-test-key')
    .matchHeader('content-type', (value: string) => {
      boundary = /boundary="?([a-f0-9-]{36})/i.exec(value)?.[1] || '';
      return !!boundary;
    })
    .reply(200, { id: 'file-1' });
  try {
    const drive = google.drive({ version: 'v3', auth: 'boundary-test-key' });
    const result = await drive.files.create({
      requestBody: { name: 'boundary.txt' },
      media: { mimeType: 'text/plain', body: Readable.from(['boundary-content']) },
    });
    expect(result.data.id).toBe('file-1');
    expect(boundary).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    expect(body).toContain(`--${boundary}`);
    expect(body).toContain('boundary-content');
    expect(scope.isDone()).toBe(true);
  } finally {
    nock.cleanAll();
  }
});

test('preserves real HTTP parsing, file responses and final 404 handling', async () => {
  const app = express();
  app.use((_req: any, res: any, next: any) => {
    res.setHeader('Content-Security-Policy', "default-src 'none'");
    next();
  });
  app.use(bodyParser.json());
  app.use(bodyParser.urlencoded({ extended: true }));
  app.post('/echo', (req: any, res: any) => res.json(req.body));
  app.get('/file', (_req: any, res: any) => res.sendFile(require.resolve('express/package.json')));
  await request(app).post('/echo').send({ message: 'hello' }).expect(200, { message: 'hello' });
  await request(app).post('/echo').type('form').send('settings[enabled]=yes')
    .expect(200, { settings: { enabled: 'yes' } });
  expect((await request(app).get('/file').expect(200)).body.name).toBe('express');
  await request(app).get('/missing').expect(404);
});

export {};
