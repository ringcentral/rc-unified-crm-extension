const developerPortal = require('../../connector/developerPortal');

/**
 * MCP Tool: Get Public Connectors
 * 
 * This tool retrieves a list of public connectors from the developer portal.
 */

const toolDefinition = {
    name: 'getPublicConnectors',
    description: 'Auth flow step.1. Get a list of all available connectors from the developer portal. Returns a list of connector names for users to choose.',
    inputSchema: {
        type: 'object',
        properties: {},
        required: []
    }
};

/**
 * Execute the getPublicConnectors tool
 * @returns {Object} Result object with connector names
 */
async function execute() {
    try {
        const { connectors: publicConnectorList } = await developerPortal.getPublicConnectorList();
        const connectorList = publicConnectorList;
        if(process.env.RC_ACCOUNT_ID) {
            const { privateConnectors } = await developerPortal.getPrivateConnectorList();
            connectorList.push(...privateConnectors);
        }
        return {
            success: true,
            data: connectorList.map(c => c.displayName)
        };
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