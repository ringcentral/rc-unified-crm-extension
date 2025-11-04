# updateMessageLog

This function is to add following messages on the same day to the same contact. Use case is explained [here](./createMessageLog.md)

## Input parameters

| Parameter          | Description                                                                                              |
|--------------------|----------------------------------------------------------------------------------------------------------|
| `user`             | An object describing the Chrome extension user associated with the action that triggered this interface. |
| `authHeader`           | The HTTP Authorization header to be transmitted with the API request to the target CRM.                  | 
| `contactInfo`          | An associative array describing the contact a call is associated with.                                   |
| `existingMessageLog`          | existing message log entity                                 |
| `message`           | message text                | 

## Reference

=== "Example CRM"

    ```js
    {!> packages/template/src/connectors/interfaces/updateMessageLog.js !}
	```
	
=== "Pipedrive"

	```js
    {!> src/connectors/pipedrive/index.js [ln:611-660] !}
	```

