# MCP Module Documentation

## Overview

The MCP (Model Context Protocol) module provides an AI assistant interface for the RingCentral Unified CRM Extension. It enables AI assistants like ChatGPT to interact with the CRM integration through a standardized protocol, allowing users to authenticate, manage contacts, and log calls via conversational AI.

## Architecture

```
packages/core/mcp/
├── mcpHandler.js          # Main MCP server handler + WIDGET_VERSION constant
├── lib/
│   └── validator.js       # Connector manifest validation
├── tools/                 # MCP tool implementations
│   ├── index.js           # Tool registry (tools + widgetTools)
│   ├── getHelp.js         # Help/onboarding tool
│   ├── getPublicConnectors.js  # Triggers widget, resolves RC account ID + rcExtensionId + openaiSessionId
│   ├── doAuth.js          # OAuth session creation (widget-only)
│   ├── checkAuthStatus.js # Poll OAuth status (widget-only)
│   ├── logout.js          # Logout from CRM
│   ├── findContactByPhone.js  # Search contact by phone
│   ├── findContactByName.js   # Search contact by name
│   ├── createContact.js   # Create new contact
│   ├── createCallLog.js   # Create call log entry
│   ├── rcGetCallLogs.js   # Fetch RingCentral call logs
│   ├── getGoogleFilePicker.js # Google Sheets picker (disabled)
│   ├── getCallLog.js      # Get call log (disabled)
│   ├── updateCallLog.js   # Update call log (disabled)
│   └── createMessageLog.js # Create message log (disabled)
└── ui/                    # ChatGPT Widget UI
    ├── index.html         # Entry HTML
    ├── package.json       # UI dependencies
    ├── vite.config.ts     # Vite build config
    ├── App/
    │   ├── root.tsx       # React entry point
    │   ├── App.tsx        # Multi-step auth flow orchestrator
    │   ├── main.css       # Tailwind + OpenAI styles
    │   ├── lib/
    │   │   ├── callTool.ts         # Direct fetch to /mcp/widget-tool-call
    │   │   ├── developerPortal.ts  # Client-side developer portal API calls
    │   │   └── debugLog.ts         # Debug logger
    │   └── components/
    │       ├── ConnectorList.tsx  # Connector selection widget
    │       ├── AuthInfoForm.tsx   # Hostname/environment input form
    │       ├── OAuthConnect.tsx   # OAuth link + status polling
    │       ├── AuthSuccess.tsx    # Success banner
    │       └── DebugPanel.tsx     # Collapsible debug log panel
    └── dist/              # Built widget output
```

## Core Components

### MCP Handler (`mcpHandler.js`)

A stateless, hand-rolled JSON-RPC handler — no `@modelcontextprotocol/sdk`, no SSE, no in-memory sessions. Each POST request is handled independently, making it fully compatible with stateless deployments like AWS Lambda.

**Key Features:**
- Defines `WIDGET_VERSION` — the **single source of truth** for the widget cache-busting URI
- Handles `initialize`, `tools/list`, `tools/call`, `resources/list`, `resources/read`, and `ping` methods
- Defines `inputSchema` (JSON Schema) for every tool that takes parameters — required so ChatGPT forwards arguments
- Injects `rcAccessToken`, `openaiSessionId`, and `rcExtensionId` into every `tools/call` request
- Verifies the RC access token against the RC API and caches `rcExtensionId` in `CacheModel` keyed by `openaiSessionId` (24h TTL) — subsequent requests hit the cache instead of the RC API
- Automatically looks up and injects `jwtToken` from `LlmSessionModel` using `rcExtensionId` (or `openaiSessionId` as a fallback)
- Stamps `WIDGET_URI` into `getPublicConnectors`'s `_meta['openai/outputTemplate']` at response time
- Serves the widget HTML via `resources/read`
- Exposes `handleWidgetToolCall` which searches both `tools.tools` and `tools.widgetTools`

**Request Flow:**
1. Receives `POST /mcp` with a JSON-RPC body
2. Extracts `rcAccessToken` from `Authorization` header and `openaiSessionId` from `params._meta['openai/session']`
3. On `tools/call`: checks `CacheModel` for a cached `rcExtensionId`; if missing, verifies via RC API and persists to cache
4. Injects server-side context (`rcAccessToken`, `openaiSessionId`, `rcExtensionId`, `jwtToken`) into tool args
5. Routes to the appropriate tool handler via a `switch` on `method`
6. Returns a JSON-RPC response immediately — no streaming, no SSE

### Widget Version Management

`WIDGET_VERSION` in `mcpHandler.js` is the **only place** that needs to change when bumping the widget version:

