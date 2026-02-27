/**
 * MCP Server for RC Unified CRM Extension
 * 
 * This module provides MCP (Model Context Protocol) interface for the CRM extension.
 * It exposes tools that can be called by AI assistants or other MCP clients.
 */
const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");
const { StreamableHTTPServerTransport } = require("@modelcontextprotocol/sdk/server/streamableHttp.js");
const { z } = require('zod');
const axios = require('axios');
const tools = require('./tools');
const { LlmSessionModel } = require('../models/llmSessionModel');
const logger = require('../lib/logger');
const fs = require('fs');
const path = require('path');

// Map to store sessions (server + transport pairs) by session ID
const sessions = new Map();

/**
 * Increment this to bust ChatGPT's widget resource cache after every UI build.
 * This is the single source of truth — mcpHandler injects it into the
 * getPublicConnectors tool's _meta at registration time so getPublicConnectors.js
 * never needs to be touched for a version bump.
 */
const WIDGET_VERSION = 6;
const WIDGET_URI = `ui://widget/ConnectorList-v${WIDGET_VERSION}.html`;

/**
 * Verify an RC access token and return the caller's extension ID.
 * Throws if the token is invalid (RC API returns a non-2xx response).
 * The result is cached in sessionContext so the RC API is only hit once
 * per MCP session regardless of how many tool calls are made.
 *
 * @param {string} rcAccessToken
 * @returns {Promise<string>} RC extension ID as a string
 */
async function resolveRcExtensionId(rcAccessToken) {
    const resp = await axios.get(
        'https://platform.ringcentral.com/restapi/v1.0/account/~/extension/~',
        { headers: { Authorization: `Bearer ${rcAccessToken}` } }
    );
    return resp.data?.id?.toString() ?? null;
}

/**
 * Create and configure a new MCP Server instance.
 * Each session needs its own server instance since the SDK only allows one transport per server.
 *
 * @param {Object} req - Express request object (for auth token access)
 * @returns {{ server: McpServer, sessionContext: { rcExtensionId: string|null } }}
 *   The configured server and a mutable context object that is shared with
 *   the sessions Map entry. `sessionContext.rcExtensionId` is populated lazily
 *   on the first tool call and cached for the lifetime of the session.
 */
function createMcpServer(req) {
    const sessionContext = { rcExtensionId: null };
    const mcpServer = new McpServer({
        name: 'rc-unified-crm-extension',
        version: '1.0.0'
    });

    // Get auth token from request for tool execution
    const rcAccessToken = req?.headers?.['authorization']?.split('Bearer ')?.[1];

    // ChatGPT stable conversation session ID (present in every tool call's _meta)
    const openaiSessionId = req?.body?.params?._meta?.['openai/session'] ?? null;

    // Zod input schemas for every tool.
    // Without a registered inputSchema, ChatGPT silently drops ALL arguments when
    // calling the tool, so every tool that accepts parameters must be listed here.
    const zodSchemas = {
        findContactByName: {
            name: z.string().describe('Name to search for'),
        },
        findContactByPhone: {
            phoneNumber: z.string().describe('Phone number in E.164 format (e.g. +14155551234)'),
            overridingFormat: z.string().optional().describe('Overriding format to search for'),
            isExtension: z.boolean().optional().describe('Whether the request is from an extension'),
        },
        createContact: {
            phoneNumber: z.string().describe('Phone number in E.164 format (e.g. +14155551234)'),
            newContactName: z.string().optional().describe('Full name of the new contact'),
        },
        createCallLog: {
            incomingData: z.json().optional().describe('Call log data to create'),
            contactId: z.string().optional().describe('CRM contact ID to attach the log to')
        },
        rcGetCallLogs: {
            timeFrom: z.string().describe('Start of time range in ISO 8601 format'),
            timeTo: z.string().describe('End of time range in ISO 8601 format'),
        },
        getGoogleFilePicker: {
            sheetName: z.string().optional().describe('Name of a new sheet to create'),
        },
        logout: {},
    };

    // Register each tool from the tools module
    for (const tool of tools.tools) {
        const { name, description, annotations, _meta } = tool.definition;

        // For getPublicConnectors, stamp the current WIDGET_URI into _meta so
        // ChatGPT renders the right versioned widget without touching the tool file.
        const toolMeta = name === 'getPublicConnectors'
            ? { ...(_meta || {}), 'openai/outputTemplate': WIDGET_URI }
            : _meta;

        mcpServer.registerTool(
            name,
            {
                description,
                annotations,
                _meta: toolMeta,
                ...(zodSchemas[name] ? { inputSchema: zodSchemas[name] } : {}),
            },
            async (params) => {
                const toolArgs = { ...params };
                if (rcAccessToken) {
                    toolArgs.rcAccessToken = rcAccessToken;
                }
                if (openaiSessionId) {
                    toolArgs.openaiSessionId = openaiSessionId;
                }

                // Lazily verify the RC access token once per session and cache
                // the resulting rcExtensionId in sessionContext.  Subsequent
                // tool calls within the same session skip the API call entirely.
                if (rcAccessToken && !sessionContext.rcExtensionId) {
                    try {
                        sessionContext.rcExtensionId = await resolveRcExtensionId(rcAccessToken);
                    } catch (err) {
                        logger.warn('Failed to resolve RC extension ID:', { message: err.message });
                    }
                }

                // Inject rcExtensionId and the matching jwtToken into every tool call.
                // When rcExtensionId is available, look up the JWT by that key.
                if (sessionContext.rcExtensionId) {
                    toolArgs.rcExtensionId = sessionContext.rcExtensionId;
                    if (!toolArgs.jwtToken) {
                        let llmSession = await LlmSessionModel.findByPk(sessionContext.rcExtensionId);
                        if (!llmSession?.jwtToken && openaiSessionId) {
                            const fallback = await LlmSessionModel.findByPk(openaiSessionId);
                            if (fallback?.jwtToken) {
                                // Migrate: store under the verified RC key for future calls
                                await LlmSessionModel.upsert({
                                    id: sessionContext.rcExtensionId,
                                    jwtToken: fallback.jwtToken,
                                });
                                llmSession = fallback;
                            }
                        }
                        if (llmSession?.jwtToken) {
                            toolArgs.jwtToken = llmSession.jwtToken;
                        }
                    }
                }

                const result = await tool.execute(toolArgs);

                // If tool returned structuredContent, return it at top level.
                // Preserve the tool's own content text if provided (e.g. checkAuthStatus
                // includes a JWT instruction for the model). Fall back to the generic
                // widget placeholder for render-only tools like getPublicConnectors.
                if (result?.structuredContent) {
                    return {
                        structuredContent: result.structuredContent,
                        content: Array.isArray(result.content)
                            ? result.content
                            : [
                                {
                                    type: 'text',
                                    text: '[Interactive widget displayed above - no additional response needed]'
                                }
                            ]
                    };
                }

                // Otherwise return as text content
                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify(result, null, 2)
                        }
                    ]
                };
            }
        );
    }

    // Register the widget resource
    const appUrl = process.env.APP_SERVER || 'https://localhost:6066';

    mcpServer.registerResource(
        'connector-list-widget',
        WIDGET_URI,
        {
            title: 'ConnectorList',
            description: 'ChatGPT widget for connector selection'
        },
        async () => {
            // Try to read the built dist/index.html first
            const distPath = path.join(__dirname, 'ui', 'dist', 'index.html');
            const devPath = path.join(__dirname, 'ui', 'index.html');

            let htmlContent;
            try {
                htmlContent = fs.readFileSync(distPath, 'utf8');
            } catch {
                htmlContent = fs.readFileSync(devPath, 'utf8');
            }

            return {
                contents: [
                    {
                        uri: WIDGET_URI,
                        mimeType: 'text/html+skybridge',
                        text: htmlContent,
                        _meta: {
                            'openai/widgetPrefersBorder': true,
                            'openai/widgetDomain': appUrl,
                            'openai/widgetCSP': {
                                connect_domains: [appUrl, 'https://appconnect.labs.ringcentral.com'],
                                resource_domains: [appUrl]
                            }
                        }
                    }
                ]
            };
        }
    );

    return { server: mcpServer, sessionContext };
}

