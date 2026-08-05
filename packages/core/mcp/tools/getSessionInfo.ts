// @ts-check

const jwt = /** @type {any} */ (require('../../lib/jwt'));
const { UserModel: RawUserModel } = require('../../models/userModel');
const UserModel = /** @type {any} */ (RawUserModel);
const { RingCentral: RawRingCentral } = require('../../lib/ringcentral');
const RingCentral = /** @type {any} */ (RawRingCentral);

function isRecord(value: unknown): value is Record<string, any> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isPlainRecord(value: unknown): value is Record<string, any> {
    if (!isRecord(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}

function isNonBlankString(value: unknown): value is string {
    return typeof value === 'string' && value.trim().length > 0;
}

function normalizeOptionalString(value: unknown, fieldName: string): string | null {
    if (typeof value === 'undefined' || value === null || (typeof value === 'string' && !value.trim())) {
        return null;
    }
    if (typeof value !== 'string') {
        throw new Error(`${fieldName} must be a string`);
    }
    return value;
}

function normalizeCaughtError(error: unknown): { message: string; details?: string } {
    if (error instanceof Error) {
        return { message: error.message || 'Unknown error occurred', details: error.stack };
    }
    if (typeof error === 'string' && error.trim()) {
        return { message: error };
    }
    return { message: 'Unknown error occurred' };
}

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
 * @returns {Promise<any>} Result object with session information
 */
async function execute(args: any = {}) {
    try {
        if (!isPlainRecord(args)) {
            throw new Error('Arguments must be an object');
        }
        const {
            openaiSessionId: rawOpenaiSessionId,
            rcExtensionId: rawRcExtensionId,
            jwtToken: rawJwtToken,
            rcAccessToken: rawRcAccessToken,
        } = args;
        const openaiSessionId = normalizeOptionalString(rawOpenaiSessionId, 'openaiSessionId');
        const rcExtensionId = normalizeOptionalString(rawRcExtensionId, 'rcExtensionId');
        const jwtToken = normalizeOptionalString(rawJwtToken, 'jwtToken');
        const rcAccessToken = normalizeOptionalString(rawRcAccessToken, 'rcAccessToken');

        const decodedToken = jwtToken ? jwt.decodeJwt(jwtToken) : null;
        const userId = isRecord(decodedToken) && isNonBlankString(decodedToken.id)
            ? decodedToken.id
            : null;
        const rawUser = userId ? await UserModel.findByPk(userId) : null;
        const user = isRecord(rawUser) ? rawUser : null;

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
            if (!isRecord(rcExtensionInfo)) {
                throw new Error('RingCentral returned an invalid extension response');
            }
        }
        const extensionName = isRecord(rcExtensionInfo) && isNonBlankString(rcExtensionInfo.name)
            ? rcExtensionInfo.name
            : null;
        const decodedPlatform = userId && isRecord(decodedToken) && isNonBlankString(decodedToken.platform)
            ? decodedToken.platform
            : null;
        const userPlatform = user && isNonBlankString(user.platform) ? user.platform : null;
        const hostname = user && isNonBlankString(user.hostname) ? user.hostname : null;
        return {
            success: true,
            data: {
                openaiSessionId,
                dataToShow: {
                    isCrmAuthenticated: Boolean(decodedToken && user && isNonBlankString(user.accessToken)),
                    ringcentral: {
                        extensionId: rcExtensionId,
                        name: extensionName,
                    },
                    crm: {
                        userId,
                        platform: decodedPlatform ?? userPlatform,
                        hostname,
                    }
                }
            }
        };
    }
    catch (error) {
        const normalizedError = normalizeCaughtError(error);
        return {
            success: false,
            error: normalizedError.message,
            errorDetails: normalizedError.details
        };
    }
}

exports.definition = toolDefinition;
exports.execute = execute;

export {};
