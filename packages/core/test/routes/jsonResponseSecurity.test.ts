const express = require('express');
const request = require('supertest');
jest.mock('../../lib/jwt', () => ({ decodeJwt: jest.fn(), generateJwt: jest.fn() }));
jest.mock('../../handlers/log', () => ({ createCallLog: jest.fn(), updateCallLog: jest.fn(), createMessageLog: jest.fn() }));
jest.mock('../../lib/analytics', () => ({ init: jest.fn(), track: jest.fn() }));
jest.mock('../../lib/s3ErrorLogReport', () => ({ getUploadUrl: jest.fn() }));
const jwt = require('../../lib/jwt');
const logCore = require('../../handlers/log');
const reports = require('../../lib/s3ErrorLogReport');
const { createCoreRouter } = require('../../index');

describe('JSON response and optional report storage boundaries', () => {
  let app;
  const text = '</script><img src=x onerror=alert(1)>';
  beforeEach(() => {
    jest.clearAllMocks();
    jwt.decodeJwt.mockReturnValue({ id: 'user', platform: 'crm' });
    app = express();
    app.use(express.json());
    app.use(createCoreRouter());
  });

  for (const debug of [false, true]) {
    test.each([
      ['post', '/callLog', 'createCallLog'],
      ['patch', '/callLog', 'updateCallLog'],
      ['post', '/messageLog', 'createMessageLog'],
    ])('%s %s preserves data in JSON with debug=' + debug, async (method, url, handler) => {
      logCore[handler].mockResolvedValue({ successful: true, logId: 'log', logIds: ['log'], updatedNote: text, returnMessage: { message: text }, messageLogs: [{ body: text }] });
      const response = await request(app)[method](url)
        .query({ jwtToken: 'valid' }).set('is-debug', String(debug)).send({ logInfo: {} });
      expect(response.status).toBe(200);
      expect(response.type).toBe('application/json');
      expect(response.body.returnMessage.message).toBe(text);
      expect(Boolean(response.body._debug)).toBe(debug);
    });
  }

  test('preserves the existing plaintext rejection response', async () => {
    const response = await request(app).post('/callLog').send({});
    expect(response.status).toBe(400);
    expect(response.text).toBe('Please go to Settings and authorize CRM platform');
  });

  test('returns a JSON presigned URL on success', async () => {
    reports.getUploadUrl.mockResolvedValue('https://signed.example/upload');
    const response = await request(app).get('/debug/report/url').query({ jwtToken: 'valid' });
    expect(response.status).toBe(200);
    expect(response.type).toBe('application/json');
    expect(response.body).toEqual({ presignedUrl: 'https://signed.example/upload' });
  });

  test.each([false, true])('returns a bounded generic JSON error with debug=%p when storage is unavailable', async (debug) => {
    reports.getUploadUrl.mockRejectedValue(new Error('credential-detail-must-not-be-returned'));
    const response = await request(app).get('/debug/report/url').query({ jwtToken: 'valid' }).set('is-debug', String(debug))
      .timeout({ response: 1000 });
    expect(response.status).toBe(503);
    expect(response.type).toBe('application/json');
    expect(response.body).toMatchObject({ successful: false, message: 'Error report storage is unavailable' });
    expect(Boolean(response.body._debug)).toBe(debug);
    expect(response.text).not.toContain('credential-detail');
  });
});

export {};
