# getOverridingOAuthOption

This lifecycle hook allows a connector to override the standard OAuth token-exchange request parameters. It is called during the initial OAuth authorization flow, just before the framework exchanges an authorization code for tokens.

Use this hook when the target CRM's token endpoint requires non-standard parameters — for example, when credentials must be passed in the request body rather than as a Basic Auth header, or when the `grant_type` value deviates from the OAuth 2.0 default.

!!! note "Bullhorn-specific pattern"
    This hook is currently implemented in the Bullhorn connector, which uses password-flow authorization and requires client credentials to be passed explicitly in the query string rather than via a Basic Auth header.

## Input parameters

| Parameter | Description                                                             |
|-----------|-------------------------------------------------------------------------|
| `code`    | The authorization code returned from the CRM's OAuth authorization endpoint. |

## Return value(s)

An object that overrides the default token-exchange request. The framework merges this object into its own token request. Common properties to override:

| Property  | Type   | Description                                                                                       |
|-----------|--------|---------------------------------------------------------------------------------------------------|
| `headers` | object | HTTP headers to include in the token request. Use `{ Authorization: '' }` to suppress Basic Auth. |
| `query`   | object | Query string parameters for the token request, such as `grant_type`, `code`, `client_id`, etc.   |

**Example**
```js
return {
  headers: {
    Authorization: '' // suppress default Basic Auth header
  },
  query: {
    grant_type: 'authorization_code',
    code: code,
    client_id: process.env.MY_CRM_CLIENT_ID,
    client_secret: process.env.MY_CRM_CLIENT_SECRET,
    redirect_uri: process.env.MY_CRM_REDIRECT_URI
  }
};
```
