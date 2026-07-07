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
  uploadToGoogleDrive: jest.fn(),
}));

const jwt = require('@app-connect/core/lib/jwt');
const { UserModel } = require('@app-connect/core/models/userModel');
const googleDrivePlugin = require('../src/plugins/googleDrivePlugin');
const { getServer } = require('../src/index');

describe('Application plugin routes', () => {
  afterAll(() => {
    if (originalDisableSyncDbTable === undefined) {
      delete process.env.DISABLE_SYNC_DB_TABLE;
    } else {
      process.env.DISABLE_SYNC_DB_TABLE = originalDisableSyncDbTable;
    }
  });

  beforeEach(() => {
    jest.clearAllMocks();
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
