# getAuthType

This interface declares the authentication method used by your connector. The framework calls it once when it needs to understand how to authenticate the current user, and uses the return value to branch the entire auth flow — deciding whether to initiate an OAuth redirect or to collect static credentials via an API key form.

It is also called when the framework queries your connector's `/implementedInterfaces` endpoint to build a capability map. The auth type you return determines which companion interface the framework expects: `getOauthInfo` for OAuth connectors, or `getBasicAuth` for API key connectors.

## When is this interface called?

- When a user attempts to connect to the CRM for the first time
- When the framework checks which interfaces your connector implements

### Signature

```js
function getAuthType({ proxyId, proxyConfig } = {}) {
  return 'oauth'; // or 'apiKey'
}
```

Existing connectors may define this with no parameters. The runtime can pass `proxyId` and `proxyConfig` when the connected user came from proxy mode.

## Input parameters

A string literal indicating the auth method:

| Value      | Description                                                                                  |
|------------|----------------------------------------------------------------------------------------------|
| `"oauth"`  | The CRM uses OAuth 2.0. The framework will call [`getOauthInfo`](getOauthInfo.md) to retrieve credentials and will manage the OAuth redirect flow. |
| `"apiKey"` | The CRM uses static credentials (API key, username/password, or similar). The framework will present the user with the credential form defined in [`platform.auth.apiKey.page`](../manifest-pages.md#api-key-auth-page) and will call [`getBasicAuth`](getBasicAuth.md) to build the Authorization header. |

**Example**
```js
function getAuthType() {
  return 'oauth';
}
```

## How auth type affects the rest of the connector

Returning `"oauth"` means you must also implement:

- [`getOauthInfo`](getOauthInfo.md) — supplies OAuth credentials and token endpoint details
- [`getUserInfo`](getUserInfo.md) — called after the OAuth code exchange to fetch and store user details

Returning `"apiKey"` means you must also implement:

- [`getBasicAuth`](getBasicAuth.md) — converts the user's submitted credentials into an Authorization header value
- [`getUserInfo`](getUserInfo.md) — called immediately after credential submission to verify them and fetch user details

In both cases `getUserInfo` is required. The difference is only in which pre-auth interface the framework calls to set up the request.

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
    --8<-- "packages/template/src/connectors/interfaces/getAuthType.ts"
    ```

=== "Pipedrive (OAuth)"

    ```js
    --8<-- "src/connectors/pipedrive/index.ts:11:13"
    ```
