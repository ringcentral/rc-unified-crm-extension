# getCallLog

This interface retrieves a previously logged call log record in the target CRM. This information is used to render a form to allow an end user to view or edit that record within the Unified CRM extension. 

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
| `subject`              | The subject or summary line of the activity record. |
| `note`                 | The contents of the activity record.                |
| `additionalSubmission` | A set of key/value pairs describing the additional fields associated with a call log record. These fields correspond to the custom fields as defined by the adapter's manifest. |

**Example**

```js
{
  subject: "<string>",
  note: "<string>",
  additionalSubmission: "<object>"
}
```

## Examples

=== "Example CRM"

    ```js
    {!> src/adapters/testCRM/index.js [ln:194-218] !}
	```
	
=== "Pipedrive"

	```js
    {!> src/adapters/pipedrive/index.js [ln:285-304] !}
	```

