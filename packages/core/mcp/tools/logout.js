const jwt = require('../../lib/jwt');
const { UserModel } = require('../../models/userModel');
const connectorRegistry = require('../../connector/registry');

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
        properties: {
            jwtToken: {
                type: 'string',
                description: 'JWT token containing userId and platform information. If user does not have this, direct them to use the "auth" tool first.'
            }
        }
    }
};

/**
 * Execute the logout tool
 * @param {Object} args - The tool arguments
 * @param {string} args.jwtToken - JWT token containing userId and platform information. If user does not have this, direct them to use the "auth" tool first.
 * @returns {Object} Result object with logout information
 */
async function execute(args) {
    try {
        const { jwtToken } = args;
        const { platform, id } = jwt.decodeJwt(jwtToken);
        
        const userToLogout = await UserModel.findByPk(id);
            if (!userToLogout) {
            return {
                success: false,
                error: "User not found",
                errorDetails: "User not found",
            };
        }
        const platformModule = connectorRegistry.getConnector(platform);
        await platformModule.unAuthorize({ user: userToLogout });
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