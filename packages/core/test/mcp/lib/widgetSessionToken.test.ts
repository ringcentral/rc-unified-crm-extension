const {
  createWidgetSessionToken,
  verifyWidgetSessionToken,
} = require('../../../mcp/lib/widgetSessionToken');

describe('MCP widget session token', () => {
  const originalSecret = process.env.APP_SERVER_SECRET_KEY;

  beforeEach(() => {
    process.env.APP_SERVER_SECRET_KEY = 'test-app-server-secret-key-123456';
  });

  afterEach(() => {
    if (originalSecret === undefined) {
      delete process.env.APP_SERVER_SECRET_KEY;
    } else {
      process.env.APP_SERVER_SECRET_KEY = originalSecret;
    }
  });

  test('creates and verifies a token bound to RC extension and OpenAI session IDs', () => {
    const token = createWidgetSessionToken({
      rcExtensionId: 'rc-ext-1',
      openaiSessionId: 'openai-session-1',
    });

    expect(token).toEqual(expect.any(String));
    expect(verifyWidgetSessionToken(token)).toEqual({
      rcExtensionId: 'rc-ext-1',
      openaiSessionId: 'openai-session-1',
    });
  });

  test('does not create a token without a verified RC extension ID', () => {
    expect(createWidgetSessionToken({ openaiSessionId: 'openai-session-1' })).toBeNull();
  });

  test('rejects invalid or incorrectly signed tokens', () => {
    const token = createWidgetSessionToken({
      rcExtensionId: 'rc-ext-1',
      openaiSessionId: 'openai-session-1',
    });

    expect(verifyWidgetSessionToken('not-a-token')).toBeNull();

    process.env.APP_SERVER_SECRET_KEY = 'different-test-app-server-secret-key';
    expect(verifyWidgetSessionToken(token)).toBeNull();
  });
});

export {};
