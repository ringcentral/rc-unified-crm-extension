const { createAuthSession } = require('../../lib/authSession');

/**
 * MCP Tool: Do Authentication (widget-only)
 *
 * Creates a server-side OAuth session for the given sessionId.
 * The widget generates the sessionId and authUri client-side for instant display,
 * then calls this endpoint in the background to register the session in the DB
 * so the OAuth callback can resolve it.
 */

const toolDefinition = {
    name: 'doAuth',
    description: 'Create a server-side OAuth session. Widget-only — not called by AI model.',
    inputSchema: {
        type: 'object',
        properties: {
            connectorName: {
                type: 'string',
                description: 'Connector platform name'
            },
            hostname: {
                type: 'string',
                description: 'Resolved hostname for the CRM instance'
            }
        },
        required: ['connectorName']
    },
    annotations: {
        readOnlyHint: false,
        openWorldHint: false,
        destructiveHint: false
    }
};

async function execute(args) {
    try {
        const { sessionId, connectorName, hostname = '' } = args;

        if (!sessionId || !connectorName) {
            return { success: false, error: 'Missing required fields: sessionId, connectorName' };
        }

        await createAuthSession(sessionId, {
            platform: connectorName,
            hostname,
        });

        return { success: true };
    } catch (error) {
        return {
            success: false,
            error: error.message || 'Unknown error occurred',
            errorDetails: error.stack,
        };
    }
}

exports.definition = toolDefinition;
exports.execute = execute;
