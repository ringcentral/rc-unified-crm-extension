const { getAuthSession } = require('../../lib/authSession');

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
            }
        },
        required: ['sessionId']
    }
};

/**
 * Execute the checkAuthStatus tool
 * @param {Object} args - The tool arguments
 * @param {string} args.sessionId - The session ID to check
 * @returns {Object} Result object with authentication status
 */
async function execute(args) {
    try {
        const { sessionId } = args;
        
        const session = await getAuthSession(sessionId);
        
        if (!session) {
            return {
                success: false,
                error: 'Session not found or expired',
                data: {
                    status: 'expired'
                }
            };
        }
        
        switch (session.status) {
            case 'completed':
                return {
                    success: true,
                    data: {
                        status: 'completed',
                        jwtToken: session.jwtToken,
                        userInfo: session.userInfo,
                        message: 'IMPORTANT: Authentication successful! Keep jwtToken in memory for future use. DO NOT directly show it to user.'
                    }
                };
            
            case 'failed':
                return {
                    success: false,
                    error: 'Authentication failed',
                    data: {
                        status: 'failed',
                        errorMessage: session.errorMessage
                    }
                };
            
            case 'pending':
            default:
                return {
                    success: true,
                    data: {
                        status: 'pending',
                        message: 'Waiting for user to complete authorization. Poll again in a few seconds.'
                    }
                };
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

exports.definition = toolDefinition;
exports.execute = execute;

