const jwt = require('../../lib/jwt');
const connectorRegistry = require('../../connector/registry');
const contactCore = require('../../handlers/contact');

/**
 * MCP Tool: Find Contact
 * 
 * This tool searches for a contact in the CRM platform by phone number.
 * It uses the platform-specific connector to find matching contacts.
 */

const toolDefinition = {
    name: 'findContactByPhone',
    description: '⚠️ REQUIRES AUTHENTICATION: User must first authenticate using the "auth" tool to obtain a JWT token before using this tool. | Search for a contact in the CRM platform by phone number. Returns contact details if found.',
    inputSchema: {
        type: 'object',
        properties: {
            jwtToken: {
                type: 'string',
                description: 'JWT token containing userId and platform information. If user does not have this, direct them to use the "auth" tool first.'
            },
            phoneNumber: {
                type: 'string',
                description: 'Phone number to search for, if not in E.164 format, convert it to E.164 format'
            },
            overridingFormat: {
                type: 'string',
                description: 'Overriding format to search for'
            },
            isExtension: {
                type: 'boolean',
                description: 'Whether the request is from an extension'
            }
        },
        required: ['jwtToken', 'phoneNumber']
    },
    annotations: {
        readOnlyHint: true,
        openWorldHint: true,
        destructiveHint: false
    }
};

/**
 * Execute the findContactByPhone tool
 * @param {Object} args - The tool arguments
 * @param {string} args.jwtToken - JWT token with user and platform info
 * @param {string} [args.phoneNumber] - Phone number to search for
 * @param {string} [args.overridingFormat] - Overriding format to search for
 * @param {string} [args.isExtension] - Whether the request is from an extension
 * @returns {Object} Result object with contact information
 */
async function execute(args) {
    try {
        const { jwtToken, phoneNumber, overridingFormat, isExtension } = args;

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

        // Check if findContactByPhone is implemented
        if (!platformModule.findContact) {
            throw new Error(`findContactByPhone is not implemented for platform: ${platform}`);
        }

        // Call the findContactByPhone method
        const { successful, returnMessage, contact } = await contactCore.findContact({ platform, userId, phoneNumber, overridingFormat: overridingFormat ?? '', isExtension: isExtension ?? false });
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