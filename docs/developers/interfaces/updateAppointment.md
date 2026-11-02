# updateAppointment

This interface updates an existing appointment in the connected CRM. It is called when a user edits an appointment from within App Connect's appointment panel.

## Input parameters

| Parameter       | Description                                                                                         |
|-----------------|-----------------------------------------------------------------------------------------------------|
| `user`          | An object describing the Chrome extension user associated with the action that triggered this interface. |
| `authHeader`    | The HTTP Authorization header to be transmitted with the API request to the target CRM.             |
| `appointmentId` | The CRM ID of the appointment to update.                                                            |
| `patchBody`     | An object containing the fields to update. See [Patch body schema](#patch-body-schema).             |

### Patch body schema

| Property          | Type   | Description                                                                                          |
|-------------------|--------|------------------------------------------------------------------------------------------------------|
| `title`           | string | New title for the appointment.                                                                       |
| `summary`         | string | New notes or body text.                                                                              |
| `startTimeUtc`    | string | Updated ISO-8601 UTC start time.                                                                     |
| `durationMinutes` | number | Updated duration in minutes.                                                                         |
| `contacts`        | array  | (Optional) Replacement list of attendee IDs or contact objects. When provided, existing attendees not in this list are removed. |

The HTTP client sends these fields inside a `patch` wrapper:

```json
{
  "patch": {
    "title": "Updated meeting",
    "summary": "Discuss next steps",
    "startTimeUtc": "2026-10-26T12:00:00.000Z",
    "durationMinutes": 60,
    "contacts": [{ "id": "2288275906", "type": "contact" }]
  }
}
```

Send `startTimeUtc` and `durationMinutes` together when changing the time. Omit
both for edits that only change other fields. The server continues to accept the
deprecated `startTime` input for older clients; current clients send `startTimeUtc`.

Contact IDs may be non-empty strings, including UUIDs and alphanumeric CRM IDs,
or positive integers. String IDs are not required to be numeric.

`participantName`, `attendees`, `attendeeIds`, `contactId`, and `contactType` are
display/response fields, not appointment patch fields. Use `contacts` for attendee
changes. Send a changed status through the separate status, confirm, or cancel
endpoint, rather than including `status` in the patch.

## Return value(s)

An object with the following property:

| Parameter     | Description                                                                             |
|---------------|-----------------------------------------------------------------------------------------|
| `appointment` | The full updated [appointment object](listAppointments.md#appointment-object).          |

If the appointment cannot be found or updated, return:

| Parameter       | Description                                                      |
|-----------------|------------------------------------------------------------------|
| `successful`    | `false`                                                          |
| `returnMessage` | An object with `message`, `messageType`, and `ttl`.              |

**Example**
```js
return {
  appointment: {
    id: "12345",
    thirdPartyAppointmentId: "12345",
    title: "Updated intake call",
    description: "Rescheduled",
    startTimeUtc: "2024-03-16T10:00:00.000Z",
    durationMinutes: 30,
    status: "scheduled",
    contactId: "",
    attendees: []
  }
};
```

## Reference

=== "Clio"

    ```js
    --8<-- "src/connectors/clio/index.ts:1271:1355"
    ```
