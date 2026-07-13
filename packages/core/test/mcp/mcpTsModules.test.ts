describe('MCP TypeScript module parity', () => {
  test('validator.ts returns the same manifest validation result shape', () => {
    const { isManifestValid } = require('../../mcp/lib/validator.ts');

    expect(isManifestValid({
      connectorManifest: {
        platforms: {
          testCrm: {
            name: 'Test CRM',
            auth: {
              type: 'apiKey',
              apiKey: {}
            }
          }
        }
      },
      connectorName: 'testCrm'
    })).toEqual({
      isValid: true,
      errors: []
    });

    expect(isManifestValid({
      connectorManifest: { platforms: {} },
      connectorName: 'missing'
    })).toEqual({
      isValid: false,
      errors: ['Platform "missing" not found in manifest']
    });
  });

  test('tool index.ts preserves AI-visible and widget-only registry names', () => {
    const jsTools = require('../../mcp/tools');
    const tsTools = require('../../mcp/tools/index.ts');

    expect(tsTools.tools.map((tool) => tool.definition.name)).toEqual(
      jsTools.tools.map((tool) => tool.definition.name)
    );
    expect(tsTools.widgetTools.map((tool) => tool.definition.name)).toEqual(
      jsTools.widgetTools.map((tool) => tool.definition.name)
    );
  });

  test('mcpHandler.ts exports the request and widget handlers', () => {
    const tsHandler = require('../../mcp/mcpHandler.ts');

    expect(tsHandler.handleMcpRequest).toEqual(expect.any(Function));
    expect(tsHandler.handleWidgetToolCall).toEqual(expect.any(Function));
  });

  test('doAuth.ts creates auth sessions through the same public contract', async () => {
    jest.resetModules();
    const createAuthSession = jest.fn().mockResolvedValue(undefined);
    jest.doMock('../../lib/authSession', () => ({
      createAuthSession
    }));

    const doAuth = require('../../mcp/tools/doAuth.ts');
    await expect(doAuth.execute({
      sessionId: 'session-1',
      connectorName: 'testCrm',
      hostname: 'crm.example.com',
      rcExtensionId: 'rc-ext-1',
      openaiSessionId: 'openai-session-1'
    })).resolves.toEqual({ success: true });

    expect(createAuthSession).toHaveBeenCalledWith('session-1', {
      platform: 'testCrm',
      hostname: 'crm.example.com',
      rcExtensionId: 'rc-ext-1',
      openaiSessionId: 'openai-session-1'
    });
  });

  test('rcGetCallLogs.ts returns an error for invalid jwt without calling RingCentral', async () => {
    jest.resetModules();
    const getCallLogData = jest.fn();
    const RingCentral = jest.fn(() => ({ getCallLogData }));
    jest.doMock('../../lib/ringcentral', () => ({ RingCentral }));
    jest.doMock('../../lib/jwt', () => ({
      decodeJwt: jest.fn().mockReturnValue(null)
    }));
    jest.doMock('../../models/callLogModel', () => ({
      CallLogModel: {}
    }));

    const rcGetCallLogs = require('../../mcp/tools/rcGetCallLogs.ts');
    await expect(rcGetCallLogs.execute({
      jwtToken: 'bad-token',
      rcAccessToken: 'rc-token'
    })).resolves.toEqual({
      success: false,
      error: 'Invalid JWT token'
    });
    expect(RingCentral).not.toHaveBeenCalled();
  });
});

export {};
