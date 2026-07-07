# createAppointment

This interface creates a new appointment in the connected CRM. It is called when a user schedules a new appointment from within App Connect's appointment panel.

## Input parameters

| Parameter    | Description                                                                                         |
|--------------|-----------------------------------------------------------------------------------------------------|
| `user`       | An object describing the Chrome extension user associated with the action that triggered this interface. |
| `authHeader` | The HTTP Authorization header to be transmitted with the API request to the target CRM.             |
| `payload`    | An object describing the appointment to create. See [Payload schema](#payload-schema).              |

### Payload schema

| Property          | Type   | Description                                                                                     |
|-------------------|--------|-------------------------------------------------------------------------------------------------|
| `title`           | string | The appointment title or subject.                                                               |
| `summary`         | string | Notes or body text for the appointment.                                                         |
| `startTimeUtc`    | string | ISO-8601 UTC timestamp for the appointment start time.                                          |
| `durationMinutes` | number | Duration of the appointment in minutes.                                                         |
| `contacts`        | array  | (Optional) Array of contact IDs (strings or numbers) or contact objects with an `id` property to add as attendees. |

## Return value(s)

An object with the following properties:

| Parameter       | Description                                                    |
|-----------------|----------------------------------------------------------------|
| `appointmentId` | The ID of the newly created appointment in the CRM.            |
| `appointment`   | The full [appointment object](listAppointments.md#appointment-object) representing the created record. |

If the appointment cannot be created, return:

| Parameter       | Description                                                      |
|-----------------|------------------------------------------------------------------|
| `successful`    | `false`                                                          |
| `returnMessage` | An object with `message`, `messageType`, and `ttl`.              |

**Example**
```js
return {
  appointmentId: "12345",
  appointment: {
    id: "12345",
    thirdPartyAppointmentId: "12345",
    title: "Intake call with Jane Smith",
    description: "Initial consultation",
    startTimeUtc: "2024-03-15T14:00:00.000Z",
    durationMinutes: 60,
    status: "scheduled",
    contactId: "",
    attendees: [{ id: 67890, name: "Jane Smith", type: "Contact" }]
  }
};
```

## Reference

=== "Clio"

    ```js
    --8<-- "src/connectors/clio/index.ts:1216:1269"
    ```