/**
 * Handle incoming MCP HTTP requests using the SDK's StreamableHTTPServerTransport
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function handleMcpRequest(req, res) {
    try {
        logger.info('Received MCP request:', { method: req.body?.method });

        // Use the stable ChatGPT conversation ID as the session key so that
        // subsequent tool calls within the same conversation reuse the same
        // server/transport/sessionContext (including the cached rcExtensionId).
        const openaiSessionId = req.body?.params?._meta?.['openai/session'];
        let session;

        if (openaiSessionId && sessions.has(openaiSessionId)) {
            session = sessions.get(openaiSessionId);
        } else {
            const { server, sessionContext } = createMcpServer(req);
            const transport = new StreamableHTTPServerTransport({
                sessionIdGenerator: undefined,
                onsessioninitialized: (mcpSessionId) => {
                    // Prefer the stable ChatGPT conversation ID as the map key.
                    // Fall back to the MCP transport's own generated ID when no
                    // openai/session header is present (e.g. non-ChatGPT clients).
                    const key = openaiSessionId || mcpSessionId;
                    sessions.set(key, { server, transport, sessionContext });
                    logger.info('MCP session initialized:', { sessionId: key });
                }
            });

            // Set up cleanup on transport close
            transport.onclose = () => {
                const key = openaiSessionId || transport.sessionId;
                if (key) {
                    sessions.delete(key);
                    logger.info('MCP session closed:', { sessionId: key });
                }
            };

            // Connect server to transport
            await server.connect(transport);
            session = { server, transport, sessionContext };
        }

        // Let the transport handle the request
        await session.transport.handleRequest(req, res, req.body);

    } catch (error) {
        logger.error('Error handling MCP request:', { stack: error.stack });

        // Send JSON-RPC error response
        res.status(200).json({
            jsonrpc: '2.0',
            id: req.body?.id || null,
            error: {
                code: -32603,
                message: 'Internal server error',
                data: {
                    error: error.message,
                    stack: process.env.NODE_ENV !== 'production' ? error.stack : undefined
                }
            }
        });
    }
}

/**
 * Handle widget tool calls via direct HTTP (bypasses MCP protocol).
 * The ChatGPT postMessage bridge does not forward tool arguments,
 * so the widget uses fetch() to this endpoint instead.
 *
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
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
