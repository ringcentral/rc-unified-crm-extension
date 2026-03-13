/**
 * MCP Server for RC Unified CRM Extension
 *
 * Stateless hand-rolled JSON-RPC handler — no SDK, no SSE, no sessions Map.
 * Fully compatible with stateless deployments (AWS Lambda, etc.).
 * All auth context is resolved per-request; rcExtensionId is cached in CacheModel.
 */

const axios = require('axios');
const tools = require('./tools');
const { LlmSessionModel } = require('../models/llmSessionModel');
const { CacheModel } = require('../models/cacheModel');
const logger = require('../lib/logger');
const fs = require('fs');
const path = require('path');

/**
 * Increment this to bust ChatGPT's widget resource cache after every UI build.
 * This is the single source of truth — injected into getPublicConnectors _meta at response time.
 */
const WIDGET_VERSION = 6;
const WIDGET_URI = `ui://widget/ConnectorList-v${WIDGET_VERSION}.html`;

const JSON_RPC_INTERNAL_ERROR = -32603;
const JSON_RPC_METHOD_NOT_FOUND = -32601;
const JSON_RPC_INVALID_PARAMS = -32602;

/**
 * JSON Schema definitions for tools that accept parameters.
 * Without inputSchema, ChatGPT silently drops all arguments when calling the tool.
 */
const inputSchemas = {
    findContactByName: {
        type: 'object',
        properties: {
            name: { type: 'string', description: 'Name to search for' },
        },
        required: ['name'],
    },
    findContactByPhone: {
        type: 'object',
        properties: {
            phoneNumber: { type: 'string', description: 'Phone number in E.164 format (e.g. +14155551234)' },
            overridingFormat: { type: 'string', description: 'Overriding format to search for' },
            isExtension: { type: 'boolean', description: 'Whether the request is from an extension' },
        },
        required: ['phoneNumber'],
    },
    createContact: {
        type: 'object',
        properties: {
            phoneNumber: { type: 'string', description: 'Phone number in E.164 format (e.g. +14155551234)' },
            newContactName: { type: 'string', description: 'Full name of the new contact' },
        },
        required: ['phoneNumber'],
    },
    createCallLog: {
        type: 'object',
        properties: {
            incomingData: { description: 'Call log data to create' },
            contactId: { type: 'string', description: 'CRM contact ID to attach the log to' },
            contactType: { type: 'string', description: 'Type of the CRM contact' },
            note: { type: 'string', description: 'Note to include in the call log' },
        },
        required: [],
    },
    rcGetCallLogs: {
        type: 'object',
        properties: {
            timeFrom: { type: 'string', description: 'Start of time range in ISO 8601 format' },
            timeTo: { type: 'string', description: 'End of time range in ISO 8601 format' },
        },
        required: ['timeFrom', 'timeTo'],
    },
    logout: {
        type: 'object',
        properties: {},
        required: [],
    },
};

/**
 * Verify an RC access token and return the caller's extension ID.
 * Throws if the token is invalid.
 */
async function resolveRcExtensionId(rcAccessToken) {
    const resp = await axios.get(
        'https://platform.ringcentral.com/restapi/v1.0/account/~/extension/~',
        { headers: { Authorization: `Bearer ${rcAccessToken}` } }
    );
    return resp.data?.id?.toString() ?? null;
}

/**
 * Resolve rcExtensionId for the current request.
 * Checks CacheModel first (avoids RC API call on Lambda cold starts),
 * falls back to a live RC API verification and persists the result.
 */
