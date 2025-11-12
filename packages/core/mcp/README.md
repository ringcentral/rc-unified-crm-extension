# MCP Tools for RC Unified CRM Extension

This directory contains MCP (Model Context Protocol) tools that provide programmatic access to CRM extension functionality.

## Overview

MCP is a standard protocol for AI assistants and applications to interact with external tools and services. These tools expose CRM extension capabilities in a structured, callable format.

## Available Tools

### getImplementedInterfaces

Returns which interfaces/methods are implemented by a specific CRM platform connector.

**Input:**
```json
{
  "jwtToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Output:**
```json
{
  "success": true,
  "data": {
    "getAuthType": true,
    "getOauthInfo": true,
    "getUserInfo": true,
    "createCallLog": true,
    "updateCallLog": true,
    "getCallLog": true,
    "createMessageLog": true,
    "updateMessageLog": false,
    "createContact": true,
    "findContact": true,
    "unAuthorize": true,
    "upsertCallDisposition": false,
    "findContactWithName": true,
    "getUserList": true,
    "getLicenseStatus": false,
    "getLogFormatType": true
  },
  "platform": "salesforce",
  "authType": "oauth"
}
```

## Usage

### As a Module

```javascript
const mcp = require('./packages/core/mcp');

// Get all available tools
const tools = mcp.getTools();
console.log('Available tools:', tools.map(t => t.name));

// Execute a tool
const result = await mcp.executeTool('getImplementedInterfaces', {
  jwtToken: 'your-jwt-token-here'
});

console.log('Result:', result);
```

### As an MCP Server

```javascript
const mcp = require('./packages/core/mcp');

// In your MCP server implementation
app.post('/mcp/tools/list', (req, res) => {
  const tools = mcp.getTools();
  res.json({ tools });
});

app.post('/mcp/tools/execute', async (req, res) => {
  const { toolName, args } = req.body;
  try {
    const result = await mcp.executeTool(toolName, args);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});
```

## Adding New Tools

To add a new MCP tool:

1. Create a new file in `tools/` directory (e.g., `tools/myNewTool.js`)
2. Export the tool definition and execute function:

```javascript
const toolDefinition = {
    name: 'myNewTool',
    description: 'Description of what this tool does',
    inputSchema: {
        type: 'object',
        properties: {
            param1: {
                type: 'string',
                description: 'Description of param1'
            }
        },
        required: ['param1']
    }
};

async function execute(args) {
    // Tool implementation
    return { success: true, data: {} };
}

module.exports = {
    definition: toolDefinition,
    execute
};
```

3. Add the tool to `tools/index.js`:

```javascript
const myNewTool = require('./myNewTool');

module.exports.tools = [
    getImplementedInterfaces,
    myNewTool  // Add here
];
```

## Architecture

```
mcp/
├── index.js              # Main MCP server interface
├── tools/                # Individual MCP tools
│   ├── index.js          # Tools registry
│   └── getImplementedInterfaces.js
└── README.md             # This file
```

## Error Handling

All tools return a consistent response format:

**Success:**
```json
{
  "success": true,
  "data": { ... }
}
```

**Error:**
```json
{
  "success": false,
  "error": "Error message",
  "errorDetails": "Stack trace (in development)"
}
```

## Dependencies

These MCP tools depend on the following core modules:
- `lib/jwt` - JWT token encoding/decoding
- `connector/registry` - CRM connector registry

## Testing

```bash
# Run tests for MCP tools
npm test -- mcp
```

