const axios = require('axios');

/**
 * MCP Tool: Get Public Connectors
 *
 * Triggers the connector selection widget. The widget fetches the connector
 * list and manifests directly from the developer portal on the client side.
 * This tool only needs to resolve the RC account ID (for private connector
 * support) and return the server URL for widget-to-server tool calls.
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
        // openai/outputTemplate is injected at registration time by mcpHandler.js
        // using the module-level WIDGET_URI — do not hardcode a version here.
        "openai/toolBehavior": 'interactive',
        "openai/widgetAccessible": true
    }
};

/**
 * Execute the getPublicConnectors tool.
 * Uses the RC access token (injected by mcpHandler) to resolve the account ID,
 * which the widget needs to fetch private connectors directly from the developer portal.
 */
async function execute({ rcAccessToken, openaiSessionId } = {}) {
    let rcExtensionId = null;
    let rcAccountId = null;

    if (rcAccessToken) {
        try {
            const resp = await axios.get(
                'https://platform.ringcentral.com/restapi/v1.0/account/~/extension/~',
                { headers: { Authorization: `Bearer ${rcAccessToken}` } }
            );
            rcExtensionId = resp.data?.id ?? null;
            rcAccountId = resp.data?.account?.id ?? null;
        } catch {
            // Non-fatal: widget will only show public connectors
        }
    }

    return {
        structuredContent: {
            serverUrl: process.env.APP_SERVER || 'https://localhost:6066',
            rcExtensionId,
            rcAccountId,
            openaiSessionId: openaiSessionId ?? null,
        }
    };
}

exports.definition = toolDefinition;
exports.execute = execute;
