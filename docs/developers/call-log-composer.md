# CallLogComposer

The CallLogComposer is a centralized utility module that provides consistent call log formatting and composition across all CRM adapters. It supports multiple output formats (plain text, HTML, and Markdown) and handles intelligent updating of existing log entries.

## Overview

The CallLogComposer handles the complex task of:

- **Format standardization**: Ensures consistent call log formatting across different CRMs
- **Multi-format support**: Generates logs in plain text, HTML, or Markdown formats  
- **Intelligent upserts**: Updates existing log entries without duplicating information
- **User preference compliance**: Respects user settings to include/exclude specific log components
- **Timezone handling**: Properly formats dates and times based on user timezone preferences

## Core Function

### `composeCallLog(params)`

The main function that composes a complete call log based on user settings and provided parameters.

#### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `logFormat` | `string` | Format type: `'text/plain'`, `'text/html'`, or `'text/markdown'` (defaults to plain text) |
| `existingBody` | `string` | Existing log body content (for updates) |
| `callLog` | `Object` | Call log information from RingCentral API |
| `contactInfo` | `Object` | Contact information associated with the call |
| `user` | `Object` | User information including settings and timezone preferences |
| `note` | `string` | User-entered notes during or after the call |
| `aiNote` | `string` | AI-generated call summary or notes |
| `transcript` | `string` | Full call transcript text |
| `recordingLink` | `string` | URL link to call recording |
| `subject` | `string` | Call subject or summary line |
| `startTime` | `Date` | Call start time |
| `duration` | `number` | Call duration in seconds |
| `result` | `string` | Call result (e.g., "Call connected", "Hang Up", "Missed") |
| `platform` | `string` | CRM platform identifier |

#### Return Value

Returns a `Promise<string>` containing the formatted call log body.

#### Example Usage

```js
const { composeCallLog } = require('@ringcentral/integration-core/lib/callLogComposer');

const logBody = await composeCallLog({
    logFormat: 'text/html',
    existingBody: '',
    callLog: {
        sessionId: '4503991004',
        startTime: '2024-01-15T10:30:00.000Z',
        duration: 120,
        direction: 'Inbound',
        result: 'Answered'
    },
    contactInfo: {
        phoneNumber: '+1234567890',
        name: 'John Smith'
    },
    user: {
        userSettings: {
            addCallLogNote: { value: true },
            addCallLogDateTime: { value: true },
            addCallLogDuration: { value: true }
        },
        timezoneOffset: '-05:00'
    },
    note: 'Discussed quarterly sales projections',
    subject: 'Q1 Sales Review Call'
});
```

## User Settings Integration

The CallLogComposer respects the following user settings to control which components are included in the log:

| Setting | Default | Description |
|---------|---------|-------------|
| `addCallLogNote` | `true` | Include user notes in the log |
| `addCallSessionId` | `false` | Include RingCentral session ID |
| `addCallLogSubject` | `true` | Include call subject/summary |
| `addCallLogContactNumber` | `false` | Include contact phone number |
| `addCallLogDateTime` | `true` | Include call date and time |
| `addCallLogDuration` | `true` | Include call duration |
| `addCallLogResult` | `true` | Include call result |
| `addCallLogRecording` | `true` | Include recording link |
| `addCallLogAINote` | `true` | Include AI-generated notes |
| `addCallLogTranscript` | `true` | Include call transcript |

## Output Formats

### Plain Text Format

```
- Note: Discussed quarterly sales projections
- Summary: Q1 Sales Review Call
- Date/Time: 2024-01-15 05:30:00 AM
- Duration: 00:02:00
- Result: Answered
- Call recording link: https://example.com/recording
- AI Note:
Customer expressed interest in expanding their service plan.
--- END
```

### HTML Format

```html
<b>Agent notes</b><br>Discussed quarterly sales projections<br><br><b>Call details</b><br>
<li><b>Summary</b>: Q1 Sales Review Call</li>
<li><b>Date/time</b>: 2024-01-15 05:30:00 AM</li>
<li><b>Duration</b>: 00:02:00</li>
<li><b>Result</b>: Answered</li>
<li><b>Call recording link</b>: <a target="_blank" href="https://example.com/recording">open</a></li>
<div><b>AI Note</b><br>Customer expressed interest in expanding their service plan.</div><br>
```

### Markdown Format

