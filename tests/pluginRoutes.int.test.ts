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
jest.mock('../src/plugins/googleDrivePlugin', () => ({
  checkAuth: jest.fn(),
  getOAuthUrl: jest.fn(),
  logout: jest.fn(),
  onOAuthCallback: jest.fn(),
  uploadToGoogleDrive: jest.fn(),
}));

const jwt = require('@app-connect/core/lib/jwt');
const { UserModel } = require('@app-connect/core/models/userModel');
const googleDrivePlugin = require('../src/plugins/googleDrivePlugin');
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
    jwt.decodeJwt.mockReturnValue({
      id: 'crm-user-id',
      platform: 'testCRM',
    });
    UserModel.findByPk.mockResolvedValue({
      id: 'crm-user-id',
      platform: 'testCRM',
      userSettings: {
        'plugin_ringcentral_labs-app_caps-yKI8e20W': {
          value: {
            config: {
              ignoredLetters: {
                value: ['e', '!'],
              },
            },
          },
        },
      },
    });
  });

  test('GET /googleDrive/oauthUrl returns an OAuth URL for a valid CRM JWT', async () => {
    googleDrivePlugin.getOAuthUrl.mockResolvedValue({
      oAuthUri: 'https://accounts.google.example/oauth?state=encoded',
    });

    const response = await request(getServer())
      .get('/googleDrive/oauthUrl')
      .query({ jwtToken: 'crm-jwt', pluginId: 'googleDrive' });

    expect(response.status).toBe(200);
    expect(googleDrivePlugin.getOAuthUrl).toHaveBeenCalledWith({
      jwtToken: 'crm-jwt',
      pluginId: 'googleDrive',
    });
    expect(response.body).toEqual({
      oAuthUri: 'https://accounts.google.example/oauth?state=encoded',
    });
  });

  test('GET /googleDrive/oauthUrl validates JWT presence and converts plugin errors to 400', async () => {
    await expect(request(getServer()).get('/googleDrive/oauthUrl'))
      .resolves.toMatchObject({ status: 400, text: 'JWT token is required' });

    googleDrivePlugin.getOAuthUrl.mockRejectedValueOnce(new Error('oauth failed'));

    const response = await request(getServer())
      .get('/googleDrive/oauthUrl')
      .query({ jwtToken: 'crm-jwt' });

    expect(response.status).toBe(400);
  });

  test('GET /googleDrive/oauthCallback resolves user, passes reconstructed callback URI, and returns plugin id', async () => {
    const state = encodeURIComponent(JSON.stringify({
      jwtToken: 'crm-jwt',
      pluginId: 'googleDrive',
    }));

    const response = await request(getServer())
      .get('/googleDrive/oauthCallback')
      .query({
        callbackUri: `https://extension.example/callback?state=${state}`,
        code: 'google-code',
        scope: 'drive.file',
      });

    expect(response.status).toBe(200);
    expect(jwt.decodeJwt).toHaveBeenCalledWith('crm-jwt');
    expect(UserModel.findByPk).toHaveBeenCalledWith('crm-user-id');
    expect(googleDrivePlugin.onOAuthCallback).toHaveBeenCalledWith({
      user: expect.objectContaining({ id: 'crm-user-id' }),
      callbackUri: `https://extension.example/callback?state=${state}&code=google-code&scope=drive.file`,
    });
    expect(response.body).toEqual({ pluginId: 'googleDrive' });
  });

  test('GET /googleDrive/oauthCallback returns 400 when the CRM user cannot be found', async () => {
    UserModel.findByPk.mockResolvedValueOnce(null);
    const state = encodeURIComponent(JSON.stringify({
      jwtToken: 'crm-jwt',
      pluginId: 'googleDrive',
    }));

    const response = await request(getServer())
      .get('/googleDrive/oauthCallback')
      .query({
        callbackUri: `https://extension.example/callback?state=${state}`,
        code: 'google-code',
        scope: 'drive.file',
      });

    expect(response.status).toBe(400);
    expect(response.text).toBe('User not found');
    expect(googleDrivePlugin.onOAuthCallback).not.toHaveBeenCalled();
  });

  test('GET /googleDrive/checkAuth validates JWT and delegates to the Google Drive plugin', async () => {
    googleDrivePlugin.checkAuth.mockResolvedValue({
      isSuccessful: true,
    });

    const response = await request(getServer())
      .get('/googleDrive/checkAuth')
      .query({ jwtToken: 'crm-jwt' });

    expect(response.status).toBe(200);
    expect(jwt.decodeJwt).toHaveBeenCalledWith('crm-jwt');
    expect(googleDrivePlugin.checkAuth).toHaveBeenCalledWith({
      userId: 'crm-user-id',
    });
    expect(response.body).toEqual({
      isSuccessful: true,
    });

    await expect(request(getServer()).get('/googleDrive/checkAuth'))
      .resolves.toMatchObject({ status: 400, text: 'JWT token is required' });
  });

  test('POST /googleDrive/logout validates JWT and delegates to the Google Drive plugin', async () => {
    googleDrivePlugin.logout.mockResolvedValue({
      successful: true,
      message: 'Logged out',
    });

    const response = await request(getServer())
      .post('/googleDrive/logout')
      .send({ jwtToken: 'crm-jwt' });

    expect(response.status).toBe(200);
    expect(jwt.decodeJwt).toHaveBeenCalledWith('crm-jwt');
    expect(googleDrivePlugin.logout).toHaveBeenCalledWith({
      userId: 'crm-user-id',
    });
    expect(response.body).toEqual({
      successful: true,
      message: 'Logged out',
    });

    await expect(request(getServer()).post('/googleDrive/logout').send({}))
      .resolves.toMatchObject({ status: 400, text: 'JWT token is required' });
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

  test('GET /plugin/licenseStatus/googleDrive delegates auth check and returns current license response shape', async () => {
    googleDrivePlugin.checkAuth.mockResolvedValue({
      isSuccessful: false,
    });

    const response = await request(getServer())
      .get('/plugin/licenseStatus/googleDrive')
      .query({ jwtToken: 'crm-jwt' });

    expect(response.status).toBe(200);
    expect(googleDrivePlugin.checkAuth).toHaveBeenCalledWith({
      userId: 'crm-user-id',
    });
    expect(response.body).toEqual({
      licenseStatus: false,
      errorMessage: 'License is invalid AND Google Drive user is not authorized',
      licenseStatusDescription: 'Invalid. Please go [here](https://www.google.com)',
    });
  });

  test('GET /plugin/licenseStatus/:pluginId rejects unknown plugins', async () => {
    const response = await request(getServer())
      .get('/plugin/licenseStatus/unknownPlugin')
      .query({ jwtToken: 'crm-jwt' });

    expect(response.status).toBe(400);
    expect(response.text).toBe('Unknown plugin');
  });

  test('GET /plugin/licenseStatus/:pluginId returns user not found before plugin handling', async () => {
    UserModel.findByPk.mockResolvedValue(null);

    const response = await request(getServer())
      .get('/plugin/licenseStatus/allCap')
      .query({ jwtToken: 'crm-jwt' });

    expect(response.status).toBe(400);
    expect(response.text).toBe('User not found');
    expect(googleDrivePlugin.checkAuth).not.toHaveBeenCalled();
  });

  test('POST /plugin/all_cap runs the all-cap plugin against submitted data', async () => {
    const response = await request(getServer())
      .post('/plugin/all_cap')
      .query({ jwtToken: 'crm-jwt' })
      .send({
        data: {
          note: 'Hello!',
        },
      });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      note: 'HeLLO!',
    });
  });

  test('POST /plugin/googleDrive delegates upload to the Google Drive plugin', async () => {
    googleDrivePlugin.uploadToGoogleDrive.mockReturnValue({
      successful: true,
      id: 'google-file-id',
    });

    const response = await request(getServer())
      .post('/plugin/googleDrive')
      .query({ jwtToken: 'crm-jwt' })
      .send({
        data: {
          logInfo: {
            telephonySessionId: 'telephony-session-1',
          },
        },
      });

    expect(response.status).toBe(200);
    expect(googleDrivePlugin.uploadToGoogleDrive).toHaveBeenCalledWith({
      user: expect.objectContaining({
        id: 'crm-user-id',
      }),
      data: {
        logInfo: {
          telephonySessionId: 'telephony-session-1',
        },
      },
    });
    expect(response.body).toEqual({
      successful: true,
      id: 'google-file-id',
    });
  });

  test('POST /plugin/:pluginId rejects unknown plugins', async () => {
    const response = await request(getServer())
      .post('/plugin/unknownPlugin')
      .query({ jwtToken: 'crm-jwt' })
      .send({
        data: {
          note: 'Hello!',
        },
      });

    expect(response.status).toBe(400);
    expect(response.text).toBe('Unknown plugin');
    expect(googleDrivePlugin.uploadToGoogleDrive).not.toHaveBeenCalled();
  });
});

export {};
