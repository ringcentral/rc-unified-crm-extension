# Handlers

Handlers contain the shared business workflows behind the route layer.

## Handler Overview

| File | Responsibility | Main exports |
| --- | --- | --- |
| `handlers/auth.js` | Connector login, OAuth callback handling, user persistence, and auth validation | `onOAuthCallback`, `onApiKeyLogin`, `authValidation`, `getLicenseStatus`, `onRingcentralOAuthCallback` |
| `handlers/contact.js` | Contact search, creation, and account-data caching | `findContact`, `createContact`, `findContactWithName` |
| `handlers/log.js` | Call logging, message logging, plugin execution, call-log lookup, and note cache writes | `createCallLog`, `updateCallLog`, `createMessageLog`, `getCallLog`, `saveNoteCache` |
| `handlers/admin.js` | Admin settings, RingCentral reporting, server logging settings, and user mapping | `validateAdminRole`, `upsertAdminSettings`, `getAdminSettings`, `upsertAdminRcTokens`, `getServerLoggingSettings`, `updateServerLoggingSettings`, `getAdminReport`, `getUserReport`, `getUserMapping`, `reinitializeUserMapping` |
| `handlers/user.js` | User setting reads, admin/user setting merge, and updates | `getUserSettingsByAdmin`, `getUserSettings`, `updateUserSettings` |
| `handlers/disposition.js` | Call-disposition writes against an existing log | `upsertCallDisposition` |
| `handlers/calldown.js` | User-owned call-down scheduling | `schedule`, `list`, `remove`, `markCalled`, `update` |
| `handlers/plugin.js` | Async plugin task polling and cleanup | `getPluginAsyncTasks` |
| `handlers/managedAuth.js` | Shared API-key auth field discovery, secure storage, and login-time field resolution | `getManagedAuthAdminSettings`, `getManagedAuthState`, `resolveApiKeyLoginFields`, `upsertOrgManagedAuthValues`, `upsertUserManagedAuthValues` |

## Common Execution Pattern

Most connector-backed handlers follow the same sequence:

1. Load the current `UserModel` row.
2. Derive `proxyId` and optional proxy configuration from `platformAdditionalInfo`.
3. Resolve the connector from `connectorRegistry`.
4. Ask the connector for its auth type.
5. Refresh OAuth tokens through `lib/oauth.js` or build API-key auth.
6. Call the connector method with normalized inputs.
7. Return a shared `successful` plus `returnMessage` shape.

## `auth.js`

Key behavior:

- `onOAuthCallback()` completes the external OAuth code exchange, calls `getUserInfo()`, and persists the user through `saveUserInfo()`.
- `onApiKeyLogin()` uses connector-provided basic-auth construction and the same user persistence path.
- `onApiKeyLogin()` resolves shared API-key fields from `handlers/managedAuth.js`, ignores end-user overrides for shared fields, and returns `missingRequiredFieldConsts` when required fields are missing.
- `saveUserInfo()` updates or creates `UserModel`, preserving existing `platformAdditionalInfo` keys and adding `proxyId`.
- `authValidation()` refreshes OAuth tokens when needed, then delegates session validation to the connector.
- `getLicenseStatus()` is connector-defined and only wrapped here.
- `onRingcentralOAuthCallback()` stores admin RingCentral tokens in `AdminConfigModel`.

## `contact.js`

Key behavior:

- `findContact()` checks `AccountDataModel` cache first using `contact-${phoneNumber}` as the data key.
- Found contacts are cached per `rcAccountId` and `platformName`.
- Cache refresh can be forced with `isForceRefreshAccountData`.
- Missing or expired users return warning-style response objects rather than throwing.
- `findContactWithName()` mirrors the phone lookup path without the account-data cache.

Known caveat called out in code:

- account-data contact caching assumes one RingCentral account does not need separate caches for multiple CRM platforms at the same time

## `log.js`

This is the heaviest handler in the package.

Key responsibilities:

- prevents duplicate call-log creation by checking `CallLogModel` on `sessionId`
- loads note cache from DynamoDB when `USE_CACHE` and server-side call logging are enabled
- runs configured plugins before creating or updating logs
- composes log body content with `composeCallLog()` or `composeSharedSMSLog()`
- stores local mappings between telephony ids and CRM log ids
- handles normal SMS, fax, group SMS, and shared SMS cases
- enriches tracking metadata for analytics callers

Important persistence behavior:

- `CallLogModel` stores the App Connect to CRM mapping for call logs
- `MessageLogModel` stores the App Connect to CRM mapping for message logs
- `CacheModel` stores async plugin task state
- `NoteCache` stores temporary notes keyed by session id

## `admin.js`

Key responsibilities:

- validates RingCentral admin role from the current extension token
- validates arbitrary RingCentral user tokens with `validateRcUserToken()`
- stores and reads account-level admin configuration
- stores admin OAuth tokens used for RingCentral reporting
- fetches call aggregation and user activity metrics from RingCentral
- delegates server-side logging settings to connector-specific methods when available
- builds CRM user to RingCentral extension mappings through `getUserList()`

## `user.js`

This module is mainly about merging account-level policy with per-user preferences.

Rules implemented here:

- if no admin settings exist, return user settings directly
- admin settings can override or hide user settings
- plugin settings merge at both the plugin level and nested config-field level
- connectors can intercept setting updates with `onUpdateUserSettings()`

## Smaller Handler Modules

`disposition.js`:

- requires an existing local call-log mapping before writing disposition data

`calldown.js`:

- decodes the JWT directly
- keeps operations scoped to the authenticated user
- supports schedule, list, remove, mark-as-called, and partial update flows

`plugin.js`:

- returns cached async task status
- deletes terminal task cache records after the client reads them

`managedAuth.js`:

- reads API-key field definitions from either the developer portal manifest or the connector registry manifest
- isolates managed field definitions with `managed: true` and `managedScope` (`account` or `user`)
- encrypts managed auth values before writing to `AccountDataModel`
- provides admin views with stored values using `{ hasValue, value }` while keeping database values encrypted at rest
- resolves login fields by merging stored managed values and non-managed end-user inputs

