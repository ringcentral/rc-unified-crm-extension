# checkAndRefreshAccessToken

This lifecycle hook is called before each API request to check whether the current OAuth access token is expired or about to expire, and to refresh it if necessary. It is invoked with the OAuth application instance and the current user record, and should return the (possibly updated) user object.

This hook handles OAuth token refresh specifically. For session-token validation (e.g. CRM REST session keys), see [`authValidation`](authValidation.md).

!!! note "Bullhorn-specific pattern"
    This hook is currently implemented in the Bullhorn connector because Bullhorn's access tokens have unusually short lifetimes and Bullhorn's multi-step REST session login (OAuth token → Bullhorn session token) requires careful sequencing. The hook includes distributed locking to prevent concurrent refreshes under high load.

## Signature

```js
async function checkAndRefreshAccessToken(oauthApp, user, tokenLockTimeout = 20, skipLock = false)
```

## Input parameters

| Parameter          | Description                                                                                          |
|--------------------|------------------------------------------------------------------------------------------------------|
| `oauthApp`         | The OAuth application instance (from the framework) used to exchange refresh tokens for new access tokens. |
| `user`             | The user object stored in the database, including the current `accessToken`, `refreshToken`, and expiry. |
| `tokenLockTimeout` | (Optional) Time in seconds to wait for a distributed lock when multiple concurrent requests attempt to refresh. Default: `20`. |
| `skipLock`         | (Optional) Boolean. When `true`, skips the distributed lock acquisition. Useful for internal retry calls. Default: `false`. |

## Return value(s)

The updated user object with refreshed `accessToken`, `refreshToken`, and expiry fields written back to the database.

**Example**
```js
// The hook returns the updated user object
const currentUser = await checkAndRefreshAccessToken(oauthApp, user);
// currentUser.accessToken is now fresh
```
