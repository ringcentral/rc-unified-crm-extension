const {
  createWidgetSessionToken,
  verifyWidgetSessionToken,
} = require('../../../mcp/lib/widgetSessionToken');
const { sign } = require('jsonwebtoken');
const {
  widgetIdentityRoundTripCases,
  invalidExtensionIdentityCases,
  nonStringWidgetTokenCases,
  malformedWidgetTokenCases,
  widgetPayloadCases,
} = require('../data/widgetSessionTokenCases');

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

  test.each<[any]>(widgetIdentityRoundTripCases as [any][])('round-trips $label without changing identity data', ({ rcExtensionId, openaiSessionId }) => {
    const token = createWidgetSessionToken({ rcExtensionId, openaiSessionId });

    expect(verifyWidgetSessionToken(token)).toEqual({
      rcExtensionId,
      openaiSessionId,
    });
  });

  test('does not create a token without a verified RC extension ID', () => {
    expect(createWidgetSessionToken({ openaiSessionId: 'openai-session-1' })).toBeNull();
    expect(createWidgetSessionToken()).toBeNull();
  });

  test.each<[any]>(invalidExtensionIdentityCases as [any][])('does not create a token for falsy $label extension identity', ({ rcExtensionId }) => {
    expect(createWidgetSessionToken({
      rcExtensionId,
      openaiSessionId: 'openai-session-1',
    })).toBeNull();
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

  test.each<[any]>(nonStringWidgetTokenCases as [any][])('rejects non-string widget session token value %p', (token) => {
    expect(verifyWidgetSessionToken(token)).toBeNull();
  });

  test.each<[any]>(malformedWidgetTokenCases as [any][])('rejects malformed string token %p', (token) => {
    expect(verifyWidgetSessionToken(token)).toBeNull();
  });

  test.each<[any, any]>(widgetPayloadCases as [any, any][])('rejects or normalizes widget token payload %#', (payload, expected) => {
    const token = sign(payload, process.env.APP_SERVER_SECRET_KEY);

    expect(verifyWidgetSessionToken(token)).toEqual(expected);
  });

  test('rejects expired and not-yet-active session tokens', () => {
    const expiredToken = sign({
      type: 'mcp-widget-session',
      rcExtensionId: 'rc-ext-expired',
    }, process.env.APP_SERVER_SECRET_KEY, { expiresIn: -1 });
    const futureToken = sign({
      type: 'mcp-widget-session',
      rcExtensionId: 'rc-ext-future',
    }, process.env.APP_SERVER_SECRET_KEY, { notBefore: '10m' });

    expect(verifyWidgetSessionToken(expiredToken)).toBeNull();
    expect(verifyWidgetSessionToken(futureToken)).toBeNull();
  });

  test('requires APP_SERVER_SECRET_KEY when signing a widget session token', () => {
    delete process.env.APP_SERVER_SECRET_KEY;

    expect(() => createWidgetSessionToken({
      rcExtensionId: 'rc-ext-1'
    })).toThrow('APP_SERVER_SECRET_KEY is not defined');
    expect(verifyWidgetSessionToken('not-a-token')).toBeNull();
  });

  test('returns null when the secret disappears before verifying a valid token', () => {
    const token = createWidgetSessionToken({ rcExtensionId: 'rc-ext-1' });
    delete process.env.APP_SERVER_SECRET_KEY;

    expect(verifyWidgetSessionToken(token)).toBeNull();
  });
});

export {};
