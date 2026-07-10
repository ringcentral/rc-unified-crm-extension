const {
  MCP_OAUTH_INVALID_TOKEN_MESSAGE,
  MCP_OAUTH_REQUIRED_MESSAGE,
  MCP_OAUTH_STALE_CLIENT_MESSAGE,
  buildMcpOAuthError,
  getMcpOAuthChallengeHeader,
} = require('../../../mcp/lib/oauthError');

describe('MCP OAuth error helpers', () => {
  const originalAppServer = process.env.APP_SERVER;

  afterEach(() => {
    process.env.APP_SERVER = originalAppServer;
  });

  test('builds the default reconnect error without optional details', () => {
    expect(MCP_OAUTH_REQUIRED_MESSAGE).toContain('authorization is required');
    expect(MCP_OAUTH_STALE_CLIENT_MESSAGE).toContain('outdated RingCentral OAuth client ID');
    expect(buildMcpOAuthError()).toEqual({
      success: false,
      error: 'mcp_oauth_reconnect_required',
      message: MCP_OAUTH_INVALID_TOKEN_MESSAGE,
    });
  });

  test('includes custom error details only when provided', () => {
    expect(buildMcpOAuthError({
      error: 'custom_error',
      message: 'Custom message',
      errorDetails: { status: 401 },
    })).toEqual({
      success: false,
      error: 'custom_error',
      message: 'Custom message',
      errorDetails: { status: 401 },
    });
  });

  test('escapes challenge header values from env defaults and explicit overrides', () => {
    process.env.APP_SERVER = 'https://app.example.com/"quoted"';

    expect(getMcpOAuthChallengeHeader()).toContain(
      'resource_metadata="https://app.example.com/\\"quoted\\"/.well-known/oauth-protected-resource"',
    );

    const header = getMcpOAuthChallengeHeader({
      appServer: 'https://app.example.com/path\\segment',
      error: 'invalid"token',
      errorDescription: 'Line with "quotes" and slash \\',
    });

    expect(header).toContain('resource_metadata="https://app.example.com/path\\\\segment/.well-known/oauth-protected-resource"');
    expect(header).toContain('error="invalid\\"token"');
    expect(header).toContain('error_description="Line with \\"quotes\\" and slash \\\\"');
  });
});
