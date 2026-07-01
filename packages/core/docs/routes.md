# Core Routes

This page documents the non-MCP HTTP routes defined in `index.js`.

## Route Design Notes

- Most routes accept a `jwtToken` query parameter and resolve the current user from it.
- Many routes emit analytics using request headers such as `rc-extension-id`, `rc-account-id`, `user-agent`, `developer-author-name`, and `eventAddedVia`.
- When the request header `is-debug` is set to `'true'`, route handlers can return `DebugTracer` output wrappers.
- Several routes are marked obsolete in code but still present for compatibility.

## System And Metadata Routes

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/releaseNotes` | Merges package release notes with connector release notes |
| `GET` | `/crmManifest` | Returns a platform manifest, with optional server URL overrides |
| `GET` | `/isAlive` | Simple health check returning `OK` |
| `GET` | `/implementedInterfaces` | Reports which connector methods exist for a platform |
| `GET` | `/serverVersionInfo` | Returns manifest version data; marked obsolete in code |
| `GET` | `/.well-known/openai-apps-challenge` | Returns the ChatGPT verification code |
| `GET` | `/.well-known/oauth-protected-resource` | OAuth protected-resource metadata |
| `GET` | `/.well-known/oauth-authorization-server` | OAuth authorization-server metadata |
| `GET` | `/oauth/authorize_shim` | Rebuilds OAuth params and redirects to RingCentral |
| `POST` | `/oauth/register` | Returns RingCentral client credentials for the shim flow |

## Authentication Routes

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/licenseStatus` | Checks connector-specific license status for the current user |
| `GET` | `/authValidation` | Verifies the current CRM auth session |
| `GET` | `/hostname` | Returns host-related info used during auth flows |
| `GET` | `/oauth-callback` | Completes connector OAuth and persists the user |
| `POST` | `/apiKeyLogin` | Handles API-key based login flows |
| `GET` | `/apiKeyManagedAuthState` | Returns required-field readiness for shared API-key auth |
| `POST` | `/unAuthorize` | Logs the user out of the CRM |
| `GET` | `/userInfoHash` | Returns a hash derived from user information |
| `GET` | `/ringcentral/oauth/callback` | Completes the admin RingCentral OAuth callback |

## Admin Routes

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/admin/settings` | Validates RingCentral admin role and saves admin settings |
| `GET` | `/admin/settings` | Returns admin settings for the current account |
| `POST` | `/admin/userMapping` | Builds a mapping between CRM users and RingCentral extensions |
| `POST` | `/admin/reinitializeUserMapping` | Rebuilds user mappings from scratch |
| `GET` | `/admin/serverLoggingSettings` | Loads connector-specific server logging settings |
| `POST` | `/admin/serverLoggingSettings` | Updates connector-specific server logging settings |
| `GET` | `/admin/managedAuth` | Returns admin-facing managed-auth field definitions and masked stored values |
| `POST` | `/admin/managedAuth` | Upserts org-level or extension-level managed auth values |
| `GET` | `/ringcentral/admin/report` | Returns aggregated RingCentral call activity metrics |
| `GET` | `/ringcentral/admin/userReport` | Returns per-extension call and SMS metrics |

## User Settings Routes

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/user/preloadSettings` | Loads settings used to bootstrap client-side configuration |
| `POST` | `/user/refreshInfo` | Refreshes connector-owned CRM user information for the current user |
| `GET` | `/user/settings` | Returns merged user and admin settings |
| `POST` | `/user/settings` | Updates per-user settings, with connector hooks when present |

## Contact Routes

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/contact` | Finds contacts by phone number |
| `POST` | `/contact` | Creates a new contact |
| `GET` | `/custom/contact/search` | Finds contacts by name |

## Logging And Disposition Routes

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/callLog/cacheNote` | Stores a temporary note for server-side call logging |
| `GET` | `/callLog` | Looks up existing call logs by session id plus extension identity |
| `POST` | `/callLog` | Creates a CRM call log and stores the local linkage record |
| `PATCH` | `/callLog` | Updates an existing CRM call log |
| `PUT` | `/callDisposition` | Upserts call disposition data through the connector |
| `POST` | `/messageLog` | Creates or updates CRM logs for SMS, fax, and shared SMS |

## Call-Down Routes

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/calldown` | Schedules a call-down item |
| `GET` | `/calldown` | Lists the current user's call-down items |
| `DELETE` | `/calldown/:id` | Removes a call-down item |
| `PATCH` | `/calldown/:id` | Updates or marks a call-down item |

## Plugin And Debug Routes

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/debug/report/url` | Returns a presigned URL for error log upload |
| `POST` | `/plugin/async-callback/:taskId` | Receives async plugin completion callbacks for call-log tasks |
| `POST` | `/plugin/register` | Registers an account-level plugin and stores returned plugin auth data |
| `DELETE` | `/plugin/unregister` | Removes account-level plugin auth and settings |
| `GET` | `/plugin/licenseStatus` | Reads license status for an installed plugin |

## Development-Only Mock Routes

These routes are only mounted when `IS_PROD === 'false'`.

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/registerMockUser` | Creates a mock user |
| `DELETE` | `/deleteMockUser` | Removes a mock user |
| `GET` | `/mockCallLog` | Reads mock call logs |
| `POST` | `/mockCallLog` | Creates a mock call log |
| `DELETE` | `/mockCallLog` | Clears mock call logs |

## Operational Notes

- `createCoreRouter()` currently contains a large amount of orchestration logic in addition to route registration.
- Most route handlers duplicate a common pattern: decode JWT, load user, resolve connector, refresh auth, call handler, then track analytics.
- If route count continues growing, this file is a strong candidate for modular route extraction by feature area.
