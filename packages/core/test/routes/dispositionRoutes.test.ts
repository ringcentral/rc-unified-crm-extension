const express = require('express');
const request = require('supertest');

jest.mock('../../handlers/disposition', () => ({
  upsertCallDisposition: jest.fn(),
}));
jest.mock('../../lib/analytics', () => ({
  init: jest.fn(),
  track: jest.fn(),
}));
jest.mock('../../lib/jwt', () => ({
  decodeJwt: jest.fn(),
  generateJwt: jest.fn().mockReturnValue('refreshed-crm-jwt'),
}));

const disposition = require('../../handlers/disposition');
const analytics = require('../../lib/analytics');
const jwt = require('../../lib/jwt');
const {
  BasicMutationResponseSchema,
  CallDispositionRequestSchema,
} = require('../../contracts');
const { createCoreRouter } = require('../../index');

describe('Disposition Routes', () => {
  let app;

  beforeEach(() => {
    jest.clearAllMocks();
    jwt.decodeJwt.mockReturnValue({
      id: 'crm-user-id',
      platform: 'testCRM',
    });
    app = express();
    app.use(express.json());
    app.use('/', createCoreRouter());
  });

  test('PUT /callDisposition delegates decoded CRM identity and request body', async () => {
    disposition.upsertCallDisposition.mockResolvedValue({
      successful: true,
      returnMessage: {
        message: 'Disposition saved',
        messageType: 'success',
        ttl: 2000,
      },
      extraDataTracking: {
        statusCode: 204,
      },
    });

    const requestBody = {
      sessionId: 'session-1',
      extensionNumber: '101',
      hashedExtensionId: 'hashed-extension-1',
      dispositions: [{ id: 'disp-1' }],
      additionalSubmission: { note: 'extra' },
    };
    expect(CallDispositionRequestSchema.parse(requestBody)).toEqual(requestBody);

    const response = await request(app)
      .put('/callDisposition')
      .query({ jwtToken: 'crm-jwt' })
      .send(requestBody);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      successful: true,
      returnMessage: {
        message: 'Disposition saved',
        messageType: 'success',
        ttl: 2000,
      },
    });
    expect(BasicMutationResponseSchema.parse(response.body)).toEqual(response.body);
    expect(disposition.upsertCallDisposition).toHaveBeenCalledWith({
      platform: 'testCRM',
      userId: 'crm-user-id',
      sessionId: 'session-1',
      extensionNumber: '101',
      hashedExtensionId: 'hashed-extension-1',
      dispositions: [{ id: 'disp-1' }],
      additionalSubmission: { note: 'extra' },
    });
    expect(analytics.track).toHaveBeenCalledWith(expect.objectContaining({
      eventName: 'Disposition call log',
      interfaceName: 'dispositionCallLog',
      connectorName: 'testCRM',
      success: true,
      extras: {
        statusCode: 204,
      },
    }));
  });

  test('PUT /callDisposition rejects missing CRM auth token', async () => {
    const response = await request(app)
      .put('/callDisposition')
      .send({
        sessionId: 'session-1',
      });

    expect(response.status).toBe(400);
    expect(response.text).toBe('Please go to Settings and authorize CRM platform');
    expect(disposition.upsertCallDisposition).not.toHaveBeenCalled();
    expect(analytics.track).toHaveBeenCalledWith(expect.objectContaining({
      eventName: 'Disposition call log',
      success: false,
    }));
  });

  test('PUT /callDisposition rejects invalid JWT token', async () => {
    jwt.decodeJwt.mockReturnValue(null);

    const response = await request(app)
      .put('/callDisposition')
      .query({ jwtToken: 'invalid-jwt' })
      .send({
        sessionId: 'session-1',
      });

    expect(response.status).toBe(400);
    expect(response.text).toBe('Invalid JWT token');
    expect(disposition.upsertCallDisposition).not.toHaveBeenCalled();
  });

  test('PUT /callDisposition rejects decoded token without user id', async () => {
    jwt.decodeJwt.mockReturnValue({
      platform: 'testCRM',
    });

    const response = await request(app)
      .put('/callDisposition')
      .query({ jwtToken: 'crm-jwt' })
      .send({
        sessionId: 'session-1',
      });

    expect(response.status).toBe(400);
    expect(response.text).toBe('Please go to Settings and authorize CRM platform');
    expect(disposition.upsertCallDisposition).not.toHaveBeenCalled();
  });

  test('PUT /callDisposition returns 401 when handler asks to revoke user session', async () => {
    disposition.upsertCallDisposition.mockResolvedValue({
      successful: false,
      returnMessage: {
        message: 'User session expired. Please connect again.',
        messageType: 'warning',
        ttl: 5000,
      },
      isRevokeUserSession: true,
    });

    const response = await request(app)
      .put('/callDisposition')
      .query({ jwtToken: 'crm-jwt' })
      .send({
        sessionId: 'session-1',
      });

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      successful: false,
      returnMessage: {
        message: 'User session expired. Please connect again.',
        messageType: 'warning',
        ttl: 5000,
      },
    });
    expect(analytics.track).toHaveBeenCalledWith(expect.objectContaining({
      eventName: 'Disposition call log',
      success: false,
    }));
  });

  test('PUT /callDisposition maps handler exceptions to 400 error response', async () => {
    disposition.upsertCallDisposition.mockRejectedValue(new Error('provider failed'));

    const response = await request(app)
      .put('/callDisposition')
      .query({ jwtToken: 'crm-jwt' })
      .send({
        sessionId: 'session-1',
      });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: 'provider failed',
    });
    expect(analytics.track).toHaveBeenCalledWith(expect.objectContaining({
      eventName: 'Disposition call log',
      success: false,
      extras: {
        statusCode: 'unknown',
      },
    }));
  });
});


export {};
