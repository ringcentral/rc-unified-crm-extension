# Core Architecture

This package is the reusable backend framework behind App Connect server deployments.

Its job is to expose a stable HTTP surface, persist shared state, and delegate CRM-specific work to registered connectors.

## Main Entry Points

`index.ts` exports the package assembly surface:

| Export | Purpose |
| --- | --- |
| `createCoreApp(options)` | Builds an Express app, installs middleware, and mounts the shared router |
| `createCoreMiddleware()` | Returns the common JSON, XML, and CORS middleware stack |
| `createCoreRouter()` | Creates the shared route layer without creating a full app |
| `initializeCore(options)` | Initializes analytics and database synchronization |
| `connectorRegistry` | Global registry for manifests, release notes, connectors, and interface composition |
| `proxyConnector` | Proxy-driven connector implementation used for config-based integrations |
| `DebugTracer` | Request-level debug tracing helper |

## Runtime Responsibilities

`index.ts` owns the framework assembly:

- configures local DynamoDB support when `DYNAMODB_LOCALHOST` is set
- installs an axios interceptor in local-style environments
- syncs Sequelize models on startup unless `DISABLE_SYNC_DB_TABLE` or `skipDatabaseInit` disables it
- adds the `hashedRcExtensionId` column to `users` if an older schema is missing it
- migrates `callLogs` to include `hashedExtensionId` in the local call-log identity key when an older schema is missing it
- mounts all shared HTTP routes
- exposes dev-only mock routes when `IS_PROD === 'false'`

## Request Flow

The non-MCP request path is:

1. Express receives a request through `createCoreApp()` or `createCoreRouter()`.
2. Core middleware parses JSON or XML and applies CORS defaults.
3. Route handlers in `index.ts` decode JWTs, gather analytics metadata, and call a shared handler.
4. Handlers load the current user and connector, refresh auth if needed, and call the connector operation.
5. Models persist linkage data such as user sessions, call log ids, cached account data, and plugin task state.
6. Libraries compose payloads, normalize errors, emit analytics, and handle logging.

## Connector-Centered Design

The package keeps route shapes and handler logic shared across platforms by pushing CRM-specific behavior behind the connector interface.

Important consequences:

- handlers decide when to load a connector and how to authenticate against it
- connectors decide how to talk to a CRM
- proxy connectors make many integrations data-driven instead of code-driven
- registry-level interface composition lets a platform add methods without mutating the original connector object

## Persistence Layers

There are two storage styles in this package:

- Sequelize models for relational/shared application state
- Dynamoose models for selected operational state such as proxy connector definitions, distributed locks, and note cache entries

`AccountDataModel` also stores encrypted shared API-key auth values. Shared auth intentionally stays separate from `AdminConfigModel.userMappings`:

- `managed-auth-org` stores account-scoped encrypted auth field values
- `managed-auth-user` stores per-extension encrypted auth field values
- server-side logging user mapping continues to live in admin config and is not reused for managed auth

## Cross-Cutting Concerns

Several concerns are applied in multiple modules:

- OAuth refresh via `lib/oauth.ts`
- RingCentral admin and reporting helpers via `lib/ringcentral.ts`
- response-safe error shaping via `lib/errorHandler.ts`
- analytics events via `lib/analytics.ts`
- opt-in debug traces via `lib/debugTracer.ts`
- structured server logging via `lib/logger.ts`

## Important Environment Variables

| Variable | Why it matters |
| --- | --- |
| `DATABASE_URL` | Sequelize connection string |
| `DISABLE_SYNC_DB_TABLE` | Skips model sync in `initDB()` |
| `MIXPANEL_TOKEN` | Enables analytics tracking |
| `APP_SERVER_SECRET_KEY` | Signs and verifies JWTs and encrypts stored managed auth values |
| `HASH_KEY` | Hashes RingCentral account and extension identifiers |
| `DYNAMODB_LOCALHOST` | Points Dynamoose to a local endpoint |
| `IS_PROD` | Enables local-only logging and mock routes when set to `'false'` |
| `OVERRIDE_APP_SERVER` | Overrides manifest server URL in `GET /crmManifest` |
| `OVERRIDE_SERVER_SIDE_LOGGING_SERVER` | Overrides manifest server-side logging URL in `GET /crmManifest` |
| `RINGCENTRAL_SERVER` | Used by RingCentral OAuth and reporting helpers |
| `RINGCENTRAL_CLIENT_ID` | Used by RingCentral OAuth and reporting helpers |
| `RINGCENTRAL_CLIENT_SECRET` | Used by RingCentral OAuth and reporting helpers |
| `RINGCENTRAL_MCP_CLIENT_ID` | Public RingCentral OAuth client ID used by MCP clients with PKCE; no client secret is exposed |
