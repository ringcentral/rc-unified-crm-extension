# createCallback

Creates one CRM record when a user schedules a call-back. The call-back list stays in App Connect. Implement this only when the CRM should also receive the new call-back, for example as a task, activity, or reminder.

App Connect calls `createCallback` after the local save succeeds. Connectors that do not export it keep the existing App Connect-only list.

## Signature

```js
async function createCallback({
  user,
  authHeader,
  proxyConfig,
  callback
}) {
  return {
    thirdPartyId: 'crm-task-id',
    returnMessage: {
      message: 'Callback created.',
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
| `authHeader` | Prepared CRM auth header. OAuth connectors receive a refreshed bearer token. API-key connectors receive `Basic` auth. |
| `proxyConfig` | Proxy connector configuration when the user connected through proxy mode. Code connectors can ignore it. |
| `callback` | The call-back after the local write. |

### Callback object

| Property | Description |
| --- | --- |
| `id` | App Connect call-back id. |
| `contactId` | CRM contact id, or `null`. |
| `contactType` | Connector-defined contact type. |
| `phoneNumber` | Phone number from the current client request, when the client sent it. Not stored. |
| `status` | `scheduled`. |
| `scheduledAt` | ISO-8601 callback time, or `null`. |
| `lastCallAt` | `null` for a new call-back. |

The callback object does not include a contact name or note. The client does not send those fields.

## Return

| Field | Required | Description |
| --- | --- | --- |
| `thirdPartyId` | No | CRM record id. App Connect stores this on the call-back and passes it to `updateCallback`, `markCalledCallback`, and `deleteCallback`. |
| `returnMessage` | No | UI feedback. |

Return `{ successful: false, returnMessage }` or throw when the CRM write fails. App Connect keeps the local entry, does not store `thirdPartyId`, and shows `returnMessage`, or a generic warning when none is provided. The call-back request still succeeds.

## Reference

=== "Template"

    ```js
    --8<-- "packages/template/src/connectors/interfaces/createCallback.ts"
    ```