```js
// mcpHandler.js
const WIDGET_VERSION = 6;
const WIDGET_URI = `ui://widget/ConnectorList-v${WIDGET_VERSION}.html`;
```

At registration time, `mcpHandler.js` stamps `WIDGET_URI` into `getPublicConnectors`'s `_meta['openai/outputTemplate']`. `getPublicConnectors.js` itself does **not** contain a version number.

**To deploy a new widget build:**
1. Rebuild the widget: `cd packages/core/mcp/ui && npm run build`
2. Increment `WIDGET_VERSION` in `mcpHandler.js`
3. Restart the server

### Manifest Validator (`lib/validator.js`)

Validates connector manifest structures before authentication operations.

## MCP Tools

### Tool Registry

Tools are split into two registries in `tools/index.js`:

| Registry | Purpose |
|----------|---------|
| `tools` | Registered in the MCP server — visible to and callable by the AI model |
| `widgetTools` | Accessible only via `POST /mcp/widget-tool-call` — hidden from the AI model |

### Argument Handling

`mcpHandler.js` automatically injects server-side values into every tool's args before calling `execute()`:

| Injected arg | Source | Purpose |
|---|---|---|
| `rcAccessToken` | `Authorization` request header | RingCentral API calls |
| `openaiSessionId` | `params._meta['openai/session']` | Stable ChatGPT conversation ID |
| `rcExtensionId` | RC API (`/extension/~`), verified once and cached in `sessionContext` | Cryptographically verified RC identity; used as `LlmSessionModel` key |
| `jwtToken` | `LlmSessionModel.findByPk(rcExtensionId)` (fallback: `findByPk(openaiSessionId)`) | CRM auth token (after OAuth) |

Tools do **not** need ChatGPT to pass `jwtToken` explicitly — it is resolved from the session automatically. The `rcExtensionId` is verified via the RC API on the **first tool call** of each session and cached for all subsequent calls within the same conversation (0 additional API calls after that).

Note: `widgetTools` are called via `POST /mcp/widget-tool-call` which bypasses the MCP session layer entirely. No server-side injection occurs for widget tool calls — all required values must be passed explicitly by the widget in the request body.

### AI-Visible Tools (`tools`)

#### `getHelp`
Provides onboarding guidance for new users.

| Property | Value |
|----------|-------|
| Read-only | Yes |
| Parameters | None |
| Returns | Overview, steps |

#### `getPublicConnectors`
Triggers the interactive connector selection widget. The widget fetches the connector list and manifests directly from the developer portal on the client side.

| Property | Value |
|----------|-------|
| Read-only | Yes |
| Parameters | None (server injects `rcAccessToken` and `openaiSessionId`) |
| Returns | `structuredContent` with `serverUrl`, `rcAccountId`, `rcExtensionId`, and `openaiSessionId` |
| Widget | `ui://widget/ConnectorList-v{WIDGET_VERSION}.html` (versioned by `mcpHandler.js`) |

#### `logout`
Logs out user from the CRM platform.

| Property | Value |
|----------|-------|
| Destructive | Yes |
| Parameters | `jwtToken` (optional — injected from session if not passed) |
| Action | Clears user credentials |

#### Contact & Call Log Tools

`jwtToken` is injected automatically from the session — ChatGPT does not need to pass it:

| Tool | Parameters | Description |
|------|-----------|-------------|
| `findContactByPhone` | `phoneNumber` (E.164) | Search contact by phone |
| `findContactByName` | `name` | Search contact by name |
| `createContact` | `phoneNumber`, `newContactName?` | Create new CRM contact |
| `rcGetCallLogs` | `timeFrom`, `timeTo` (ISO 8601) | Fetch RingCentral call logs |
| `createCallLog` | `incomingData?`, `contactId?`, `contactType?`, `note?` | Create call log in CRM |

### Widget-Only Tools (`widgetTools`)

Not registered in the MCP server; only callable by the widget iframe via `POST /mcp/widget-tool-call`. No server-side arg injection — the widget passes all required values directly.

#### `doAuth`
Creates a server-side OAuth session for the given `sessionId`.

| Property | Value |
|----------|-------|
| Parameters | `sessionId`, `connectorName`, `hostname` |
| Returns | `{ success: true }` |
| Note | The widget generates `sessionId` and the OAuth URL client-side; `doAuth` just registers the session in the DB so the callback can resolve it |

#### `checkAuthStatus`
Polls the OAuth session status. Called exclusively by the widget during the OAuth flow — the AI model never calls this directly.

| Property | Value |
|----------|-------|
| Parameters | `sessionId`, `rcExtensionId?` (passed by widget from `getPublicConnectors` structuredContent) |
| Returns | `{ data: { status, ... } }` for all states |
| On Success | `data.jwtToken` and `data.userInfo` included; JWT stored in `LlmSessionModel` keyed by `rcExtensionId` |
| Statuses | `pending` · `completed` · `failed` — all return consistent `{ data: { status } }` for reliable widget parsing |

