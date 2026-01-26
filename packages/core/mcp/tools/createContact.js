const jwt = require('../../lib/jwt');
const connectorRegistry = require('../../connector/registry');
const contactCore = require('../../handlers/contact');

/**
 * MCP Tool: Create Contact
 * 
 * This tool creates a new contact in the CRM platform.
 */

const toolDefinition = {
    name: 'createContact',
    description: '⚠️ REQUIRES AUTHENTICATION: User must first authenticate using the "auth" tool to obtain a JWT token before using this tool. | Create a new contact in the CRM platform. Returns the created contact information if successful.',
    inputSchema: {
        type: 'object',
        properties: {
            jwtToken: {
                type: 'string',
                description: 'JWT token containing userId and platform information. If user does not have this, direct them to use the "auth" tool first.'
            },
            phoneNumber: {
                type: 'string',
                description: 'Phone number of the new contact (MUST BE in E.164 format, e.g., +14155551234)'
            },
            newContactName: {
                type: 'string',
                description: 'Full name of the new contact. If not provided, use phone number as the name'
            }
        },
        required: ['jwtToken', 'phoneNumber']
    },
    annotations: {
        readOnlyHint: false,
        openWorldHint: true,
        destructiveHint: false
    }
};

/**
 * Execute the createContact tool
 * @param {Object} args - The tool arguments
 * @param {string} args.jwtToken - JWT token with user and platform info
 * @param {string} args.phoneNumber - Phone number of the new contact
 * @param {string} args.newContactName - Name of the new contact
 * @returns {Object} Result object with created contact information
 */
async function execute(args) {
    try {
        const { jwtToken, phoneNumber, newContactName } = args;

        if (!jwtToken) {
            throw new Error('Please go to Settings and authorize CRM platform');
        }

        if (!phoneNumber) {
            throw new Error('Phone number is required');
        }

        if (!newContactName) {
            throw new Error('Contact name is required');
        }

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

        // Check if createContact is implemented
        if (!platformModule.createContact) {
            throw new Error(`createContact is not implemented for platform: ${platform}`);
        }

        // Call the createContact method
        const { successful, returnMessage, contact } = await contactCore.createContact({
            platform,
            userId,
            phoneNumber,
            newContactName
        });

        if (successful) {
            return {
                success: true,
                data: {
                    contact,
                    message: returnMessage?.message || 'Contact created successfully'
                }
            };
        }
        else {
            return {
                success: false,
                error: returnMessage?.message || 'Failed to create contact'
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