async function resolveSessionContext(rcAccessToken, openaiSessionId) {
    if (!rcAccessToken) return { rcExtensionId: null };

    if (openaiSessionId) {
        try {
            const cached = await CacheModel.findByPk(`${openaiSessionId}-rcExtensionId`);
            if (cached?.data?.rcExtensionId && (!cached.expiry || cached.expiry > new Date())) {
                return { rcExtensionId: cached.data.rcExtensionId };
            }
        } catch (err) {
            logger.warn('CacheModel lookup failed:', { message: err.message });
        }
    }

    let rcExtensionId = null;
    try {
        rcExtensionId = await resolveRcExtensionId(rcAccessToken);
        if (openaiSessionId && rcExtensionId) {
            await CacheModel.upsert({
                id: `${openaiSessionId}-rcExtensionId`,
                userId: openaiSessionId,
                cacheKey: 'rcExtensionId',
                data: { rcExtensionId },
                status: 'active',
                expiry: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24h TTL
            });
        }
    } catch (err) {
        logger.warn('Failed to resolve RC extension ID:', { message: err.message });
    }

    return { rcExtensionId };
}

/**
 * Build the tools list to return in tools/list responses.
 * Injects inputSchema and stamps WIDGET_URI into getPublicConnectors _meta.
 */
function getToolsList() {
    return tools.tools.map(tool => {
        const def = { ...tool.definition };
        if (def.name === 'getPublicConnectors') {
            def._meta = { ...(def._meta || {}), 'openai/outputTemplate': WIDGET_URI };
        }
        if (inputSchemas[def.name]) {
            def.inputSchema = inputSchemas[def.name];
        }
        return def;
    });
}

/**
 * Handle incoming MCP HTTP requests.
 * Stateless: each POST is handled independently with no session state between requests.
 */
async function handleMcpRequest(req, res) {
    try {
        const { method, params, id } = req.body;
        logger.info('Received MCP request:', { method });

        const rcAccessToken = req.headers['authorization']?.split('Bearer ')?.[1];
        const openaiSessionId = params?._meta?.['openai/session'] ?? null;

        let response;

        switch (method) {
            case 'initialize':
                response = {
                    jsonrpc: '2.0',
                    id,
                    result: {
                        protocolVersion: '2024-11-05',
                        capabilities: {
                            tools: {},
                            resources: {},
                        },
                        serverInfo: {
                            name: 'rc-unified-crm-extension',
                            version: '1.0.0',
                        },
                    },
                };
                break;

            case 'tools/list':
                response = {
                    jsonrpc: '2.0',
                    id,
                    result: { tools: getToolsList() },
                };
                break;

            case 'tools/call': {
                const { name: toolName, arguments: args } = params;
                const toolArgs = { ...(args || {}) };

                if (rcAccessToken) toolArgs.rcAccessToken = rcAccessToken;
                if (openaiSessionId) toolArgs.openaiSessionId = openaiSessionId;

                const { rcExtensionId } = await resolveSessionContext(rcAccessToken, openaiSessionId);
                if (rcExtensionId) {
                    toolArgs.rcExtensionId = rcExtensionId;
                    if (!toolArgs.jwtToken) {
                        let llmSession = await LlmSessionModel.findByPk(rcExtensionId);
                        if (!llmSession?.jwtToken && openaiSessionId) {
                            const fallback = await LlmSessionModel.findByPk(openaiSessionId);
                            if (fallback?.jwtToken) {
                                await LlmSessionModel.upsert({ id: rcExtensionId, jwtToken: fallback.jwtToken });
                                llmSession = fallback;
                            }
                        }
                        if (llmSession?.jwtToken) toolArgs.jwtToken = llmSession.jwtToken;
                    }
                }

                try {
                    const tool = tools.tools.find(t => t.definition.name === toolName);
                    if (!tool) throw new Error(`Tool not found: ${toolName}`);

                    const result = await tool.execute(toolArgs);

                    if (result?.structuredContent) {
                        response = {
                            jsonrpc: '2.0',
                            id,
                            result: {
                                structuredContent: result.structuredContent,
                                content: Array.isArray(result.content)
                                    ? result.content
                                    : [{ type: 'text', text: '[Interactive widget displayed above - no additional response needed]' }],
                            },
                        };
                    } else {
                        response = {
                            jsonrpc: '2.0',
                            id,
                            result: {
                                content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
                            },
                        };
                    }
                } catch (toolError) {
                    response = {
                        jsonrpc: '2.0',
                        id,
                        error: {
                            code: JSON_RPC_INTERNAL_ERROR,
                            message: `Tool execution failed: ${toolError.message}`,
                        },
                    };
                }
                break;
            }

            case 'resources/list':
                response = {
                    jsonrpc: '2.0',
                    id,
                    result: {
                        resources: [{
                            uri: WIDGET_URI,
                            name: 'connector-list-widget',
                            title: 'ConnectorList',
                            description: 'ChatGPT widget for connector selection',
                            mimeType: 'text/html+skybridge',
                        }],
                    },
                };
                break;

            case 'resources/read': {
                const uri = params?.uri;
                if (!uri?.startsWith('ui://widget/')) {
                    response = {
                        jsonrpc: '2.0',
                        id,
                        error: { code: JSON_RPC_INVALID_PARAMS, message: `Unknown resource: ${uri}` },
                    };
                    break;
                }

                const appUrl = process.env.APP_SERVER || 'http://localhost:6066';
                const distPath = path.join(__dirname, 'ui', 'dist', 'index.html');
                const devPath = path.join(__dirname, 'ui', 'index.html');
                let htmlContent;
                try { htmlContent = fs.readFileSync(distPath, 'utf8'); }
                catch { htmlContent = fs.readFileSync(devPath, 'utf8'); }

                response = {
                    jsonrpc: '2.0',
                    id,
                    result: {
                        contents: [{
                            uri: WIDGET_URI,
                            mimeType: 'text/html+skybridge',
                            text: htmlContent,
                            _meta: {
                                'openai/widgetPrefersBorder': true,
                                'openai/widgetDomain': appUrl,
                                'openai/widgetCSP': {
                                    connect_domains: [appUrl, 'https://appconnect.labs.ringcentral.com'],
                                    resource_domains: [appUrl],
                                },
                            },
                        }],
                    },
                };
                break;
            }

            case 'ping':
                response = { jsonrpc: '2.0', id, result: {} };
                break;

            case 'notifications/initialized':
            case 'notifications/cancelled':
                // JSON-RPC notifications — no id, no response expected
                return res.status(200).end();

            default:
                response = {
                    jsonrpc: '2.0',
                    id,
                    error: { code: JSON_RPC_METHOD_NOT_FOUND, message: `Method not found: ${method}` },
                };
        }

        res.status(200).json(response);
    } catch (error) {
        logger.error('Error handling MCP request:', { stack: error.stack });
        res.status(200).json({
            jsonrpc: '2.0',
            id: req.body?.id || null,
            error: {
                code: JSON_RPC_INTERNAL_ERROR,
                message: 'Internal server error',
                data: { error: error.message },
            },
        });
    }
}

