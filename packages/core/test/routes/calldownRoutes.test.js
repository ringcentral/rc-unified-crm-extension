const express = require('express');
const request = require('supertest');

jest.mock('../../handlers/calldown', () => ({
  schedule: jest.fn(),
  list: jest.fn(),
  remove: jest.fn(),
  update: jest.fn(),
}));
jest.mock('../../lib/analytics', () => ({
  init: jest.fn(),
  track: jest.fn(),
}));
jest.mock('../../lib/jwt', () => ({
  decodeJwt: jest.fn(),
  generateJwt: jest.fn().mockReturnValue('refreshed-crm-jwt'),
}));

const calldown = require('../../handlers/calldown');
const analytics = require('../../lib/analytics');
const jwt = require('../../lib/jwt');
const { createCoreRouter } = require('../../index');

describe('Calldown Routes', () => {
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

  test('POST /calldown schedules a callback and delegates body/token values', async () => {
    calldown.schedule.mockResolvedValue({
      id: 'call-down-id',
    });

    const response = await request(app)
      .post('/calldown')
      .query({
        jwtToken: 'crm-jwt',
        rcAccessToken: 'rc-token',
      })
      .send({
        contactId: 'contact-1',
        scheduledAt: '2026-07-02T13:00:00.000Z',
      });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      successful: true,
      id: 'call-down-id',
    });
    expect(calldown.schedule).toHaveBeenCalledWith({
      jwtToken: 'crm-jwt',
      rcAccessToken: 'rc-token',
      body: {
        contactId: 'contact-1',
        scheduledAt: '2026-07-02T13:00:00.000Z',
      },
    });
    expect(analytics.track).toHaveBeenCalledWith(expect.objectContaining({
      eventName: 'Schedule call down',
      interfaceName: 'scheduleCallDown',
      success: true,
    }));
  });

  test('POST /calldown rejects missing CRM auth token', async () => {
    const response = await request(app)
      .post('/calldown')
      .send({ contactId: 'contact-1' });

    expect(response.status).toBe(400);
    expect(response.text).toBe('Please go to Settings and authorize CRM platform');
    expect(calldown.schedule).not.toHaveBeenCalled();
  });

  test('GET /calldown returns items from handler with status filter', async () => {
    calldown.list.mockResolvedValue({
      items: [
        {
          id: 'call-down-id',
          status: 'called',
        },
      ],
    });

    const response = await request(app)
      .get('/calldown')
      .query({
        jwtToken: 'crm-jwt',
        status: 'called',
      });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      successful: true,
      items: [
        {
          id: 'call-down-id',
          status: 'called',
        },
      ],
    });
    expect(calldown.list).toHaveBeenCalledWith({
      jwtToken: 'crm-jwt',
      status: 'called',
    });
    expect(analytics.track).toHaveBeenCalledWith(expect.objectContaining({
      eventName: 'Get call down list',
      interfaceName: 'getCallDownList',
      success: true,
    }));
  });

  test('GET /calldown maps handler errors to a 400 error body', async () => {
    calldown.list.mockRejectedValue(new Error('Unauthorized'));

    const response = await request(app)
      .get('/calldown')
      .query({ jwtToken: 'crm-jwt' });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: 'Unauthorized',
    });
    expect(analytics.track).toHaveBeenCalledWith(expect.objectContaining({
      eventName: 'Get call down list',
      success: false,
    }));
  });

  test('DELETE /calldown/:id delegates deletion by route parameter', async () => {
    calldown.remove.mockResolvedValue({
      successful: true,
    });

    const response = await request(app)
      .delete('/calldown/call-down-id')
      .query({ jwtToken: 'crm-jwt' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      successful: true,
    });
    expect(calldown.remove).toHaveBeenCalledWith({
      jwtToken: 'crm-jwt',
      id: 'call-down-id',
    });
    expect(analytics.track).toHaveBeenCalledWith(expect.objectContaining({
      eventName: 'Delete call down item',
      interfaceName: 'deleteCallDownItem',
      success: true,
    }));
  });

  test('DELETE /calldown/:id rejects missing CRM auth token', async () => {
    const response = await request(app)
      .delete('/calldown/call-down-id');

    expect(response.status).toBe(400);
    expect(response.text).toBe('Please go to Settings and authorize CRM platform');
    expect(calldown.remove).not.toHaveBeenCalled();
  });

  test('PATCH /calldown/:id delegates allowed update body', async () => {
    calldown.update.mockResolvedValue({
      successful: true,
    });

    const response = await request(app)
      .patch('/calldown/call-down-id')
      .query({ jwtToken: 'crm-jwt' })
      .send({
        status: 'called',
        lastCallAt: '2026-07-02T14:00:00.000Z',
      });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      successful: true,
    });
    expect(calldown.update).toHaveBeenCalledWith({
      jwtToken: 'crm-jwt',
      id: 'call-down-id',
      updateData: {
        status: 'called',
        lastCallAt: '2026-07-02T14:00:00.000Z',
      },
    });
    expect(analytics.track).toHaveBeenCalledWith(expect.objectContaining({
      eventName: 'Mark call down called',
      interfaceName: 'markCallDownCalled',
      success: true,
    }));
  });

  test('PATCH /calldown/:id maps handler errors to a 400 error body', async () => {
    calldown.update.mockRejectedValue(new Error('No valid fields to update'));

    const response = await request(app)
      .patch('/calldown/call-down-id')
      .query({ jwtToken: 'crm-jwt' })
      .send({
        unexpectedField: 'ignored',
      });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: 'No valid fields to update',
    });
    expect(analytics.track).toHaveBeenCalledWith(expect.objectContaining({
      eventName: 'Mark call down called',
      success: false,
    }));
  });
});

