# updateCallback

Updates the CRM record for an existing call-back. App Connect calls this after a user edits a call-back without marking it called.

Marking a call-back called uses [`markCalledCallback`](markCalledCallback.md).

## Signature

```js
async function updateCallback({
  user,
  authHeader,
  proxyConfig,
  callback,
  previous,
  thirdPartyId
}) {
  return {
    returnMessage: {
      message: 'Callback updated.',
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
| `callback` | The call-back after the local write. |
| `previous` | The call-back before the write. `phoneNumber` is omitted. |
| `thirdPartyId` | CRM record id stored from `createCallback`. `null` when create did not return one. |

`phoneNumber` is present on `callback` only when the current edit request sent it.

Use `thirdPartyId` to find the CRM record. `callback.id` remains the App Connect id.

## Return

| Field | Description |
| --- | --- |
| `returnMessage` | Optional UI feedback. |

Return `{ successful: false, returnMessage }` or throw when the CRM write fails. App Connect keeps the local change and shows a warning. The call-back request still succeeds.

## Reference

=== "Template"

    ```js
    --8<-- "packages/template/src/connectors/interfaces/updateCallback.ts"
    ```
