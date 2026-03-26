# Using App Connect and Gemini

!!! warning "The App Connect MCP server is currently in alpha. Feedback welcome."

## Manual setup

Execute the following command:

```sh
gemini mcp add appconnect npx -y mcp-remote https://unified-crm-extension.labs.ringcentral.com/mcp
```

Or, edit `~/.gemini/settings.json` and manually add the following:

```js
{
  "mcpServers": {
    "mixpanel": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://unified-crm-extension.labs.ringcentral.com/mcp"]
    }
  }
}
```
