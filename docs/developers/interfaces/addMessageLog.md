# addMessageLog

This interface is responsible for creating a new messaging log record in the associated CRM. The message or messages must be associated with the contact passed in as a request parameter. Other associations may be made depending upon the CRM and the adapter. This interface can be invoked for a single SMS message, or for a group of SMS messages. 

## Input parameters

| Parameter              | Description                                                                            |
|------------------------|----------------------------------------------------------------------------------------|
| `user`                 | TODO | 
| `contactInfo`          | An associative array describing the contact a call is associated with.                  |
| `authHeader`           | The HTTP Authorization header to be transmitted with the API request to the target CRM. | 
| `message`              | All the metadata associated with the message to be logged. [SMS message schema](https://developers.ringcentral.com/api-reference/Message-Store/readMessage) is described in our API Reference. |
| `additionalSubmission` | All of the additional custom fields defined in the manifest and submitted by the user. |
| `recordingLink`        | TODO | 
| `timezoneOffset`       | TODO | 

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

The ID of the log entry created within the CRM.

=== "Example CRM"

    ```js
    {!> src/adapters/testCRM/index.js [ln:266-297] !}
	```
	
=== "Pipedrive"

	```js
    {!> src/adapters/pipedrive/index.js [ln:197-247] !}
	```

