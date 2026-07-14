const {
  MCP_OAUTH_INVALID_TOKEN_MESSAGE,
  MCP_OAUTH_REQUIRED_MESSAGE,
  MCP_OAUTH_STALE_CLIENT_MESSAGE,
  buildMcpOAuthError,
  getMcpOAuthChallengeHeader,
} = require('../../../mcp/lib/oauthError');
const {
  resourceMetadataCases,
  explicitOAuthErrorFieldCases,
  optionalOAuthErrorDetailCases,
  structuredOAuthErrorCases,
} = require('../data/oauthErrorCases');

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

  test.each<[any]>(resourceMetadataCases as [any][])('preserves the $label while building resource metadata', ({ appServer, expectedResource }) => {
    const header = getMcpOAuthChallengeHeader({ appServer });

    expect(header).toContain(`resource_metadata="${expectedResource}"`);
    expect(header).toContain('error="invalid_token"');
    expect(header).toContain(`error_description="${MCP_OAUTH_REQUIRED_MESSAGE}"`);
  });

  test.each<[any]>(explicitOAuthErrorFieldCases as [any][])('preserves $label in explicit OAuth error fields', ({ error, errorDescription }) => {
    const header = getMcpOAuthChallengeHeader({
      appServer: 'https://app.example.com',
      error,
      errorDescription,
    });

    expect(header).toContain(`error="${error}"`);
    expect(header).toContain(`error_description="${errorDescription}"`);
  });

  test.each<[any]>(optionalOAuthErrorDetailCases as [any][])('handles $label optional error details', ({ errorDetails, expectedIncluded }) => {
    const result = buildMcpOAuthError({
      error: 'variation_error',
      message: 'Variation message',
      errorDetails,
    });

    expect(Object.prototype.hasOwnProperty.call(result, 'errorDetails')).toBe(expectedIncluded);
    if (expectedIncluded) {
      expect(result.errorDetails).toEqual(errorDetails);
    }
  });

  test.each<[any]>(structuredOAuthErrorCases as [any][])('preserves custom $label in the structured error', ({ error, message }) => {
    expect(buildMcpOAuthError({ error, message })).toEqual({
      success: false,
      error,
      message,
    });
  });
});