```markdown
## Agent notes
Discussed quarterly sales projections

## Call details
**Summary**: Q1 Sales Review Call
**Date/Time**: 2024-01-15 05:30:00 AM
**Duration**: 00:02:00
**Result**: Answered
**Call recording link**: https://example.com/recording

### AI Note
Customer expressed interest in expanding their service plan.
```

## Individual Upsert Functions

The CallLogComposer also exports individual upsert functions for granular control:

### Available Functions

- `upsertCallAgentNote({ body, note, logFormat })`
- `upsertCallSessionId({ body, id, logFormat })`
- `upsertRingCentralUserName({ body, userName, logFormat })`
- `upsertRingCentralNumber({ body, number, extension, logFormat })`
- `upsertCallSubject({ body, subject, logFormat })`
- `upsertContactPhoneNumber({ body, phoneNumber, direction, logFormat })`
- `upsertCallDateTime({ body, startTime, timezoneOffset, logFormat })`
- `upsertCallDuration({ body, duration, logFormat })`
- `upsertCallResult({ body, result, logFormat })`
- `upsertCallRecording({ body, recordingLink, logFormat })`
- `upsertAiNote({ body, aiNote, logFormat })`
- `upsertTranscript({ body, transcript, logFormat })`

### Example: Individual Function Usage

```js
const { upsertCallAgentNote } = require('@ringcentral/integration-core/lib/callLogComposer');

let logBody = '- Date/Time: 2024-01-15 05:30:00 AM\n- Duration: 00:02:00\n';

// Add or update agent note
logBody = upsertCallAgentNote({
    body: logBody,
    note: 'Customer requested follow-up call next week',
    logFormat: 'text/plain'
});

// Result: "- Note: Customer requested follow-up call next week\n- Date/Time: 2024-01-15 05:30:00 AM\n- Duration: 00:02:00\n"
```

## Helper Functions

### `getLogFormatType(platform)`

Determines the appropriate log format type for a specific CRM platform by reading its manifest configuration.

```js
const { getLogFormatType } = require('@ringcentral/integration-core/lib/callLogComposer');

const format = getLogFormatType('pipedrive');
// Returns: 'text/html' (based on platform manifest)
```

## Timezone Handling

The CallLogComposer handles timezone conversion automatically:

- **String offsets**: Accepts formats like `'+05:30'` or `'-08:00'`
- **Numeric offsets**: Supports minute-based offsets (e.g., `330` for +5:30)
- **Default format**: Outputs dates as `'YYYY-MM-DD hh:mm:ss A'`

## Best Practices

### For Adapter Developers

1. **Use the main function**: Always prefer `composeCallLog()` over individual upsert functions for complete logs
2. **Respect user settings**: Pass the complete user object to ensure settings are honored
3. **Handle existing content**: Always pass `existingBody` when updating existing logs
4. **Format consistency**: Use `getLogFormatType()` to determine the correct format for your platform

### Example: Complete Integration

```js
const { composeCallLog, getLogFormatType } = require('@ringcentral/integration-core/lib/callLogComposer');

async function createCallLog({ user, contactInfo, callLog, note, platform }) {
    try {
        // Determine format from platform manifest
        const logFormat = getLogFormatType(platform);
        
        // Compose the complete log
        const logBody = await composeCallLog({
            logFormat,
            callLog,
            contactInfo,
            user,
            note,
            startTime: callLog.startTime,
            duration: callLog.duration,
            result: callLog.result,
            platform
        });
        
        // Create log entry in CRM using formatted body
        const result = await crmApi.createActivity({
            contactId: contactInfo.id,
            subject: `Call with ${contactInfo.name}`,
            body: logBody,
            type: 'call'
        });
        
        return {
            logId: result.id,
            returnMessage: {
                message: 'Call logged successfully',
                messageType: 'success',
                ttl: 3000
            }
        };
    } catch (error) {
        console.error('Error creating call log:', error);
        throw error;
    }
}
```

## Error Handling

The CallLogComposer functions are designed to be resilient:

- **Missing parameters**: Functions gracefully handle undefined or null values
- **Invalid formats**: Defaults to plain text format if an invalid format is specified
- **Malformed data**: Safely processes partial or incomplete call log data

## Dependencies

The CallLogComposer relies on:

- `moment-timezone`: For date/time formatting and timezone conversion
- `@ringcentral/integration-core/lib/util`: For duration formatting utilities
- `@ringcentral/integration-core/adapter/registry`: For platform manifest access
- `@ringcentral/integration-core/lib/constants`: For format type constants