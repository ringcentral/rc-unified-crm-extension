---
name: project-architecture
description: Use this skill to understand the RingCentral App Connect project structure, including the monorepo layout, core package APIs, handlers, models, and how components interact.
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

### Handlers (packages/core/handlers/)

| Handler | File | Purpose |
|---------|------|---------|
| Auth | `auth.js` | OAuth flow, token refresh, API key auth |
| Contact | `contact.js` | Contact search, matching, creation |
| Log | `log.js` | Call/message logging, updates |
| Admin | `admin.js` | Admin settings, user mappings |
| User | `user.js` | User settings, preferences |
| Disposition | `disposition.js` | Call dispositions |

### Models (packages/core/models/)

| Model | File | Purpose |
|-------|------|---------|
| UserModel | `userModel.js` | User auth, tokens, settings |
| CallLogModel | `callLogModel.js` | Call log records |
| MessageLogModel | `messageLogModel.js` | SMS/message logs |
| AdminConfigModel | `adminConfigModel.js` | Admin configurations |
| CacheModel | `cacheModel.js` | Caching layer |

### Key Libraries (packages/core/lib/)

| Library | File | Purpose |
|---------|------|---------|
| JWT | `jwt.js` | Token encoding/decoding |
| Analytics | `analytics.js` | Usage tracking |
| Logger | `logger.js` | Structured logging |
| Constants | `constants.js` | Shared constants (LOG_DETAILS_FORMAT_TYPE, etc.) |
| CallLogComposer | `callLogComposer.js` | Compose call log details |
| ErrorHandler | `errorHandler.js` | Standardized error handling |
| Util | `util.js` | General utilities |

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

## API Routes

Core routes provided by `@app-connect/core`:

### Authentication
- `GET /authValidation` - Validate auth
- `GET /oauth-callback` - OAuth callback
- `POST /apiKeyLogin` - API key login
- `POST /unAuthorize` - Logout

### Contacts
- `GET /contact` - Find by phone
- `POST /contact` - Create contact
- `GET /custom/contact/search` - Search by name

### Logging
- `GET /callLog` - Get call log
- `POST /callLog` - Create call log
- `PATCH /callLog` - Update call log
- `PUT /callDisposition` - Set disposition
- `POST /messageLog` - Create message log

### Settings
- `GET /user/settings` - User settings
- `POST /user/settings` - Update user settings
- `GET /admin/settings` - Admin settings
- `POST /admin/settings` - Update admin settings

## Environment Variables

Key environment variables:

```bash
# Database
DATABASE_URL=postgres://...
DISABLE_SYNC_DB_TABLE=false

# Server
APP_SERVER_SECRET_KEY=secret
HASH_KEY=hash-key
IS_PROD=false

# DynamoDB (local dev)
DYNAMODB_LOCALHOST=http://localhost:8000

# CRM-specific (example for Pipedrive)
PIPEDRIVE_CLIENT_ID=...
PIPEDRIVE_CLIENT_SECRET=...
PIPEDRIVE_ACCESS_TOKEN_URI=...
PIPEDRIVE_REDIRECT_URI=...
```

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

