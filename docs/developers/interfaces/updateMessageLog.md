# updateMessageLog

This function is to add following messages on the same day to the same contact. Use case is explained [here](./createMessageLog.md)

#### Params
`Input`:
- `user`: user entity
- `contactInfo`: has `id`, `phoneNumber`, `type`, `name`
- `existingMessageLog`: existing message log entity
- `authHeader`: auth header for CRM API call
- `message`: message text

#### Reference

=== "Example CRM"

    ```js
    {!> src/adapters/testCRM/index.js [ln:511-541] !}
	```
	
=== "Pipedrive"

	```js
    {!> src/adapters/pipedrive/index.js [ln:528-576] !}
	```

