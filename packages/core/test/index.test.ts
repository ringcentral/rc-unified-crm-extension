const express = require('express');
const request = require('supertest');

jest.mock('../lib/jwt', () => ({
  decodeJwt: jest.fn(),
  generateJwt: jest.fn(),
}));
jest.mock('../handlers/auth', () => ({
  authValidation: jest.fn(),
}));
jest.mock('../handlers/log', () => ({
  handleAsyncPluginCallback: jest.fn(),
}));
jest.mock('../lib/analytics', () => ({
  init: jest.fn(),
  track: jest.fn(),
}));

const jwt = require('../lib/jwt');
const authCore = require('../handlers/auth');
const logCore = require('../handlers/log');
const { createCoreRouter, createCoreMiddleware } = require('../index');
const connectorRegistry = require('../connector/registry');
const { ImplementedInterfacesResponseSchema } = require('../contracts');

test('TypeScript package entrypoint exposes the compatibility core API', () => {
  const tsCore = require('../index.ts');

  expect(tsCore.createCoreRouter).toEqual(expect.any(Function));
  expect(tsCore.createCoreMiddleware).toEqual(expect.any(Function));
  expect(tsCore.createCoreApp).toEqual(expect.any(Function));
  expect(tsCore.initializeCore).toEqual(expect.any(Function));
  expect(tsCore.connectorRegistry).toBeDefined();
  expect(tsCore.proxyConnector).toBeDefined();
  expect(tsCore.DebugTracer).toEqual(expect.any(Function));
});

function buildApp() {
  const app = express();
  createCoreMiddleware().forEach((m) => app.use(m));
  app.use('/', createCoreRouter());
  return app;
}

