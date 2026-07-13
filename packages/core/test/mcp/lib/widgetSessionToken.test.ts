const {
  createWidgetSessionToken,
  verifyWidgetSessionToken,
} = require('../../../mcp/lib/widgetSessionToken');
const { sign } = require('jsonwebtoken');

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
    expect(createWidgetSessionToken()).toBeNull();
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

  test('creates tokens without an OpenAI session id', () => {
    const token = createWidgetSessionToken({
      rcExtensionId: 'rc-ext-1',
    });

    expect(verifyWidgetSessionToken(token)).toEqual({
      rcExtensionId: 'rc-ext-1',
      openaiSessionId: null,
    });
  });

  test.each([
    [undefined],
    [null],
    [123]
  ])('rejects non-string widget session token values', (token) => {
    expect(verifyWidgetSessionToken(token)).toBeNull();
  });

  test.each([
    [{ type: 'wrong-type', rcExtensionId: 'rc-ext-1', openaiSessionId: 'openai-session-1' }, null],
    [{ type: 'mcp-widget-session', rcExtensionId: '', openaiSessionId: 'openai-session-1' }, null],
    [{ type: 'mcp-widget-session', rcExtensionId: 123, openaiSessionId: 'openai-session-1' }, null],
    [{ type: 'mcp-widget-session', rcExtensionId: 'rc-ext-1', openaiSessionId: 123 }, {
      rcExtensionId: 'rc-ext-1',
      openaiSessionId: null,
    }]
  ])('rejects or normalizes widget token payload %#', (payload, expected) => {
    const token = sign(payload, process.env.APP_SERVER_SECRET_KEY);

    expect(verifyWidgetSessionToken(token)).toEqual(expected);
  });

  test('requires APP_SERVER_SECRET_KEY when signing a widget session token', () => {
    delete process.env.APP_SERVER_SECRET_KEY;

    expect(() => createWidgetSessionToken({
      rcExtensionId: 'rc-ext-1'
    })).toThrow('APP_SERVER_SECRET_KEY is not defined');
    expect(verifyWidgetSessionToken('not-a-token')).toBeNull();
  });
});

export {};
