// @ts-check

const MCP_OAUTH_REQUIRED_MESSAGE = 'RingCentral authorization is required to use App Connect MCP. If this MCP server was connected before the PKCE update, disconnect and reconnect it so your MCP client gets the new public PKCE client ID.';
const MCP_OAUTH_STALE_CLIENT_MESSAGE = 'This App Connect MCP authorization was started with an outdated RingCentral OAuth client ID. App Connect MCP now uses PKCE. Disconnect or remove the App Connect MCP server in your MCP client, then add and connect it again.';
const MCP_OAUTH_INVALID_TOKEN_MESSAGE = 'The RingCentral authorization for App Connect MCP is missing, expired, or could not be refreshed. If this started after the PKCE update, disconnect and reconnect App Connect MCP so your client uses the new public PKCE client ID.';

function escapeBearerValue(value) {
    return String(value || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function getMcpOAuthChallengeHeader({
    appServer = process.env.APP_SERVER,
    error = 'invalid_token',
    errorDescription = MCP_OAUTH_REQUIRED_MESSAGE
} = {}) {
    return `Bearer realm="mcp", resource_metadata="${escapeBearerValue(`${appServer}/.well-known/oauth-protected-resource`)}", error="${escapeBearerValue(error)}", error_description="${escapeBearerValue(errorDescription)}"`;
}

function buildMcpOAuthError({
    error = 'mcp_oauth_reconnect_required',
    message = MCP_OAUTH_INVALID_TOKEN_MESSAGE,
    errorDetails = undefined,
} = {}) {
    return {
        success: false,
        error,
        message,
        ...(errorDetails ? { errorDetails } : {}),
    };
}

exports.MCP_OAUTH_REQUIRED_MESSAGE = MCP_OAUTH_REQUIRED_MESSAGE;
exports.MCP_OAUTH_STALE_CLIENT_MESSAGE = MCP_OAUTH_STALE_CLIENT_MESSAGE;
exports.MCP_OAUTH_INVALID_TOKEN_MESSAGE = MCP_OAUTH_INVALID_TOKEN_MESSAGE;
exports.getMcpOAuthChallengeHeader = getMcpOAuthChallengeHeader;
exports.buildMcpOAuthError = buildMcpOAuthError;

export {};
