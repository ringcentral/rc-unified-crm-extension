# getAuthType

Returns the auth mode the runtime should use for this connector.

## Signature

```js
function getAuthType({ proxyId, proxyConfig } = {}) {
  return 'oauth'; // or 'apiKey'
}
```

Existing connectors may define this with no parameters. The runtime can pass `proxyId` and `proxyConfig` when the connected user came from proxy mode.

## Return

Return one of:

| Value | Runtime behavior |
| --- | --- |
| `oauth` | Core refreshes OAuth tokens when needed, builds `authHeader` as `Bearer <accessToken>`, and calls `getOauthInfo()` for token exchange details. |
| `apiKey` | Core calls `getBasicAuth({ apiKey: user.accessToken })`, then builds `authHeader` as `Basic <returned value>`. |

## Example

```js
function getAuthType() {
  return 'apiKey';
}

module.exports = getAuthType;
```

## Reference

=== "Template"

    ```js
    --8<-- "packages/template/src/connectors/interfaces/getAuthType.js"
    ```

