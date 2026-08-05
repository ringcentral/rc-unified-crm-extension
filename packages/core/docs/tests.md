# Tests

This page maps the non-MCP test suite under `packages/core/test`.

## Test Setup

| File | Purpose |
| --- | --- |
| `test/setup.ts` | Shared test bootstrapping for Jest |
| `jest.config.ts` | Package-local Jest configuration |

## Connector Tests

| File | Coverage |
| --- | --- |
| `test/connector/registry.test.ts` | Registry behavior, connector registration, and interface composition |
| `test/connector/proxy/engine.test.ts` | Proxy request rendering, auth header building, and response mapping |
| `test/connector/proxy/index.test.ts` | Proxy connector behavior across connector operations |
| `test/connector/proxy/sample.json` | Sample proxy config fixture used by tests |

## Handler Tests

| File | Coverage |
| --- | --- |
| `test/handlers/admin.test.ts` | Admin settings and reporting behavior |
| `test/handlers/auth.test.ts` | OAuth, API-key login, and auth validation behavior |
| `test/handlers/contact.test.ts` | Contact lookup and creation flows |
| `test/handlers/log.test.ts` | Call-log and message-log workflows |
| `test/handlers/plugin.test.ts` | Async plugin task polling and cleanup |
| `test/handlers/managedAuth.test.ts` | Shared-auth field loading, encryption, masking, and login-time field resolution |

## Route Tests

| File | Coverage |
| --- | --- |
| `test/routes/managedAuthRoutes.test.ts` | Shared-auth API route behavior and validation paths |

## Library Tests

| File | Coverage |
| --- | --- |
| `test/lib/callLogComposer.test.ts` | Call-log formatting |
| `test/lib/debugTracer.test.ts` | Debug trace capture and serialization |
| `test/lib/jwt.test.ts` | JWT sign and verify helpers |
| `test/lib/logger.test.ts` | Logger behavior |
| `test/lib/oauth.test.ts` | OAuth client and token-refresh behavior |
| `test/lib/ringcentral.test.ts` | RingCentral API wrapper helpers |
| `test/lib/sharedSMSComposer.test.ts` | Shared-SMS formatting |
| `test/lib/util.test.ts` | Hashing, formatting, and utility helpers |

## Model Tests

| File | Coverage |
| --- | --- |
| `test/models/models.test.ts` | General Sequelize model behavior |
| `test/models/accountDataModel.test.ts` | Account-data cache behavior |
| `test/models/dynamo/connectorSchema.test.ts` | Dynamo-backed connector schema behavior |

## Coverage Gaps To Be Aware Of

The current non-MCP test suite does not appear to have direct dedicated files for:

- `handlers/calldown.ts`
- `handlers/disposition.ts`
- `lib/authSession.ts`
- `lib/encode.ts`
- `lib/errorHandler.ts`
- `lib/generalErrorMessage.ts`
- `lib/s3ErrorLogReport.ts`
- `models/callDownListModel.ts`
- `models/llmSessionModel.ts`
- `models/dynamo/lockSchema.ts`
- `models/dynamo/noteCacheSchema.ts`
