# getOverridingOAuthOption

This lifecycle hook allows a connector to override the standard OAuth token-exchange request parameters. It is called during the initial OAuth authorization flow, just before the framework exchanges an authorization code for tokens.

Use this hook when the target CRM's token endpoint requires non-standard parameters — for example, when credentials must be passed in the request body rather than as a Basic Auth header, or when the `grant_type` value deviates from the OAuth 2.0 default.

!!! note "Bullhorn-specific pattern"
    This hook is currently implemented in the Bullhorn connector, which uses password-flow authorization and requires client credentials to be passed explicitly in the query string rather than via a Basic Auth header.

## Input parameters

| Parameter | Description                                                             |
|-----------|-------------------------------------------------------------------------|
| `code`    | The authorization code returned from the CRM's OAuth authorization endpoint. |
| `oauthInfo` | The resolved OAuth configuration from `getOauthInfo()` or admin-managed OAuth. |

## Return value(s)

An object that overrides the default token-exchange request. The framework merges this object into its own token request. Common properties to override:

| Property  | Type   | Description                                                                                       |
|-----------|--------|---------------------------------------------------------------------------------------------------|
| `headers` | object | HTTP headers to include in the token request. Use `{ Authorization: undefined }` to suppress Basic Auth. |
| `query`   | object | Query string parameters for the token request, such as `grant_type`, `code`, `client_id`, etc.   |

!!! warning "Use `undefined`, not `''`, to suppress the header"
    The underlying OAuth client always computes a Basic-auth `Authorization` header internally when a client secret is configured, then shallow-merges these headers on top of it. Setting `Authorization: ''` still sends a present-but-empty header (`Authorization: `), which some servers (e.g. ServiceNow) reject as malformed. Only `Authorization: undefined` actually omits the header from the outgoing request.

**Example**
```js
return {
  headers: {
    Authorization: undefined // omit the default Basic Auth header entirely
  },
  query: {
    grant_type: 'authorization_code',
    code: code,
    client_id: oauthInfo.clientId,
    client_secret: oauthInfo.clientSecret,
    redirect_uri: oauthInfo.redirectUri
  }
};
```
