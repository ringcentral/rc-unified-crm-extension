# Logging SMS, MMS, Voicemail, Fax, And Shared SMS

Message logging uses one route and two connector interfaces. The runtime decides whether to create a new CRM activity or update an existing one.

## Interfaces

Implement:

- [`createMessageLog`](interfaces/createMessageLog.md)
- [`updateMessageLog`](interfaces/updateMessageLog.md)
- [`findContact`](interfaces/findContact.md), because messages must be associated with a contact
- [`createContact`](interfaces/createContact.md), optional when users can create contacts for unknown numbers
- [`getLogFormatType`](interfaces/getLogFormatType.md), recommended for shared SMS body composition

## Normal Message Grouping

For normal SMS, MMS, voicemail, and fax:

1. Core checks unlogged message IDs.
2. Messages are grouped by conversation/day.
3. The first message in a group calls `createMessageLog`.
4. Later messages in that same group call `updateMessageLog`.
5. Core stores local `messageLogs` rows linked to the CRM log ID.

Group SMS appends the selected contact ID to conversation/message IDs so the same RingCentral group conversation can be logged against different contacts.

## Shared SMS

Shared SMS uses `conversationLogId`. Core composes `sharedSMSLogContent` with subject/body and either:

- calls `createMessageLog` when no CRM activity exists for the shared thread, or
- calls `updateMessageLog` when the shared thread was already logged.

The shared SMS body can include participants, owner/call queue info, assignment hints, notes, and messages.

## Media Fields

Depending on message type, `createMessageLog` or `updateMessageLog` may receive:

| Field | Description |
| --- | --- |
| `recordingLink` | Voicemail audio link. |
| `faxDocLink` | Fax view link. |
| `faxDownloadLink` | Fax download link with RingCentral access token when available. |
| `imageLink` | View link for MMS image attachments. |
| `imageDownloadLink` | Download link for MMS image attachments. |
| `imageContentType` | Image MIME type. |
| `videoLink` | View link for MMS video attachments. |

If your CRM requires uploading media instead of linking to it, download the media while the supplied link/token is still valid.

## Custom Fields

Manifest fields under `page.messageLog.additionalFields[]` are passed as `additionalSubmission`.

For contact-dependent fields, return options from contact lookup in `contact.additionalInfo` using the same `const` key as the manifest field.

## Testing

1. Send an SMS to a known contact and log it.
2. Send another SMS in the same conversation/day and verify `updateMessageLog`.
3. Test voicemail, fax, and MMS if the connector supports them.
4. Test shared SMS separately when enabled for the account.
5. Check local `messageLogs` rows and the CRM activity body.

