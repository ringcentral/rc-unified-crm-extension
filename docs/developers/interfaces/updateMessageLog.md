# updateMessageLog

This interface is invoked when a new SMS message has been received, and the daily digest for that SMS conversation needs to be updated, as explained in more detail in [`addMessageLog`](./addMessageLog.md).

Developers are responsible for making modifications to the `existingMessageLog` to insert the newly received messaging into the body of the SMS message log. 

## Input parameters

| Parameter            | Description                                                                                              |
|----------------------|----------------------------------------------------------------------------------------------------------|
| `user`               | An object describing the Chrome extension user associated with the action that triggered this interface. | 
| `contactInfo`        | An associative array describing the contact a call is associated with.                                   |
| `existingMessageLog` | The current contents of the existing message log within the CRM.                                         |
| `message`            | All the metadata associated with the message to be logged.  [SMS message schema](https://developers.ringcentral.com/api-reference/Message-Store/readMessage) is described in our API Reference. |
| `authHeader`         | The HTTP Authorization header to be transmitted with the API request to the target CRM.                  | 

## Return value(s)



## Reference

=== "Example CRM"

    ```js
    {!> src/adapters/testCRM/index.js [ln:304-334] !}
	```
	
=== "Pipedrive"

	```js
    {!> src/adapters/pipedrive/index.js [ln:249-282] !}
	```

