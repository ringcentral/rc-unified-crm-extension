// @ts-check

const { getAuthSession: rawGetAuthSession } = require('../../lib/authSession');
const getAuthSession = /** @type {any} */ (rawGetAuthSession);
const { LlmSessionModel: RawLlmSessionModel } = require('../../models/llmSessionModel');
const LlmSessionModel = /** @type {any} */ (RawLlmSessionModel);

/**
 * MCP Tool: Check Auth Status
 *
 * Polls the status of an ongoing OAuth authentication session
 */

const toolDefinition = {
    name: 'checkAuthStatus',
    description: 'Check the status of an ongoing OAuth authentication session. Poll this after user clicks the auth link.',
    inputSchema: {
        type: 'object',
        properties: {
            sessionId: {
                type: 'string',
                description: 'The session ID returned from doAuth tool'
            },
        },
        required: ['sessionId']
    },
    annotations: {
        readOnlyHint: true,
        openWorldHint: false,
        destructiveHint: false
    }
};

/**
 * Execute the checkAuthStatus tool
 * @param {Object} args - The tool arguments
 * @param {string} args.sessionId - The session ID to check
 * @param {string} args.rcExtensionId - The RC extension ID
 * @returns {Promise<any>} Result object with authentication status
 */
async function execute(args) {
    try {
        // rcExtensionId is injected by mcpHandler after verifying the RC access
        // token. Using it as the DB key binds the CRM credential to a verified
        // RC identity.
        const { sessionId, rcExtensionId } = args;
        if (!rcExtensionId) {
            throw new Error('rcExtensionId is required');
        }
        const session = await getAuthSession(sessionId);

        if (!session) {
            return {
                success: false,
                error: 'CRM auth session not found or expired. Ask the user to start the auth flow again.'
            };
        }

        if (session.rcExtensionId && session.rcExtensionId !== rcExtensionId) {
            return {
                success: false,
                error: 'CRM auth session does not belong to this RingCentral extension.'
            };
        }

        switch (session.status) {
            case 'completed':
                if (!session.jwtToken) {
                    return {
                        success: false,
                        error: 'CRM auth session completed without a CRM token.'
                    };
                }
                await LlmSessionModel.upsert({
                    id: rcExtensionId,
                    jwtToken: session.jwtToken,
                    expiry: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
                });
                return {
                    data: {
                        status: 'completed',
                        userInfo: session.userInfo,
                        message: 'Authentication successful. CRM token stored server-side for future tool calls.'
                    }
                };

            case 'expired':
                return {
                    data: {
                        status: 'expired',
                        errorMessage: 'Authentication session expired. Ask the user to start the auth flow again.'
                    }
                };

            case 'failed':
                return {
                    data: {
                        status: 'failed',
                        errorMessage: session.errorMessage || 'Unknown error'
                    }
                };

            case 'pending':
            default:
                return {
                    data: {
                        status: 'pending'
                    }
                };
        }
    }
    catch (error) {
        return {
            success: false,
            error: `CRM auth status check error: ${error.message}`
        };
    }
}

exports.definition = toolDefinition;
exports.execute = execute;

export {};
