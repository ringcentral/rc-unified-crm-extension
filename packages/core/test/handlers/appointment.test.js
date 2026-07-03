jest.mock('../../models/userModel', () => ({
  UserModel: {
    findByPk: jest.fn()
  }
}));
jest.mock('../../connector/registry', () => ({
  getConnector: jest.fn()
}));
jest.mock('../../lib/oauth', () => ({
  getOAuthApp: jest.fn(() => ({ app: true })),
  checkAndRefreshAccessToken: jest.fn()
}));
jest.mock('../../models/dynamo/connectorSchema', () => ({
  Connector: {
    getProxyConfig: jest.fn()
  }
}));

const appointmentHandler = require('../../handlers/appointment');
const { UserModel } = require('../../models/userModel');
const connectorRegistry = require('../../connector/registry');
const oauth = require('../../lib/oauth');
const { Connector } = require('../../models/dynamo/connectorSchema');

describe('Appointment Handler', () => {
  const baseUser = {
    id: 'user-1',
    hostname: 'crm.example.com',
    accessToken: 'access-token',
    platformAdditionalInfo: {}
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  function mockApiKeyConnector(overrides = {}) {
    const connector = {
      getAuthType: jest.fn().mockResolvedValue('apiKey'),
      getBasicAuth: jest.fn(() => 'encoded-key'),
      listAppointments: jest.fn().mockResolvedValue({ appointments: [{ id: 'appt-1' }] }),
      createAppointment: jest.fn().mockResolvedValue({ appointmentId: 'appt-2', appointment: { id: 'appt-2' } }),
      updateAppointment: jest.fn().mockResolvedValue({ appointment: { id: 'appt-3' } }),
      refreshAppointment: jest.fn().mockResolvedValue({ appointment: { id: 'appt-4' } }),
      confirmAppointment: jest.fn().mockResolvedValue({ appointment: { id: 'appt-5' } }),
      cancelAppointment: jest.fn().mockResolvedValue({ appointment: { id: 'appt-6' } }),
      ...overrides
    };
    connectorRegistry.getConnector.mockReturnValue(connector);
    return connector;
  }

  test('returns database warning when user lookup fails', async () => {
    UserModel.findByPk.mockRejectedValueOnce(new Error('db unavailable'));

    const result = await appointmentHandler.listAppointments({
      platform: 'testCRM',
      userId: 'user-1'
    });

    expect(result.successful).toBe(false);
    expect(result.returnMessage.messageType).toBe('warning');
    expect(result.returnMessage.message).toBe('Database operation failed');
  });

  test('returns warning when user is missing or session has no token', async () => {
    UserModel.findByPk.mockResolvedValueOnce(null);

    await expect(appointmentHandler.listAppointments({
      platform: 'testCRM',
      userId: 'missing-user'
    })).resolves.toMatchObject({
      successful: false,
      returnMessage: {
        message: 'User not found'
      }
    });

    UserModel.findByPk.mockResolvedValueOnce({ id: 'user-1' });
    const noTokenResult = await appointmentHandler.createAppointment({
      platform: 'testCRM',
      userId: 'user-1',
      payload: { title: 'Meeting' }
    });

    expect(noTokenResult.successful).toBe(false);
    expect(noTokenResult.returnMessage.message).toBe('User not found');
  });

  test('listAppointments resolves oauth auth with proxy config and returns connector result', async () => {
    const user = {
      ...baseUser,
      platformAdditionalInfo: {
        proxyId: 'proxy-1',
        tokenUrl: 'https://token.example.com'
      }
    };
    const refreshedUser = {
      ...user,
      accessToken: 'fresh-token'
    };
    const connector = {
      getAuthType: jest.fn().mockResolvedValue('oauth'),
      getOauthInfo: jest.fn().mockResolvedValue({ tokenUrl: 'https://token.example.com' }),
      listAppointments: jest.fn().mockResolvedValue({
        appointments: [{ id: 'appt-1' }],
        returnMessage: {
          messageType: 'success',
          message: 'Listed'
        }
      })
    };
    UserModel.findByPk.mockResolvedValue(user);
    Connector.getProxyConfig.mockResolvedValue({ id: 'proxy-1' });
    oauth.checkAndRefreshAccessToken.mockResolvedValue(refreshedUser);
    connectorRegistry.getConnector.mockReturnValue(connector);

    const result = await appointmentHandler.listAppointments({
      platform: 'testCRM',
      userId: 'user-1',
      range: { startDate: '2026-07-01' },
      mineOnly: true,
      forceSync: true
    });

    expect(connector.getOauthInfo).toHaveBeenCalledWith({
      tokenUrl: 'https://token.example.com',
      hostname: 'crm.example.com',
      proxyId: 'proxy-1',
      proxyConfig: { id: 'proxy-1' }
    });
    expect(connector.listAppointments).toHaveBeenCalledWith({
      user: refreshedUser,
      authHeader: 'Bearer fresh-token',
      range: { startDate: '2026-07-01' },
      mineOnly: true,
      forceSync: true,
      proxyConfig: { id: 'proxy-1' }
    });
    expect(result).toMatchObject({
      successful: true,
      appointments: [{ id: 'appt-1' }]
    });
  });

  test('oauth auth returns revoke response when token refresh fails', async () => {
    const connector = {
      getAuthType: jest.fn().mockResolvedValue('oauth'),
      getOauthInfo: jest.fn().mockResolvedValue({})
    };
    UserModel.findByPk.mockResolvedValue(baseUser);
    connectorRegistry.getConnector.mockReturnValue(connector);
    oauth.checkAndRefreshAccessToken.mockResolvedValue(null);

    const result = await appointmentHandler.createAppointment({
      platform: 'testCRM',
      userId: 'user-1',
      payload: { title: 'Meeting' }
    });

    expect(result).toMatchObject({
      successful: false,
      isRevokeUserSession: true,
      returnMessage: {
        message: 'User session expired. Please connect again.'
      }
    });
  });

  test('apiKey auth is used by create, update, refresh, confirm, and cancel operations', async () => {
    UserModel.findByPk.mockResolvedValue(baseUser);
    const connector = mockApiKeyConnector();

    const createResult = await appointmentHandler.createAppointment({
      platform: 'testCRM',
      userId: 'user-1',
      payload: { title: 'Create' }
    });
    const updateResult = await appointmentHandler.updateAppointment({
      platform: 'testCRM',
      userId: 'user-1',
      appointmentId: 'appt-2',
      patchBody: { title: 'Update' }
    });
    const refreshResult = await appointmentHandler.refreshAppointment({
      platform: 'testCRM',
      userId: 'user-1',
      appointmentId: 'appt-3'
    });
    const confirmResult = await appointmentHandler.confirmAppointment({
      platform: 'testCRM',
      userId: 'user-1',
      appointmentId: 'appt-4'
    });
    const cancelResult = await appointmentHandler.cancelAppointment({
      platform: 'testCRM',
      userId: 'user-1',
      appointmentId: 'appt-5'
    });

    expect(createResult.appointmentId).toBe('appt-2');
    expect(updateResult.appointment).toEqual({ id: 'appt-3' });
    expect(refreshResult.appointment).toEqual({ id: 'appt-4' });
    expect(confirmResult.appointment).toEqual({ id: 'appt-5' });
    expect(cancelResult.appointment).toEqual({ id: 'appt-6' });
    expect(connector.getBasicAuth).toHaveBeenCalledWith({ apiKey: 'access-token' });
    expect(connector.createAppointment).toHaveBeenCalledWith({
      user: baseUser,
      authHeader: 'Basic encoded-key',
      payload: { title: 'Create' },
      proxyConfig: null
    });
    expect(connector.updateAppointment).toHaveBeenCalledWith({
      user: baseUser,
      authHeader: 'Basic encoded-key',
      appointmentId: 'appt-2',
      patchBody: { title: 'Update' },
      proxyConfig: null
    });
    expect(connector.refreshAppointment).toHaveBeenCalledWith({
      user: baseUser,
      authHeader: 'Basic encoded-key',
      appointmentId: 'appt-3',
      proxyConfig: null
    });
    expect(connector.confirmAppointment).toHaveBeenCalledWith({
      user: baseUser,
      authHeader: 'Basic encoded-key',
      appointmentId: 'appt-4',
      proxyConfig: null
    });
    expect(connector.cancelAppointment).toHaveBeenCalledWith({
      user: baseUser,
      authHeader: 'Basic encoded-key',
      appointmentId: 'appt-5',
      proxyConfig: null
    });
  });

  test('operation errors are mapped through API error handler', async () => {
    UserModel.findByPk.mockResolvedValue(baseUser);
    mockApiKeyConnector({
      updateAppointment: jest.fn().mockRejectedValue({
        response: {
          status: 429
        }
      })
    });

    const result = await appointmentHandler.updateAppointment({
      platform: 'testCRM',
      userId: 'user-1',
      appointmentId: 'appt-2',
      patchBody: { title: 'Update' }
    });

    expect(result.successful).toBe(false);
    expect(result.returnMessage.messageType).toBe('warning');
  });
});
