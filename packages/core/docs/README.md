# App Connect Core Docs

This docs set explains the maintained code under `packages/core`, excluding the `mcp/` subsystem.

Use it when you need to change shared backend behavior, trace a request through the framework, or understand which module owns a feature.

## Scope

Included:

- root package entrypoints and route assembly
- connector infrastructure
- handlers
- models, including DynamoDB-backed schemas used outside MCP
- shared libraries
- tests that cover the non-MCP package surface

Excluded:

- `mcp/`
- generated output such as `coverage/`
- vendored dependencies such as `node_modules/`

## Reading Order

1. [Architecture](architecture.md) for the runtime shape and request flow
2. [Routes](routes.md) for the HTTP surface in `index.js`
3. [Handlers](handlers.md) for shared business logic
4. [Connectors](connectors.md) for registration, proxy behavior, and developer-portal helpers
5. [Models](models.md) for persistence
6. [Libraries](libraries.md) for shared helpers and infrastructure code
7. [Tests](tests.md) for current automated coverage

## File Map

| Area | Files |
| --- | --- |
| Package root | `index.js`, `package.json`, `README.md`, `releaseNotes.json`, `jest.config.js` |
| Connectors | `connector/registry.js`, `connector/developerPortal.js`, `connector/mock.js`, `connector/proxy/index.js`, `connector/proxy/engine.js` |
| Handlers | `handlers/admin.js`, `handlers/auth.js`, `handlers/calldown.js`, `handlers/contact.js`, `handlers/disposition.js`, `handlers/log.js`, `handlers/plugin.js`, `handlers/managedAuth.js`, `handlers/user.js` |
| Sequelize models | `models/accountDataModel.js`, `models/adminConfigModel.js`, `models/cacheModel.js`, `models/callDownListModel.js`, `models/callLogModel.js`, `models/llmSessionModel.js`, `models/messageLogModel.js`, `models/sequelize.js`, `models/userModel.js` |
| DynamoDB models | `models/dynamo/connectorSchema.js`, `models/dynamo/lockSchema.js`, `models/dynamo/noteCacheSchema.js` |
| Libraries | `lib/analytics.js`, `lib/authSession.js`, `lib/callLogComposer.js`, `lib/constants.js`, `lib/debugTracer.js`, `lib/encode.js`, `lib/errorHandler.js`, `lib/generalErrorMessage.js`, `lib/jwt.js`, `lib/logger.js`, `lib/oauth.js`, `lib/ringcentral.js`, `lib/s3ErrorLogReport.js`, `lib/sharedSMSComposer.js`, `lib/util.js` |
| Tests | `test/setup.js`, `test/connector/**`, `test/handlers/**`, `test/lib/**`, `test/models/**`, `test/routes/**` excluding `test/mcp/**` |

## Relationship To The Package README

The package [README.md](../README.md) is still the best public-facing quick start.

This docs set is the maintainer-oriented reference for the internals behind that API surface.
