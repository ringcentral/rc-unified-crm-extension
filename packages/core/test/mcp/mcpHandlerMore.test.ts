const axios = require('axios');
const fs = require('fs');
const toolsModule = require('../../mcp/tools');
const { verifyWidgetSessionToken } = require('../../mcp/lib/widgetSessionToken');
const { LlmSessionModel } = require('../../models/llmSessionModel');
const { CacheModel } = require('../../models/cacheModel');
const { UserModel } = require('../../models/userModel');
const { getHashValue } = require('../../lib/util');
const jwt = require('../../lib/jwt');
const { handleMcpRequest, handleWidgetToolCall } = require('../../mcp/mcpHandler');

jest.mock('axios', () => ({ get: jest.fn() }));

jest.mock('../../mcp/tools', () => ({
  tools: [
    {
      definition: { name: 'getPublicConnectors', _meta: { existing: true } },
      execute: jest.fn(),
    },
    {
      definition: { name: 'simpleTool', outputSchema: { type: 'object' } },
      execute: jest.fn(),
    },
    {
      definition: { name: 'falseTool', outputSchema: { type: 'object' } },
      execute: jest.fn(),
    },
    {
      definition: { name: 'throwTool' },
      execute: jest.fn(),
    },
  ],
  widgetTools: [
    {
      definition: { name: 'widgetOnly' },
      execute: jest.fn(),
    },
  ],
}));

jest.mock('../../models/llmSessionModel', () => ({
  LlmSessionModel: {
    findByPk: jest.fn(),
    destroy: jest.fn(),
    upsert: jest.fn(),
  },
}));

jest.mock('../../models/cacheModel', () => ({
  CacheModel: {
    findByPk: jest.fn(),
    upsert: jest.fn(),
  },
}));

jest.mock('../../models/userModel', () => ({
  UserModel: {
    findByPk: jest.fn(),
    findOne: jest.fn(),
  },
}));

jest.mock('../../lib/util', () => ({
  getHashValue: jest.fn(),
}));

jest.mock('../../lib/jwt', () => ({
  decodeJwt: jest.fn(),
  generateJwt: jest.fn(),
}));

jest.mock('../../lib/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

jest.mock('../../mcp/lib/widgetSessionToken', () => ({
  verifyWidgetSessionToken: jest.fn(),
}));

function mockResponse() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
    end: jest.fn(),
  };
}

function makeRequest(method, params = {}, extra: any = {}) {
  return {
    body: {
      jsonrpc: '2.0',
      id: extra.id ?? 1,
      method,
      params,
    },
    headers: extra.headers || {},
  };
}

function getTool(name) {
  return [...toolsModule.tools, ...toolsModule.widgetTools]
    .find(tool => tool.definition.name === name);
}

