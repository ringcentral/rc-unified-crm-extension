# deleteCallback

Removes the CRM record for a call-back after App Connect deletes the local entry.

## Signature

```js
async function deleteCallback({
  user,
  authHeader,
  proxyConfig,
  callback,
  thirdPartyId
}) {
  return {};
}
```

## Input

| Field | Description |
| --- | --- |
| `user` | Connected CRM user. |
| `authHeader` | Prepared CRM auth header. |
| `proxyConfig` | Proxy connector configuration when applicable. |
| `callback` | The call-back that was removed. |
| `thirdPartyId` | CRM record id stored from `createCallback`. `null` when create did not return one. |

A delete has no request body, so `callback` has no phone number. Find the CRM record with `thirdPartyId`.

## Return

| Field | Description |
| --- | --- |
| `returnMessage` | Optional UI feedback. |

Return `{ successful: false, returnMessage }` or throw when the CRM delete fails. App Connect keeps the local deletion and shows a warning. The call-back request still succeeds.

`GET /calldown` does not call `createCallback`, `updateCallback`, `markCalledCallback`, or `deleteCallback`.

## Reference

=== "Template"

    ```js
    --8<-- "packages/template/src/connectors/interfaces/deleteCallback.ts"
    ```
