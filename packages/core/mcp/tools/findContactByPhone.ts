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
 * MCP Tool: Find Contact
 * 
 * This tool searches for a contact in the CRM platform by phone number.
 * It uses the platform-specific connector to find matching contacts.
 */

const toolDefinition = {
    name: 'findContactByPhone',
    description: '⚠️ REQUIRES CRM CONNECTION. | Search for a contact in the CRM platform by phone number. Returns contact details if found.',
    inputSchema: {
        type: 'object',
        properties: {
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
        required: ['phoneNumber']
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
 * @param {boolean} [args.isExtension] - Whether the request is from an extension
 * @returns {Promise<any>} Result object with contact information
 */
async function execute(args) {
    try {
        const { jwtToken, phoneNumber, overridingFormat, isExtension } = args || {};

        if (!isNonBlankString(jwtToken)) {
            throw new Error('Not authenticated. Please connect to your CRM first.');
        }
        if (!isNonBlankString(phoneNumber)) {
            throw new Error(
                typeof phoneNumber === 'undefined' || phoneNumber === null || typeof phoneNumber === 'string'
                    ? 'Phone number is required'
                    : 'Phone number must be a string'
            );
        }
        if (typeof overridingFormat !== 'undefined' && typeof overridingFormat !== 'string') {
            throw new Error('Overriding format must be a string');
        }
        if (typeof isExtension !== 'undefined' && typeof isExtension !== 'boolean') {
            throw new Error('isExtension must be a boolean');
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

        // Check if findContactByPhone is implemented
        if (typeof platformModule.findContact !== 'function') {
            throw new Error(`findContactByPhone is not implemented for platform: ${platform}`);
        }

        // Call the findContactByPhone method
        const searchResult = await contactCore.findContact({ platform, userId, phoneNumber, overridingFormat: overridingFormat ?? '', isExtension: isExtension ?? false });
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
