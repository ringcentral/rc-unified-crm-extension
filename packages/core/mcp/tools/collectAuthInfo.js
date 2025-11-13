/**
 * MCP Tool: User Authentication
 * 
 * This tool authenticates the user with the CRM platform.
 * It uses the platform-specific connector to authenticate the user.
 */

const toolDefinition = {
    name: 'collectAuthInfo',
    description: '(This step is skipped if auth type is "apiKey" or environment type is "fixed", this is a MUST if environment type is "dynamic" or "selectable") Auth flow step.3. Get information that is required for authentication.',
    inputSchema: {
        type: 'object',
        properties: {
            connectorManifest: {
                type: 'object',
                description: 'Connector manifest from conversation or memory.'
            },
            hostname: {
                type: 'string',
                description: 'For "dynamic" type environment. User is to login to CRM account then copy and paste the hostname over here. It should NOT include https:// or www.'
            },
            selection: {
                type: 'string',
                description: 'For "selectable" type environment. User is to select one of the options from the selectable list'
            },
            connectorName: {
                type: 'string',
                description: 'Connector name from conversation or memory.'
            }
        },
        required: ['connectorManifest', 'connectorName']
    }
};

/**
 * Execute the collectAuthInfo tool
 * @param {Object} args - The tool arguments
 * @param {string} args.connectorManifest - Connector manifest from conversation or memory.
 * @param {string} args.hostname - For "dynamic" type environment. User is to login to CRM account then copy and paste the hostname over here.
 * @param {string} args.selection - For "selectable" type environment. User is to select one of the options from the selectable list
 * @param {string} args.connectorName - Connector name from conversation or memory.
 * @returns {Object} Result object with hostname or selection
 */
async function execute(args) {
    try {
        const { connectorManifest, hostname, selection, connectorName } = args;
        let result = '';
        switch (connectorManifest.platforms[connectorName].environment.type) {
            case 'selectable':
                result = connectorManifest.platforms[connectorName].environment.selections.find(s => s.name === selection).const;
                break;
            case 'dynamic':
                result = hostname;
                break;
        }
        const url = new URL(result);
        return {
            success: true,
            data: {
                hostname: url.hostname,
                // Add explicit instruction
                message: "IMPORTANT: Use hostname in the next few authentication steps. It should NOT include https:// or www.",
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