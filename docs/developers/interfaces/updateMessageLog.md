# updateMessageLog

The `updateMessageLog` interface is an essential part of maintaining a single, unified log for a conversation within a rolling 24-hour window.

| Event                                                   | App Connect Action       | Developer Expectation                                      |
|---------------------------------------------------------|--------------------------|------------------------------------------------------------|
| First message received in a 24-hour window              | Calls `createMessageLog` | Create a new message log entry.                            |
| Subsequent messages received within that 24-hour window | Calls `updateMessageLog` | Update the existing log entry created by createMessageLog. |


This mechanism ensures that a series of related messages are logged as modifications to a single conversation record rather than creating a new log entry for every single message.

## Input parameters

| Parameter            | Description                                                                                              |
|----------------------|----------------------------------------------------------------------------------------------------------|
| `user`               | An object describing the Chrome extension user associated with the action that triggered this interface. |
| `authHeader`         | The HTTP Authorization header to be transmitted with the API request to the target CRM.                  |
| `contactInfo`        | has `id`, `phoneNumber`, `type`, `name`                                                                  |
| `existingMessageLog` | The activity log being updated. This contains the original text, which you will need to update.          |
| `message`            | The message you will need to append to the existing message log                                          |

## Reference

=== "Example CRM"

    ```js
    {!> src/adapters/testCRM/index.js [ln:419-449] !}
	```
	
=== "Pipedrive"

	```js
    {!> src/adapters/pipedrive/index.js [ln:605-654] !}
	```

