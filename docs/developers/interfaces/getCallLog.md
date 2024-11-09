# getCallLog

This interface retrieves a previously logged call log record in the target CRM. This information is used to render a form to allow an end user to view or edit that record within the App Connect client.

## Request parameters

| Parameter    | Description                                                                             |
|--------------|-----------------------------------------------------------------------------------------|
| `user`       | TODO                                                                                    |
| `callLogId`  | The ID of the activity or call log record within the CRM.                               |
| `authHeader` | The HTTP Authorization header to be transmitted with the API request to the target CRM. |


## Return value(s)

This interface should return the associated call log record in a prescribed format. 

| Parameter              | Description                                         |
|------------------------|-----------------------------------------------------|
| `callLogInfo`              | Contain `subject`, `note` and optionally `additionalSubmission` |
| `returnMessage`|       `message`, `messageType` and `ttl`|

**Example**

```js
{
  callLogInfo:{
    subject: "A new call from John Doe",
    note: "Delivery location changed.",
    additionalSubmission: {
      address: "12 Some Street, CA"
    }
  },
  returnMessage:{
    message: 'Log fetched',
    messageType: 'success', // 'success', 'warning' or 'danger'
    ttl: 30000 // in miliseconds
  }
}
```

## Reference

=== "Example CRM"

    ```js
    {!> src/adapters/testCRM/index.js [ln:246-276] !}
	```
	
=== "Pipedrive"

	```js
    {!> src/adapters/pipedrive/index.js [ln:356-377] !}
	```

