# createCallLog

Creates one CRM activity/log record for a RingCentral call.

## Signature

```js
async function createCallLog({
  user,
  contactInfo,
  authHeader,
  callLog,
  note,
  additionalSubmission,
  aiNote,
  transcript,
  ringSenseTranscript,
  ringSenseSummary,
  ringSenseAIScore,
  ringSenseBulletedSummary,
  ringSenseLink,
  composedLogDetails,
  hashedAccountId,
  isFromSSCL,
  proxyConfig
}) {
  return {
    logId: 'crm-log-id',
    returnMessage: {
      message: 'Call logged.',
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
| `contactInfo` | Contact selected for the call. Shape: `{ id, phoneNumber, type, name }`. |
| `authHeader` | Prepared CRM auth header. |
| `callLog` | RingCentral call log object. Includes `id`, `sessionId`, `telephonySessionId`, `direction`, `from`, `to`, `startTime`, `duration`, `result`, `recording`, and `legs` when available. |
| `note` | Agent note submitted by the user or cached from server-side logging. |
| `additionalSubmission` | Values from manifest `page.callLog.additionalFields[]`. |
| `aiNote`, `transcript` | Smart Notes/AI summary and transcript when enabled for the user. |
| `ringSenseTranscript`, `ringSenseSummary`, `ringSenseAIScore`, `ringSenseBulletedSummary`, `ringSenseLink` | ACE/RingSense artifacts when available. |
| `composedLogDetails` | Body composed by core when `getLogFormatType()` returns `text/plain`, `text/html`, or `text/markdown`. Empty when the connector uses a custom format. |
| `hashedAccountId` | Hashed RingCentral account ID from request headers when available. |
| `isFromSSCL` | True when the call is logged by server-side call logging. |
| `proxyConfig` | Proxy configuration when applicable. |

## Return

| Field | Required | Description |
| --- | --- | --- |
| `logId` | Yes | CRM activity/log ID. Core stores this as `thirdPartyLogId` for later update and lookup. |
| `returnMessage` | Optional | UI feedback. |
| `extraDataTracking` | Optional | Analytics/tracing data. Core adds `withSmartNoteLog` and `withTranscript`. |

If `logId` is missing, core treats the operation as unsuccessful.

## Notes

Create a single CRM activity for the call. App Connect assumes one CRM log maps to one RingCentral call session.

When possible, write `composedLogDetails` directly to the CRM body. That keeps user log-format settings, recordings, AI artifacts, and later update behavior consistent across connectors.

## Reference

=== "Template"

    ```js
    --8<-- "packages/template/src/connectors/interfaces/createCallLog.js"
    ```
