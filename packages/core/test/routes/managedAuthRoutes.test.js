const express = require('express');
const request = require('supertest');

jest.mock('../../handlers/admin', () => ({
  validateRcUserToken: jest.fn(),
  validateAdminRole: jest.fn(),
}));
jest.mock('../../handlers/managedAuth', () => ({
  getManagedAuthState: jest.fn(),
}));
jest.mock('../../handlers/managedOAuth', () => ({
  getManagedOAuthState: jest.fn(),
  upsertPendingManagedOAuth: jest.fn(),
  clearPendingManagedOAuth: jest.fn(),
  resetManagedOAuth: jest.fn(),
}));
jest.mock('../../handlers/auth', () => ({
  onApiKeyLogin: jest.fn(),
}));
jest.mock('../../lib/jwt', () => ({
  generateJwt: jest.fn().mockReturnValue('jwt-token'),
  decodeJwt: jest.fn(),
}));

const adminCore = require('../../handlers/admin');
const managedAuthCore = require('../../handlers/managedAuth');
const managedOAuthCore = require('../../handlers/managedOAuth');
const authCore = require('../../handlers/auth');
const { createCoreRouter } = require('../../index');

describe('Managed Auth Routes', () => {
  let app;

  beforeEach(() => {
    jest.clearAllMocks();
    app = express();
    app.use(express.json());
    app.use('/', createCoreRouter());
  });

  describe('GET /apiKeyManagedAuthState', () => {
    test('should validate rcAccessToken and use validated identity', async () => {
      adminCore.validateRcUserToken.mockResolvedValue({
        rcAccountId: 'validated-account-id',
        rcExtensionId: 'validated-extension-id',
      });
      managedAuthCore.getManagedAuthState.mockResolvedValue({
        hasManagedAuth: true,
        allRequiredFieldsSatisfied: true,
        visibleFieldConsts: [],
        missingRequiredFieldConsts: [],
      });

      const response = await request(app)
        .get('/apiKeyManagedAuthState')
        .query({
          platform: 'testCRM',
          rcAccessToken: 'valid-rc-token',
          rcAccountId: 'spoofed-account-id',
          rcExtensionId: 'spoofed-extension-id',
        });

      expect(response.status).toBe(200);
      expect(adminCore.validateRcUserToken).toHaveBeenCalledWith({ rcAccessToken: 'valid-rc-token' });
      expect(managedAuthCore.getManagedAuthState).toHaveBeenCalledWith(expect.objectContaining({
        platform: 'testCRM',
        rcAccountId: 'validated-account-id',
        rcExtensionId: 'validated-extension-id',
      }));
    });
  });

  describe('GET /oauthManagedAuthState', () => {
    test('should validate rcAccessToken and return managed OAuth state for validated account', async () => {
      adminCore.validateRcUserToken.mockResolvedValue({
        rcAccountId: 'validated-account-id',
        rcExtensionId: 'validated-extension-id',
      });
      adminCore.validateAdminRole.mockResolvedValue({
        isValidated: true,
        rcAccountId: 'validated-account-id',
      });
      managedOAuthCore.getManagedOAuthState.mockResolvedValue({
        isAdmin: true,
        hasAccountOAuth: false,
        hasPendingOAuth: true,
        pendingValues: {
          clientId: 'client-id',
          clientSecret: 'client-secret',
        },
      });

      const response = await request(app)
        .get('/oauthManagedAuthState')
        .query({
          platform: 'testCRM',
          rcAccessToken: 'valid-rc-token',
          rcAccountId: 'spoofed-account-id',
        });

      expect(response.status).toBe(200);
      expect(adminCore.validateRcUserToken).toHaveBeenCalledWith({ rcAccessToken: 'valid-rc-token' });
      expect(adminCore.validateAdminRole).toHaveBeenCalledWith({ rcAccessToken: 'valid-rc-token' });
      expect(managedOAuthCore.getManagedOAuthState).toHaveBeenCalledWith({
        platform: 'testCRM',
        rcAccountId: 'validated-account-id',
        isAdmin: true,
      });
      expect(response.body.pendingValues.clientSecret).toBe('client-secret');
    });
  });

  describe('POST /admin/managedOAuth/cache', () => {
    test('should require admin role and write pending managed OAuth values for validated account', async () => {
      adminCore.validateAdminRole.mockResolvedValue({
        isValidated: true,
        rcAccountId: 'validated-account-id',
      });
      managedOAuthCore.upsertPendingManagedOAuth.mockResolvedValue({});

      const values = {
        clientId: 'client-id',
        clientSecret: 'client-secret',
      };

      const response = await request(app)
        .post('/admin/managedOAuth/cache')
        .query({ rcAccessToken: 'valid-rc-token' })
        .send({ values });

      expect(response.status).toBe(200);
      expect(managedOAuthCore.upsertPendingManagedOAuth).toHaveBeenCalledWith({
        rcAccountId: 'validated-account-id',
        values,
      });
    });

    test('should reject non-admin users', async () => {
      adminCore.validateAdminRole.mockResolvedValue({
        isValidated: false,
        rcAccountId: 'validated-account-id',
      });

      const response = await request(app)
        .post('/admin/managedOAuth/cache')
        .query({ rcAccessToken: 'valid-rc-token' })
        .send({ values: { clientId: 'client-id' } });

      expect(response.status).toBe(403);
      expect(managedOAuthCore.upsertPendingManagedOAuth).not.toHaveBeenCalled();
    });
  });

  describe('DELETE /admin/managedOAuth/account', () => {
    test('should require admin role and delete managed OAuth account for validated account', async () => {
      adminCore.validateAdminRole.mockResolvedValue({
        isValidated: true,
        rcAccountId: 'validated-account-id',
      });
      managedOAuthCore.resetManagedOAuth.mockResolvedValue({
        deletedAccountCount: 1,
        deletedPendingCount: 1,
      });

      const response = await request(app)
        .delete('/admin/managedOAuth/account')
        .query({
          rcAccessToken: 'valid-rc-token',
          platform: 'testCRM',
        });

      expect(response.status).toBe(200);
      expect(managedOAuthCore.resetManagedOAuth).toHaveBeenCalledWith({
        rcAccountId: 'validated-account-id',
        platform: 'testCRM',
      });
    });

    test('should reject non-admin users', async () => {
      adminCore.validateAdminRole.mockResolvedValue({
        isValidated: false,
        rcAccountId: 'validated-account-id',
      });

      const response = await request(app)
        .delete('/admin/managedOAuth/account')
        .query({
          rcAccessToken: 'valid-rc-token',
          platform: 'testCRM',
        });

      expect(response.status).toBe(403);
      expect(managedOAuthCore.resetManagedOAuth).not.toHaveBeenCalled();
    });
  });

  describe('POST /apiKeyLogin', () => {

    test('should validate rcAccessToken and ignore spoofed rc ids in body', async () => {
      adminCore.validateRcUserToken.mockResolvedValue({
        rcAccountId: 'validated-account-id',
        rcExtensionId: 'validated-extension-id',
      });
      authCore.onApiKeyLogin.mockResolvedValue({
        userInfo: {
          id: 'crm-user-id',
          name: 'CRM User',
        },
        returnMessage: {
          messageType: 'success',
          message: 'ok',
        },
      });

      const response = await request(app)
        .post('/apiKeyLogin')
        .send({
          platform: 'testCRM',
          apiKey: 'api-key',
          hostname: 'test.example.com',
          rcAccessToken: 'valid-rc-token',
          rcAccountId: 'spoofed-account-id',
          rcExtensionId: 'spoofed-extension-id',
        });

      expect(response.status).toBe(200);
      expect(adminCore.validateRcUserToken).toHaveBeenCalledWith({ rcAccessToken: 'valid-rc-token' });
      expect(authCore.onApiKeyLogin).toHaveBeenCalledWith(expect.objectContaining({
        platform: 'testCRM',
        rcAccountId: 'validated-account-id',
        rcExtensionId: 'validated-extension-id',
      }));
    });
  });
});