describe('Core Router JWT normalization', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should accept query jwtToken without exp without refreshing it', async () => {
    jwt.decodeJwt.mockReturnValue({ id: 'user-1', platform: 'testCRM' });
    authCore.authValidation.mockResolvedValue({
      successful: true,
      returnMessage: { message: 'ok' },
      failReason: null,
      status: 200,
    });
    const app = buildApp();

    const response = await request(app).get('/authValidation?jwtToken=query-token');

    expect(response.status).toBe(200);
    expect(response.headers['x-refreshed-jwt-token']).toBeUndefined();
    expect(authCore.authValidation).toHaveBeenCalledWith({
      platform: 'testCRM',
      userId: 'user-1',
    });
    expect(jwt.generateJwt).not.toHaveBeenCalled();
  });

  test('should refresh near-expiry query jwtToken and expose header', async () => {
    const nowMs = 1700000000000;
    const nowSeconds = Math.floor(nowMs / 1000);
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(nowMs);
    jwt.decodeJwt.mockImplementation((token) => {
      if (token === 'query-token') {
        return { id: 'user-1', platform: 'testCRM', exp: nowSeconds + 60 };
      }
      if (token === 'new-token') {
        return { id: 'user-1', platform: 'testCRM', exp: nowSeconds + (14 * 24 * 60 * 60) };
      }
      return null;
    });
    jwt.generateJwt.mockReturnValue('new-token');
    authCore.authValidation.mockResolvedValue({
      successful: true,
      returnMessage: { message: 'ok' },
      failReason: null,
      status: 200,
    });
    const app = buildApp();

    const response = await request(app)
      .get('/authValidation?jwtToken=query-token')
      .set('Origin', 'https://example.com');

    expect(response.status).toBe(200);
    expect(response.headers['x-refreshed-jwt-token']).toBe('new-token');
    expect(response.headers['access-control-expose-headers']).toContain('x-refreshed-jwt-token');
    expect(jwt.generateJwt).toHaveBeenCalledWith({ id: 'user-1', platform: 'testCRM' });
    expect(authCore.authValidation).toHaveBeenCalledWith({
      platform: 'testCRM',
      userId: 'user-1',
    });
    expect(jwt.decodeJwt).toHaveBeenCalledWith('new-token');
    nowSpy.mockRestore();
  });

  test('should not rotate long-lived query jwtToken', async () => {
    const nowMs = 1700000000000;
    const nowSeconds = Math.floor(nowMs / 1000);
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(nowMs);
    jwt.decodeJwt.mockReturnValue({
      id: 'user-1',
      platform: 'testCRM',
      exp: nowSeconds + (120 * 365 * 24 * 60 * 60),
    });
    authCore.authValidation.mockResolvedValue({
      successful: true,
      returnMessage: { message: 'ok' },
      failReason: null,
      status: 200,
    });
    const app = buildApp();

    const response = await request(app).get('/authValidation?jwtToken=query-token');

    expect(response.status).toBe(200);
    expect(response.headers['x-refreshed-jwt-token']).toBeUndefined();
    expect(jwt.generateJwt).not.toHaveBeenCalled();
    nowSpy.mockRestore();
  });

  test('should refresh near-expiry bearer token and expose header', async () => {
    const nowMs = 1700000000000;
    const nowSeconds = Math.floor(nowMs / 1000);
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(nowMs);
    jwt.decodeJwt.mockImplementation((token) => {
      if (token === 'old-token') {
        return { id: 'user-1', platform: 'testCRM', exp: nowSeconds + 60 };
      }
      if (token === 'new-token') {
        return { id: 'user-1', platform: 'testCRM', exp: nowSeconds + (14 * 24 * 60 * 60) };
      }
      return null;
    });
    jwt.generateJwt.mockReturnValue('new-token');
    const app = buildApp();

    const response = await request(app)
      .get('/isAlive')
      .set('Authorization', 'Bearer old-token')
      .set('Origin', 'https://example.com');

    expect(response.status).toBe(200);
    expect(response.headers['x-refreshed-jwt-token']).toBe('new-token');
    expect(response.headers['access-control-expose-headers']).toContain('x-refreshed-jwt-token');
    expect(jwt.generateJwt).toHaveBeenCalledWith({ id: 'user-1', platform: 'testCRM' });
    nowSpy.mockRestore();
  });

  test('should treat invalid bearer token as unauthenticated for authValidation route', async () => {
    jwt.decodeJwt.mockReturnValue(null);
    const app = buildApp();

    const response = await request(app)
      .get('/authValidation?jwtToken=query-token')
      .set('Authorization', 'Bearer invalid-token');

    expect(response.status).toBe(400);
    expect(response.text).toContain('authorize CRM platform');
    expect(authCore.authValidation).not.toHaveBeenCalled();
  });

  test('should bypass normalization for /mcp routes', async () => {
    const app = buildApp();

    const response = await request(app)
      .get('/mcp')
      .set('Authorization', 'Bearer maybe-token');

    expect(response.status).toBe(404);
    expect(jwt.decodeJwt).not.toHaveBeenCalled();
  });

  test('should route plugin async callbacks by task id', async () => {
    logCore.handleAsyncPluginCallback.mockResolvedValue({
      statusCode: 200,
      body: { successful: true },
    });
    const app = buildApp();

    const response = await request(app)
      .post('/plugin/async-callback/task-123')
      .send({
        successful: true,
        message: 'Done',
        note: 'Callback note',
      });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ successful: true });
    expect(logCore.handleAsyncPluginCallback).toHaveBeenCalledWith({
      taskId: 'task-123',
      body: {
        successful: true,
        message: 'Done',
        note: 'Callback note',
      },
    });
  });
});
describe('Core Router implementedInterfaces contract', () => {
  const originalUseCache = process.env.USE_CACHE;

  beforeEach(() => {
    connectorRegistry.connectors.clear();
    connectorRegistry.manifests.clear();
    connectorRegistry.platformInterfaces.clear();
    delete process.env.USE_CACHE;
  });

  afterEach(() => {
    connectorRegistry.connectors.clear();
    connectorRegistry.manifests.clear();
    connectorRegistry.platformInterfaces.clear();
    if (originalUseCache === undefined) {
      delete process.env.USE_CACHE;
    } else {
      process.env.USE_CACHE = originalUseCache;
    }
  });

  test('returns client capability flags for an oauth platform', async () => {
    connectorRegistry.registerConnector('contractCRM', {
      getAuthType: jest.fn().mockReturnValue('oauth'),
      getOauthInfo: jest.fn(),
      getUserInfo: jest.fn(),
      createCallLog: jest.fn(),
      updateCallLog: jest.fn(),
      createMessageLog: jest.fn(),
      findContactWithName: jest.fn(),
      getLicenseStatus: jest.fn(),
    });
    const app = buildApp();

    const response = await request(app).get('/implementedInterfaces?platform=contractCRM');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      getAuthType: true,
      getOauthInfo: true,
      getUserInfo: true,
      createCallLog: true,
      updateCallLog: true,
      getCallLog: false,
      createMessageLog: true,
      updateMessageLog: false,
      createContact: false,
      findContact: false,
      listAppointments: false,
      createAppointment: false,
      updateAppointment: false,
      refreshAppointment: false,
      confirmAppointment: false,
      cancelAppointment: false,
      unAuthorize: false,
      upsertCallDisposition: false,
      findContactWithName: true,
      getUserList: false,
      getLicenseStatus: true,
      getLogFormatType: false,
      refreshUserInfo: false,
      cacheCallNote: false,
    });
    expect(ImplementedInterfacesResponseSchema.parse(response.body)).toEqual(response.body);
    expect(response.body).not.toHaveProperty('getBasicAuth');
  });

  test('returns basic auth and cache flags for an apiKey platform', async () => {
    process.env.USE_CACHE = 'true';
    connectorRegistry.registerConnector('apiKeyCRM', {
      getAuthType: jest.fn().mockReturnValue('apiKey'),
      getBasicAuth: jest.fn(),
      createCallLog: jest.fn(),
      updateCallLog: jest.fn(),
      updateMessageLog: jest.fn(),
      refreshUserInfo: jest.fn(),
    });
    const app = buildApp();

    const response = await request(app).get('/implementedInterfaces?platform=apiKeyCRM');

    expect(response.status).toBe(200);
    expect(response.body).toEqual(expect.objectContaining({
      getAuthType: true,
      getBasicAuth: true,
      createCallLog: true,
      updateCallLog: true,
      updateMessageLog: true,
      refreshUserInfo: true,
      cacheCallNote: true,
    }));
    expect(response.body).not.toHaveProperty('getOauthInfo');
  });

  test('rejects requests without a platform parameter', async () => {
    const app = buildApp();

    const response = await request(app).get('/implementedInterfaces');

    expect(response.status).toBe(400);
    expect(response.text).toBe('Please provide platform.');
  });
});

export {};
