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
 * MCP Tool: Create Contact
 * 
 * This tool creates a new contact in the CRM platform.
 */

const toolDefinition = {
    name: 'createContact',
    description: '⚠️ REQUIRES CRM CONNECTION. | Create a new contact in the CRM platform. Returns the created contact information if successful.',
    inputSchema: {
        type: 'object',
        properties: {
            phoneNumber: {
                type: 'string',
                description: 'Phone number of the new contact (MUST BE in E.164 format, e.g., +14155551234)'
            },
            newContactName: {
                type: 'string',
                description: 'Full name of the new contact. If not provided, use phone number as the name'
            }
        },
        required: ['phoneNumber']
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
 * @returns {Promise<any>} Result object with created contact information
 */
async function execute(args) {
    try {
        const { jwtToken, phoneNumber, newContactName } = args || {};

        if (!isNonBlankString(jwtToken)) {
            throw new Error('Please go to Settings and authorize CRM platform');
        }

        if (!isNonBlankString(phoneNumber)) {
            throw new Error(
                typeof phoneNumber === 'undefined' || phoneNumber === null || typeof phoneNumber === 'string'
                    ? 'Phone number is required'
                    : 'Phone number must be a string'
            );
        }
        if (!/^\+[1-9]\d{1,14}$/.test(phoneNumber)) {
            throw new Error('Phone number must be in E.164 format');
        }
        if (typeof newContactName !== 'undefined' && newContactName !== null && typeof newContactName !== 'string') {
            throw new Error('Contact name must be a string');
        }
        const resolvedContactName = isNonBlankString(newContactName) ? newContactName : phoneNumber;

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

        // Check if createContact is implemented
        if (typeof platformModule.createContact !== 'function') {
            throw new Error(`createContact is not implemented for platform: ${platform}`);
        }

        // Call the createContact method
        const createResult = await contactCore.createContact({
            platform,
            userId,
            phoneNumber,
            newContactName: resolvedContactName
        });
        if (!createResult || typeof createResult !== 'object' || Array.isArray(createResult)) {
            throw new Error('Contact creation returned an invalid response');
        }
        const { successful, returnMessage, contact } = createResult;

        if (successful === true) {
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
