// @ts-check

const jwt = /** @type {any} */ (require('../../lib/jwt'));
const connectorRegistry = /** @type {any} */ (require('../../connector/registry'));
const logCore = /** @type {any} */ (require('../../handlers/log'));

/**
 * MCP Tool: Get Call Log
 * 
 * This tool retrieves call logs from the CRM platform by session IDs.
 */

const toolDefinition = {
    name: 'getCallLog',
    description: '⚠️ REQUIRES AUTHENTICATION: User must first authenticate using the "auth" tool to obtain a JWT token before using this tool. | Get call logs from the CRM platform by session IDs. Returns log details if found.',
    inputSchema: {
        type: 'object',
        properties: {
            jwtToken: {
                type: 'string',
                description: 'JWT token containing userId and platform information. If user does not have this, direct them to use the "auth" tool first.'
            },
            sessionIds: {
                type: 'string',
                description: 'Session IDs to retrieve, seprated by commas'
            },
            extensionNumber: {
                type: 'string',
                description: 'RingCentral extension number to match with each session ID'
            },
            requireDetails: {
                type: 'boolean',
                description: 'Whether to require detailed log information. If true, will call CRM API. Otherwise will just query in our own database',
                default: false
            }
        },
        required: ['jwtToken', 'sessionIds']
    }
};

/**
 * Execute the getCallLog tool
 * @param {Object} args - The tool arguments
 * @param {string} args.jwtToken - JWT token with user and platform info
 * @param {string} args.sessionIds - Session IDs to retrieve, seprated by commas
 * @param {string} [args.extensionNumber] - RingCentral extension number used to scope the lookup.
 * @param {boolean} [args.requireDetails] - Whether to require detailed log information. If true, will call CRM API. Otherwise will just query in our own database.
 * @returns {Promise<any>} Result object with call log information
 */
async function execute(args) {
    try {
        const { jwtToken, sessionIds, extensionNumber, requireDetails = false } = args;

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

        // Check if getCallLog is implemented
        if (!platformModule.getCallLog) {
            throw new Error(`getCallLog is not implemented for platform: ${platform}`);
        }

        // Call the getCallLog method
        const getCallLogParams: any = {
            userId, 
            sessionIds, 
            platform, 
            requireDetails 
        };
        if (extensionNumber) {
            getCallLogParams.extensionNumber = extensionNumber;
        }
        const { successful, logs, returnMessage } = await logCore.getCallLog(getCallLogParams);
        
        if (successful) {
            return {
                success: true,
                data: logs,
            };
        }
        else {
            return {
                success: false,
                error: returnMessage.message,
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
