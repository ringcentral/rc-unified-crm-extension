# Connectors

Connectors are the extension seam that lets the shared framework support multiple CRMs.

## Registry

`connector/registry.js` exports a singleton `ConnectorRegistry`.

### Responsibilities

- register connector implementations by platform name
- store manifests by platform
- store release notes
- register extra interface methods per platform
- compose registered interfaces onto a connector at read time
- fall back to the `proxy` connector when a platform-specific connector is missing

### Important behavior

| Method | Notes |
| --- | --- |
| `registerConnector()` | Validates that the connector implements `createCallLog` and `updateCallLog` |
| `getConnector()` | Returns the original connector, an interface-only connector, a composed connector, or the proxy connector fallback |
| `registerConnectorInterface()` | Adds methods without mutating the original connector object |
| `getManifest(platform, fallbackToDefault)` | Throws if no manifest exists |
| `getConnectorCapabilities()` | Summarizes original methods, composed methods, registered interfaces, and auth type |

## Proxy Connector

The proxy connector makes integrations configurable through stored connector metadata instead of custom connector code.

### Files

| File | Role |
| --- | --- |
| `connector/proxy/index.js` | User-facing connector implementation for auth, contacts, call logs, message logs, dispositions, and logout |
| `connector/proxy/engine.js` | Low-level request templating, auth header creation, and response mapping |

### What `proxy/index.js` does

- loads proxy config from `models/dynamo/connectorSchema.js`
- resolves auth type from config, defaulting to `apiKey`
- builds `getOauthInfo()` for OAuth-style proxy integrations
- performs `getUserInfo()`, `findContact()`, `createContact()`, `findContactWithName()`, `createCallLog()`, `getCallLog()`, `updateCallLog()`, `createMessageLog()`, `updateMessageLog()`, `upsertCallDisposition()`, and `getUserList()`
- clears stored tokens in `unAuthorize()`
- exposes connector-specific log format through `meta.logFormat`

### What `proxy/engine.js` does

- resolves dot-path expressions with `getByPath()`
- renders template strings like `{{ user.accessToken }}`
- recursively renders query params, headers, and bodies
- composes auth headers from operation-specific or global auth config
- performs axios requests from the rendered config
- maps contact and call-log responses into App Connect's shared shape

## Developer Portal Helpers

`connector/developerPortal.js` wraps public API calls to the App Connect Developer Portal.

Exports:

- `getPublicConnectorList()`
- `getConnectorManifest()`

These functions are small fetch helpers and return `null` on failure after logging.

## Mock Connector Helpers

`connector/mock.js` is not a full connector implementation. It is a development helper used by the dev-only mock routes.

Exports:

- `createUser()`
- `deleteUser()`
- `getCallLog()`
- `createCallLog()`
- `cleanUpMockLogs()`

## Connector Contract In Practice

The shared framework expects these methods most often:

- `getAuthType()`
- `getOauthInfo()` or `getBasicAuth()`
- `getUserInfo()`
- `authValidation()`
- `createCallLog()`
- `updateCallLog()`
- `getCallLog()`
- `createMessageLog()`
- `updateMessageLog()`
- `findContact()`
- `createContact()`
- `findContactWithName()`
- `unAuthorize()`
- optional methods such as `getUserList()`, `getLicenseStatus()`, `upsertCallDisposition()`, `getServerLoggingSettings()`, `updateServerLoggingSettings()`, and `onUpdateUserSettings()`

## API-Key Managed Auth Fields

`apiKey` connector manifests can now annotate auth fields in `platform.auth.apiKey.page.content[]` with:

- `managed?: boolean`
- `managedScope?: 'account' | 'user'`
- `hidden?: boolean`

Behavior:

- `managed: true` marks a field as eligible for admin-managed storage and server-side auto-fill
- `managedScope: 'account'` stores one encrypted value per RingCentral account
- `managedScope: 'user'` stores encrypted values per RingCentral extension inside that account
- `hidden: true` hides input field from users
- stored managed auth values are encrypted at rest by default

This does not change the connector runtime contract. `handlers/auth.onApiKeyLogin()` still resolves the manifest-driven auth payload and passes the final field map through `additionalInfo` into connector `getUserInfo()`. Existing connectors like Redtail that already read extra API-key fields from `additionalInfo` remain compatible.

