# getCallLog

Loads an existing CRM call activity so App Connect can show/edit it and compose safe updates.

## Signature

```js
async function getCallLog({
  user,
  telephonySessionId,
  callLogId,
  contactId,
  authHeader,
  proxyConfig
}) {
  return {
    callLogInfo: {
      subject: 'Inbound call',
      note: 'Agent note',
      fullBody: 'Full CRM activity body',
      fullLogResponse: {}
    }
  };
}
```

## Input

| Field | Description |
| --- | --- |
| `user` | Connected CRM user. |
| `telephonySessionId` | Local call-log ID used by App Connect. |
| `callLogId` | CRM activity/log ID previously returned by `createCallLog`. |
| `contactId` | CRM contact ID stored with the local call log. |
| `authHeader` | Prepared CRM auth header. |
| `proxyConfig` | Proxy configuration when applicable. |

## Return

| Field | Description |
| --- | --- |
| `callLogInfo.subject` | Current CRM subject/title. |
| `callLogInfo.note` | Current editable note. |
| `callLogInfo.fullBody` | Full body/description saved in the CRM. Used by core as the base for composed updates. |
| `callLogInfo.fullLogResponse` | Full CRM response. Passed later to `updateCallLog` as `existingCallLogDetails`. |
| `callLogInfo.contactName` | Optional contact display name. |
| `callLogInfo.dispositions` | Optional current disposition values keyed by manifest field. |
| `returnMessage` | Optional UI feedback. |
| `extraDataTracking` | Optional analytics/tracing data. |

## Reference

=== "Template"

    ```js
    --8<-- "packages/template/src/connectors/interfaces/getCallLog.ts"
    ```

