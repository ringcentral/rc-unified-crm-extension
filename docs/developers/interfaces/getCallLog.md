# getCallLog

This function is to return call log from CRM to client extension.

#### Params
`Input`:
- `user`: user entity
- `callLogId`: crm call log id
- `authHeader`: auth header for CRM API call

`Output`:
- `subject`: call log subject
- `note`: call log user note

#### Reference
=== "Example CRM"

    ```js
    {!> src/adapters/testCRM/index.js [ln:199-223] !}
	```
	
=== "Pipedrive"

	```js
    {!> src/adapters/pipedrive/index.js [ln:285-304] !}
	```

