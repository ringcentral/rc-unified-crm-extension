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
const {
  appointmentUser: baseUser,
  appointmentCreatePayload: baseCreatePayload,
  appointmentListRange,
  appointmentApiKeyOperationCases,
  invalidAppointmentConnectorResultCases,
} = require('../data/appointmentCases');

describe('Appointment Handler', () => {
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

  test.each<[any]>(appointmentApiKeyOperationCases as [any][])(
    '$label returns a warning when the user is missing',
    async ({ handlerName, handlerArgs }) => {
      UserModel.findByPk.mockResolvedValueOnce(null);

      await expect(appointmentHandler[handlerName]({
        platform: 'testCRM',
        userId: 'missing-user',
        ...handlerArgs,
      })).resolves.toMatchObject({
        successful: false,
        returnMessage: {
          message: 'User not found',
        },
      });
      expect(connectorRegistry.getConnector).not.toHaveBeenCalled();
    },
  );

  test('returns a warning when the user session has no token', async () => {
    UserModel.findByPk.mockResolvedValueOnce({ id: 'user-1' });
    const noTokenResult = await appointmentHandler.createAppointment({
      platform: 'testCRM',
      userId: 'user-1',
      payload: baseCreatePayload
    });

    expect(noTokenResult.successful).toBe(false);
    expect(noTokenResult.returnMessage.message).toBe('User not found');
  });

  test('forwards an empty auth header for connector-managed auth types', async () => {
    const connector = mockApiKeyConnector({
      getAuthType: jest.fn().mockResolvedValue('managed'),
    });
    UserModel.findByPk.mockResolvedValue(baseUser);

    const result = await appointmentHandler.listAppointments({
      platform: 'testCRM',
      userId: 'user-1',
      range: appointmentListRange,
    });

    expect(result.successful).toBe(true);
    expect(connector.getBasicAuth).not.toHaveBeenCalled();
    expect(connector.listAppointments).toHaveBeenCalledWith({
      user: baseUser,
      authHeader: '',
      range: appointmentListRange,
      proxyConfig: null,
    });
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
      range: appointmentListRange
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
      range: appointmentListRange,
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
      payload: baseCreatePayload
    });

    expect(result).toMatchObject({
      successful: false,
      isRevokeUserSession: true,
      returnMessage: {
        message: 'User session expired. Please connect again.'
      }
    });
  });

  test.each<[any]>(appointmentApiKeyOperationCases as [any][])(
    '$label uses API-key auth and preserves the connector result',
    async ({ handlerName, connectorMethod, handlerArgs, connectorArgs, connectorResult, expectedResult }) => {
      UserModel.findByPk.mockResolvedValue(baseUser);
      const connector = mockApiKeyConnector({
        [connectorMethod]: jest.fn().mockResolvedValue(connectorResult),
      });

      const result = await appointmentHandler[handlerName]({
        platform: 'testCRM',
        userId: 'user-1',
        ...handlerArgs,
      });

      expect(result).toMatchObject({
        successful: true,
        ...expectedResult,
      });
      expect(connector.getBasicAuth).toHaveBeenCalledWith({ apiKey: 'access-token' });
      expect(connector[connectorMethod]).toHaveBeenCalledWith({
        user: baseUser,
        authHeader: 'Basic encoded-key',
        ...connectorArgs,
        proxyConfig: null,
      });
    },
  );

  test.each<[any]>(appointmentApiKeyOperationCases as [any][])(
    '$label maps connector errors through the API error handler',
    async ({ handlerName, connectorMethod, handlerArgs }) => {
      UserModel.findByPk.mockResolvedValue(baseUser);
      mockApiKeyConnector({
        [connectorMethod]: jest.fn().mockRejectedValue({
          response: {
            status: 429
          }
        })
      });

      const result = await appointmentHandler[handlerName]({
        platform: 'testCRM',
        userId: 'user-1',
        ...handlerArgs,
      });

      expect(result.successful).toBe(false);
      expect(result.returnMessage.messageType).toBe('warning');
    },
  );

  test('preserves a literal false connector failure envelope', async () => {
    UserModel.findByPk.mockResolvedValue(baseUser);
    mockApiKeyConnector({
      createAppointment: jest.fn().mockResolvedValue({
        successful: false,
        returnMessage: {
          messageType: 'warning',
          message: 'Provider rejected the appointment',
          ttl: 5000
        }
      })
    });

    const result = await appointmentHandler.createAppointment({
      platform: 'testCRM',
      userId: 'user-1',
      payload: baseCreatePayload
    });

    expect(result).toMatchObject({
      successful: false,
      returnMessage: {
        message: 'Provider rejected the appointment'
      }
    });
  });

  test('preserves a literal true connector success envelope', async () => {
    UserModel.findByPk.mockResolvedValue(baseUser);
    mockApiKeyConnector({
      listAppointments: jest.fn().mockResolvedValue({
        successful: true,
        appointments: [{ id: 'appt-true' }]
      })
    });

    const result = await appointmentHandler.listAppointments({
      platform: 'testCRM',
      userId: 'user-1'
    });

    expect(result).toMatchObject({
      successful: true,
      appointments: [{ id: 'appt-true' }]
    });
  });

  test.each<[any]>(invalidAppointmentConnectorResultCases as [any][])(
    'rejects $label from the connector',
    async ({ connectorResult }) => {
      UserModel.findByPk.mockResolvedValue(baseUser);
      mockApiKeyConnector({
        listAppointments: jest.fn().mockResolvedValue(connectorResult),
      });

      const result = await appointmentHandler.listAppointments({
        platform: 'testCRM',
        userId: 'user-1'
      });

      expect(result.successful).toBe(false);
      expect(result.appointments).toBeUndefined();
      expect(result.returnMessage.messageType).toBe('warning');
    },
  );
});

export {};
