const jwt = require('../../lib/jwt');
const { UserModel } = require('../../models/userModel');
const { RingCentral } = require('../../lib/ringcentral');

/**
 * MCP Tool: Get Session Info
 *
 * Returns non-sensitive information about the current MCP/CRM session.
 */

const toolDefinition = {
    name: 'getSessionInfo',
    description: 'Get the current user session info, including RingCentral identity and CRM connection status.',
    inputSchema: {
        type: 'object',
        properties: {},
        required: []
    },
    annotations: {
        readOnlyHint: true,
        openWorldHint: false,
        destructiveHint: false
    }
};

/**
 * Execute the getSessionInfo tool
 * @param {Object} args - Tool arguments injected by mcpHandler
 * @param {string} [args.openaiSessionId] - OpenAI session identifier
 * @param {string} [args.rcExtensionId] - Verified RingCentral extension identifier
 * @param {string} [args.jwtToken] - CRM JWT token
 * @param {string} [args.rcAccessToken] - RingCentral access token
 * @returns {Object} Result object with session information
 */
async function execute(args = {}) {
    try {
        const {
            openaiSessionId = null,
            rcExtensionId = null,
            jwtToken,
            rcAccessToken,
        } = args;

        const decodedToken = jwtToken ? jwt.decodeJwt(jwtToken) : null;
        const userId = decodedToken?.id ?? null;
        const user = userId ? await UserModel.findByPk(userId) : null;

        let rcExtensionInfo = null;
        if (rcExtensionId && rcAccessToken) {
            const rcSDK = new RingCentral({
                server: process.env.RINGCENTRAL_SERVER,
                clientId: process.env.RINGCENTRAL_CLIENT_ID,
                clientSecret: process.env.RINGCENTRAL_CLIENT_SECRET,
                redirectUri: `${process.env.APP_SERVER}/ringcentral/oauth/callback`
            });
            rcExtensionInfo = await rcSDK.getExtensionInfo(rcExtensionId, {
                access_token: rcAccessToken,
                token_type: 'Bearer'
            });
        }
        return {
            success: true,
            data: {
                openaiSessionId,
                dataToShow: {
                    isCrmAuthenticated: Boolean(decodedToken && user?.accessToken),
                    ringcentral: {
                        extensionId: rcExtensionId?.id ?? null,
                        name: rcExtensionInfo?.name ?? null,
                    },
                    crm: {
                        userId,
                        platform: decodedToken?.platform ?? user?.platform ?? null,
                        hostname: user?.hostname ?? null
                    }
                }
            }
        };
    }
    catch (error) {
        return {
            success: false,
            error: error.message || 'Unknown error occurred',
            errorDetails: error.stack
        };
    }
}

exports.definition = toolDefinition;
exports.execute = execute;
