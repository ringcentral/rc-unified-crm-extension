# updateCallLog

Updates an existing CRM call activity. Core calls this when the user edits the log, when finalized call data arrives, when a recording becomes available, or when AI artifacts are added later.

## Signature

```js
async function updateCallLog({
  user,
  existingCallLog,
  authHeader,
  recordingLink,
  recordingDownloadLink,
  subject,
  note,
  startTime,
  duration,
  result,
  aiNote,
  transcript,
  legs,
  ringSenseTranscript,
  ringSenseSummary,
  ringSenseAIScore,
  ringSenseBulletedSummary,
  ringSenseLink,
  additionalSubmission,
  composedLogDetails,
  existingCallLogDetails,
  hashedAccountId,
  isFromSSCL,
  proxyConfig
}) {
  return {
    updatedNote: note,
    returnMessage: {
      message: 'Call log updated.',
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
| `recordingLink` | View/listen link for the recording when available. |
| `recordingDownloadLink` | Download link when the caller supplied one. |
| `subject`, `note` | Latest user-editable log fields. |
| `startTime`, `duration`, `result`, `legs` | Finalized RingCentral call details. |
| `aiNote`, `transcript` | Smart Notes/AI summary and transcript when available. |
| `ringSenseTranscript`, `ringSenseSummary`, `ringSenseAIScore`, `ringSenseBulletedSummary`, `ringSenseLink` | ACE/RingSense artifacts when available. |
| `additionalSubmission` | Values from manifest `page.callLog.additionalFields[]`. |
| `composedLogDetails` | Updated body composed by core for plain text, HTML, or Markdown formats. |
| `existingCallLogDetails` | Full CRM response returned by `getCallLog()` before the update, when core could fetch it. |
| `hashedAccountId` | Hashed RingCentral account ID from request headers when available. |
| `isFromSSCL` | True when invoked by server-side call logging. |
| `proxyConfig` | Proxy configuration when applicable. |

## Return

| Field | Description |
| --- | --- |
| `updatedNote` | Optional note/body value to send back to the client. |
| `returnMessage` | Optional UI feedback. |
| `extraDataTracking` | Optional analytics/tracing data. |

Core already knows the CRM log ID from `existingCallLog.thirdPartyLogId`; you do not need to return it.

## Avoid Overwriting User Edits

Users may edit the CRM activity directly after `createCallLog` and before a later recording/final-data update. Prefer targeted replacement or the centrally composed `composedLogDetails` update strategy used by existing connectors instead of blindly replacing unrelated fields.

## Reference

=== "Template"

    ```js
    --8<-- "packages/template/src/connectors/interfaces/updateCallLog.ts"
    ```

