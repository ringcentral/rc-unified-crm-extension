const express = require('express');
const request = require('supertest');

jest.mock('../../handlers/admin', () => ({
  validateRcUserToken: jest.fn(),
  validateAdminRole: jest.fn(),
}));
jest.mock('../../handlers/managedAuth', () => ({
  getManagedAuthState: jest.fn(),
  getManagedAuthAdminSettings: jest.fn(),
  upsertOrgManagedAuthValues: jest.fn(),
  upsertUserManagedAuthValues: jest.fn(),
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
jest.mock('../../models/userModel', () => ({
  UserModel: {
    findByPk: jest.fn(),
  },
}));

const adminCore = require('../../handlers/admin');
const managedAuthCore = require('../../handlers/managedAuth');
const managedOAuthCore = require('../../handlers/managedOAuth');
const authCore = require('../../handlers/auth');
const jwt = require('../../lib/jwt');
const { UserModel } = require('../../models/userModel');
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


  describe('GET /admin/managedAuth', () => {
    test('should use CRM jwt platform and validated admin account for settings lookup', async () => {
      jwt.decodeJwt.mockReturnValue({ id: 'crm-user-id' });
      UserModel.findByPk.mockResolvedValue({
        id: 'crm-user-id',
        platform: 'salesforce',
      });
      adminCore.validateAdminRole.mockResolvedValue({
        isValidated: true,
        rcAccountId: 'validated-account-id',
      });
      managedAuthCore.getManagedAuthAdminSettings.mockResolvedValue({
        orgFields: [{ const: 'apiKey' }],
        userFields: [{ const: 'userToken' }],
        orgValues: {},
        userValues: [],
      });

      const response = await request(app)
        .get('/admin/managedAuth')
        .query({
          jwtToken: 'crm-jwt',
          rcAccessToken: 'valid-rc-token',
          connectorId: 'shared-connector',
          isPrivate: 'true',
        });

      expect(response.status).toBe(200);
      expect(jwt.decodeJwt).toHaveBeenCalledWith('crm-jwt');
      expect(UserModel.findByPk).toHaveBeenCalledWith('crm-user-id');
      expect(adminCore.validateAdminRole).toHaveBeenCalledWith({ rcAccessToken: 'valid-rc-token' });
      expect(managedAuthCore.getManagedAuthAdminSettings).toHaveBeenCalledWith({
        platform: 'salesforce',
        rcAccountId: 'validated-account-id',
        connectorId: 'shared-connector',
        isPrivate: true,
      });
      expect(response.body.orgFields).toEqual([{ const: 'apiKey' }]);
    });

    test('should reject non-admin users before reading managed auth settings', async () => {
      jwt.decodeJwt.mockReturnValue({ id: 'crm-user-id' });
      UserModel.findByPk.mockResolvedValue({
        id: 'crm-user-id',
        platform: 'salesforce',
      });
      adminCore.validateAdminRole.mockResolvedValue({
        isValidated: false,
        rcAccountId: 'validated-account-id',
      });

      const response = await request(app)
        .get('/admin/managedAuth')
        .query({
          jwtToken: 'crm-jwt',
          rcAccessToken: 'valid-rc-token',
        });

      expect(response.status).toBe(403);
      expect(response.text).toBe('Admin validation failed');
      expect(managedAuthCore.getManagedAuthAdminSettings).not.toHaveBeenCalled();
    });
  });

  describe('POST /admin/managedAuth', () => {
    test('should save org scoped values under the validated admin account and CRM platform', async () => {
      jwt.decodeJwt.mockReturnValue({ id: 'crm-user-id' });
      UserModel.findByPk.mockResolvedValue({
        id: 'crm-user-id',
        platform: 'salesforce',
      });
      adminCore.validateAdminRole.mockResolvedValue({
        isValidated: true,
        rcAccountId: 'validated-account-id',
      });
      managedAuthCore.upsertOrgManagedAuthValues.mockResolvedValue({});

      const response = await request(app)
        .post('/admin/managedAuth')
        .query({
          jwtToken: 'crm-jwt',
          rcAccessToken: 'valid-rc-token',
          connectorId: 'private-connector',
          isPrivate: 'true',
        })
        .send({
          scope: 'org',
          values: { apiKey: 'api-key' },
          fieldsToRemove: ['oldApiKey'],
        });

      expect(response.status).toBe(200);
      expect(response.text).toBe('Shared authentication updated');
      expect(managedAuthCore.upsertOrgManagedAuthValues).toHaveBeenCalledWith({
        rcAccountId: 'validated-account-id',
        platform: 'salesforce',
        values: { apiKey: 'api-key' },
        fieldsToRemove: ['oldApiKey'],
      });
      expect(managedAuthCore.upsertUserManagedAuthValues).not.toHaveBeenCalled();
    });

    test('should save user scoped values with selected RingCentral extension details', async () => {
      jwt.decodeJwt.mockReturnValue({ id: 'crm-user-id' });
      UserModel.findByPk.mockResolvedValue({
        id: 'crm-user-id',
        platform: 'salesforce',
      });
      adminCore.validateAdminRole.mockResolvedValue({
        isValidated: true,
        rcAccountId: 'validated-account-id',
      });
      managedAuthCore.upsertUserManagedAuthValues.mockResolvedValue({});

      const response = await request(app)
        .post('/admin/managedAuth')
        .query({
          jwtToken: 'crm-jwt',
          rcAccessToken: 'valid-rc-token',
        })
        .send({
          scope: 'user',
          rcExtensionId: '101',
          rcUserName: 'Ada Lovelace',
          values: { userToken: 'token-101' },
          fieldsToRemove: ['oldUserToken'],
        });

      expect(response.status).toBe(200);
      expect(managedAuthCore.upsertUserManagedAuthValues).toHaveBeenCalledWith({
        rcAccountId: 'validated-account-id',
        platform: 'salesforce',
        rcExtensionId: '101',
        rcUserName: 'Ada Lovelace',
        values: { userToken: 'token-101' },
        fieldsToRemove: ['oldUserToken'],
      });
      expect(managedAuthCore.upsertOrgManagedAuthValues).not.toHaveBeenCalled();
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
