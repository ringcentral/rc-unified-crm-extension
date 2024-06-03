# createContact

This function is to create a placeholder contact, ONLY in the following case:
* User adds a new call/message log against a number with no matched contact. In another words, create placeholder contact is tied to call/message logging action

To create a new contact on CRM platform, you might need more infomation than contact's name. It's important to address here that the framework uses this as a way to add a placeholder contact and user can do further editting after the call is logged.

#### Params

`Input`:
- `user`: user entity
- `authHeader`: auth header for CRM API call
- `phoneNumber`: contact phone number in E.164 format
- `newContactName`: new contact's name
- `newContactType`: (optional) new contact's type

#### Reference
=== "Example CRM"

    ```js
    {!> src/adapters/testCRM/index.js [ln:332-393] !}
	```
	
=== "Pipedrive"

	```js
    {!> src/adapters/pipedrive/index.js [ln:114-129] !}
	```

