# refreshAppointment

This interface fetches the latest state of a single appointment from the CRM. It is called when a user opens an appointment detail view or manually refreshes an appointment to pick up changes made directly in the CRM.

## Input parameters

| Parameter       | Description                                                                                         |
|-----------------|-----------------------------------------------------------------------------------------------------|
| `user`          | An object describing the Chrome extension user associated with the action that triggered this interface. |
| `authHeader`    | The HTTP Authorization header to be transmitted with the API request to the target CRM.             |
| `appointmentId` | The CRM ID of the appointment to retrieve.                                                          |

## Return value(s)

An object with the following property:

| Parameter     | Description                                                                               |
|---------------|-------------------------------------------------------------------------------------------|
| `appointment` | The current [appointment object](listAppointments.md#appointment-object) from the CRM.    |

If the appointment cannot be found, return:

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
    title: "Intake call with Jane Smith",
    description: "Initial consultation",
    startTimeUtc: "2024-03-15T14:00:00.000Z",
    durationMinutes: 60,
    status: "scheduled",
    contactId: "67890",
    attendees: [{ id: 67890, name: "Jane Smith", type: "Contact" }]
  }
};
```

## Reference

=== "Clio"

    ```js
    --8<-- "src/connectors/clio/index.ts:1357:1370"
    ```
