# upsertCallDisposition

Saves additional disposition or related-entity data for an existing call log.

!!! info "Optional interface"
    Implement this when the call log form includes CRM-specific disposition fields that must be saved after the log exists.

## Signature

```js
async function upsertCallDisposition({
  user,
  existingCallLog,
  authHeader,
  dispositions,
  proxyConfig
}) {
  return {
    logId: existingCallLog.thirdPartyLogId,
    returnMessage: {
      message: 'Disposition updated.',
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
| `existingCallLog` | Local App Connect linkage record. Use `existingCallLog.thirdPartyLogId` as the CRM log ID. |
| `authHeader` | Prepared CRM auth header. |
| `dispositions` | Submitted disposition object. Shape is connector-specific and usually mirrors manifest field `const` values. |
| `proxyConfig` | Proxy configuration when applicable. |

Older template code may name this argument `callDisposition`; the current runtime passes `dispositions`.

## Return

| Field | Required | Description |
| --- | --- | --- |
| `logId` | Yes | Existing CRM log ID. Core treats the operation as successful when this value is truthy. |
| `returnMessage` | Optional | UI feedback. |
| `extraDataTracking` | Optional | Analytics/tracing data. |

## Reference

=== "Template"

    ```js
    --8<-- "packages/template/src/connectors/interfaces/upsertCallDisposition.ts"
    ```

