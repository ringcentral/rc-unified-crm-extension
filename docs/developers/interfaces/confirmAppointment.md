# confirmAppointment

This interface marks an existing appointment as confirmed in the connected CRM. Not all CRMs support a distinct "confirmed" status — implement this interface only if the target CRM supports explicit appointment confirmation.

!!! note "CRM support"
    `confirmAppointment` is currently implemented in NetSuite, where appointment status can be explicitly set to `"confirmed"`. If your CRM does not have a distinct confirmed status, you do not need to implement this interface.

## Input parameters

| Parameter       | Description                                                                                         |
|-----------------|-----------------------------------------------------------------------------------------------------|
| `user`          | An object describing the Chrome extension user associated with the action that triggered this interface. |
| `authHeader`    | The HTTP Authorization header to be transmitted with the API request to the target CRM.             |
| `appointmentId` | The CRM ID of the appointment to confirm.                                                           |

## Return value(s)

An object indicating the result of the operation:

| Parameter       | Description                                                                                   |
|-----------------|-----------------------------------------------------------------------------------------------|
| `successful`    | `true` if the confirmation succeeded, `false` otherwise.                                      |
| `returnMessage` | (Optional) An object with `message`, `messageType`, and `ttl` to display to the user.         |
| `appointment`   | (Optional) The updated [appointment object](listAppointments.md#appointment-object).           |

**Example**
```js
return {
  successful: true,
  returnMessage: {
    message: 'Appointment confirmed.',
    messageType: 'success',
    ttl: 3000
  }
};
```