/**
 * Handle widget tool calls via direct HTTP (bypasses MCP protocol).
 * The ChatGPT postMessage bridge does not forward tool arguments,
 * so the widget uses fetch() to this endpoint instead.
 */
async function handleWidgetToolCall(req, res) {
    try {
        logger.info('Widget tool call received. body:', JSON.stringify(req.body));

        const { tool: toolName, toolArgs: args } = req.body || {};

        logger.info('Widget tool call parsed:', { toolName, args: JSON.stringify(args) });

        if (!toolName) {
            return res.status(400).json({ success: false, error: 'Missing tool name' });
        }

        const allWidgetCallable = [...tools.tools, ...tools.widgetTools];
        const tool = allWidgetCallable.find(t => t.definition.name === toolName);
        if (!tool) {
            return res.status(404).json({ success: false, error: `Unknown tool: ${toolName}` });
        }

        const result = await tool.execute(args || {});
        logger.info('Widget tool call result:', { toolName, success: result?.success });
        res.json(result);
    } catch (error) {
        logger.error('Widget tool call error:', { stack: error.stack });
        res.status(500).json({
            success: false,
            error: error.message || 'Internal server error',
        });
    }
}

exports.handleMcpRequest = handleMcpRequest;
exports.handleWidgetToolCall = handleWidgetToolCall;
