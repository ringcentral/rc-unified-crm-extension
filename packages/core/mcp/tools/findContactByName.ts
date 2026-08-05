// @ts-check

const jwt = /** @type {any} */ (require('../../lib/jwt'));
const connectorRegistry = /** @type {any} */ (require('../../connector/registry'));
const contactCore = /** @type {any} */ (require('../../handlers/contact'));

function isNonBlankString(value) {
    return typeof value === 'string' && value.trim().length > 0;
}

function isCanonicalIdentifier(value) {
    return isNonBlankString(value) && value.trim() === value;
}

function normalizeCaughtError(error) {
    if (error instanceof Error) {
        return { message: error.message || 'Unknown error occurred', details: error.stack };
    }
    if (typeof error === 'string' && error.trim()) {
        return { message: error, details: undefined };
    }
    return { message: 'Unknown error occurred', details: undefined };
}

/**
 * MCP Tool: Find Contact With Name
 * 
 * This tool searches for a contact in the CRM platform by name.
 * It uses the platform-specific connector to find matching contacts.
 */

const toolDefinition = {
    name: 'findContactByName',
    description: '⚠️ REQUIRES CRM CONNECTION. | Search for a contact in the CRM platform by name. Returns contact details if found.',
    inputSchema: {
        type: 'object',
        properties: {
            name: {
                type: 'string',
                description: 'Name to search for'
            }
        },
        required: ['name']
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
 * @param {string} args.name - Name to search for
 * @param {string} args.jwtToken - JWT token with user and platform info
 * @returns {Promise<any>} Result object with contact information
 */
async function execute(args) {
    try {
        const { name, jwtToken } = args || {};
        if (!isNonBlankString(jwtToken)) {
            throw new Error('Not authenticated. Please connect to your CRM first.');
        }
        if (!isNonBlankString(name)) {
            throw new Error(
                typeof name === 'undefined' || name === null || typeof name === 'string'
                    ? 'Name is required'
                    : 'Name must be a string'
            );
        }
        // Decode JWT to get userId and platform
        const decodedToken = jwt.decodeJwt(jwtToken);
        if (!decodedToken || typeof decodedToken !== 'object' || Array.isArray(decodedToken)) {
            throw new Error('Invalid JWT token');
        }
        const { id: userId, platform } = decodedToken;
        
        if (!isCanonicalIdentifier(userId)) {
            throw new Error('Invalid JWT token: userId not found');
        }
        if (!isCanonicalIdentifier(platform)) {
            throw new Error('Invalid JWT token: platform not found');
        }

        // Get the platform connector module
        const platformModule = connectorRegistry.getConnector(platform);
        
        if (!platformModule) {
            throw new Error(`Platform connector not found for: ${platform}`);
        }

        // Check if findContactByName is implemented
        if (typeof platformModule.findContactWithName !== 'function') {
            throw new Error(`findContactByName is not implemented for platform: ${platform}`);
        }

        // Call the findContactByName method
        const searchResult = await contactCore.findContactWithName({ platform, userId, name });
        if (!searchResult || typeof searchResult !== 'object' || Array.isArray(searchResult)) {
            throw new Error('Contact search returned an invalid response');
        }
        const { successful, returnMessage, contact } = searchResult;
        if (successful === true) {
            return {
                success: true,
                data: contact,
            };
        }
        else {
            return {
                success: false,
                error: returnMessage?.message || 'Contact not found',
            };
        }
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
