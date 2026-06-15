---
title: "App Connect Plugins"
---

# App Connect Plugins

!!! info "Connecting a CRM?"
    Use a [connector](../getting-started.md) when App Connect needs to authenticate to a CRM, match contacts, create contacts, or save CRM activity records. Use a plugin when you need to enrich or side-effect the logging workflow around an existing connector.

Plugins run during call, SMS, or fax logging. They can transform logging payloads before the connector receives them, or run background work that should not block CRM logging.

## Template

Scaffold a plugin server with:

```bash
npx @app-connect/cli init my-plugin --template plugin
```

The template route wiring lives in `packages/plugin-template/src/app.js`. It shows the endpoints App Connect expects a plugin server to expose.

## Registration Flow

1. Register a plugin profile in the [Developer Console](https://appconnect.labs.ringcentral.com/console).
2. Deploy the plugin server and configure its manifest URLs.
3. An App Connect admin installs the plugin for an account.
4. App Connect resolves the plugin manifest and calls `userRegisterEndpointUrl`.
5. The plugin server validates the RingCentral admin identity and returns `{ jwtToken }`.
6. App Connect stores that plugin JWT in account data and uses it as a bearer token when invoking plugin endpoints.

Core resolves public, private, and shared plugin manifests through `packages/core/handlers/plugin.js`.

## Manifest Fields

Current plugin runtime reads these fields from the plugin platform manifest:

| Field | Purpose |
| --- | --- |
| `endpointUrl` | Main plugin invocation endpoint. |
| `userRegisterEndpointUrl` | Account registration endpoint. Must return `{ jwtToken }`. |
| `licenseStatusUrl` | Optional license endpoint. Called with `Authorization: Bearer <pluginJwtToken>`. |
| `supportedLogTypes` | Activity types that should invoke the plugin: `call`, `sms`, and/or `fax`. |
| `isAsync` | Marks the plugin as asynchronous. For call logs, App Connect dispatches after create or update succeeds and expects a callback. |
| `tokenSyncUrl` | Required for async plugins. App Connect calls this before invoking `endpointUrl` so the plugin can refresh its stored token. |
| Config fields | Stored in user settings under `plugin_<pluginId>` and passed to plugin calls as `config`. |

Keep plugin secrets on the plugin server. The manifest should contain URLs and UI/config metadata, not secret values.

## Required Plugin Endpoints

The template exposes these route shapes:

| Endpoint | Method | Purpose |
| --- | --- | --- |
| `/isAlive` | `GET` | Plugin health check. |
| `/admin/register` | `POST` | Validate `rcAccessToken` and `rcAccountId`, then return `{ jwtToken }`. |
| `/token/sync` | `POST` | Refresh or validate the plugin token before async dispatch. |
| `/plugin/sync` | `POST` | Run synchronous payload processing. |
| `/plugin/async` | `POST` | Start asynchronous processing. |
| `/license` | `GET` | Optional license status endpoint. |
| `/authUrl` | `GET` | Optional user OAuth URL endpoint. |
| `/checkAuth` | `GET` | Optional user OAuth state endpoint. |
| `/logout` | `POST` | Optional plugin logout endpoint. |

Protected plugin endpoints should read the bearer token from `Authorization` and refresh it through `x-refreshed-jwt-token` when needed. The template helper is `validateAndRefreshPluginToken`; adjust its plugin-id check if your configured endpoint URL does not include a plugin id path parameter.

## Synchronous Plugins

A synchronous plugin runs inline before the connector save. App Connect sends the current logging payload and waits for the plugin response.

Request body:

```json
{
  "data": {
    "note": "Call notes",
    "additionalSubmission": {},
    "logInfo": {}
  },
  "config": {
    "ignoredLetters": {
      "value": "abc"
    }
  }
}
```

Return the same payload shape App Connect sent you. You may change fields such as `note`, `additionalSubmission`, or other connector inputs, but do not remove required data that the logging flow still needs.

Use synchronous plugins for deterministic, fast payload transformations.

## Asynchronous Plugins

Async plugins are currently callback-enabled for call-log create and update flows. App Connect creates a one-week task cache, saves the task id, and sends that task id to the plugin. The task id embedded in the callback URL is the callback validation method. SMS and fax async plugins remain fire-and-forget and do not receive this callback contract yet.

Request body:

```json
{
  "asyncTaskId": "task-id",
  "callbackUrl": "https://app-connect.example.com/plugin/async-callback/task-id",
  "data": {
    "note": "Call notes",
    "logInfo": {}
  },
  "config": {}
}
```

Return quickly:

```json
{
  "accepted": true,
  "asyncTaskId": "task-id"
}
```

When background work finishes, post to `callbackUrl`:

```json
{
  "successful": true,
  "message": "Async plugin completed",
  "note": "Text to append to Agent notes"
}
```

On success, App Connect appends `note` to the call log's Agent notes and removes the task cache. The callback does not re-run plugins.

For failed work:

```json
{
  "successful": false,
  "message": "Upload failed",
  "note": ""
}
```

On failure, App Connect marks the task cache as `failed` and stores `message` in the cache data. Missing or expired tasks are rejected, and async task caches expire after one week.

Use asynchronous plugins for side effects or delayed enrichment. Use synchronous plugins when the plugin must change the payload before the connector saves the CRM activity.

## License Checks

If a plugin requires entitlement checks, configure `licenseStatusUrl`. App Connect calls it with the account-level plugin JWT:

```http
Authorization: Bearer <pluginJwtToken>
```

Return a JSON object that the client can interpret as the plugin license state. The template handler is `packages/plugin-template/src/handlers/license.js`.

## Custom Configuration

Plugin configuration is similar to connector custom settings. The saved config is passed to the plugin invocation as `config`; core reads it from user settings under:

```text
plugin_<pluginId>.value.config
```

Validate config defaults on the plugin server. Older clients or admin-managed settings can omit optional config values.
