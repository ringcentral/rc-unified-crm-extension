# createContact

This interface is invoked whenever a new contact needs to be created in the target CRM. This happens when a user of the Unified CRM Chrome extension has elected to create a "placeholder contact." 

This function is to create a placeholder contact, ONLY in the following case:
* User adds a new call/message log against a number with no matched contact. In another words, create placeholder contact is tied to call/message logging action

## Manifest elements

Every CRM can define a different set of contact types, or data elements that can be associated with an activity (call or SMS) log. Within the `platforms.[crm name]` section of your manifest, provide the list of contact types supported by the target CRM.

```js
..snip..
"contactTypes": [
   "TestContactType",
   "Contact"
],
..snip..
```

## Request parameters

| Parameter        | Description                                                                                              |
|------------------|----------------------------------------------------------------------------------------------------------|
| `user`           | An object describing the Chrome extension user associated with the action that triggered this interface. |
| `authHeader`     | The HTTP Authorization header to be transmitted with the API request to the target CRM.                  |
| `phoneNumber`    | The phone number of the contact in E.164 format, e.g. +1231231234.                                       |
| `newContactName` | The name of the contact as entered by the user.                                                          |
| `newContactType` | The contact type the user selected to indicate what kind of contact to create.                           |

## Return value(s)

This interface returns a single object. That object describes the contact that was created. 

| Parameter | Description                                                                                                          |
|-----------|----------------------------------------------------------------------------------------------------------------------|
| `id`      | The ID of the contact in the target CRM.                                                                             |
| `name`    | The display name of the contact. This name will appear and be associated with all users with the same `phoneNumber`. |

**Example**

```js
{
  id: "<string>",
  name: "<string>"
}
```

## Reference

=== "Example CRM"

    ```js
    {!> src/adapters/testCRM/index.js [ln:336-397] !}
	```
	
=== "Pipedrive"

	```js
    {!> src/adapters/pipedrive/index.js [ln:114-129] !}
	```

