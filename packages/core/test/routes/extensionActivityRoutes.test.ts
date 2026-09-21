const express = require('express');
const request = require('supertest');

jest.mock('../../handlers/admin', () => ({
  validateAdminRole: jest.fn(),
}));
jest.mock('../../handlers/extensionActivity', () => ({
  recordExtensionActivity: jest.fn(),
  getExtensionAdoptionStats: jest.fn(),
}));
jest.mock('../../lib/analytics', () => ({
  init: jest.fn(),
  track: jest.fn(),
}));
jest.mock('../../lib/jwt', () => ({
  decodeJwt: jest.fn(),
  generateJwt: jest.fn(),
}));
jest.mock('../../lib/util', () => ({
  getHashValue: jest.fn((value) => `hash-${value}`),
}));
jest.mock('../../models/userModel', () => ({
  UserModel: {
    findByPk: jest.fn(),
  },
}));

const adminCore = require('../../handlers/admin');
const extensionActivityCore = require('../../handlers/extensionActivity');
const analytics = require('../../lib/analytics');
const { ExtensionAdoptionStatsResponseSchema } = require('../../contracts');
const { createCoreRouter } = require('../../index');

function flushPromises() {
  return new Promise((resolve) => setImmediate(resolve));
}

describe('Extension adoption routes', () => {
  let app;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.HASH_KEY = 'hash-key';
    extensionActivityCore.recordExtensionActivity.mockResolvedValue(true);
    app = express();
    app.use(express.json());
    app.use('/', createCoreRouter());
  });

  describe('GET /userInfoHash', () => {
    test('returns the same hashes as before and records activity fire-and-forget', async () => {
      const response = await request(app).get('/userInfoHash').query({ extensionId: 'ext-1', accountId: 'acc-1' });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ extensionId: 'hash-ext-1', accountId: 'hash-acc-1' });
      await flushPromises();
      expect(extensionActivityCore.recordExtensionActivity).toHaveBeenCalledTimes(1);
      expect(extensionActivityCore.recordExtensionActivity).toHaveBeenCalledWith({
        hashedRcExtensionId: 'hash-ext-1',
        rcAccountId: 'acc-1',
      });
    });

    test('does not record activity when extensionId or accountId is missing', async () => {
      await request(app).get('/userInfoHash').query({ extensionId: 'ext-1' });
      await request(app).get('/userInfoHash').query({ accountId: 'acc-1' });
      await request(app).get('/userInfoHash');
      await flushPromises();

      expect(extensionActivityCore.recordExtensionActivity).not.toHaveBeenCalled();
    });

    test('still responds 200 when recording activity resolves false or is slow', async () => {
      let resolveRecord;
      extensionActivityCore.recordExtensionActivity.mockReturnValue(new Promise((resolve) => { resolveRecord = resolve; }));

      const response = await request(app).get('/userInfoHash').query({ extensionId: 'ext-1', accountId: 'acc-1' });

      // The response must not wait for the database write.
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ extensionId: 'hash-ext-1', accountId: 'hash-acc-1' });
      resolveRecord(false);
      await flushPromises();
    });
  });

  describe('GET /admin/extensionAdoptionStats', () => {
    test('returns stats for the validated admin account', async () => {
      adminCore.validateAdminRole.mockResolvedValue({ isValidated: true, rcAccountId: 12345 });
      extensionActivityCore.getExtensionAdoptionStats.mockResolvedValue({
        installedCount: 4,
        connectedCount: 2,
        lastActiveAt: '2026-09-21T08:15:30.000Z',
      });

      const response = await request(app)
        .get('/admin/extensionAdoptionStats')
        .set('X-RC-Access-Token', 'admin-token');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ installedCount: 4, connectedCount: 2, lastActiveAt: '2026-09-21T08:15:30.000Z' });
      expect(() => ExtensionAdoptionStatsResponseSchema.parse(response.body)).not.toThrow();
      expect(adminCore.validateAdminRole).toHaveBeenCalledWith({ rcAccessToken: 'admin-token' });
      expect(extensionActivityCore.getExtensionAdoptionStats).toHaveBeenCalledWith({ rcAccountId: '12345' });
      expect(analytics.track).toHaveBeenCalledWith(expect.objectContaining({
        interfaceName: 'getExtensionAdoptionStats',
        success: true,
      }));
    });

    test('passes null lastActiveAt through untouched', async () => {
      adminCore.validateAdminRole.mockResolvedValue({ isValidated: true, rcAccountId: 'acc-1' });
      extensionActivityCore.getExtensionAdoptionStats.mockResolvedValue({ installedCount: 0, connectedCount: 0, lastActiveAt: null });

      const response = await request(app).get('/admin/extensionAdoptionStats').set('X-RC-Access-Token', 'admin-token');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ installedCount: 0, connectedCount: 0, lastActiveAt: null });
      expect(() => ExtensionAdoptionStatsResponseSchema.parse(response.body)).not.toThrow();
    });

    test('rejects non-admin tokens with 403 and does not query stats', async () => {
      adminCore.validateAdminRole.mockResolvedValue({ isValidated: false, rcAccountId: 'acc-1' });

      const response = await request(app).get('/admin/extensionAdoptionStats').set('X-RC-Access-Token', 'user-token');

      expect(response.status).toBe(403);
      expect(extensionActivityCore.getExtensionAdoptionStats).not.toHaveBeenCalled();
    });

    test('returns 500 with an error message when the stats query fails', async () => {
      adminCore.validateAdminRole.mockResolvedValue({ isValidated: true, rcAccountId: 'acc-1' });
      extensionActivityCore.getExtensionAdoptionStats.mockRejectedValue(new Error('relation "extensionActivities" does not exist'));

      const response = await request(app).get('/admin/extensionAdoptionStats').set('X-RC-Access-Token', 'admin-token');

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'relation "extensionActivities" does not exist' });
      expect(analytics.track).toHaveBeenCalledWith(expect.objectContaining({
        interfaceName: 'getExtensionAdoptionStats',
        success: false,
      }));
    });

    test('returns 500 when admin validation itself fails', async () => {
      adminCore.validateAdminRole.mockRejectedValue(new Error('Request failed with status code 401'));

      const response = await request(app).get('/admin/extensionAdoptionStats').set('X-RC-Access-Token', 'bad-token');

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Request failed with status code 401' });
    });
  });
});
