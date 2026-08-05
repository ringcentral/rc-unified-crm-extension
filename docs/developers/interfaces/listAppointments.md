# listAppointments

This interface retrieves upcoming appointments from the connected CRM so they can be displayed within App Connect's appointment panel. It is called whenever a user opens or refreshes the appointments view.

## Input parameters

| Parameter    | Description                                                                                         |
|--------------|-----------------------------------------------------------------------------------------------------|
| `user`       | An object describing the Chrome extension user associated with the action that triggered this interface. |
| `authHeader` | The HTTP Authorization header to be transmitted with the API request to the target CRM.             |
| `range`      | (Optional) An object with `startTime` and `endTime` ISO-8601 strings defining the window of appointments to fetch. |
| `mineOnly`   | (Optional) Boolean. When `true`, return only appointments owned by the current user.                |

## Return value(s)

An object with the following property:

| Parameter      | Description                                           |
|----------------|-------------------------------------------------------|
| `appointments` | An array of [appointment objects](#appointment-object). |

### Appointment object

| Property                 | Type   | Description                                                                              |
|--------------------------|--------|------------------------------------------------------------------------------------------|
| `id`                     | string | The unique identifier of the appointment in the CRM.                                     |
| `thirdPartyAppointmentId`| string | Same as `id` — the CRM's native ID for the appointment.                                  |
| `title`                  | string | The appointment title or subject.                                                        |
| `description`            | string | Notes or body text for the appointment.                                                  |
| `startTimeUtc`           | string | ISO-8601 UTC timestamp of the appointment start time.                                    |
| `durationMinutes`        | number | Duration of the appointment in minutes.                                                  |
| `status`                 | string | Current status. Typically `"scheduled"`, `"cancelled"`, or `"confirmed"`.                |
| `contactId`              | string | ID of the primary contact associated with the appointment (empty string if none).        |
| `attendees`              | array  | Array of attendee objects, each with `id`, `name`, and `type`.                           |

**Example**
```js
return {
  appointments: [
    {
      id: "12345",
      thirdPartyAppointmentId: "12345",
      title: "Intake call with Jane Smith",
      description: "Initial consultation",
      startTimeUtc: "2024-03-15T14:00:00.000Z",
      durationMinutes: 60,
      status: "scheduled",
      contactId: "67890",
      attendees: [
        { id: 67890, name: "Jane Smith", type: "Contact" }
      ]
    }
  ]
};
```

## Reference

=== "Clio"

    ```js
    --8<-- "src/connectors/clio/index.ts:1176:1214"
    ```
