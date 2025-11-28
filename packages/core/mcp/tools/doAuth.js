const authCore = require('../../handlers/auth');
const jwt = require('../../lib/jwt');
const crypto = require('crypto');
const { createAuthSession } = require('../../lib/authSession');
/**
 * MCP Tool: Do Authentication
 * 
 * This tool does the authentication.
 */

const toolDefinition = {
    name: 'doAuth',
    description: 'Auth flow step.4. Do the authentication.',
    inputSchema: {
        type: 'object',
        properties: {
            connectorManifest: {
                type: 'object',
                description: 'Connector manifest from conversation or memory.'
            },
            connectorName: {
                type: 'string',
                description: 'Connector name from conversation or memory.'
            },
            hostname: {
                type: 'string',
                description: 'Hostname to authenticate to.'
            },
            apiKey: {
                type: 'string',
                description: 'API key to authenticate to.'
            },
            additionalInfo: {
                type: 'object',
                description: 'Additional information to authenticate to.',
                properties: {
                    username: {
                        type: 'string',
                        description: 'Username to authenticate to.'
                    },
                    password: {
                        type: 'string',
                        description: 'Password to authenticate to.'
                    },
                    apiUrl: {
                        type: 'string',
                        description: 'API URL to authenticate to.'
                    }
                }
            },
            callbackUri: {
                type: 'string',
                description: 'Callback URI to authenticate to.'
            }
        }
    }
};

/**
 * Execute the doAuth tool
 * @param {Object} args - The tool arguments
 * @param {string} args.connectorManifest - Connector manifest from conversation or memory.
 * @param {string} args.connectorName - Connector name from conversation or memory.
 * @param {string} args.hostname - Hostname to authenticate to.
 * @param {string} args.apiKey - API key to authenticate to.
 * @param {Object} args.additionalInfo - Additional information to authenticate to.
 * @param {string} args.callbackUri - Callback URI to authenticate to.
 * @returns {Object} Result object with authentication information
 */
async function execute(args) {
    try {
        const { connectorManifest, connectorName, hostname, apiKey, additionalInfo, callbackUri } = args;
        const platform = connectorManifest.platforms[connectorName];
        switch (platform.auth.type) {
            case 'apiKey':
                const { userInfo } = await authCore.onApiKeyLogin({ platform: platform.name, hostname, apiKey, additionalInfo });
                if (userInfo) {
                    const jwtToken = jwt.generateJwt({
                        id: userInfo.id.toString(),
                        platform: platform.name
                    });
                    return {
                        success: true,
                        data: {
                            jwtToken,
                            message: "IMPORTANT: Authentication successful. Keep jwtToken in memory for future use.",
                        }
                    }
                }
                else {
                    return {
                        success: false,
                        error: "Authentication failed",
                        errorDetails: "User info not found",
                    }
                }
            case 'oauth':
                if (callbackUri) {
                    const query = Object.fromEntries(new URL(callbackUri).searchParams);
                    query.hostname = hostname;
                    const { userInfo } = await authCore.onOAuthCallback({ platform: platform.name, hostname, callbackUri, query });
                    if (userInfo) {
                        const jwtToken = jwt.generateJwt({
                            id: userInfo.id.toString(),
                            platform: platform.name
                        });
                        return {
                            success: true,
                            data: {
                                jwtToken,
                                message: "IMPORTANT: Authentication successful. Keep jwtToken in memory for future use.",
                            }
                        }
                    }
                    else {
                        return {
                            success: false,
                            error: "Authentication failed",
                            errorDetails: "User info not found",
                        }
                    }
                }
                else {
                    // Generate unique session ID
                    const sessionId = crypto.randomUUID();
                    
                    // Store session
                    await createAuthSession(sessionId, {
                        platform: platform.name,
                        hostname,
                    });
                    
                    const authUri = composeAuthUri({ platform, sessionId, hostname });
                    return {
                        success: true,
                        data: {
                            authUri,
                            sessionId,
                            message: "IMPORTANT: Show this uri as a clickable link for user to authorize. After user authorizes, use checkAuthStatus tool with this sessionId to get the jwtToken.",
                        }
                    }
                }
        }
    }
    catch (error) {
        return {
            success: false,
            error: error.message || 'Unknown error occurred',
            errorDetails: error.stack
        };
    }
}

function composeAuthUri({ platform, sessionId, hostname }) {
    let customState = '';
    if (platform.auth.oauth.customState) {
        customState = platform.auth.oauth.customState;
    }
    
    // Include sessionId in state if provided
    const stateParam = sessionId ? 
        `sessionId=${sessionId}&platform=${platform.name}&hostname=${hostname}` : 
        `platform=${platform.name}&hostname=${hostname}`;
    
    return `${platform.auth.oauth.authUrl}?` +
        `response_type=code` +
        `&client_id=${platform.auth.oauth.clientId}` +
        `${!!platform.auth.oauth.scope && platform.auth.oauth.scope != '' ? `&${platform.auth.oauth.scope}` : ''}` +
        `&state=${customState === '' ? encodeURIComponent(stateParam) : customState}` +
        `&redirect_uri=${process.env.APP_SERVER}/oauth-callback`;
}

exports.definition = toolDefinition;
exports.execute = execute;