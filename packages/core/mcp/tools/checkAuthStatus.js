const { getAuthSession } = require('../../lib/authSession');
const { LlmSessionModel } = require('../../models/llmSessionModel');

/**
 * MCP Tool: Check Auth Status
 * 
 * Polls the status of an ongoing OAuth authentication session
 */

const toolDefinition = {
    name: 'checkAuthStatus',
    description: 'Auth flow step.5. Check the status of an ongoing OAuth authentication session. Poll this after user clicks the auth link.',
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
 * @returns {Object} Result object with authentication status
 */
async function execute(args) {
    try {
        // rcExtensionId is injected by mcpHandler after verifying the RC access
        // token.  Using it as the DB key binds the CRM credential to a verified
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

        switch (session.status) {
            case 'completed': {
                // Guard against duplicate DB writes if polled concurrently
                try {
                    await LlmSessionModel.create({
                        id: rcExtensionId,
                        jwtToken: session.jwtToken
                    });
                } catch {
                    // Record already exists from a prior poll — safe to ignore
                }
                return {
                    data: {
                        status: 'completed',
                        jwtToken: session.jwtToken,
                        userInfo: session.userInfo,
                        message: 'IMPORTANT: Authentication successful! Keep jwtToken in memory for future use. DO NOT directly show it to user.'
                    }
                };
            }

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

