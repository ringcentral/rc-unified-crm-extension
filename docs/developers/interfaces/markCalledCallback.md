# markCalledCallback

Updates the CRM record when a user marks a call-back called. App Connect calls this after the local status becomes `called`, including when an edit changes the status to `called`.

Edits that leave the status unchanged use [`updateCallback`](updateCallback.md).

## Signature

```js
async function markCalledCallback({
  user,
  authHeader,
  proxyConfig,
  callback,
  previous,
  thirdPartyId
}) {
  return {
    returnMessage: {
      message: 'Callback marked called.',
      messageType: 'success',
      ttl: 2000
    }
  };
}
```

## Input

| Field | Description |
| --- | --- |
| `user` | Connected CRM user. |
| `authHeader` | Prepared CRM auth header. |
| `proxyConfig` | Proxy connector configuration when applicable. |
| `callback` | The call-back after it is marked called. `callback.status` is `called`. |
| `previous` | The call-back before the change. `phoneNumber` is omitted. |
| `thirdPartyId` | CRM record id stored from `createCallback`. `null` when create did not return one. |

Mark-as-called does not include a phone number.

Use `thirdPartyId` to find the CRM record. `callback.id` remains the App Connect id.

## Return

| Field | Description |
| --- | --- |
| `returnMessage` | Optional UI feedback. |

Return `{ successful: false, returnMessage }` or throw when the CRM write fails. App Connect keeps the local change and shows a warning. The call-back request still succeeds.

## Reference

=== "Template"

    ```js
    --8<-- "packages/template/src/connectors/interfaces/markCalledCallback.ts"
    ```
