const originalDisableSyncDbTable = process.env.DISABLE_SYNC_DB_TABLE;
process.env.DISABLE_SYNC_DB_TABLE = 'true';

const request = require('supertest');

jest.mock('@app-connect/core/lib/jwt', () => ({
  decodeJwt: jest.fn(),
}));
jest.mock('@app-connect/core/models/userModel', () => ({
  UserModel: {
    findByPk: jest.fn(),
  },
}));

const jwt = require('@app-connect/core/lib/jwt');
const { UserModel } = require('@app-connect/core/models/userModel');
const { getServer } = require('../src/index');

describe('Application plugin routes', () => {
  let consoleLogSpy;

  afterAll(() => {
    if (originalDisableSyncDbTable === undefined) {
      delete process.env.DISABLE_SYNC_DB_TABLE;
    } else {
      process.env.DISABLE_SYNC_DB_TABLE = originalDisableSyncDbTable;
    }
  });

  afterEach(() => {
    consoleLogSpy?.mockRestore();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    jwt.decodeJwt.mockReturnValue({ id: 'crm-user-id', platform: 'testCRM' });
    UserModel.findByPk.mockResolvedValue({
      id: 'crm-user-id',
      platform: 'testCRM',
      userSettings: {
        'plugin_ringcentral_labs-app_caps-yKI8e20W': {
          value: { config: { ignoredLetters: { value: ['e', '!'] } } },
        },
      },
    });
  });

  test.each([
    '/googleDrive/oauthUrl',
    '/googleDrive/oauthCallback',
    '/googleDrive/checkAuth',
  ])('GET %s is no longer available', async (endpoint) => {
    const response = await request(getServer()).get(endpoint).query({ jwtToken: 'crm-jwt' });

    expect(response.status).toBe(404);
  });

  test('POST /googleDrive/logout is no longer available', async () => {
    const response = await request(getServer())
      .post('/googleDrive/logout')
      .send({ jwtToken: 'crm-jwt' });

    expect(response.status).toBe(404);
  });

  test('GET /plugin/licenseStatus/allCap returns the built-in all-cap license status', async () => {
    const response = await request(getServer())
      .get('/plugin/licenseStatus/allCap')
      .query({ jwtToken: 'crm-jwt' });

    expect(response.status).toBe(200);
    expect(jwt.decodeJwt).toHaveBeenCalledWith('crm-jwt');
    expect(UserModel.findByPk).toHaveBeenCalledWith('crm-user-id');
    expect(response.body).toEqual({
      licenseStatus: true,
      licenseStatusDescription: 'License: Basic',
    });
  });

  test.each(['unknownPlugin', 'googleDrive'])('rejects license checks for unsupported plugin %s', async (pluginId) => {
    const response = await request(getServer())
      .get(`/plugin/licenseStatus/${pluginId}`)
      .query({ jwtToken: 'crm-jwt' });

    expect(response.status).toBe(400);
    expect(response.text).toBe('Unknown plugin');
  });

  test('POST /plugin/all_cap runs the all-cap plugin against submitted data', async () => {
    const response = await request(getServer())
      .post('/plugin/all_cap')
      .query({ jwtToken: 'crm-jwt' })
      .send({ data: { note: 'Hello!' } });

    expect(response.status).toBe(200);
    expect(response.type).toBe('application/json');
    expect(response.body).toEqual({ note: 'HeLLO!' });
  });

  test('POST /plugin/all_cap converts plugin exceptions to a 400 response', async () => {
    const response = await request(getServer())
      .post('/plugin/all_cap')
      .query({ jwtToken: 'crm-jwt' })
      .send({ data: {} });

    expect(response.status).toBe(400);
  });

  test.each(['unknownPlugin', 'googleDrive'])('rejects execution of unsupported plugin %s', async (pluginId) => {
    const response = await request(getServer())
      .post(`/plugin/${pluginId}`)
      .query({ jwtToken: 'crm-jwt' })
      .send({ data: { note: 'Hello!' } });

    expect(response.status).toBe(400);
    expect(response.text).toBe('Unknown plugin');
  });

  describe.each([
    ['get', '/plugin/licenseStatus/allCap'],
    ['post', '/plugin/all_cap'],
  ])('%s %s authentication', (method, endpoint) => {
    test('rejects a missing CRM user before plugin handling', async () => {
      UserModel.findByPk.mockResolvedValueOnce(null);
      const response = await request(getServer())[method](endpoint)
        .query({ jwtToken: 'crm-jwt' });

      expect(response.status).toBe(400);
      expect(response.text).toBe('User not found');
    });

    test.each([null, { platform: 'testCRM' }])('rejects invalid or expired JWT payload %p', async (payload) => {
      jwt.decodeJwt.mockReturnValue(payload);
      const response = await request(getServer())[method](endpoint)
        .query({ jwtToken: 'invalid-jwt' });

      expect(response.status).toBe(401);
      expect(response.text).toBe('Invalid or expired token');
      expect(UserModel.findByPk).not.toHaveBeenCalled();
    });
  });
});

export {};
