# getOauthInfo

Returns the private OAuth values core needs to exchange and refresh CRM tokens.

## Signature

```js
async function getOauthInfo({
  tokenUrl,
  hostname,
  rcAccountId,
  proxyId,
  proxyConfig,
  userEmail,
  isFromMCP
} = {}) {
  return {
    clientId: process.env.CRM_CLIENT_ID,
    clientSecret: process.env.CRM_CLIENT_SECRET,
    accessTokenUri: process.env.CRM_TOKEN_URI,
    redirectUri: process.env.CRM_REDIRECT_URI
  };
}
```

Connectors can ignore fields they do not need. Regional connectors commonly use `hostname`. MCP-enabled connectors may use `isFromMCP` to return a different redirect URI.

## Input

| Field | Description |
| --- | --- |
| `tokenUrl` | Token URL previously saved in `user.platformAdditionalInfo.tokenUrl`, or supplied during OAuth callback. |
| `hostname` | CRM hostname selected or entered by the user. |
| `rcAccountId` | RingCentral account ID when available. Used by managed OAuth resolution. |
| `proxyId` | Proxy connector ID saved with the user. |
| `proxyConfig` | Loaded proxy configuration for the connection. |
| `userEmail` | User email from the auth flow, when available. |
| `isFromMCP` | True when the OAuth flow was initiated by MCP. |

## Return

| Field | Required | Description |
| --- | --- | --- |
| `clientId` | Yes | CRM OAuth application client ID. |
| `clientSecret` | Yes | CRM OAuth application client secret. |
| `accessTokenUri` | Yes | CRM token endpoint. |
| `redirectUri` | Yes | Redirect URI registered with the CRM application. |
| `authorizationUri` | Optional | Authorization URI if a custom OAuth helper needs it. |
| `scopes` | Optional | Scopes used by `client-oauth2` when needed. |
| `hostname` | Optional | Overrides the hostname saved with the connected user. |
| `failMessage` | Optional | If present, core stops the flow and shows this message as an auth failure. |

## Reference

=== "Template"

    ```js
    --8<-- "packages/template/src/connectors/interfaces/getOauthInfo.js"
    ```

