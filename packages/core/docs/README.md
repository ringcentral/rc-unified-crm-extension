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
2. [Routes](routes.md) for the HTTP surface in `index.ts`
3. [Handlers](handlers.md) for shared business logic
4. [Connectors](connectors.md) for registration, proxy behavior, and developer-portal helpers
5. [Models](models.md) for persistence
6. [Libraries](libraries.md) for shared helpers and infrastructure code
7. [Tests](tests.md) for current automated coverage

## File Map

| Area | Files |
| --- | --- |
| Package root | `index.ts`, `package.json`, `README.md`, `releaseNotes.json`, `jest.config.ts` |
| Connectors | `connector/registry.ts`, `connector/developerPortal.ts`, `connector/mock.ts`, `connector/proxy/index.ts`, `connector/proxy/engine.ts` |
| Handlers | `handlers/admin.ts`, `handlers/auth.ts`, `handlers/calldown.ts`, `handlers/contact.ts`, `handlers/disposition.ts`, `handlers/log.ts`, `handlers/plugin.ts`, `handlers/managedAuth.ts`, `handlers/user.ts` |
| Sequelize models | `models/accountDataModel.ts`, `models/adminConfigModel.ts`, `models/cacheModel.ts`, `models/callDownListModel.ts`, `models/callLogModel.ts`, `models/llmSessionModel.ts`, `models/messageLogModel.ts`, `models/sequelize.ts`, `models/userModel.ts` |
| DynamoDB models | `models/dynamo/connectorSchema.ts`, `models/dynamo/lockSchema.ts`, `models/dynamo/noteCacheSchema.ts` |
| Libraries | `lib/analytics.ts`, `lib/authSession.ts`, `lib/callLogComposer.ts`, `lib/constants.ts`, `lib/debugTracer.ts`, `lib/encode.ts`, `lib/errorHandler.ts`, `lib/generalErrorMessage.ts`, `lib/jwt.ts`, `lib/logger.ts`, `lib/oauth.ts`, `lib/ringcentral.ts`, `lib/s3ErrorLogReport.ts`, `lib/sharedSMSComposer.ts`, `lib/util.ts` |
| Tests | `test/setup.ts`, `test/connector/**`, `test/handlers/**`, `test/lib/**`, `test/models/**`, `test/routes/**` excluding `test/mcp/**` |

## Relationship To The Package README

The package [README.md](../README.md) is still the best public-facing quick start.

This docs set is the maintainer-oriented reference for the internals behind that API surface.
