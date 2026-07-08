const express = require('express');
const request = require('supertest');

jest.mock('../../handlers/admin', () => ({
  validateAdminRole: jest.fn(),
}));
jest.mock('../../handlers/plugin', () => ({
  registerPluginAccount: jest.fn(),
  unregisterPluginAccount: jest.fn(),
  getPluginLicenseStatus: jest.fn(),
}));
jest.mock('../../lib/analytics', () => ({
  init: jest.fn(),
  track: jest.fn(),
}));

jest.mock('../../lib/jwt', () => ({
  decodeJwt: jest.fn(),
  generateJwt: jest.fn().mockReturnValue('refreshed-crm-jwt'),
}));
jest.mock('../../models/userModel', () => ({
  UserModel: {
    findByPk: jest.fn(),
  },
}));

const adminCore = require('../../handlers/admin');
const pluginCore = require('../../handlers/plugin');
const analytics = require('../../lib/analytics');
const jwt = require('../../lib/jwt');
const { UserModel } = require('../../models/userModel');
const { createCoreRouter } = require('../../index');

describe('Plugin Routes', () => {
  let app;

  beforeEach(() => {
    jest.clearAllMocks();
    app = express();
    app.use(express.json());
    app.use('/', createCoreRouter());
  });

  describe('POST /plugin/register', () => {
    test('should validate admin role, reject spoofed account ids, and register the selected plugin', async () => {
      adminCore.validateAdminRole.mockResolvedValue({
        isValidated: true,
        rcAccountId: 'validated-account-id',
      });
      pluginCore.registerPluginAccount.mockResolvedValue({ successful: true });

      const response = await request(app)
        .post('/plugin/register')
        .set('X-RC-Access-Token', 'valid-rc-token')
        .send({
          pluginId: 'plugin-1',
          rcAccountId: 'validated-account-id',
          pluginAccess: 'shared',
          pluginName: 'plugin.sample',
        });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ successful: true });
      expect(adminCore.validateAdminRole).toHaveBeenCalledWith({ rcAccessToken: 'valid-rc-token' });
      expect(pluginCore.registerPluginAccount).toHaveBeenCalledWith({
        pluginId: 'plugin-1',
        rcAccessToken: 'valid-rc-token',
        rcAccountId: 'validated-account-id',
        pluginAccess: 'shared',
        pluginName: 'plugin.sample',
      });
      expect(analytics.track).toHaveBeenCalledWith(expect.objectContaining({
        eventName: 'Plugin Register',
        interfaceName: 'pluginRegister',
        success: true,
      }));
    });

    test('should return a failed register response when plugin provider registration fails', async () => {
      adminCore.validateAdminRole.mockResolvedValue({
        isValidated: true,
        rcAccountId: 'validated-account-id',
      });
      pluginCore.registerPluginAccount.mockRejectedValue(new Error('Plugin register API did not return jwtToken'));

      const response = await request(app)
        .post('/plugin/register')
        .query({ rcAccessToken: 'valid-rc-token' })
        .send({
          pluginId: 'plugin-1',
          rcAccountId: 'validated-account-id',
          pluginAccess: 'shared',
          pluginName: 'plugin.sample',
        });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        successful: false,
        returnMessage: 'Plugin register API did not return jwtToken',
      });
      expect(analytics.track).toHaveBeenCalledWith(expect.objectContaining({
        eventName: 'Plugin Register',
        interfaceName: 'pluginRegister',
        success: false,
      }));
    });

    test('should reject register requests when the body account does not match the validated admin account', async () => {
      adminCore.validateAdminRole.mockResolvedValue({
        isValidated: true,
        rcAccountId: 'validated-account-id',
      });

      const response = await request(app)
        .post('/plugin/register')
        .query({ rcAccessToken: 'valid-rc-token' })
        .send({
          pluginId: 'plugin-1',
          rcAccountId: 'spoofed-account-id',
          pluginAccess: 'shared',
          pluginName: 'plugin.sample',
        });

      expect(response.status).toBe(403);
      expect(response.body).toEqual({
        successful: false,
        returnMessage: 'rcAccountId mismatch',
      });
      expect(pluginCore.registerPluginAccount).not.toHaveBeenCalled();
    });
  });


  describe('GET /plugin/licenseStatus', () => {
    test('should require a CRM user session and return plugin license status for the requested account', async () => {
      jwt.decodeJwt.mockReturnValue({ id: 'crm-user-id', platform: 'salesforce' });
      UserModel.findByPk.mockResolvedValue({
        id: 'crm-user-id',
        platform: 'salesforce',
      });
      pluginCore.getPluginLicenseStatus.mockResolvedValue({
        licenseStatus: true,
        licenseStatusDescription: 'Active',
      });

      const response = await request(app)
        .get('/plugin/licenseStatus')
        .set('Authorization', 'Bearer crm-jwt')
        .query({
          rcAccountId: 'validated-account-id',
          pluginId: 'plugin-1',
        });

      expect(response.status).toBe(200);
      expect(jwt.decodeJwt).toHaveBeenCalledWith('crm-jwt');
      expect(UserModel.findByPk).toHaveBeenCalledWith('crm-user-id');
      expect(pluginCore.getPluginLicenseStatus).toHaveBeenCalledWith({
        rcAccountId: 'validated-account-id',
        pluginId: 'plugin-1',
      });
      expect(response.body).toEqual({
        licenseStatus: true,
        licenseStatusDescription: 'Active',
      });
    });

    test('should degrade plugin license provider errors to an invalid license response', async () => {
      jwt.decodeJwt.mockReturnValue({ id: 'crm-user-id', platform: 'salesforce' });
      UserModel.findByPk.mockResolvedValue({
        id: 'crm-user-id',
        platform: 'salesforce',
      });
      pluginCore.getPluginLicenseStatus.mockRejectedValue(new Error('provider timeout'));

      const response = await request(app)
        .get('/plugin/licenseStatus')
        .set('Authorization', 'Bearer crm-jwt')
        .query({
          rcAccountId: 'validated-account-id',
          pluginId: 'plugin-1',
        });

      expect(response.status).toBe(200);
      expect(pluginCore.getPluginLicenseStatus).toHaveBeenCalledWith({
        rcAccountId: 'validated-account-id',
        pluginId: 'plugin-1',
      });
      expect(response.body).toEqual({
        licenseStatus: false,
        licenseStatusDescription: 'provider timeout',
      });
    });

    test('should not query plugin license status without a CRM user session', async () => {
      const response = await request(app)
        .get('/plugin/licenseStatus')
        .query({
          rcAccountId: 'validated-account-id',
          pluginId: 'plugin-1',
        });

      expect(response.status).toBe(400);
      expect(response.text).toBe('Please go to Settings and authorize CRM platform');
      expect(pluginCore.getPluginLicenseStatus).not.toHaveBeenCalled();
    });
  });
  describe('DELETE /plugin/unregister', () => {
    test('should validate admin role and unregister the selected plugin for the validated account', async () => {
      adminCore.validateAdminRole.mockResolvedValue({
        isValidated: true,
        rcAccountId: 'validated-account-id',
      });
      pluginCore.unregisterPluginAccount.mockResolvedValue({ successful: true });

      const response = await request(app)
        .delete('/plugin/unregister')
        .set('X-RC-Access-Token', 'valid-rc-token')
        .query({
          pluginId: 'plugin-1',
          rcAccountId: 'validated-account-id',
          pluginName: 'plugin.sample',
        });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ successful: true });
      expect(adminCore.validateAdminRole).toHaveBeenCalledWith({ rcAccessToken: 'valid-rc-token' });
      expect(pluginCore.unregisterPluginAccount).toHaveBeenCalledWith({
        pluginId: 'plugin-1',
        rcAccountId: 'validated-account-id',
        pluginName: 'plugin.sample',
      });
      expect(analytics.track).toHaveBeenCalledWith(expect.objectContaining({
        eventName: 'Plugin Unregister',
        interfaceName: 'pluginUnregister',
        success: true,
      }));
    });

    test('should reject unregister requests from non-admin users', async () => {
      adminCore.validateAdminRole.mockResolvedValue({
        isValidated: false,
        rcAccountId: 'validated-account-id',
      });

      const response = await request(app)
        .delete('/plugin/unregister')
        .query({
          rcAccessToken: 'valid-rc-token',
          pluginId: 'plugin-1',
          rcAccountId: 'validated-account-id',
          pluginName: 'plugin.sample',
        });

      expect(response.status).toBe(403);
      expect(response.body).toEqual({
        successful: false,
        returnMessage: 'Admin validation failed',
      });
      expect(pluginCore.unregisterPluginAccount).not.toHaveBeenCalled();
    });
  });
});

export {};
