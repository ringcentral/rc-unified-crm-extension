# updateCallLog

This function is to update call log in following 2 scenarios:
1. User edit log to update subject or note
2. Call recording link is synced to the extension and then passed to server

* Call recording link will be ready and synced to client extension with delay after a recorded call. If user logs the call immediately after it ends, the log info won't contain recording link. And the link will be automatically passed to server and you want to update it onto previous log.

#### Params
`Input`:
- `user`: user entity
- `existingCallLog`: existing call log entity
- `authHeader`: auth header for CRM API call
- `recordingLink`: call recording link
- `subject`: updated log subject
- `note`: updated user note

`Output`:
- `id`: call log id

#### Reference
=== "Example CRM"

    ```js
    {!> src/adapters/testCRM/index.js [ln:227-264] !}
	```
	
=== "Pipedrive"

	```js
    {!> src/adapters/pipedrive/index.js [ln:158-195] !}
	```

