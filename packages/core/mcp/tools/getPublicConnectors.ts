// @ts-check

const axios = /** @type {any} */ (require('axios'));
const { Op } = /** @type {any} */ (require('sequelize'));
const { UserModel: RawUserModel } = require('../../models/userModel');
const UserModel = /** @type {any} */ (RawUserModel);
const { getHashValue: rawGetHashValue } = require('../../lib/util');
const getHashValue = /** @type {any} */ (rawGetHashValue);
const { createWidgetSessionToken: rawCreateWidgetSessionToken } = require('../lib/widgetSessionToken');
const createWidgetSessionToken = /** @type {any} */ (rawCreateWidgetSessionToken);

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
        openWorldHint: true,
        destructiveHint: false
    },
    _meta: {
        // openai/outputTemplate is injected at registration time by mcpHandler.ts
        // using the module-level WIDGET_URI — do not hardcode a version here.
        "openai/toolBehavior": 'interactive',
        "openai/widgetAccessible": true
    }
};

/**
 * Execute the getPublicConnectors tool.
 * Uses the RC access token (injected by mcpHandler) to resolve the account ID,
 * which the widget needs to fetch private connectors directly from the developer portal.
 * @param {{ rcAccessToken?: string, openaiSessionId?: string }=} params - Injected MCP session parameters
 * @returns {Promise<any>} Result object with connector metadata
 */
async function execute({ rcAccessToken, openaiSessionId }: { rcAccessToken?: string, openaiSessionId?: string } = {}) {
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

    // Check if user session already exists from Chrome extension
    const hashedRcExtensionId = getHashValue(rcExtensionId, process.env.HASH_KEY);
    const user = await UserModel.findOne({
        where: {
            hashedRcExtensionId,
            [Op.and]: [
                { accessToken: { [Op.not]: null } },
                { accessToken: { [Op.ne]: '' } },
            ],
        },
        order: [['updatedAt', 'DESC']],
    });
    // Case: user exists, return user info in plain message
    if (user?.accessToken) {
        return {
            structuredContent: {
                error: true,
                errorMessage: `You are already connected to ${user.platform}. It's controlled from App Connect Chrome extension.`
            }
        }
    }
    else {
        // Case: user doesn't exist, return structured content for widget
        return {
            structuredContent: {
                serverUrl: process.env.APP_SERVER || 'https://localhost:6066',
                rcExtensionId,
                rcAccountId,
                openaiSessionId: openaiSessionId ?? null,
                widgetSessionToken: createWidgetSessionToken({ rcExtensionId, openaiSessionId: openaiSessionId ?? null }),
            }
        };
    }

}

exports.definition = toolDefinition;
exports.execute = execute;

export {};
