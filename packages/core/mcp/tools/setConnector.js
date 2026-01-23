const developerPortal = require('../../connector/developerPortal');

/**
 * MCP Tool: Set Connector
 * 
 * This tool helps the user set the connector.
 */

const toolDefinition = {
    name: 'setConnector',
    description: 'Auth flow step.2. Save connectorManifest to memory if successful.',
    inputSchema: {
        type: 'object',
        properties: {
            connectorDisplayName: {
                type: 'string',
                description: 'Connector displayname to set'
            }
        },
        required: ['connectorDisplayName']
    },
    annotations: {
        readOnlyHint: true,
        openWorldHint: false,
        destructiveHint: false
    }
};

/**
 * Execute the setConnector tool
 * @param {Object} args - The tool arguments
 * @param {string} args.connectorDisplayName - Connector display name to set
 * @returns {Object} Result object with connector information
 */
async function execute(args) {
    try {
        const { connectorDisplayName } = args;
        const { connectors: publicConnectorList } = await developerPortal.getPublicConnectorList();
        const { privateConnectors } = await developerPortal.getPrivateConnectorList();
        const connectorList = [...publicConnectorList, ...privateConnectors];
        const connector = connectorList.find(c => c.displayName === connectorDisplayName);
        const connectorName = connector.name;
        const connectorManifest = await developerPortal.getConnectorManifest({ connectorId: connector.id, isPrivate: connector.status === 'private' });
        if (!connectorManifest) {
            throw new Error(`Connector manifest not found: ${connectorDisplayName}`);
        }
        return {
            success: true,
            data: {
                connectorManifest,
                connectorDisplayName,
                connectorName,
                // Add explicit instruction
                message: "IMPORTANT: Use connectorManifest, connectorDisplayName, and connectorName in the next few authentication steps. Call 'collectAuthInfo' tool if the connector is oauth, unless connectorManifest.platform[0].environment.type == 'fixed'.",
                
            }
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