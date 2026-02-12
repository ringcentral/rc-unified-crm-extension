/**
 * MCP Server for RC Unified CRM Extension
 * 
 * This module provides MCP (Model Context Protocol) interface for the CRM extension.
 * It exposes tools that can be called by AI assistants or other MCP clients.
 */
const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");
const { StreamableHTTPServerTransport } = require("@modelcontextprotocol/sdk/server/streamableHttp.js");
const tools = require('./tools');
const logger = require('../lib/logger');
const fs = require('fs');
const path = require('path');

// Map to store sessions (server + transport pairs) by session ID
const sessions = new Map();

/**
 * Create and configure a new MCP Server instance
 * Each session needs its own server instance since the SDK only allows one transport per server
 * @param {Object} req - Express request object (for auth token access)
 * @returns {McpServer} Configured MCP Server
 */
function createMcpServer(req) {
    const mcpServer = new McpServer({
        name: 'rc-unified-crm-extension',
        version: '1.0.0'
    });

    // Get auth token from request for tool execution
    const rcAccessToken = req?.headers?.['authorization']?.split('Bearer ')?.[1];

    // Register each tool from the tools module
    // Note: Don't pass inputSchema to registerTool - it expects Zod schemas, not JSON Schema
    // ChatGPT gets the parameter info from description and _meta
    for (const tool of tools.tools) {
        const { name, description, annotations, _meta } = tool.definition;
        
        mcpServer.registerTool(
            name,
            {
                description,
                annotations,
                _meta
            },
            async (params) => {
                // Add auth token to params if available
                const toolArgs = { ...params };
                if (rcAccessToken) {
                    toolArgs.rcAccessToken = rcAccessToken;
                }

                const result = await tool.execute(toolArgs);

                // If tool returned structuredContent, return it at top level
                // This is the format ChatGPT expects for widget rendering
                if (result?.structuredContent) {
                    return {
                        structuredContent: result.structuredContent,
                        content: [
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
        'ui://widget/ConnectorList.html',
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
                        uri: 'ui://widget/ConnectorList.html',
                        mimeType: 'text/html+skybridge',
                        text: htmlContent,
                        _meta: {
                            'openai/widgetPrefersBorder': true,
                            'openai/widgetDomain': appUrl,
                            'openai/widgetCSP': {
                                connect_domains: [appUrl],
                                resource_domains: [appUrl]
                            }
                        }
                    }
                ]
            };
        }
    );

    return mcpServer;
}

/**
 * Handle incoming MCP HTTP requests using the SDK's StreamableHTTPServerTransport
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function handleMcpRequest(req, res) {
    try {
        logger.info('Received MCP request:', { method: req.body?.method });

        // Check for existing session
        const sessionId = req.body?.params?._meta?.['openai/session'];
        let session;

        if (sessionId && sessions.has(sessionId)) {
            // Reuse existing session
            session = sessions.get(sessionId);
        } else {
            // Create new server and transport for new session
            const server = createMcpServer(req);
            const transport = new StreamableHTTPServerTransport({
                sessionIdGenerator: undefined,
                onsessioninitialized: (newSessionId) => {
                    sessions.set(newSessionId, { server, transport });
                    logger.info('MCP session initialized:', { sessionId: newSessionId });
                }
            });

            // Set up cleanup on transport close
            transport.onclose = () => {
                const sid = transport.sessionId;
                if (sid) {
                    sessions.delete(sid);
                    logger.info('MCP session closed:', { sessionId: sid });
                }
            };

            // Connect server to transport
            await server.connect(transport);
            session = { server, transport };
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

exports.handleMcpRequest = handleMcpRequest;