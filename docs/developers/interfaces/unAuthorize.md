# unAuthorize

Logs a user out of the CRM connector and clears or revokes stored credentials.

## Signature

```js
async function unAuthorize({ user }) {
  user.accessToken = '';
  user.refreshToken = '';
  await user.save();

  return {
    successful: true,
    returnMessage: {
      messageType: 'success',
      message: 'Logged out.',
      ttl: 1000
    }
  };
}
```

## Input

| Field | Description |
| --- | --- |
| `user` | Persisted App Connect user model for the connected CRM user. |

## Behavior

If the CRM supports token revocation, call the CRM revoke/deauthorize endpoint first. Then clear credentials from App Connect storage or destroy the user record.

Common choices:

| Choice | When to use it |
| --- | --- |
| Clear `accessToken` and `refreshToken`, then `user.save()` | Keeps user settings and connector preferences. |
| `user.destroy()` | Removes the entire CRM user record, including settings tied to that record. |

## Return

| Field | Description |
| --- | --- |
| `successful` | Optional. Proxy mode returns it; route handlers mainly use `returnMessage`. |
| `returnMessage` | Optional UI feedback. |

## Reference

=== "Template"

    ```js
    --8<-- "packages/template/src/connectors/interfaces/unAuthorize.js"
    ```

