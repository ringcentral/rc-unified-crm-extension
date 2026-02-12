const developerPortal = require('../../connector/developerPortal');

/**
 * MCP Tool: Get Public Connectors
 * 
 * This tool retrieves a list of public connectors from the developer portal.
 */

const toolDefinition = {
    name: 'getPublicConnectors',
    description: 'Get available connectors. Returns an interactive widget - do NOT summarize or list the results in text, just show the widget.',
    inputSchema: {
        type: 'object',
        properties: {},
        required: []
    },
    annotations: {
        readOnlyHint: true,
        openWorldHint: false,
        destructiveHint: false
    },
    _meta: {
        "openai/outputTemplate": 'ui://widget/ConnectorList.html',
        "openai/toolBehavior": 'interactive',
        "openai/widgetAccessible": true
    }
};

const supportedPlatforms = ['googleSheets', 'clio'];

/**
 * Execute the getPublicConnectors tool
 * @returns {Object} Result object with connector names
 */
async function execute() {
    try {
        const { connectors: publicConnectorList } = await developerPortal.getPublicConnectorList();
        const connectorList = [...publicConnectorList];
        
        if (process.env.RC_ACCOUNT_ID) {
            const { privateConnectors } = await developerPortal.getPrivateConnectorList();
            connectorList.push(...privateConnectors);
        }
        
        // Filter to supported platforms and format for UI
        const supportedConnectors = connectorList
            .filter(c => supportedPlatforms.includes(c.name))
            .map(c => ({
                name: c.name,
                displayName: c.displayName,
                description: c.description || `Connect to ${c.displayName}`,
                status: c.status || 'public'
            }));
        
        return {
            // structuredContent is sent to the UI widget - no text content needed
            structuredContent: {
                connectors: supportedConnectors
            }
        };
    }
    catch (error) {
        return {
            structuredContent: {
                error: true,
                errorMessage: error.message || 'Failed to load connectors'
            }
        };
    }
}

exports.definition = toolDefinition;
exports.execute = execute;