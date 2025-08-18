# checkAndRefreshAccessToken

For CRMs that don't follow standard OAuth 2.0 or API key authentication patterns, developers need to provide this method in their adapter to check and refresh tokens. This interface is particularly useful for CRMs like Bullhorn that have custom authentication flows or session management requirements.

## When to implement

You should implement this interface when your CRM:

- Has custom session management (like Bullhorn's session tokens)
- Requires special token refresh logic beyond standard OAuth 2.0
- Uses non-standard authentication mechanisms
- Has platform-specific token validation requirements

## Input parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `oauthApp` | Object | Yes | The OAuth application instance created by `getOAuthApp()` |
| `user` | Object | Yes | The user object containing authentication tokens and platform-specific information |
| `tokenLockTimeout` | Number | No | Timeout in seconds for token refresh locks (default: 10) |

### User object structure

The `user` object contains:

```js
{
  id: String,                    // User ID
  accessToken: String,           // Current access token
  refreshToken: String,          // Current refresh token  
  tokenExpiry: Date,            // Token expiration timestamp
  platform: String,             // Platform name (e.g., 'bullhorn')
  platformAdditionalInfo: Object // Platform-specific data
}
```

## Return value(s)

This interface should return the updated `user` object with refreshed tokens if necessary.

**Return type:** `Promise<Object>`

The returned user object should have updated:
- `accessToken` - New access token if refreshed
- `refreshToken` - New refresh token if refreshed  
- `tokenExpiry` - New expiration timestamp if refreshed
- `platformAdditionalInfo` - Any platform-specific data that was updated

## Implementation guidelines

1. **Early return**: If the user object is invalid or missing required tokens, return the user object as-is
2. **Token validation**: Check if tokens are expired or about to expire (consider a buffer time)
3. **Refresh logic**: Implement your CRM's specific token refresh mechanism
4. **Error handling**: Handle authentication errors gracefully
5. **User persistence**: Save the updated user object to the database

## Default behavior

If this interface is not implemented, the system will use the default OAuth 2.0 token refresh logic in `packages/core/lib/oauth.js`, which:

- Checks if tokens are expired (with 2-minute buffer)
- Uses standard OAuth 2.0 refresh token flow
- Supports token refresh locking via DynamoDB
- Handles concurrent refresh requests

## Reference

=== "Bullhorn"

	```js
    {!> src/adapters/bullhorn/index.js [ln:195-222] !}
	```

=== "Default OAuth Implementation"

	```js
    {!> packages/core/lib/oauth.js [ln:20-83] !}
	```
