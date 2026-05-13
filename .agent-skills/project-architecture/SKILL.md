---
name: project-architecture
description: "Navigates the RingCentral App Connect monorepo to locate files, trace request flows through Express routes to handlers and models, explain package dependencies, and scaffold new CRM connectors. Use when asking about project structure, where code lives, how packages connect, or how to add new connectors, routes, or models."
---

# Project Architecture

## Repository Structure

```
rc-unified-crm-extension/
├── packages/                    # Monorepo packages
│   ├── core/                    # @app-connect/core - shared business logic
│   │   ├── handlers/            # Business logic handlers
│   │   ├── models/              # Sequelize data models
│   │   ├── lib/                 # Utilities (jwt, analytics, logger, etc.)
│   │   ├── connector/           # Connector registry
│   │   └── mcp/                 # MCP (Model Context Protocol) tools
│   ├── cli/                     # CLI tools for project setup
│   └── template/                # Template for new connector projects
├── src/                         # Main development server
│   ├── connectors/              # CRM connector implementations
│   ├── plugins/                 # Data plugins
│   ├── index.js                 # App entry point
│   ├── server.js                # Express server
│   └── lambda.js                # AWS Lambda handler
├── serverless-deploy/           # Production deployment
├── serverless-deploy-test/      # Test environment deployment
├── docs/                        # Documentation (MkDocs)
└── tests/                       # Integration tests
```

## Core Package (@app-connect/core)

### Entry Point Usage

```javascript
const { createCoreApp, connectorRegistry } = require('@app-connect/core');

// Set manifest before registering connectors
connectorRegistry.setDefaultManifest(manifest);
connectorRegistry.registerConnector('myCRM', myCRMConnector, manifest);

// Create Express app with all core functionality
const app = createCoreApp();
```

Key directories: `handlers/` (auth, contact, log, admin, user, disposition, calldown, plugin), `models/` (user, callLog, messageLog, adminConfig, cache, accountData, callDownList, llmSession), `lib/` (jwt, analytics, logger, constants, callLogComposer, errorHandler, oauth, ringcentral, util).

See [REFERENCE.md](REFERENCE.md) for full handler, model, and library tables.

## Connector Registry

The connector registry manages CRM connector lifecycle:

```javascript
const { connectorRegistry } = require('@app-connect/core');

// Register a connector
connectorRegistry.registerConnector('platformName', connectorModule, manifest);

// Register interface functions (extend without modifying original)
connectorRegistry.registerConnectorInterface('platformName', 'createCallLog', customFn);

// Get composed connector
const connector = connectorRegistry.getConnector('platformName');
```

## Request Flow

Incoming requests follow this path:

1. **Express route** (`src/server.js` or core routes) receives the HTTP request
2. **Handler** (`packages/core/handlers/`) validates input and executes business logic
3. **Connector** (`src/connectors/<crm>/`) calls the external CRM API
4. **Model** (`packages/core/models/`) persists results to the database
5. **Response** returns through the handler back to the caller

**Example — tracing `POST /callLog`:**
`POST /callLog` → `packages/core/handlers/log.js:createCallLog()` → composes log via `lib/callLogComposer.js` → calls `connector.createCallLog()` in `src/connectors/<crm>/` → persists via `CallLogModel` → returns response.

## API Routes

Core route groups: **Auth** (`/authValidation`, `/oauth-callback`, `/apiKeyLogin`, `/unAuthorize`), **Contacts** (`/contact`, `/custom/contact/search`), **Logging** (`/callLog`, `/callDisposition`, `/messageLog`), **Settings** (`/user/settings`, `/admin/settings`).

See [REFERENCE.md](REFERENCE.md) for full route listing with methods.

## Adding a New CRM Connector

1. Copy an existing connector directory (e.g. `src/connectors/pipedrive/`) to `src/connectors/<new-crm>/`
2. Implement the required interface methods (see `packages/template/src/connectors/myCRM.js`):
   `getAuthType`, `getBasicAuth` or `getOauthInfo`, `getUserInfo`, `unAuthorize`, `findContact`, `findContactWithName`, `createContact`, `createCallLog`, `getCallLog`, `updateCallLog`, `createMessageLog`, `updateMessageLog`, `upsertCallDisposition`, `getUserList`
3. Register the connector in `src/index.js`:
   ```javascript
   connectorRegistry.registerConnector('newCrm', require('./connectors/newCrm'), manifest);
   ```
4. Add CRM-specific environment variables to your `.env`
5. Run `npm test` to verify the interface contract is satisfied
6. Run `npm run server` → test the OAuth flow via `GET /authValidation`

Existing connectors for reference: `bullhorn`, `clio`, `googleSheets`, `insightly`, `netsuite`, `pipedrive`, `redtail`.

## Environment Variables

Key groups: `DATABASE_URL`, `APP_SERVER_SECRET_KEY`, `HASH_KEY`, `IS_PROD`, `DYNAMODB_LOCALHOST`, plus CRM-specific credentials (e.g. `PIPEDRIVE_CLIENT_ID`).

See [REFERENCE.md](REFERENCE.md) for full variable listing.

## Development Workflow

```bash
# Start local server
npm run server

# Start ngrok tunnel
npm run ngrok

# Run tests
npm test

# Build for deployment
npm run build

# Deploy
npm run deploy
```

## Database

- **Development**: SQLite (`db.sqlite`)
- **Production**: PostgreSQL via Sequelize ORM
- **Cache/Locks**: DynamoDB (local via `npm run dynamo-local`)