## ChatGPT Widget UI

The UI module provides a single interactive widget that drives the full authentication flow inside a ChatGPT iframe. Users select a connector, provide any required environment info, authorize via OAuth (opened in a new tab), and see a success confirmation — all without leaving the widget.

### Technology Stack
- **React 18** with TypeScript
- **Vite** with `vite-plugin-singlefile` for self-contained HTML
- **Tailwind CSS 4** with `@openai/apps-sdk-ui` components
- **OpenAI Apps SDK UI** for consistent ChatGPT styling

### Widget Communication

**1. Receiving the initial server context** — via four mechanisms (whichever fires first):

| Mechanism | Description |
|-----------|-------------|
| `window.openai.toolOutput` | Synchronous read on mount |
| `openai:set_globals` event | ChatGPT pushes globals into the iframe |
| `ui/notifications/tool-result` postMessage | MCP Apps bridge notification |
| Polling `window.openai.toolOutput` | Fallback for async population |

The initial payload is `{ serverUrl, rcAccountId, rcExtensionId, openaiSessionId }`.

**2. Fetching connectors and manifests** — via direct `fetch()` to `appconnect.labs.ringcentral.com`:

```typescript
import { fetchConnectors, fetchManifest } from './lib/developerPortal'

const connectors = await fetchConnectors(rcAccountId)      // list with id, name, displayName
const manifest   = await fetchManifest(connector.id, isPrivate, rcAccountId)
```

**3. Calling widget tools** — via direct `fetch()` to `POST /mcp/widget-tool-call`:

```typescript
import { callTool } from './lib/callTool'

const result = await callTool('doAuth', { sessionId, connectorName, hostname })
const status = await callTool('checkAuthStatus', { sessionId, rcExtensionId })
```

`window.openai.callTool()` is **intentionally not used** for widget tool calls. Direct `fetch()` to `/mcp/widget-tool-call` forwards all arguments correctly and works for both `doAuth` and `checkAuthStatus`.

### Widget Auth Flow

The widget (`App.tsx`) acts as a multi-step wizard:

```
loadingConnectors → select → loading → authInfo (if dynamic/selectable env) → oauth → success
                                     → oauth (if fixed env)                          → error
```

| Step | Component | Description |
|------|-----------|-------------|
| `loadingConnectors` | (spinner) | Widget fetches connector list from developer portal |
| `select` | `ConnectorList` | Displays available connectors |
| `loading` | (spinner) | Shown while manifest is being fetched |
| `authInfo` | `AuthInfoForm` | Collects hostname (dynamic) or environment (selectable). Resolved locally — no server call |
| `oauth` | `OAuthConnect` | Uses `openaiSessionId` as the OAuth session ID (falls back to `crypto.randomUUID()`). Generates the OAuth URL client-side, calls `doAuth` in background to register the session in the DB, then shows "Authorize" button. After click, polls `checkAuthStatus` every 5 seconds via direct fetch |
| `success` | `AuthSuccess` | Shows connected CRM name and user info |
| `error` | (inline) | Shows error with "Back to connector list" link |

### Components

#### ConnectorList
Displays available CRM connectors with public/private badges. On selection, delegates to `App.tsx` which fetches the manifest directly.

#### AuthInfoForm
Form for environment info collection. Handles `dynamic` (text input) and `selectable` (button list) environment types. Hostname resolution happens inline in `App.tsx`.

#### OAuthConnect
Handles the full OAuth step. Uses `openaiSessionId` (from the initial tool output) as the session ID so the OAuth callback can be correlated with the ChatGPT conversation — falls back to `crypto.randomUUID()` when running outside ChatGPT. Calls `doAuth` in the background, shows an "Authorize in [CRM]" button (disabled until session is created), then polls `checkAuthStatus` every 5 seconds via `callTool()` (direct fetch). On success, fires `updateModelContext` to push the jwtToken into ChatGPT's context, then calls `onSuccess`.

#### AuthSuccess
Success banner showing the connected CRM name and optional user info.

### Developer Portal Client (`lib/developerPortal.ts`)

Calls `appconnect.labs.ringcentral.com/public-api` directly from the browser:

| Function | Description |
|----------|-------------|
| `fetchConnectors(rcAccountId?)` | Fetches public + private connectors, filters to `SUPPORTED_PLATFORMS` |
| `fetchManifest(connectorId, isPrivate, rcAccountId?)` | Fetches connector manifest by ID |

`SUPPORTED_PLATFORMS` is defined in this file: `['clio']`.

### Building the Widget

**Production build** (generates `dist/index.html` with all JS, CSS, and assets inlined):

```bash
cd packages/core/mcp/ui
npm install
npm run build  # Output: dist/index.html (single file)
```

**Development server** (hot reload for local testing):

