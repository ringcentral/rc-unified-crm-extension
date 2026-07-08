// @ts-check

const { createAuthSession: rawCreateAuthSession } = require('../../lib/authSession');
const createAuthSession = /** @type {any} */ (rawCreateAuthSession);

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
            sessionId: {
                type: 'string',
                description: 'Server-issued widget session ID'
            },
            hostname: {
                type: 'string',
                description: 'Resolved hostname for the CRM instance'
            }
        },
        required: ['sessionId', 'connectorName']
    },
    annotations: {
        readOnlyHint: false,
        openWorldHint: false,
        destructiveHint: false
    }
};

async function execute(args) {
    try {
        const { sessionId, connectorName, hostname = '', rcExtensionId, openaiSessionId } = args;

        if (!sessionId || !connectorName || !rcExtensionId) {
            return { success: false, error: 'Missing required fields: sessionId, connectorName, rcExtensionId' };
        }

        await createAuthSession(sessionId, {
            platform: connectorName,
            hostname,
            rcExtensionId,
            openaiSessionId,
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

export {};
