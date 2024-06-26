# updateCallLog

This interface is called when a call log activity record needs to be updated. This interface is invoked in response to the following user actions:

* The user of the Unified CRM Chrome extension updates the subject or notes associated with a call log. 
* When a recording has become available for a phone call.

### Adding a recording to a call log entry

Events are triggers the moment a phone call is completed so that it can be logged properly. However, recordings take additional time to process and encode to make available to users. Therefore, for any given call you will receive an event when the call ends, and a subsequent event when a record is made available (assuming a recording of the call was made). 

It is the developer's responsibility to update the call log record contents as they see fit to make a call recording available. 

## Input parameters

| Parameter              | Description                                                                                              |
|------------------------|----------------------------------------------------------------------------------------------------------|
| `user`                 | An object describing the Chrome extension user associated with the action that triggered this interface. | 
| `existingCallLog`      | All the metadata associated with the call to be logged. [Call Log schema](https://developers.ringcentral.com/api-reference/Call-Log/readUserCallRecord) is described in our API Reference. |
| `authHeader`           | The HTTP Authorization header to be transmitted with the API request to the target CRM.                  | 
| `recordingLink`        | If the call has a recording associated with it, then this field will contain a link to the voicemail.    |
| `subject`              | The subject or summary of the call activity. The value may have been changes by the user.                |
| `note`                 | The notes saved by the user. The value may change if the user has updated the notes they have taken.     |

### Contact Info

```js
{ 
  id: "<string">,
  type: "<string>", 
  phoneNumber: "<E.164 Phone Number>",
  name: "<string>"
}
```

## Return value(s)

An object with following properties:

| Parameter              | Description                                                                                              |
|------------------------|----------------------------------------------------------------------------------------------------------|
|`updatedNote`| updated note on CRM |
|`returnMessage`|`message`, `messageType` and `ttl`|

**Example**
```js
  return {
    updatedNote: "Some random notes",
    returnMessage:{
      message: 'Call logged',
      messageType: 'success', // 'success', 'warning' or 'danger'
      ttl: 30000 // in miliseconds
    }
  }
```

## Reference

=== "Example CRM"

    ```js
    {!> src/adapters/testCRM/index.js [ln:362-392] !}
	```
	
=== "Pipedrive"

	```js
    {!> src/adapters/pipedrive/index.js [ln:307-340] !}
	```