```bash
cd packages/core/mcp/ui
npm run dev
```

**Cache busting after a build:** Increment `WIDGET_VERSION` in `mcpHandler.js` and restart the server. That is the only file that needs to change — `getPublicConnectors.js` and the README do not contain a version number.

## API Integration

### Endpoints

| Endpoint | Purpose |
|----------|---------|
| `POST /mcp` | Full MCP protocol endpoint for AI assistants (ChatGPT, etc.) |
| `POST /mcp/widget-tool-call` | Lightweight direct tool call for the widget iframe (bypasses MCP session protocol) |

#### `POST /mcp/widget-tool-call`

Called by the widget via `fetch()` to invoke `doAuth` and `checkAuthStatus` with full argument support.

**`doAuth` request:**
```json
{
  "tool": "doAuth",
  "toolArgs": {
    "sessionId": "<openaiSessionId or random UUID>",
    "connectorName": "clio",
    "hostname": "app.clio.com"
  }
}
```

**`checkAuthStatus` request:**
```json
{
  "tool": "checkAuthStatus",
  "toolArgs": {
    "sessionId": "<same sessionId used in doAuth>",
    "rcExtensionId": "<from getPublicConnectors structuredContent>"
  }
}
```

**Response:** The raw result from `tool.execute()` — shape varies by tool.

### Headers (for `/mcp`)

| Header | Value |
|--------|-------|
| `Content-Type` | `application/json` |
| `Authorization` | `Bearer <RC_ACCESS_TOKEN>` (optional, for RingCentral API calls) |

## Supported Platforms

Currently supported for MCP integration:
- **Clio** - Legal practice management

## Security Considerations

1. **JWT Tokens**: Stored server-side in `LlmSessionModel`, **keyed by `rcExtensionId`** (a cryptographically verified RingCentral identity). Tools receive the JWT via server injection — it is never sent back to ChatGPT as a visible parameter.
2. **RC Identity Verification**: On the first tool call of each session, `mcpHandler.js` calls `GET /restapi/v1.0/extension/~` with the Bearer token from the request. If the RC token is invalid, the call throws and `rcExtensionId` remains `null`. The result is cached in `sessionContext` so at most **one RC API call** is made per conversation.
3. **Session key binding**: The sessions Map is keyed on the stable `openai/session` ID so the same `sessionContext` (and its verified `rcExtensionId`) is reused for all tool calls within a ChatGPT conversation. A session can only access credentials stored under its own verified `rcExtensionId`.
4. **Session Management**: MCP sessions are server-side and automatically cleaned up on transport close.
5. **OAuth Flows**: Uses secure OAuth 2.0 with server-side callback handling.
6. **RC Account ID**: Resolved server-side via RC API and passed to the widget — never requires exposing secrets to the browser.
7. **CORS**: Widget calls `appconnect.labs.ringcentral.com` directly; the developer portal public API supports browser fetch.

| | Before | After |
|---|---|---|
| Identity proof | `openai/session` (unverified, from request body) | `rcExtensionId` (verified via RC API) |
| RC token verified? | No | Yes — first tool call per conversation |
| API calls per session | 0 (no verify) | 1 (cached after first call) |
| `LlmSessionModel` key | arbitrary session ID | stable, verified RC extension ID |

## Error Handling

All tools return standardized response objects:

**Success:**
```json
{ "success": true, "data": { ... } }
```

**Failure:**
```json
{ "success": false, "error": "Error message" }
```

## Usage Example

A typical conversation flow:

1. **User**: "Connect me to my CRM"
2. **AI**: Calls `getPublicConnectors` → server verifies RC token, resolves `rcExtensionId` + RC account ID + `openaiSessionId` → shows widget
3. **Widget**: Fetches connector list from developer portal → displays connector cards
4. **User**: Clicks "Clio" in the widget
5. **Widget**: Fetches Clio manifest → shows environment selector (US/EU/AU/CA)
6. **User**: Selects region → widget calls `doAuth` with `openaiSessionId` as OAuth session key → shows "Authorize in Clio" button
7. **User**: Clicks button → Clio OAuth page opens in new tab → user authorizes
8. **Widget**: Polls `checkAuthStatus` every 5 seconds via direct fetch (passes `sessionId` + `rcExtensionId`) → "Waiting for authorization..."
9. **Widget**: Auth completes → jwtToken stored in `LlmSessionModel[rcExtensionId]` → widget fires `updateModelContext` with jwtToken → shows success banner
10. **AI**: "You're now connected! What would you like to do?"
11. **User**: "Find contacts named Test"
12. **AI**: Calls `findContactByName(name="Test")` — server injects jwtToken automatically using cached `rcExtensionId` as lookup key → returns results

Steps 3–9 happen entirely within the widget iframe. The AI assistant is not involved until authentication is complete.