describe('MCP Handler additional protocol coverage', () => {
  const originalAppServer = process.env.APP_SERVER;
  const originalHashKey = process.env.HASH_KEY;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.APP_SERVER = 'https://app.example.test';
    process.env.HASH_KEY = 'test-hash-key';
    verifyWidgetSessionToken.mockReturnValue({
      rcExtensionId: 'rc-ext-widget',
      openaiSessionId: 's1',
    });

    getTool('getPublicConnectors').execute.mockResolvedValue({ success: true });
    getTool('simpleTool').execute.mockResolvedValue({
      structuredContent: { success: true, data: { ok: true } },
      content: [{ type: 'text', text: 'custom content' }],
    });
    getTool('falseTool').execute.mockResolvedValue({ success: false, error: 'blocked' });
    getTool('throwTool').execute.mockRejectedValue(new Error('boom'));
    getTool('widgetOnly').execute.mockResolvedValue({ success: true, data: { widget: true } });

    axios.get.mockResolvedValue({ data: { id: 'rc-ext-1' } });
    CacheModel.findByPk.mockResolvedValue(null);
    CacheModel.upsert.mockResolvedValue([{}, true]);
    LlmSessionModel.findByPk.mockResolvedValue(null);
    LlmSessionModel.destroy.mockResolvedValue(1);
    LlmSessionModel.upsert.mockResolvedValue([{}, true]);
    UserModel.findByPk.mockResolvedValue({ id: 'user-1', accessToken: 'crm-token' });
    UserModel.findOne.mockResolvedValue(null);
    getHashValue.mockReturnValue('hashed-rc-ext-1');
    jwt.decodeJwt.mockReturnValue({ id: 'user-1' });
    jwt.generateJwt.mockReturnValue('generated-jwt');
  });

  afterAll(() => {
    process.env.APP_SERVER = originalAppServer;
    process.env.HASH_KEY = originalHashKey;
  });

  test('handles initialize, resources/list, ping, notifications, and unknown methods', async () => {
    const initializeRes = mockResponse();
    await handleMcpRequest(makeRequest('initialize'), initializeRes);
    expect(initializeRes.json.mock.calls[0][0].result.serverInfo.name)
      .toBe('rc-unified-crm-extension');

    const listRes = mockResponse();
    await handleMcpRequest(makeRequest('resources/list'), listRes);
    expect(listRes.json.mock.calls[0][0].result.resources[0]).toEqual(expect.objectContaining({
      name: 'connector-list-widget',
      mimeType: 'text/html+skybridge',
    }));

    const pingRes = mockResponse();
    await handleMcpRequest(makeRequest('ping'), pingRes);
    expect(pingRes.json.mock.calls[0][0].result).toEqual({});

    const notificationRes = mockResponse();
    await handleMcpRequest(makeRequest('notifications/initialized'), notificationRes);
    expect(notificationRes.status).toHaveBeenCalledWith(200);
    expect(notificationRes.end).toHaveBeenCalled();
    expect(notificationRes.json).not.toHaveBeenCalled();

    const unknownRes = mockResponse();
    await handleMcpRequest(makeRequest('no/such-method'), unknownRes);
    expect(unknownRes.json.mock.calls[0][0].error).toEqual(expect.objectContaining({
      code: -32601,
      message: 'Method not found: no/such-method',
    }));
  });

  test('decorates tools/list metadata and schemas', async () => {
    const res = mockResponse();
    await handleMcpRequest(makeRequest('tools/list'), res);

    const response = res.json.mock.calls[0][0];
    const publicConnectors = response.result.tools.find(tool => tool.name === 'getPublicConnectors');
    expect(publicConnectors._meta).toEqual(expect.objectContaining({
      existing: true,
      'openai/outputTemplate': expect.stringMatching(/^ui:\/\/widget\/ConnectorList-v\d+\.html$/),
    }));
    expect(publicConnectors.outputSchema.properties).toHaveProperty('serverUrl');
  });

  test('reads widget resources and falls back from dist html to dev html', async () => {
    const invalidRes = mockResponse();
    await handleMcpRequest(makeRequest('resources/read', { uri: 'file://bad.html' }), invalidRes);
    expect(invalidRes.json.mock.calls[0][0].error).toEqual(expect.objectContaining({
      code: -32602,
      message: 'Unknown resource: file://bad.html',
    }));

    const readFileSpy = jest.spyOn(fs, 'readFileSync')
      .mockImplementationOnce(() => { throw new Error('missing dist'); })
      .mockReturnValueOnce('<html>widget</html>');

    const res = mockResponse();
    await handleMcpRequest(makeRequest('resources/read', { uri: 'ui://widget/ConnectorList-v10.html' }), res);

    const content = res.json.mock.calls[0][0].result.contents[0];
    expect(content.text).toBe('<html>widget</html>');
    expect(content._meta['openai/widgetDomain']).toBe('https://app.example.test');
    expect(readFileSpy).toHaveBeenCalledTimes(2);
    readFileSpy.mockRestore();
  });

  test('injects cached rc extension and valid CRM jwt into tool calls', async () => {
    CacheModel.findByPk.mockResolvedValue({
      data: { rcExtensionId: 'rc-ext-cached' },
      expiry: new Date(Date.now() + 60000),
    });
    LlmSessionModel.findByPk.mockResolvedValue({
      jwtToken: 'cached-jwt',
      expiry: new Date(Date.now() + 60000),
    });

    const res = mockResponse();
    await handleMcpRequest(makeRequest(
      'tools/call',
      {
        name: 'simpleTool',
        arguments: { value: 1 },
        _meta: { 'openai/session': 'openai-session-1' },
      },
      { headers: { authorization: 'Bearer rc-access-token' } }
    ), res);

    expect(axios.get).not.toHaveBeenCalled();
    expect(getTool('simpleTool').execute).toHaveBeenCalledWith(expect.objectContaining({
      value: 1,
      rcAccessToken: 'rc-access-token',
      openaiSessionId: 'openai-session-1',
      rcExtensionId: 'rc-ext-cached',
      jwtToken: 'cached-jwt',
    }));
    expect(res.json.mock.calls[0][0].result).toEqual(expect.objectContaining({
      content: [{ type: 'text', text: 'custom content' }],
      structuredContent: { success: true, data: { ok: true } },
    }));
  });

  test('refreshes rc extension, removes expired sessions, and reuses fallback session jwt', async () => {
    LlmSessionModel.findByPk
      .mockResolvedValueOnce({
        jwtToken: 'expired-jwt',
        expiry: new Date(Date.now() - 60000),
      })
      .mockResolvedValueOnce({
        jwtToken: 'fallback-jwt',
        expiry: new Date(Date.now() + 60000),
      });

    const res = mockResponse();
    await handleMcpRequest(makeRequest(
      'tools/call',
      {
        name: 'simpleTool',
        arguments: {},
        _meta: { 'openai/session': 'openai-session-2' },
      },
      { headers: { authorization: 'Bearer live-rc-token' } }
    ), res);

    expect(axios.get).toHaveBeenCalledWith(
      'https://platform.ringcentral.com/restapi/v1.0/account/~/extension/~',
      { headers: { Authorization: 'Bearer live-rc-token' } }
    );
    expect(CacheModel.upsert).toHaveBeenCalledWith(expect.objectContaining({
      id: 'openai-session-2-rcExtensionId',
      data: { rcExtensionId: 'rc-ext-1' },
      status: 'resolved',
    }));
    expect(LlmSessionModel.destroy).toHaveBeenCalledWith({ where: { id: 'rc-ext-1' } });
    expect(LlmSessionModel.upsert).toHaveBeenCalledWith(expect.objectContaining({
      id: 'rc-ext-1',
      jwtToken: 'fallback-jwt',
    }));
    expect(getTool('simpleTool').execute).toHaveBeenCalledWith(expect.objectContaining({
      rcExtensionId: 'rc-ext-1',
      jwtToken: 'fallback-jwt',
    }));
  });

  test('creates a new llm session from the latest CRM user when no session exists', async () => {
    LlmSessionModel.findByPk
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ jwtToken: 'generated-jwt' });
    UserModel.findOne.mockResolvedValue({
      id: 'user-2',
      platform: 'salesforce',
      accessToken: 'crm-token',
    });

    const res = mockResponse();
    await handleMcpRequest(makeRequest(
      'tools/call',
      {
        name: 'falseTool',
        arguments: {},
        _meta: { 'openai/session': 'openai-session-3' },
      },
      { headers: { authorization: 'Bearer rc-token' } }
    ), res);

    expect(getHashValue).toHaveBeenCalledWith('rc-ext-1', 'test-hash-key');
    expect(UserModel.findOne).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ hashedRcExtensionId: 'hashed-rc-ext-1' }),
      order: [['updatedAt', 'DESC']],
    }));
    expect(jwt.generateJwt).toHaveBeenCalledWith({ id: 'user-2', platform: 'salesforce' });
    expect(res.json.mock.calls[0][0].result).toEqual(expect.objectContaining({
      structuredContent: { success: false, error: 'blocked' },
      isError: true,
    }));
  });

  test('returns JSON-RPC errors for unknown or failed tools and handles request failures', async () => {
    const missingRes = mockResponse();
    await handleMcpRequest(makeRequest('tools/call', { name: 'missingTool', arguments: {} }), missingRes);
    expect(missingRes.json.mock.calls[0][0].error).toEqual(expect.objectContaining({
      code: -32603,
      message: 'Tool execution failed: Tool not found: missingTool',
    }));

    const throwRes = mockResponse();
    await handleMcpRequest(makeRequest('tools/call', { name: 'throwTool', arguments: {} }), throwRes);
    expect(throwRes.json.mock.calls[0][0].error).toEqual(expect.objectContaining({
      code: -32603,
      message: 'Tool execution failed: boom',
    }));

    const malformedRes = mockResponse();
    await handleMcpRequest({ headers: {} }, malformedRes);
    expect(malformedRes.json.mock.calls[0][0]).toEqual(expect.objectContaining({
      id: null,
      error: expect.objectContaining({
        code: -32603,
        message: 'Internal server error',
      }),
    }));
  });

  test('returns reconnect guidance when RC extension resolution fails', async () => {
    axios.get.mockRejectedValue(new Error('invalid rc token'));

    const res = mockResponse();
    await handleMcpRequest(makeRequest(
      'tools/call',
      {
        name: 'simpleTool',
        arguments: {},
        _meta: { 'openai/session': 'openai-session-4' },
      },
      { headers: { authorization: 'Bearer bad-token' } }
    ), res);

    expect(getTool('simpleTool').execute).not.toHaveBeenCalled();
    expect(res.json.mock.calls[0][0].result).toEqual(expect.objectContaining({
      isError: true,
      structuredContent: expect.objectContaining({
        success: false,
        error: 'mcp_oauth_reconnect_required',
        message: expect.stringContaining('PKCE update'),
        errorDetails: 'invalid rc token',
      }),
    }));
  });

  test('handles widget tool call validation, success, and execution errors', async () => {
    verifyWidgetSessionToken.mockReturnValueOnce(null);
    const invalidSessionRes = mockResponse();
    await handleWidgetToolCall({ headers: {}, body: { tool: 'widgetOnly' } }, invalidSessionRes);
    expect(invalidSessionRes.status).toHaveBeenCalledWith(401);
    expect(invalidSessionRes.json).toHaveBeenCalledWith({ success: false, error: 'Invalid widget session' });

    const missingRes = mockResponse();
    await handleWidgetToolCall({ headers: { 'x-app-connect-widget-token': 'widget-token' }, body: {} }, missingRes);
    expect(missingRes.status).toHaveBeenCalledWith(400);
    expect(missingRes.json).toHaveBeenCalledWith({ success: false, error: 'Missing tool name' });

    const unknownRes = mockResponse();
    await handleWidgetToolCall({ headers: { 'x-app-connect-widget-token': 'widget-token' }, body: { tool: 'notRegistered' } }, unknownRes);
    expect(unknownRes.status).toHaveBeenCalledWith(404);
    expect(unknownRes.json).toHaveBeenCalledWith({ success: false, error: 'Unknown tool: notRegistered' });

    const aiToolRes = mockResponse();
    await handleWidgetToolCall({ headers: { 'x-app-connect-widget-token': 'widget-token' }, body: { tool: 'simpleTool' } }, aiToolRes);
    expect(aiToolRes.status).toHaveBeenCalledWith(404);
    expect(getTool('simpleTool').execute).not.toHaveBeenCalled();

    verifyWidgetSessionToken.mockReturnValueOnce({
      rcExtensionId: 'rc-ext-widget',
      openaiSessionId: 'expected-session',
    });
    const mismatchRes = mockResponse();
    await handleWidgetToolCall({
      headers: { 'x-app-connect-widget-token': 'widget-token' },
      body: { tool: 'widgetOnly', toolArgs: { sessionId: 'other-session' } },
    }, mismatchRes);
    expect(mismatchRes.status).toHaveBeenCalledWith(403);
    expect(mismatchRes.json).toHaveBeenCalledWith({ success: false, error: 'Widget session mismatch' });

    const successRes = mockResponse();
    await handleWidgetToolCall({
      headers: { 'x-app-connect-widget-token': 'widget-token' },
      body: { tool: 'widgetOnly', toolArgs: { sessionId: 's1' } },
    }, successRes);
    expect(getTool('widgetOnly').execute).toHaveBeenCalledWith({
      sessionId: 's1',
      rcExtensionId: 'rc-ext-widget',
      openaiSessionId: 's1',
    });
    expect(successRes.json).toHaveBeenCalledWith({ success: true, data: { widget: true } });

    getTool('widgetOnly').execute.mockRejectedValueOnce(new Error('widget failed'));
    const failRes = mockResponse();
    await handleWidgetToolCall({
      headers: { 'x-app-connect-widget-token': 'widget-token' },
      body: { tool: 'widgetOnly' },
    }, failRes);
    expect(failRes.status).toHaveBeenCalledWith(500);
    expect(failRes.json).toHaveBeenCalledWith({ success: false, error: 'widget failed' });
  });
});

export {};
