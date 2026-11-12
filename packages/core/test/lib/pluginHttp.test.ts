const dns = require('dns');
const axios = require('axios');
const nock = require('nock');
const pluginHttp = require('../../lib/pluginHttp');

const blocked = [
  'http://example.com/path', 'ftp://example.com', '/relative', 'https://user:password@example.com',
  'https://localhost', 'https://LOCALHOST.', 'https://service.localhost',
  'https://127.0.0.1', 'https://127.1', 'https://2130706433', 'https://0x7f000001', 'https://0177.0.0.1',
  'https://10.0.0.1', 'https://172.16.0.1', 'https://192.168.0.1', 'https://169.254.169.254',
  'https://100.100.100.200', 'https://0.0.0.0', 'https://198.18.0.1', 'https://192.0.2.1',
  'https://224.0.0.1', 'https://240.0.0.1', 'https://168.63.129.16',
  'https://[::1]', 'https://[::]', 'https://[::ffff:127.0.0.1]', 'https://[::ffff:a9fe:a9fe]',
  'https://[fc00::1]', 'https://[fe80::1]', 'https://[fec0::1]', 'https://[ff02::1]',
  'https://[2001:db8::1]', 'https://[3fff::1]', 'https://[3ffe::1]', 'https://[4000::1]',
  'https://[64:ff9b::7f00:1]', 'https://[2002:7f00:1::1]',
];

