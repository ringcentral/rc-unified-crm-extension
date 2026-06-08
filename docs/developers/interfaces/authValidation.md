# authValidation

This lifecycle hook is called before each authenticated request to verify that the current user's session or credentials are still valid. If the credentials have expired, the hook should attempt to refresh them before returning. If the credentials cannot be refreshed, the hook should return `successful: false` to signal that the user needs to re-authenticate.

This hook is distinct from `checkAndRefreshAccessToken` — it validates application-level session tokens (such as Bullhorn's `BhRestToken`) rather than OAuth access tokens.

!!! note "Bullhorn-specific pattern"
    This hook is currently implemented in the Bullhorn connector to validate the Bullhorn REST session token before each API call. You can implement the same pattern in your connector if the target CRM uses session tokens that expire independently of OAuth tokens.

## Input parameters

| Parameter | Description                                                                                         |
|-----------|-----------------------------------------------------------------------------------------------------|
| `user`    | The user object stored in the database, which includes any `platformAdditionalInfo` stored during authentication. |

## Return value(s)

| Parameter       | Description                                                                                       |
|-----------------|---------------------------------------------------------------------------------------------------|
| `successful`    | `true` if the session is valid (or was successfully refreshed), `false` if re-authentication is required. |
| `status`        | The HTTP status code of the validation request.                                                   |
| `returnMessage` | (Optional) An object with `message`, `messageType`, and `ttl` to surface an error to the user.    |

**Example**
```js
return {
  successful: true,
  status: 200
};

// On failure:
return {
  successful: false,
  returnMessage: {
    messageType: 'warning',
    message: 'Your session has expired. Please re-connect.',
    ttl: 3000
  },
  status: 401
};
```
