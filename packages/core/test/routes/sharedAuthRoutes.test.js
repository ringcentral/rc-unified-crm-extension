const express = require('express');
const request = require('supertest');

jest.mock('../../handlers/admin', () => ({
  validateRcUserToken: jest.fn(),
  validateAdminRole: jest.fn(),
}));
jest.mock('../../handlers/sharedAuth', () => ({
  getSharedAuthState: jest.fn(),
}));
jest.mock('../../handlers/auth', () => ({
  onApiKeyLogin: jest.fn(),
}));
jest.mock('../../lib/jwt', () => ({
  generateJwt: jest.fn().mockReturnValue('jwt-token'),
  decodeJwt: jest.fn(),
}));

const adminCore = require('../../handlers/admin');
const sharedAuthCore = require('../../handlers/sharedAuth');
const authCore = require('../../handlers/auth');
const { createCoreRouter } = require('../../index');

describe('Shared Auth Routes', () => {
  let app;

  beforeEach(() => {
    jest.clearAllMocks();
    app = express();
    app.use(express.json());
    app.use('/', createCoreRouter());
  });

  describe('GET /apiKeySharedAuthState', () => {
    test('should require rcAccessToken', async () => {
      const response = await request(app)
        .get('/apiKeySharedAuthState')
        .query({ platform: 'testCRM' });

      expect(response.status).toBe(400);
      expect(response.text).toContain('Missing RingCentral access token');
      expect(adminCore.validateRcUserToken).not.toHaveBeenCalled();
      expect(sharedAuthCore.getSharedAuthState).not.toHaveBeenCalled();
    });

    test('should validate rcAccessToken and use validated identity', async () => {
      adminCore.validateRcUserToken.mockResolvedValue({
        rcAccountId: 'validated-account-id',
        rcExtensionId: 'validated-extension-id',
        rcUserName: 'Validated User',
      });
      sharedAuthCore.getSharedAuthState.mockResolvedValue({
        hasSharedAuth: true,
        allRequiredFieldsSatisfied: true,
        visibleFieldConsts: [],
        missingRequiredFieldConsts: [],
      });

      const response = await request(app)
        .get('/apiKeySharedAuthState')
        .query({
          platform: 'testCRM',
          rcAccessToken: 'valid-rc-token',
          rcAccountId: 'spoofed-account-id',
          rcExtensionId: 'spoofed-extension-id',
        });

      expect(response.status).toBe(200);
      expect(adminCore.validateRcUserToken).toHaveBeenCalledWith({ rcAccessToken: 'valid-rc-token' });
      expect(sharedAuthCore.getSharedAuthState).toHaveBeenCalledWith(expect.objectContaining({
        platform: 'testCRM',
        rcAccountId: 'validated-account-id',
        rcExtensionId: 'validated-extension-id',
      }));
    });
  });

  describe('POST /apiKeyLogin', () => {
    test('should require rcAccessToken', async () => {
      const response = await request(app)
        .post('/apiKeyLogin')
        .send({
          platform: 'testCRM',
          apiKey: 'api-key',
          hostname: 'test.example.com',
        });

      expect(response.status).toBe(400);
      expect(response.text).toContain('Missing RingCentral access token');
      expect(adminCore.validateRcUserToken).not.toHaveBeenCalled();
      expect(authCore.onApiKeyLogin).not.toHaveBeenCalled();
    });

    test('should validate rcAccessToken and ignore spoofed rc ids in body', async () => {
      adminCore.validateRcUserToken.mockResolvedValue({
        rcAccountId: 'validated-account-id',
        rcExtensionId: 'validated-extension-id',
        rcUserName: 'Validated User',
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
        rcUserName: 'Validated User',
      }));
    });
  });
});
