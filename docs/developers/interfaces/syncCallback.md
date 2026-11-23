# syncCallback

This optional interface lets a connector add CRM logic after App Connect saves a call-back. The call-back list stays in App Connect. Implement this only when the CRM should also receive those events, for example as a task, activity, or reminder.

App Connect calls `syncCallback` after the local save succeeds:

| Event | When it is sent |
| --- | --- |
| `created` | A user schedules a call-back. |
| `updated` | A user edits a call-back without changing its status to `called`. |
| `called` | The status changes to `called`. |
| `deleted` | A user deletes a call-back. |

`GET /calldown` does not call this interface. Connectors that do not export `syncCallback` keep the existing App Connect-only list.

## Input parameters

| Parameter | Description |
| --- | --- |
| `user` | The App Connect user associated with the call-back. |
| `authHeader` | The HTTP Authorization header to send to the CRM. OAuth connectors receive a refreshed bearer token. API-key connectors receive `Basic` auth. |
| `proxyConfig` | Proxy connector configuration when the user connected through proxy mode. Code connectors can ignore it. |
| `event` | `created`, `updated`, `called`, or `deleted`. |
| `callback` | The call-back after the local write. For `deleted`, this is the entry that was removed. |
| `previous` | The call-back before the write. `null` for `created`. For `deleted`, this is the same removed entry. |

### Callback object

| Property | Description |
| --- | --- |
| `id` | App Connect call-back id. Use this as the stable key in the CRM. App Connect does not store a CRM record id. |
| `contactId` | CRM contact id, or `null`. |
| `contactType` | Connector-defined contact type. |
| `phoneNumber` | Phone number from the current client request. Present on `created` and `updated` when the client sent it. Omitted on `called` and `deleted`, and omitted from `previous`. Not stored. |
| `status` | `scheduled` or `called`. |
| `scheduledAt` | ISO-8601 callback time, or `null`. |
| `lastCallAt` | ISO-8601 last call time, or `null`. |

The callback object does not include a contact name or note. The client does not send those fields. A delete has no request body, so it also has no phone number. Find the CRM record by `callback.id`.

## Return value(s)

Return an object. All fields are optional.

| Property | Description |
| --- | --- |
| `returnMessage` | Optional `{ message, messageType, ttl }` shown to the user. |

Return `{ successful: false, returnMessage }` or throw when the CRM write fails. App Connect keeps the local entry and shows `returnMessage`, or a generic warning when none is provided. The call-back request still succeeds.

**Example**

```js
async function syncCallback({ authHeader, event, callback }) {
  if (event === 'created') {
    await crm.createTask({ authHeader, callback });
    return {};
  }
  if (event === 'called') {
    await crm.completeTask({ authHeader, id: callback.id });
    return {};
  }
  if (event === 'deleted') {
    await crm.deleteTask({ authHeader, id: callback.id });
    return {};
  }
  await crm.updateTask({ authHeader, id: callback.id, callback });
  return {};
}

module.exports = syncCallback;
```
