# cancelAppointment

This interface cancels or deletes an appointment in the connected CRM. It is called when a user cancels an appointment from within App Connect's appointment panel.

!!! note "Cancellation vs deletion"
    The distinction between cancelling and hard-deleting an appointment is CRM-specific. Clio permanently deletes the calendar entry. NetSuite patches the appointment's status field to mark it cancelled and keeps the record. Implement whichever behavior is appropriate for your CRM and document it for users.

## Input parameters

| Parameter       | Description                                                                                         |
|-----------------|-----------------------------------------------------------------------------------------------------|
| `user`          | An object describing the Chrome extension user associated with the action that triggered this interface. |
| `authHeader`    | The HTTP Authorization header to be transmitted with the API request to the target CRM.             |
| `appointmentId` | The CRM ID of the appointment to cancel.                                                            |

## Return value(s)

An object indicating the result of the operation:

| Parameter       | Description                                                                                   |
|-----------------|-----------------------------------------------------------------------------------------------|
| `successful`    | `true` if the cancellation succeeded, `false` otherwise.                                      |
| `returnMessage` | (Optional) An object with `message`, `messageType`, and `ttl` to display to the user.         |

**Example**
```js
return {
  successful: true,
  returnMessage: {
    message: 'Appointment cancelled.',
    messageType: 'success',
    ttl: 3000
  }
};
```

## Reference

=== "Clio"

    ```js
    --8<-- "src/connectors/clio/index.ts:1373:1395"
    ```
