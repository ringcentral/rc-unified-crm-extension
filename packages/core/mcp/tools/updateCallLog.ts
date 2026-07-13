// @ts-check

const jwt = /** @type {any} */ (require('../../lib/jwt'));
const connectorRegistry = /** @type {any} */ (require('../../connector/registry'));
const logCore = /** @type {any} */ (require('../../handlers/log'));
const util = /** @type {any} */ (require('../../lib/util'));

/**
 * MCP Tool: Update Call Log
 * 
 * This tool updates an existing call log in the CRM platform.
 */

const toolDefinition = {
    name: 'updateCallLog',
    description: '⚠️ REQUIRES AUTHENTICATION: User must first authenticate using the "auth" tool to obtain a JWT token before using this tool. | Update an existing call log in the CRM platform. Returns the updated log ID if successful.',
    inputSchema: {
        type: 'object',
        properties: {
            jwtToken: {
                type: 'string',
                description: 'JWT token containing userId and platform information. If user does not have this, direct them to use the "auth" tool first.'
            },
            incomingData: {
                type: 'object',
                description: 'Call log update data including sessionId, note, additionalSubmission, etc.',
                properties: {
                    sessionId: {
                        type: 'string',
                        description: 'Session ID of the call log to update'
                    },
                    extensionNumber: {
                        type: 'string',
                        description: 'RingCentral extension number for the call log to update'
                    },
                    note: {
                        type: 'string',
                        description: 'Updated call note/description'
                    },
                    additionalSubmission: {
                        type: 'object',
                        description: 'Additional platform-specific fields to update'
                    },
                    accountId: {
                        type: 'string',
                        description: 'RingCentral account ID'
                    }
                },
                required: ['sessionId']
            }
        },
        required: ['jwtToken', 'incomingData']
    }
};

/**
 * Execute the updateCallLog tool
 * @param {Object} args - The tool arguments
 * @param {string} args.jwtToken - JWT token with user and platform info
 * @param {Object} args.incomingData - Call log update data
 * @returns {Promise<any>} Result object with updated log ID
 */
async function execute(args) {
    try {
        const { jwtToken, incomingData } = args;
        
        // Decode JWT to get userId and platform
        const decodedToken = jwt.decodeJwt(jwtToken);
        if (!decodedToken) {
            throw new Error('Invalid JWT token');
        }
        const { id: userId, platform } = decodedToken;
        
        if (!userId) {
            throw new Error('Invalid JWT token: userId not found');
        }

        // Get the platform connector module
        const platformModule = connectorRegistry.getConnector(platform);
        
        if (!platformModule) {
            throw new Error(`Platform connector not found for: ${platform}`);
        }

        // Check if updateCallLog is implemented
        if (!platformModule.updateCallLog) {
            throw new Error(`updateCallLog is not implemented for platform: ${platform}`);
        }

        // Calculate hashed account ID
        const hashedAccountId = incomingData.accountId 
            ? util.getHashValue(incomingData.accountId, process.env.HASH_KEY) 
            : undefined;

        // Call the updateCallLog method
        const { successful, logId, updatedNote, returnMessage } = await logCore.updateCallLog({ 
            platform, 
            userId, 
            incomingData, 
            hashedAccountId,
            isFromSSCL: false 
        });
        
        if (successful) {
            return {
                success: true,
                data: {
                    logId,
                    updatedNote,
                    message: returnMessage?.message || 'Call log updated successfully'
                }
            };
        }
        else {
            return {
                success: false,
                error: returnMessage?.message || 'Failed to update call log',
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


export {};
