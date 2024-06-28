# addMessageLog

This interface is responsible for creating a new messaging log record in the associated CRM. The message or messages must be associated with the contact passed in as a request parameter. Other associations may be made depending upon the CRM and the adapter. This interface is always invoked for a single SMS message.

### Creating daily digests of an SMS conversation

To prevent SMS conversations with a customer from overwhelming the CRM with a multitude of SMS messages, the Unified CRM extension creates a daily digest for each SMS conversation with a customer into which all SMS messages for a 24 hour period are aggregated. 

Therefore, this interface is only invoked when the daily digest is created. The [`updateMessageLog`](updateMessageLog.md) interface is invoked for all subsequent SMS messages in that 24 hour period. 

## Input parameters

| Parameter              | Description                                                                                              |
|------------------------|----------------------------------------------------------------------------------------------------------|
| `user`                 | An object describing the Chrome extension user associated with the action that triggered this interface. |
| `contactInfo`          | An associative array describing the contact a call is associated with.                                   |
| `authHeader`           | The HTTP Authorization header to be transmitted with the API request to the target CRM.                  |
| `message`              | All the metadata associated with the message to be logged.  [SMS message schema](https://developers.ringcentral.com/api-reference/Message-Store/readMessage) is described in our API Reference. |
| `additionalSubmission` | All of the additional custom fields defined in the manifest and submitted by the user.                   |
| `recordingLink`        | If the call was a voicemail, then this field will contain a link to the voicemail.                       |
| `timezoneOffset`       | The timezone offset of the current user in the event you need to use UTC when calling the CRM's API.     |

### message

```js
{
  "uri" : "https://platform.ringcentral.com/restapi/xxxxxxx/message-store/60279564004",
  "id" : 60279564004,
  "to" : [ {
    "phoneNumber" : "+16505553204",
    "location" : "San Mateo, CA"
  } ],
  "from" : {
    "phoneNumber" : "+18885550052"
  },
  "type" : "SMS",
  "creationTime" : "2015-02-18T13:24:50.000Z",
  "readStatus" : "Read",
  "priority" : "Normal",
  "attachments" : [ {
    "id" : 60279564004,
    "uri" : "https://media.ringcentral.com/restapi/xxxxxxxxxxxx/content/60279564004",
    "type" : "Text",
    "contentType" : "text/plain"
  } ],
  "direction" : "Outbound",
  "availability" : "Alive",
  "subject" : "Flight information",
  "messageStatus" : "Sent",
  "smsSendingAttemptsCount" : 1,
  "conversationId" : 5578984350117917661,
  "lastModifiedTime" : "2015-02-18T13:24:50.300Z"
}
```

## Return value(s)

An object with following properties:

| Parameter              | Description                                                                                              |
|------------------------|----------------------------------------------------------------------------------------------------------|
|`logId`| ID of the log entry created within the CRM|
|`returnMessage`|`message`, `messageType` and `ttl`|

**Example**
```js
  return {
    logId: "xxxx-xxx", // ID of log entity on CRM platform
    returnMessage:{
      message: 'Logged',
      messageType: 'success', // 'success', 'warning' or 'danger'
      ttl: 30000 // in miliseconds
    }
  }
```


## Reference

=== "Example CRM"

    ```js
    {!> src/adapters/testCRM/index.js [ln:320-359] !}
	```
	
=== "Pipedrive"

	```js
    {!> src/adapters/pipedrive/index.js [ln:232-305] !}
	```

