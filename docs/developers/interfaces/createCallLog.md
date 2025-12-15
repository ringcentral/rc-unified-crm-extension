# createCallLog

This interface is responsible for creating a new call log record in the associated CRM. The call must be associated with the contact passed in as a request parameter. Other associations may be made depending upon the CRM and the connector. 

There is an underlying assumption of the framework that there is a one-to-one mapping between notes (or activities) and phone calls. Therefore, when logging a call in the target CRM only create a single log entry. 

## Input parameters

| Parameter              | Description                                                                                              |
|------------------------|----------------------------------------------------------------------------------------------------------|
| `user`                 | An object describing the Chrome extension user associated with the action that triggered this interface. | 
| `contactInfo`          | An associative array describing the contact a call is associated with.                                   |
| `authHeader`           | The HTTP Authorization header to be transmitted with the API request to the target CRM.                  | 
| `callLog`              | All the metadata associated with the call to be logged. [Call Log schema](https://developers.ringcentral.com/api-reference/Call-Log/readUserCallRecord) is described in our API Reference. |
| `note`                 | The notes saved by the user during and/or after the call.                                                |
| `additionalSubmission` | All of the additional custom fields defined in the manifest and submitted by the user.                   |
| `aiNote`       |  AI summary of the phone call   | 
| `transcript`       |  Transcript of the phone call   | 
| `ringSenseTranscript`  | The transcript from [ACE](../../users/ace.md) | 
| `ringSenseSummary`     | The summary from [ACE](../../users/ace.md) | 
| `ringSenseBulletedSummary`     | The bulleted summary from [ACE](../../users/ace.md) |
| `ringSenseAIScore`     | The AI score from [ACE](../../users/ace.md) | 
| `ringSenseLink`     | The link to [ACE](../../users/ace.md) recording | 
| `composedLogDetails`       |  Formated log details that can be directly put into log body  | 

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

| Parameter       | Description                                |
|-----------------|--------------------------------------------|
| `logId`         | ID of the log entry created within the CRM |
| `returnMessage` | `message`, `messageType` and `ttl`         |

**Example**
```js
  return {
    logId: "xxx-xxxxx", // ID of log entity on CRM platform
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
    {!> packages/template/src/connectors/interfaces/createCallLog.js !}
	```
	
=== "Pipedrive"

	```js
    {!> src/connectors/pipedrive/index.js [ln:342-421] !}
	```

### Example Call Log Schema

```js
{
  "uri" : "https://platform.ringcentral.com/restapi/v1.0/account/1477535004/extension/1477535004/call-log/X2AvJPtwNQbNQA?view=Detailed",
  "id" : "X2AvJPtwNQbNQA",
  "sessionId" : "4503991004",
  "telephonySessionId": "s-9a03590172ea4d39a7cf7d5b6dba6a3b",
  "startTime" : "2018-09-11T13:24:09.000Z",
  "duration" : 7,
  "type" : "Voice",
  "direction" : "Inbound",
  "action" : "Phone Call",
  "result" : "Accepted",
  "to" : {
    "phoneNumber" : "+18662019834",
    "name" : "Jane Smith"
  },
  "from" : {
    "phoneNumber" : "+16504445566",
    "name" : "John Smith",
    "location" : "Palo Alto, CA"
  },
  "extension" : {
    "uri" : "https://platform.ringcentral.com/restapi/v1.0/account/1477535004/extension/1477535004",
    "id" : 1477535004
  },
  "transport" : "PSTN",
  "lastModifiedTime" : "2018-09-11T13:24:12.003Z",
  "billing" : {
    "costIncluded" : 0.000,
    "costPurchased" : 0.000
  },
  "legs" : [ {
    "startTime" : "2018-09-11T13:24:09.000Z",
    "duration" : 7,
    "type" : "Voice",
    "direction" : "Inbound",
    "action" : "Phone Call",
    "result" : "Accepted",
    "to" : {
      "phoneNumber" : "+18662019834",
      "name" : "Jane Smith"
    },
    "from" : {
      "phoneNumber" : "+16504445566",
      "name" : "John Smith",
      "location" : "Palo Alto, CA"
    },
    "extension" : {
      "uri" : "https://platform.ringcentral.com/restapi/v1.0/account/1477535004/extension/1477535004",
      "id" : 1477535004
    },
    "transport" : "PSTN",
    "legType" : "Accept",
    "master" : true
  } ]
}
```
