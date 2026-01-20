const jwt = require('../../lib/jwt');
const connectorRegistry = require('../../connector/registry');
const contactCore = require('../../handlers/contact');

/**
 * MCP Tool: Find Contact With Name
 * 
 * This tool searches for a contact in the CRM platform by name.
 * It uses the platform-specific connector to find matching contacts.
 */

const toolDefinition = {
    name: 'findContactByName',
    description: '⚠️ REQUIRES AUTHENTICATION: User must first authenticate using the "auth" tool to obtain a JWT token before using this tool. | Search for a contact in the CRM platform by name. Returns contact details if found.',
    inputSchema: {
        type: 'object',
        properties: {
            jwtToken: {
                type: 'string',
                description: 'JWT token containing userId and platform information. If user does not have this, direct them to use the "auth" tool first.'
            },
            name: {
                type: 'string',
                description: 'Name to search for'
            }
        },
        required: ['jwtToken', 'name']
    },
    annotations: {
        readOnlyHint: true,
        openWorldHint: true,
        destructiveHint: false
    }
};

/**
 * Execute the findContactByName tool
 * @param {Object} args - The tool arguments
 * @param {string} args.jwtToken - JWT token with user and platform info
 * @param {string} args.name - Name to search for
 * @returns {Object} Result object with contact information
 */
async function execute(args) {
    try {
        const { jwtToken, name } = args;

        // Decode JWT to get userId and platform
        const { id: userId, platform } = jwt.decodeJwt(jwtToken);
        
        if (!userId) {
            throw new Error('Invalid JWT token: userId not found');
        }

        // Get the platform connector module
        const platformModule = connectorRegistry.getConnector(platform);
        
        if (!platformModule) {
            throw new Error(`Platform connector not found for: ${platform}`);
        }

        // Check if findContactByName is implemented
        if (!platformModule.findContactWithName) {
            throw new Error(`findContactByName is not implemented for platform: ${platform}`);
        }

        // Call the findContactByName method
        const { successful, returnMessage, contact } = await contactCore.findContactWithName({ platform, userId, name });
        if (successful) {
            return {
                success: true,
                data: contact,
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

