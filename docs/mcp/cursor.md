# Using App Connect and Cursor

!!! warning "The App Connect MCP server is currently in alpha. Feedback welcome."

## Manual setup

1. Go to **Settings** > **Tools & MCP** > **New MCP Server** to open `~/.cursor/mcp.json`
2. Add the following:
    ```json
	{
       "mcpServers": {
          "appconnect": {
             "command": "npx",
             "args": ["-y", "mcp-remote", "https://unified-crm-extension.labs.ringcentral.com/mcp"]
          }
       }
    }
	```
3. Save the file - then follow the prompts to authenticate to RingCentral
