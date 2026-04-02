# Tests

This page maps the non-MCP test suite under `packages/core/test`.

## Test Setup

| File | Purpose |
| --- | --- |
| `test/setup.js` | Shared test bootstrapping for Jest |
| `jest.config.js` | Package-local Jest configuration |

## Connector Tests

| File | Coverage |
| --- | --- |
| `test/connector/registry.test.js` | Registry behavior, connector registration, and interface composition |
| `test/connector/proxy/engine.test.js` | Proxy request rendering, auth header building, and response mapping |
| `test/connector/proxy/index.test.js` | Proxy connector behavior across connector operations |
| `test/connector/proxy/sample.json` | Sample proxy config fixture used by tests |

## Handler Tests

| File | Coverage |
| --- | --- |
| `test/handlers/admin.test.js` | Admin settings and reporting behavior |
| `test/handlers/auth.test.js` | OAuth, API-key login, and auth validation behavior |
| `test/handlers/contact.test.js` | Contact lookup and creation flows |
| `test/handlers/log.test.js` | Call-log and message-log workflows |
| `test/handlers/plugin.test.js` | Async plugin task polling and cleanup |
| `test/handlers/managedAuth.test.js` | Shared-auth field loading, encryption, masking, and login-time field resolution |

## Route Tests

| File | Coverage |
| --- | --- |
| `test/routes/managedAuthRoutes.test.js` | Shared-auth API route behavior and validation paths |

## Library Tests

| File | Coverage |
| --- | --- |
| `test/lib/callLogComposer.test.js` | Call-log formatting |
| `test/lib/debugTracer.test.js` | Debug trace capture and serialization |
| `test/lib/jwt.test.js` | JWT sign and verify helpers |
| `test/lib/logger.test.js` | Logger behavior |
| `test/lib/oauth.test.js` | OAuth client and token-refresh behavior |
| `test/lib/ringcentral.test.js` | RingCentral API wrapper helpers |
| `test/lib/sharedSMSComposer.test.js` | Shared-SMS formatting |
| `test/lib/util.test.js` | Hashing, formatting, and utility helpers |

## Model Tests

| File | Coverage |
| --- | --- |
| `test/models/models.test.js` | General Sequelize model behavior |
| `test/models/accountDataModel.test.js` | Account-data cache behavior |
| `test/models/dynamo/connectorSchema.test.js` | Dynamo-backed connector schema behavior |

## Coverage Gaps To Be Aware Of

The current non-MCP test suite does not appear to have direct dedicated files for:

- `handlers/calldown.js`
- `handlers/disposition.js`
- `lib/authSession.js`
- `lib/encode.js`
- `lib/errorHandler.js`
- `lib/generalErrorMessage.js`
- `lib/s3ErrorLogReport.js`
- `models/callDownListModel.js`
- `models/llmSessionModel.js`
- `models/dynamo/lockSchema.js`
- `models/dynamo/noteCacheSchema.js`