describe('public HTTPS plugin transport', () => {
  afterEach(() => { jest.restoreAllMocks(); nock.cleanAll(); nock.enableNetConnect(); });

  test.each(blocked)('rejects %s before creating an HTTP request', async (url) => {
    const send = jest.spyOn(axios, 'get').mockResolvedValue({ data: {} });
    await expect(pluginHttp.get(url)).rejects.toThrow(/public HTTPS/);
    expect(send).not.toHaveBeenCalled();
  });

  test.each([null, undefined, 123, {}, ['https://plugins.example.com']])('rejects non-string URL %p', async (url) => {
    const send = jest.spyOn(axios, 'get').mockResolvedValue({ data: {} });
    await expect(pluginHttp.get(url)).rejects.toThrow(/public HTTPS/);
    expect(send).not.toHaveBeenCalled();
  });

  test.each(['https://8.8.8.8/path', 'https://[2606:4700:4700::1111]/path', 'https://[::ffff:8.8.8.8]/path', 'https://plugins.example.com:8443/path'])
    ('preserves public targets and opaque payloads at %s', async (url) => {
      const response = { data: { ok: true } };
      const send = jest.spyOn(axios, 'post').mockResolvedValue(response);
      const data = { note: '</script>', token: 'opaque' };
      await expect(pluginHttp.post(url, data, { headers: { Authorization: 'Bearer opaque' } })).resolves.toBe(response);
      const [target, body, options] = send.mock.calls[0] as any[];
      expect(target).toBe(new URL(url).href);
      expect(body).toBe(data);
      expect(options).toMatchObject({ headers: { Authorization: 'Bearer opaque' }, proxy: false, adapter: 'http', httpVersion: 1, socketPath: null, transport: null, baseURL: '', allowAbsoluteUrls: true });
      expect(options.httpsAgent.options.rejectUnauthorized).toBe(true);
      expect(options.httpsAgent.options.lookup).toBe(options.lookup);
    });

  async function connectionOptions(): Promise<any> {
    const send = jest.spyOn(axios, 'get').mockResolvedValue({ data: {} });
    await pluginHttp.get('https://plugins.example.com/path');
    return send.mock.calls[0][1];
  }

  function lookup(options, answers, all = false) {
    jest.spyOn(dns, 'lookup').mockImplementation((_hostname, requested: any, callback: any) => {
      expect(requested.all).toBe(true);
      callback(null, answers);
    });
    return new Promise<any>(resolve => options.lookup('plugins.example.com', { all }, (error, address, family) => resolve({ error, address, family })));
  }

  test('passes the checked address to the socket without a second unrestricted lookup', async () => {
    const options = await connectionOptions();
    const response = await lookup(options, [{ address: '8.8.8.8', family: 4 }]);
    expect(response).toEqual({ error: null, address: '8.8.8.8', family: 4 });
    expect(dns.lookup).toHaveBeenCalledTimes(1);
    // A later connection is checked again if the host rebinds.
    dns.lookup.mockImplementation((_host, _options, callback: any) => callback(null, [{ address: '127.0.0.1', family: 4 }]));
    const rebound = await new Promise<any>(resolve => options.lookup('plugins.example.com', {}, error => resolve(error)));
    expect(rebound.message).toMatch(/public HTTPS/);
  });

  test('supports the Node 20 all-address lookup callback', async () => {
    const options = await connectionOptions();
    const records = [{ address: '2606:4700:4700::1111', family: 6 }, { address: '8.8.8.8', family: 4 }];
    const response = await lookup(options, records, true);
    expect(response).toEqual({ error: null, address: records, family: undefined });
  });

  test('respects a requested address family for a scalar lookup', async () => {
    const options = await connectionOptions();
    jest.spyOn(dns, 'lookup').mockImplementation((_host, _settings, callback: any) => callback(null, [{ address: '2606:4700:4700::1111', family: 6 }, { address: '8.8.8.8', family: 4 }]));
    const result = await new Promise<any>(resolve => options.lookup('plugins.example.com', { family: 4 }, (error, address, family) => resolve({ error, address, family })));
    expect(result).toEqual({ error: null, address: '8.8.8.8', family: 4 });
  });

  test('does not accept alternate transports or agents from caller options', async () => {
    const send = jest.spyOn(axios, 'post').mockResolvedValue({ data: {} });
    await pluginHttp.post('https://plugins.example.com/path', {}, { proxy: { host: '127.0.0.1' }, socketPath: '/private/socket', transport: {}, httpsAgent: {}, lookup: () => {}, baseURL: 'https://127.0.0.1', httpVersion: 2, auth: { username: 'user', password: 'opaque' } } as any);
    expect(send.mock.calls[0][2]).toMatchObject({ proxy: false, socketPath: null, transport: null, baseURL: '', auth: null, httpVersion: 1 });
  });

  test.each([
    [], [{ address: '127.0.0.1', family: 4 }], [{ address: 'fe80::1', family: 6 }],
    [{ address: '8.8.8.8', family: 4 }, { address: '10.0.0.1', family: 4 }],
    [{ address: '::ffff:192.168.0.1', family: 6 }], [{ address: '8.8.8.8', family: 6 }],
    [{ address: 'not-an-address', family: 4 }],
  ].map(records => ({ records })))('fails closed for invalid, private or mixed DNS results $records', async ({ records }) => {
    const options = await connectionOptions();
    const result = await lookup(options, records, true);
    expect(result.error.message).toMatch(/public HTTPS/);
    expect(result.address).toBeUndefined();
  });

  test('propagates DNS failures without falling back to another resolver', async () => {
    const options = await connectionOptions();
    const failure = new Error('DNS unavailable');
    jest.spyOn(dns, 'lookup').mockImplementation((_host, _options, callback: any) => callback(failure));
    const error = await new Promise(resolve => options.lookup('plugins.example.com', {}, resolve));
    expect(error).toBe(failure);
    expect(dns.lookup).toHaveBeenCalledTimes(1);
  });

  test('rejects localhost through the two-argument lookup API without resolving it', async () => {
    const options = await connectionOptions();
    const resolver = jest.spyOn(dns, 'lookup');
    const error = await new Promise<any>(resolve => options.lookup('localhost', resolve));
    expect(error.message).toMatch(/public HTTPS/);
    expect(resolver).not.toHaveBeenCalled();
  });

  test.each(['http://plugins.example.com/next', 'https://127.0.0.1/next', 'https://user:password@plugins.example.com/next'])
    ('blocks unsafe redirect %s before following it', async (location) => {
      nock.disableNetConnect();
      nock('https://plugins.example.com').get('/start').reply(302, '', { Location: location });
      await expect(pluginHttp.get('https://plugins.example.com/start')).rejects.toThrow(/public HTTPS/);
    });

  test.each([301, 302, 303])('retains POST-to-GET semantics for HTTPS %s redirects', async (status) => {
    nock.disableNetConnect();
    const body = { token: 'opaque', note: 'unchanged' };
    const server = nock('https://plugins.example.com')
      .post('/start', body).reply(status, '', { Location: '/finish' })
      .get('/finish').reply(function (this: any, _uri, requestBody) {
        expect(requestBody).toBe('');
        expect(this.req.headers['content-type']).toBeUndefined();
        expect(this.req.headers['content-length']).toBeUndefined();
        expect(this.req.headers.authorization).toBe('Bearer opaque');
        return [200, { ok: true }];
      });
    const response = await pluginHttp.post('https://plugins.example.com/start', body, { headers: { Authorization: 'Bearer opaque' } });
    expect(response.data).toEqual({ ok: true });
    expect(server.isDone()).toBe(true);
  });

  test.each([307, 308])('retains HTTPS %s method, body and same-origin authorization semantics', async (status) => {
    nock.disableNetConnect();
    const body = { token: 'opaque', note: 'unchanged' };
    const server = nock('https://plugins.example.com')
      .post('/start', body).reply(status, '', { Location: '/finish' })
      .post('/finish', body).matchHeader('authorization', 'Bearer opaque').reply(200, { ok: true });
    const response = await pluginHttp.post('https://plugins.example.com/start', body, { headers: { Authorization: 'Bearer opaque' } });
    expect(response.data).toEqual({ ok: true });
    expect(server.isDone()).toBe(true);
  });

  test('uses the guarded HTTP transport despite shared Axios defaults and proxy environment variables', async () => {
    nock.disableNetConnect();
    const unsafeAgent = new (require('https').Agent)({ rejectUnauthorized: false });
    const unsafeTransport = { request: jest.fn(() => { throw new Error('Unexpected shared transport'); }) };
    const unsafeLookup = jest.fn();
    const overrides = {
      adapter: 'fetch', httpVersion: 2, baseURL: 'https://127.0.0.1', allowAbsoluteUrls: false,
      auth: { username: 'test-user', password: require('crypto').randomBytes(16).toString('hex') },
      proxy: { protocol: 'http:', host: '127.0.0.1', port: 9 },
      socketPath: '/private/socket', transport: unsafeTransport,
      httpsAgent: unsafeAgent, lookup: unsafeLookup,
    };
    const savedDefaults = Object.keys(overrides).map(key => ({ key, own: Object.prototype.hasOwnProperty.call(axios.defaults, key), value: axios.defaults[key] }));
    const proxyKeys = ['HTTPS_PROXY', 'https_proxy', 'HTTP_PROXY', 'http_proxy', 'ALL_PROXY', 'all_proxy'];
    const savedEnvironment = proxyKeys.map(key => ({ key, value: process.env[key] }));
    const body = { note: 'preserved' };
    const server = nock('https://plugins.example.com')
      .post('/direct', body).matchHeader('authorization', 'Bearer opaque').reply(200, { ok: true });
    const send = jest.spyOn(axios, 'post');
    try {
      Object.assign(axios.defaults, overrides);
      for (const key of proxyKeys) process.env[key] = 'http://127.0.0.1:9';
      await expect(pluginHttp.post('https://plugins.example.com/direct', body, { headers: { Authorization: 'Bearer opaque' } }))
        .resolves.toMatchObject({ data: { ok: true } });
      expect(server.isDone()).toBe(true);
      expect(unsafeTransport.request).not.toHaveBeenCalled();
      expect(unsafeLookup).not.toHaveBeenCalled();
      const options = send.mock.calls[0][2] as any;
      expect(options).toMatchObject({ adapter: 'http', httpVersion: 1, baseURL: '', allowAbsoluteUrls: true, auth: null, proxy: false, socketPath: null, transport: null });
      expect(options.httpsAgent).not.toBe(unsafeAgent);
      expect(options.httpsAgent.options.rejectUnauthorized).toBe(true);
      expect(options.lookup).not.toBe(unsafeLookup);
    } finally {
      for (const { key, own, value } of savedDefaults) {
        if (own) axios.defaults[key] = value;
        else delete axios.defaults[key];
      }
      for (const { key, value } of savedEnvironment) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      unsafeAgent.destroy();
    }
  });

  test('does not restore authorization stripped by a cross-origin HTTPS redirect', async () => {
    nock.disableNetConnect();
    nock('https://plugins.example.com').get('/start').reply(302, '', { Location: 'https://other-provider.example/finish' });
    const target = nock('https://other-provider.example').get('/finish').reply(function (this: any) {
      expect(this.req.headers.authorization).toBeUndefined();
      return [200, { ok: true }];
    });
    await expect(pluginHttp.get('https://plugins.example.com/start', { headers: { Authorization: 'Bearer opaque' } })).resolves.toMatchObject({ data: { ok: true } });
    expect(target.isDone()).toBe(true);
  });

  test('redirect validation and its connection retain the same DNS guard', async () => {
    const options = await connectionOptions();
    expect(() => options.beforeRedirect({ href: 'https://internal.example/next', protocol: 'https:', hostname: 'internal.example', port: 443 })).not.toThrow();
    jest.spyOn(dns, 'lookup').mockImplementation((_host, _settings, callback: any) => callback(null, [{ address: '10.0.0.1', family: 4 }]));
    const error = await new Promise<any>(resolve => options.httpsAgent.options.lookup('internal.example', { all: true }, resolve));
    expect(error.message).toMatch(/public HTTPS/);
  });

  test('blocks a private DNS answer before a real socket can reach a local service', async () => {
    const net = require('net');
    let connections = 0;
    const server = net.createServer(socket => { connections++; socket.destroy(); });
    await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    const originalTimeout = axios.defaults.timeout;
    axios.defaults.timeout = 1000;
    nock.enableNetConnect(/private-target\.example/);
    const resolver = jest.spyOn(dns, 'lookup').mockImplementation((_host, options: any, callback: any) => {
      if (typeof options === 'function') { callback = options; options = {}; }
      if (options?.all) callback(null, [{ address: '127.0.0.1', family: 4 }]);
      else callback(null, '127.0.0.1', 4);
    });
    try {
      const port = server.address().port;
      await expect(pluginHttp.get(`https://private-target.example:${port}/`)).rejects.toThrow(/public HTTPS/);
      expect(resolver).toHaveBeenCalledTimes(1);
      expect(connections).toBe(0);
    } finally {
      axios.defaults.timeout = originalTimeout;
      await new Promise<void>(resolve => server.close(resolve));
    }
  });

  test.each([
    { protocol: 'http:' }, { hostname: '127.0.0.1' }, { port: 8443 },
    { auth: 'user:opaque' }, { socketPath: '/private/socket' },
  ])('rejects redirect transport options inconsistent with the checked URL: %p', async (changed) => {
    const options = await connectionOptions();
    expect(() => options.beforeRedirect({ href: 'https://plugins.example.com/path', protocol: 'https:', hostname: 'plugins.example.com', port: 443, ...changed })).toThrow(/public HTTPS/);
  });
});

export {};
