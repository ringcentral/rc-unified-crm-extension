# getUserInfo

Validates CRM credentials and returns the stable identity App Connect should store for the connected CRM user.

## Signature

```js
async function getUserInfo({
  authHeader,
  tokenUrl,
  apiUrl,
  hostname,
  platform,
  username,
  callbackUri,
  query,
  proxyId,
  proxyConfig,
  userEmail,
  data,
  additionalInfo,
  apiKey
}) {
  return {
    successful: true,
    platformUserInfo: {
      id: '123-myCRM',
      name: 'Jane Smith',
      timezoneName: 'America/Los_Angeles',
      timezoneOffset: -7,
      platformAdditionalInfo: {}
    },
    returnMessage: {
      messageType: 'success',
      message: 'Connected.',
      ttl: 1000
    }
  };
}
```

The runtime passes different fields depending on auth mode. OAuth flows include OAuth callback context. API-key flows include `apiKey` and `additionalInfo`.

## Input

| Field | Used in | Description |
| --- | --- | --- |
| `authHeader` | Both | Prepared CRM auth header. |
| `hostname` | Both | CRM hostname selected or entered during setup. |
| `platform` | Both | Platform name. |
| `additionalInfo` | API key | Auth-page fields from `auth.apiKey.page.content[]`. Managed-auth values are resolved before this method is called. |
| `apiKey` | API key | Final API key value after managed-auth resolution. |
| `tokenUrl`, `apiUrl`, `username`, `callbackUri`, `query`, `data` | OAuth | OAuth callback metadata and token response data. |
| `proxyId`, `proxyConfig`, `userEmail` | Both/proxy | Proxy and user context when available. |

## Return

| Field | Required | Description |
| --- | --- | --- |
| `successful` | Yes | `true` when credentials are valid and user info was loaded. |
| `platformUserInfo.id` | Yes | Stable CRM user ID. Include the platform suffix if the raw CRM ID may collide with another connector. |
| `platformUserInfo.name` | Yes | Display name shown after connection. |
| `platformUserInfo.timezoneName` | Optional | Time zone name used by logging formatters. |
| `platformUserInfo.timezoneOffset` | Optional | Offset used by logging formatters. Existing connectors may use hours or minute-style offsets; keep your connector consistent with its date logic. |
| `platformUserInfo.platformAdditionalInfo` | Optional | Extra values stored with the user and available later as `user.platformAdditionalInfo`. Do not store secrets unless required. |
| `platformUserInfo.overridingHostname` | Optional | Hostname core should persist instead of the setup hostname. |
| `platformUserInfo.overridingApiKey` | Optional | API key core should persist instead of the submitted API key. |
| `returnMessage` | Optional | UI feedback. |

When `successful` is false, return `returnMessage` so the client can tell the user what failed.

## Reference

=== "Template"

    ```js
    --8<-- "packages/template/src/connectors/interfaces/getUserInfo.js"
    ```
