/**
 * MCP Server for RC Unified CRM Extension
 * 
 * This module provides MCP (Model Context Protocol) interface for the CRM extension.
 * It exposes tools that can be called by AI assistants or other MCP clients.
 */

const tools = require('./tools');
const logger = require('../lib/logger');

const JSON_RPC_INTERNAL_ERROR = -32603;
const JSON_RPC_METHOD_NOT_FOUND = -32601;

async function handleMcpRequest(req, res) {
    try {
        const { method, params, id } = req.body;
        logger.info('Received MCP request:', { method });

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
                            prompts: {}
                        },
                        serverInfo: {
                            name: 'rc-unified-crm-extension',
                            version: '1.0.0'
                        }
                    }
                };
                break;
            case 'tools/list':
                response = {
                    jsonrpc: '2.0',
                    id,
                    result: {
                        tools: getTools()
                    }
                };
                break;
            case 'tools/call':
                const { name: toolName, arguments: args } = params;
                try {
                    const result = await executeTool(toolName, args || {});
                    response = {
                        jsonrpc: '2.0',
                        id,
                        result: {
                            content: [
                                {
                                    type: 'text',
                                    text: JSON.stringify(result, null, 2)
                                }
                            ]
                        }
                    };
                } catch (toolError) {
                    response = {
                        jsonrpc: '2.0',
                        id,
                        error: {
                            code: JSON_RPC_INTERNAL_ERROR,
                            message: `Tool execution failed: ${toolError.message}`,
                            data: {
                                error: toolError.message,
                                stack: process.env.NODE_ENV !== 'production' ? toolError.stack : undefined
                            }
                        }
                    };
                }
                break;
            case 'ping':
                response = {
                    jsonrpc: '2.0',
                    id,
                    result: {}
                };
                break;
            default:
                response = {
                    jsonrpc: '2.0',
                    id,
                    error: {
                        code: JSON_RPC_METHOD_NOT_FOUND,
                        message: `Method not found: ${method}`
                    }
                };
        }

        res.status(200).json(response);
    } catch (error) {
        logger.error('Error handling MCP request:', { stack: error.stack });
        const errorResponse = {
            jsonrpc: '2.0',
            id: req.body?.id || null,
            error: {
                code: JSON_RPC_INTERNAL_ERROR,
                message: 'Internal server error',
                data: {
                    error: error.message,
                    stack: process.env.NODE_ENV !== 'production' ? error.stack : undefined
                }
            }
        };
        res.status(200).json(errorResponse);
    }
}


/**
 * Get all registered MCP tools
 * @returns {Array} Array of tool definitions
 */
function getTools() {
    return tools.tools.map(tool => tool.definition);
}

/**
 * Execute a specific MCP tool
 * @param {string} toolName - Name of the tool to execute
 * @param {Object} args - Arguments to pass to the tool
 * @returns {Promise<Object>} Tool execution result
 */
async function executeTool(toolName, args) {
    // Find the tool by name
    const tool = tools.tools.find(t => t.definition.name === toolName);

    if (!tool) {
        throw new Error(`Tool not found: ${toolName}`);
    }

    // Execute the tool
    return await tool.execute(args);
}

/**
 * Get a specific tool definition
 * @param {string} toolName - Name of the tool
 * @returns {Object} Tool definition
 */
function getToolDefinition(toolName) {
    const tool = tools.tools.find(t => t.definition.name === toolName);

    if (!tool) {
        throw new Error(`Tool not found: ${toolName}`);
    }

    return tool.definition;
}

exports.handleMcpRequest = handleMcpRequest;
exports.getTools = getTools;
exports.executeTool = executeTool;
exports.getToolDefinition = getToolDefinition;
exports.tools = tools.tools;