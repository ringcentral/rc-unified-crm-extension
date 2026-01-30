---
name: call-log-composition
description: Use this skill when working with call log composition, formatting call details, handling AI notes, transcripts, and understanding the call log flow in App Connect.
---

# Call Log Composition

## Overview

Call logs are composed using `packages/core/lib/callLogComposer.js` which formats call details, AI notes, and transcripts according to the CRM's preferred format (HTML, Markdown, or Plain Text).

## Log Format Types

```javascript
const { LOG_DETAILS_FORMAT_TYPE } = require('@app-connect/core/lib/constants');

// Available formats:
LOG_DETAILS_FORMAT_TYPE.HTML       // HTML formatted logs
LOG_DETAILS_FORMAT_TYPE.MARKDOWN   // Markdown formatted logs  
LOG_DETAILS_FORMAT_TYPE.PLAIN_TEXT // Plain text formatted logs
```

## Using composeCallLog

```javascript
const { composeCallLog } = require('@app-connect/core/lib/callLogComposer');

const composedLogDetails = composeCallLog({
    logFormat: LOG_DETAILS_FORMAT_TYPE.HTML,
    callLog: {
        direction: 'Inbound',
        startTime: 1704067200000,
        duration: 120,
        result: 'Connected',
        from: { phoneNumber: '+1234567890', name: 'John Doe' },
        to: { phoneNumber: '+0987654321', name: 'Jane Smith' }
    },
    contactInfo: {
        name: 'John Doe',
        phoneNumber: '+1234567890'
    },
    note: 'Customer inquired about product pricing',
    aiNote: 'AI Summary: Customer showed interest in premium plan',
    transcript: 'Agent: Hello...\nCustomer: Hi...',
    user: {
        timezoneOffset: '-05:00',
        userSettings: {
            addCallLogAiNote: { value: true },
            addCallLogTranscript: { value: true }
        }
    },
    recordingLink: 'https://recording.url/abc123'
});
```

## Output Formats

### HTML Format
```html
<b>Agent notes</b><br>
Customer inquired about product pricing<br><br>
<b>Call details</b><br>
- Direction: Inbound<br>
- Date/time: Jan 1, 2024 10:00 AM<br>
- Duration: 2 minutes<br>
- From: John Doe (+1234567890)<br>
- To: Jane Smith (+0987654321)<br>
- Result: Connected<br>
- Recording: <a href="https://recording.url/abc123">Link</a><br><br>
<b>AI notes</b><br>
AI Summary: Customer showed interest in premium plan<br><br>
<b>Transcript</b><br>
Agent: Hello...<br>
Customer: Hi...
```

### Markdown Format
```markdown
## Agent notes
Customer inquired about product pricing

## Call details
- Direction: Inbound
- Date/time: Jan 1, 2024 10:00 AM
- Duration: 2 minutes
- From: John Doe (+1234567890)
- To: Jane Smith (+0987654321)
- Result: Connected
- Recording: [Link](https://recording.url/abc123)

## AI notes
AI Summary: Customer showed interest in premium plan

## Transcript
Agent: Hello...
Customer: Hi...
```

### Plain Text Format
```
- Note: Customer inquired about product pricing
- Direction: Inbound
- Date/time: Jan 1, 2024 10:00 AM
- Duration: 2 minutes
- From: John Doe (+1234567890)
- To: Jane Smith (+0987654321)
- Result: Connected
- Recording: https://recording.url/abc123
- AI notes: AI Summary: Customer showed interest in premium plan
- Transcript: Agent: Hello... Customer: Hi...
```

## Upsert Functions

For updating specific parts of an existing log:

```javascript
const { 
    upsertCallAgentNote,
    upsertCallSessionId,
    upsertCallRecordingLink 
} = require('@app-connect/core/lib/callLogComposer');

// Update agent note in existing log body
const updatedBody = upsertCallAgentNote({
    body: existingLogBody,
    note: 'Updated customer note',
    logFormat: LOG_DETAILS_FORMAT_TYPE.HTML
});

// Add session ID
const withSessionId = upsertCallSessionId({
    body: updatedBody,
    id: 'session-123',
    logFormat: LOG_DETAILS_FORMAT_TYPE.HTML
});
```

## Connector Implementation

In your connector's `createCallLog`:

```javascript
async function createCallLog({ 
    user, 
    contactInfo, 
    authHeader, 
    callLog, 
    additionalSubmission, 
    aiNote, 
    transcript, 
    composedLogDetails,  // Already composed by handler
    hashedAccountId 
}) {
    // composedLogDetails is pre-composed based on getLogFormatType()
    
    const postBody = {
        subject: `${callLog.direction} Call with ${contactInfo.name}`,
        note: composedLogDetails,  // Use directly
        // ... other fields
    };
    
    // Make API call to CRM
    const response = await axios.post(apiUrl, postBody, { headers });
    
    return {
        logId: response.data.id,
        returnMessage: { message: 'Call logged', messageType: 'success', ttl: 2000 },
        extraDataTracking: {
            withSmartNoteLog: !!aiNote && (user.userSettings?.addCallLogAiNote?.value ?? true),
            withTranscript: !!transcript && (user.userSettings?.addCallLogTranscript?.value ?? true)
        }
    };
}
```

## User Settings

Users can control AI note and transcript inclusion:

```javascript
// Check user preferences
const includeAiNote = user.userSettings?.addCallLogAiNote?.value ?? true;
const includeTranscript = user.userSettings?.addCallLogTranscript?.value ?? true;
```

## Call Log Flow

1. **Call ends** → RingCentral sends call data
2. **Handler receives** → `packages/core/handlers/log.js`
3. **Compose log** → `composeCallLog()` formats details
4. **Connector creates** → `connector.createCallLog()` sends to CRM
5. **Store reference** → `CallLogModel` stores mapping

## Parsing Existing Logs

When retrieving logs for editing:

```javascript
async function getCallLog({ user, callLogId, authHeader }) {
    const response = await axios.get(`${apiUrl}/logs/${callLogId}`, { headers });
    
    const logBody = response.data.note;
    
    // Extract agent note from HTML format
    const note = logBody
        .split('<b>Agent notes</b>')[1]
        ?.split('<b>Call details</b>')[0]
        ?.replaceAll('<br>', '') ?? '';
    
    return {
        callLogInfo: {
            subject: response.data.subject,
            note,
            fullBody: logBody
        }
    };
}
```

