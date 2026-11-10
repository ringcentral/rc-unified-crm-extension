---
type: contract
title: Plugin Server Endpoints
description: Endpoints, synchronous and asynchronous request contracts for plugin servers.
owner: RingCentral
status: proposed
tags: [app-connect, plugins]
---

# Plugin Server Endpoints

## Required endpoints

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

## Synchronous plugins

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
    "ignoreLetters": {
      "value": "abc"
    }
  }
}
```

Return the same payload shape App Connect sent you. You may change fields such as `note`, `additionalSubmission`, or other connector inputs, but do not remove required data that the logging flow still needs.

Use synchronous plugins for deterministic, fast payload transformations.

## Asynchronous plugins

Async plugins are callback-enabled for call-log create/update, SMS and fax flows. App Connect creates a one-week task cache, saves the task id, and sends that task id to the plugin. The task id embedded in the callback URL is the callback validation method. SMS and fax keep background dispatch, with callback fields added for completion tracking. Their original message payload remains nested at `data.logInfo.logInfo`.

The JavaScript template accepts the callback fields for all three log types. See the [Plugin server API reference](../plugin-server-api/index.md) for exact payload envelopes and [Plugin analytics](../plugin-analytics.md) for tracking semantics. Older App Connect servers may still send SMS/fax without callback fields.

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

On success for call tasks, App Connect appends `note` to the call log's Agent notes. SMS/fax completion does not change CRM content. Terminal tasks retain only minimal analytics state until the one-week expiry to suppress duplicate callbacks. The callback does not re-run plugins.

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
