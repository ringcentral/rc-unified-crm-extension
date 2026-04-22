const jwt = require('../../lib/jwt');
const { UserModel } = require('../../models/userModel');
const { LlmSessionModel } = require('../../models/llmSessionModel');
const { CacheModel } = require('../../models/cacheModel');
const connectorRegistry = require('../../connector/registry');

const RC_EXTENSION_CACHE_KEY = 'rcExtensionId';

/**
 * MCP Tool: Logout
 * 
 * This tool logs out the user from the CRM platform.
 */

const toolDefinition = {
    name: 'logout',
    description: 'Logout the user from the CRM platform.',
    inputSchema: {
        type: 'object',
        properties: {}
    },
    annotations: {
        readOnlyHint: false,
        openWorldHint: true,
        destructiveHint: true
    }
};

function isMissingSessionTableError(error) {
    const message = error?.message || '';
    return message.includes('no such table: llmSessions')
        || message.includes('relation "llmSessions" does not exist')
        || message.includes("relation 'llmSessions' does not exist");
}

/**
 * Execute the logout tool
 * @param {Object} args - The tool arguments
 * @param {string} args.jwtToken - JWT token containing userId and platform information. Injected automatically by the server after CRM connection.
 * @returns {Object} Result object with logout information
 */
async function execute(args) {
    try {
        const { jwtToken, rcExtensionId, openaiSessionId } = args;
        const session = jwt.decodeJwt(jwtToken);
        if (!session?.platform || !session?.id) {
            throw new Error('Invalid JWT token');
        }
        const { platform, id } = session;
        try {
            await LlmSessionModel.destroy({ where: { id } });
            if (rcExtensionId && rcExtensionId !== id) {
                await LlmSessionModel.destroy({ where: { id: rcExtensionId } });
            }
            if (openaiSessionId) {
                await CacheModel.destroy({ where: { id: `${openaiSessionId}-${RC_EXTENSION_CACHE_KEY}` } });
            }
        }
        catch (error) {
            if (!isMissingSessionTableError(error)) {
                throw error;
            }
        }
        const userToLogout = await UserModel.findByPk(id);
        if (!userToLogout) {
            return {
                success: false,
                error: "User not found",
                errorDetails: "User not found",
            };
        }
        const platformModule = connectorRegistry.getConnector(platform);
        try {
            await platformModule.unAuthorize({ user: userToLogout });
        }
        catch (error) {
            console.log(error);
        }
        return {
            success: true,
            data: {
                message: "IMPORTANT: Logout successful. Clear jwtToken, connectorManifest, connectorDisplayName, hostname and connectorName in memory. User is logged out from the CRM platform.",
            }
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
