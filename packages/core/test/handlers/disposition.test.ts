jest.mock('../../lib/oauth');
jest.mock('../../models/dynamo/connectorSchema', () => ({
  Connector: {
    getProxyConfig: jest.fn(),
  },
}));

const disposition = require('../../handlers/disposition');
const connectorRegistry = require('../../connector/registry');
const oauth = require('../../lib/oauth');
const { Connector } = require('../../models/dynamo/connectorSchema');
const { CallLogModel } = require('../../models/callLogModel');
const { UserModel } = require('../../models/userModel');

describe('Disposition Handler', () => {
  beforeAll(async () => {
    await UserModel.sync({ force: true });
    await CallLogModel.sync({ force: true });
  });

  afterEach(async () => {
    await CallLogModel.destroy({ where: {} });
    await UserModel.destroy({ where: {} });
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  async function createUser(overrides = {}) {
    return UserModel.create({
      id: 'user-1',
      platform: 'testCRM',
      hostname: 'crm.example.com',
      accessToken: 'access-token',
      platformAdditionalInfo: {},
      ...overrides,
    });
  }

  async function createCallLog(overrides = {}) {
    return CallLogModel.create({
      id: 'call-log-1',
      sessionId: 'session-1',
      extensionNumber: '',
      hashedExtensionId: '',
      platform: 'testCRM',
      thirdPartyLogId: 'third-party-log-1',
      userId: 'user-1',
      contactId: 'contact-1',
      ...overrides,
    });
  }

  function mockApiKeyConnector(overrides = {}): any {
    return {
      getAuthType: jest.fn().mockResolvedValue('apiKey'),
      getBasicAuth: jest.fn().mockReturnValue('encoded-api-key'),
      upsertCallDisposition: jest.fn().mockResolvedValue({
        logId: 'disposition-log-1',
        returnMessage: {
          message: 'Disposition saved',
          messageType: 'success',
          ttl: 2000,
        },
        extraDataTracking: {
          providerStatus: 'updated',
        },
      }),
      ...overrides,
    };
  }

  test('returns a warning when no matching call log exists', async () => {
    await createUser();
    const getConnectorSpy = jest.spyOn(connectorRegistry, 'getConnector');

    const result = await disposition.upsertCallDisposition({
      platform: 'testCRM',
      userId: 'user-1',
      sessionId: 'missing-session',
      dispositions: [{ id: 'disposition-1' }],
    });

    expect(result).toEqual({
      successful: false,
      returnMessage: {
        message: 'Cannot find log',
        messageType: 'warning',
        ttl: 3000,
      },
    });
    expect(getConnectorSpy).not.toHaveBeenCalled();
  });

  test('returns a warning when the matching call log exists but user is missing', async () => {
    await createCallLog();
    const getConnectorSpy = jest.spyOn(connectorRegistry, 'getConnector');

    const result = await disposition.upsertCallDisposition({
      platform: 'testCRM',
      userId: 'missing-user',
      sessionId: 'session-1',
      dispositions: [{ id: 'disposition-1' }],
    });

    expect(result).toEqual({
      successful: false,
      returnMessage: {
        message: 'Cannot find user',
        messageType: 'warning',
        ttl: 3000,
      },
    });
    expect(getConnectorSpy).not.toHaveBeenCalled();
  });

  test('upserts dispositions with apiKey auth and existing call log', async () => {
    await createUser();
    const existingCallLog = await createCallLog({
      extensionNumber: '101',
    });
    const connector = mockApiKeyConnector();
    jest.spyOn(connectorRegistry, 'getConnector').mockReturnValue(connector);
    const dispositions = [
      { id: 'disp-1', value: 'Interested' },
    ];

    const result = await disposition.upsertCallDisposition({
      platform: 'testCRM',
      userId: 'user-1',
      sessionId: 'session-1',
      extensionNumber: '101',
      dispositions,
    });

    expect(connectorRegistry.getConnector).toHaveBeenCalledWith('testCRM');
    expect(connector.getAuthType).toHaveBeenCalledWith({
      proxyId: undefined,
      proxyConfig: null,
    });
    expect(connector.getBasicAuth).toHaveBeenCalledWith({
      apiKey: 'access-token',
    });
    expect(connector.upsertCallDisposition).toHaveBeenCalledWith({
      user: expect.objectContaining({ id: 'user-1' }),
      existingCallLog: expect.objectContaining({
        id: existingCallLog.id,
        sessionId: 'session-1',
        extensionNumber: '101',
      }),
      authHeader: 'Basic encoded-api-key',
      dispositions,
      proxyConfig: null,
    });
    expect(result).toEqual({
      successful: true,
      logId: 'disposition-log-1',
      returnMessage: {
        message: 'Disposition saved',
        messageType: 'success',
        ttl: 2000,
      },
      extraDataTracking: {
        providerStatus: 'updated',
      },
    });
  });

  test('returns unsuccessful when provider upsert does not return a log id', async () => {
    await createUser();
    await createCallLog();
    const connector = mockApiKeyConnector({
      upsertCallDisposition: jest.fn().mockResolvedValue({
        returnMessage: {
          message: 'Provider did not update disposition',
          messageType: 'warning',
          ttl: 3000,
        },
      }),
    });
    jest.spyOn(connectorRegistry, 'getConnector').mockReturnValue(connector);

    const result = await disposition.upsertCallDisposition({
      platform: 'testCRM',
      userId: 'user-1',
      sessionId: 'session-1',
      dispositions: [{ id: 'disp-1' }],
    });

    expect(result.successful).toBe(false);
    expect(result.logId).toBeUndefined();
    expect(result.returnMessage.message).toBe('Provider did not update disposition');
  });

  test('matches call log by hashed extension id when extension number differs', async () => {
    await createUser();
    await createCallLog({
      id: 'hashed-call-log',
      extensionNumber: '',
      hashedExtensionId: 'hashed-extension-1',
    });
    const connector = mockApiKeyConnector();
    jest.spyOn(connectorRegistry, 'getConnector').mockReturnValue(connector);

    await disposition.upsertCallDisposition({
      platform: 'testCRM',
      userId: 'user-1',
      sessionId: 'session-1',
      extensionNumber: '101',
      hashedExtensionId: 'hashed-extension-1',
      dispositions: [{ id: 'disp-1' }],
    });

    expect(connector.upsertCallDisposition).toHaveBeenCalledWith(expect.objectContaining({
      existingCallLog: expect.objectContaining({
        id: 'hashed-call-log',
        hashedExtensionId: 'hashed-extension-1',
      }),
    }));
  });

  test('falls back to legacy extension-number match when hashed extension id is provided', async () => {
    await createUser();
    await createCallLog({
      id: 'legacy-extension-call-log',
      extensionNumber: '101',
      hashedExtensionId: '',
    });
    const connector = mockApiKeyConnector();
    jest.spyOn(connectorRegistry, 'getConnector').mockReturnValue(connector);

    await disposition.upsertCallDisposition({
      platform: 'testCRM',
      userId: 'user-1',
      sessionId: 'session-1',
      extensionNumber: '101',
      hashedExtensionId: 'new-hashed-extension',
      dispositions: [{ id: 'disp-1' }],
    });

    expect(connector.upsertCallDisposition).toHaveBeenCalledWith(expect.objectContaining({
      existingCallLog: expect.objectContaining({
        id: 'legacy-extension-call-log',
        extensionNumber: '101',
        hashedExtensionId: '',
      }),
    }));
  });

  test('uses OAuth app and refreshed access token for oauth connectors', async () => {
    await createUser({
      accessToken: 'old-access-token',
      refreshToken: 'refresh-token',
      platformAdditionalInfo: {
        tokenUrl: 'https://crm.example.com/oauth/token',
      },
    });
    await createCallLog();
    const connector = mockApiKeyConnector({
      getAuthType: jest.fn().mockResolvedValue('oauth'),
      getOauthInfo: jest.fn().mockResolvedValue({
        clientId: 'client-id',
        clientSecret: 'client-secret',
      }),
    });
    jest.spyOn(connectorRegistry, 'getConnector').mockReturnValue(connector);
    const oauthApp = { app: true };
    oauth.getOAuthApp.mockReturnValue(oauthApp);
    oauth.checkAndRefreshAccessToken.mockResolvedValue({
      id: 'user-1',
      accessToken: 'refreshed-access-token',
    });

    await disposition.upsertCallDisposition({
      platform: 'testCRM',
      userId: 'user-1',
      sessionId: 'session-1',
      dispositions: [{ id: 'disp-1' }],
    });

    expect(connector.getOauthInfo).toHaveBeenCalledWith({
      tokenUrl: 'https://crm.example.com/oauth/token',
      hostname: 'crm.example.com',
      proxyId: undefined,
      proxyConfig: null,
    });
    expect(oauth.getOAuthApp).toHaveBeenCalledWith({
      clientId: 'client-id',
      clientSecret: 'client-secret',
    });
    expect(oauth.checkAndRefreshAccessToken).toHaveBeenCalledWith(oauthApp, expect.objectContaining({
      id: 'user-1',
      accessToken: 'old-access-token',
    }));
    expect(connector.upsertCallDisposition).toHaveBeenCalledWith(expect.objectContaining({
      authHeader: 'Bearer refreshed-access-token',
      user: expect.objectContaining({
        accessToken: 'refreshed-access-token',
      }),
    }));
  });

  test('returns revoke-session warning when OAuth refresh cannot return a user', async () => {
    await createUser();
    await createCallLog();
    const connector = mockApiKeyConnector({
      getAuthType: jest.fn().mockResolvedValue('oauth'),
      getOauthInfo: jest.fn().mockResolvedValue({}),
    });
    jest.spyOn(connectorRegistry, 'getConnector').mockReturnValue(connector);
    oauth.getOAuthApp.mockReturnValue({});
    oauth.checkAndRefreshAccessToken.mockResolvedValue(null);

    const result = await disposition.upsertCallDisposition({
      platform: 'testCRM',
      userId: 'user-1',
      sessionId: 'session-1',
      dispositions: [{ id: 'disp-1' }],
    });

    expect(result).toEqual({
      successful: false,
      returnMessage: {
        message: 'User session expired. Please connect again.',
        messageType: 'warning',
        ttl: 5000,
      },
      isRevokeUserSession: true,
    });
    expect(connector.upsertCallDisposition).not.toHaveBeenCalled();
  });

  test('loads proxy config and passes it to connector methods', async () => {
    await createUser({
      platformAdditionalInfo: {
        proxyId: 'proxy-1',
      },
    });
    await createCallLog();
    const proxyConfig = {
      operations: {
        upsertCallDisposition: { method: 'POST' },
      },
    };
    Connector.getProxyConfig.mockResolvedValue(proxyConfig);
    const connector = mockApiKeyConnector();
    jest.spyOn(connectorRegistry, 'getConnector').mockReturnValue(connector);

    await disposition.upsertCallDisposition({
      platform: 'testCRM',
      userId: 'user-1',
      sessionId: 'session-1',
      dispositions: [{ id: 'disp-1' }],
    });

    expect(Connector.getProxyConfig).toHaveBeenCalledWith('proxy-1');
    expect(connector.getAuthType).toHaveBeenCalledWith({
      proxyId: 'proxy-1',
      proxyConfig,
    });
    expect(connector.upsertCallDisposition).toHaveBeenCalledWith(expect.objectContaining({
      proxyConfig,
    }));
  });

  test('maps provider failures through the API error handler', async () => {
    await createUser();
    await createCallLog();
    const providerError = new Error('provider unauthorized');
    providerError.response = {
      status: 401,
      data: {
        message: 'Unauthorized',
      },
    };
    const connector = mockApiKeyConnector({
      upsertCallDisposition: jest.fn().mockRejectedValue(providerError),
    });
    jest.spyOn(connectorRegistry, 'getConnector').mockReturnValue(connector);

    const result = await disposition.upsertCallDisposition({
      platform: 'testCRM',
      userId: 'user-1',
      sessionId: 'session-1',
      extensionNumber: '101',
      hashedExtensionId: 'hashed-extension-1',
      dispositions: [{ id: 'disp-1' }],
    });

    expect(result.successful).toBe(false);
    expect(result.returnMessage.message).toBe('Authorization error');
    expect(result.extraDataTracking).toEqual({
      statusCode: 401,
    });
  });
});


export {};
