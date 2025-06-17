# createContact

This interface is invoked whenever a new contact needs to be created in the target CRM. This happens when a user of App Connect has elected to create a "placeholder contact." 

This function is to create a placeholder contact, ONLY in the following case:
* User adds a new call/message log against a number with no matched contact. In another words, create placeholder contact is tied to call/message logging action

## Manifest elements

Every CRM can define a different set of contact types, or data elements that can be associated with an activity (call or SMS) log. Within the `platforms.[crm name]` section of your manifest, provide the list of contact types supported by the target CRM.

```js
..snip..
"contactTypes": [
  {
    "display": "TestContactType",
    "value": "testContact"
  },
  {
    "display": "Contact",
    "value": "cta"
  }
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

This interface returns a single object. That object describes the contact that was created.  It has following properties:

| Parameter | Description                                                                                                          |
|-----------|----------------------------------------------------------------------------------------------------------------------|
|`contactInfo`| Contain `id` and `name`|
|`returnMessage`|`message`, `messageType` and `ttl`|

**Example**

```js
{
  contactInfo:{
    id: "xxxx-xxxxx", // ID of the contact in the target 
    name: "John Doe" // Display name of the contact. This name will appear and be associated with all users with the same `phoneNumber`.
  },
  returnMessage:{
    message: 'Contact created',
    messageType: 'success', // 'success', 'warning' or 'danger'
    ttl: 30000 // in miliseconds
  }
}
```

## Reference

=== "Example CRM"

    ```js
    {!> src/adapters/testCRM/index.js [ln:543-611] !}
	```
	
=== "Pipedrive"

	```js
    {!> src/adapters/pipedrive/index.js [ln:241-270] !}
	```

