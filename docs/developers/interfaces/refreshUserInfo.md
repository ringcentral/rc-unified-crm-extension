# refreshUserInfo

Refreshes CRM-side information for an already connected user.

Core calls this interface from `POST /user/refreshInfo` after it resolves the current user from the App Connect JWT, refreshes OAuth credentials when needed, and prepares the CRM authorization header. The client can call this route during post-login sync for an already connected CRM user. Implement it when the connector needs to refresh cached CRM profile data, validate CRM account state, or update connector-owned fields stored on the user record after login.

!!! info "Optional interface"
    `getUserInfo` remains the required login-time identity interface. `refreshUserInfo` is optional and is reported by `/implementedInterfaces?platform=<name>` when the connector exports it.

## Signature

```js
async function refreshUserInfo({
  user,
  authHeader,
  proxyConfig
}) {
  return {
    successful: true,
    returnMessage: {
      messageType: 'success',
      message: 'User info refreshed.',
      ttl: 1000
    }
  };
}
```

## Input

| Field | Description |
| --- | --- |
| `user` | Persisted App Connect user model for the connected CRM user. |
| `authHeader` | Prepared CRM auth header. OAuth connectors receive `Bearer <accessToken>` after core refreshes the token if necessary. API-key connectors receive `Basic <value returned by getBasicAuth()>`. |
| `proxyConfig` | Proxy connector configuration when the user connected through proxy mode. Code connectors can ignore it unless they deliberately support proxy-backed behavior. |

## Behavior

Use this interface for refresh work that is safe to run after the user is already connected.

Common uses include:

- fetching current CRM profile or organization state,
- refreshing connector-specific values in `user.platformAdditionalInfo`,
- checking whether the connected CRM account is still usable,
- returning a user-facing message after a client-triggered refresh action.

Core does not re-run `getUserInfo()` and does not persist a returned `platformUserInfo` object from this interface. If refreshed data needs to be stored, update and save the `user` record inside the connector implementation.

## Return

| Field | Required | Description |
| --- | --- | --- |
| `successful` | Yes | `true` when the refresh completed; `false` when the refresh failed but the request was handled. |
| `returnMessage` | Optional | UI feedback shown to the user. Include `message`, `messageType`, and `ttl`. |

When the user's stored credentials are missing, core returns a warning before calling the connector. For OAuth connectors, core attempts token refresh first; if the refresh token is no longer valid, the route returns a reconnect warning.

## Example

```js
async function refreshUserInfo({ user, authHeader }) {
  const response = await axios.get(
    `https://${user.hostname}/api/users/me`,
    { headers: { Authorization: authHeader } }
  );

  user.platformAdditionalInfo = {
    ...user.platformAdditionalInfo,
    crmAccountName: response.data.accountName
  };
  await user.save();

  return {
    successful: true,
    returnMessage: {
      messageType: 'success',
      message: 'User info refreshed.',
      ttl: 1000
    }
  };
}
```
