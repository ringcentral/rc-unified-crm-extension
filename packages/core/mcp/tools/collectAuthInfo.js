/**
 * MCP Tool: User Authentication
 * 
 * This tool authenticates the user with the CRM platform.
 * It uses the platform-specific connector to authenticate the user.
 */

const { isManifestValid } = require('../lib/validator');

const toolDefinition = {
    name: 'collectAuthInfo',
    description: '(This step is skipped if auth type is "apiKey" or environment type is "fixed", this is a MUST if environment type is "dynamic" or "selectable") Auth flow step.3. Get information that is required for authentication. Next step is calling step.4 "doAuth" tool.',
    inputSchema: {
        type: 'object',
        properties: {
            connectorManifest: {
                type: 'object',
                description: 'connectorManifest variable from above conversation. Must be the full manifest object, not just serverUrl'
            },
            hostname: {
                type: 'string',
                description: 'For "dynamic" type environment. User is to login to CRM account then copy and paste the hostname over here.'
            },
            selection: {
                type: 'string',
                description: 'For "selectable" type environment. User is to select a name (NOT value) of the options from the selectable list'
            },
            connectorName: {
                type: 'string',
                description: 'connectorName variable from above conversation.'
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
 * @param {string} args.selection - For "selectable" type environment. User is to select a name (NOT value) of the options from the selectable list
 * @param {string} args.connectorName - Connector name from conversation or memory.
 * @returns {Object} Result object with hostname or selection
 */
async function execute(args) {
    try {
        const { connectorManifest, hostname, selection, connectorName } = args;
        const { isValid, errors } = isManifestValid({ connectorManifest, connectorName });
        if (!isValid) {
            return {
                success: false,
                error: "Invalid connector manifest",
                errorDetails: errors.join(', '),
            }
        }
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
                message: "IMPORTANT: Use hostname in the next few authentication steps.",
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