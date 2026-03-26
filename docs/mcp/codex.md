# Using App Connect and Codex

!!! warning "The App Connect MCP server is currently in alpha. Feedback welcome."

## Manual setup

1. Go to **Settings** > **MCP Servers** > **Add Server**
2. Enter a name (we recommend App Connect!), and select "Streamable HTTP"
3. Enter your region's MCP Server URL and click Save

## Setting up the Codex CLI

Add the following to `~/.codex/config.toml`:

```
[mcp_servers.appconnect]
url = "https://unified-crm-extension.labs.ringcentral.com/mcp"
```

Then authorize:

```sh
codex mcp login appconnect
```
