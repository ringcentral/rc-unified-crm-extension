# getContact

This function is to get an array of matched contacts by phone number from CRM platform. Certain number formatting might be required so to make the search more accurate.

* If CRM only supports exact match, `overridingFormat` is provided as a workaround. It is setup from the extesion options and passed in as eg. `(***) ***-****`. Please refer to [user guide](../../users/settings.md#phone-number-formats) on how it works.

![overriding format seutp](../../img/overriding-format-setup.png)

It gets called by the client extension in 3 different cases:
1. First time use after installation
2. A new call from/to the contact is connected
3. Manually click "Refresh contact"

![manually refresh contact](../../img/manually-refresh-contact.png)

#### Params
`Input`:
- `user`: user entity
- `authHeader`: auth header for CRM API call
- `phoneNumber`: contact phone number in E.164 format
- `overridingFormat`: (refer to above)

`Output`:
- `foundContacts`: an array of all matched contacts found
    - `id`: crm contact id
    - `name`: crm contact name
    - `type`: crm contact type (optional)
    - `phone`: phone number
    - `additionalInfo`: crm contact additional associations. (eg. `deal` in Pipedrive, `matter` in Clio)

#### Reference
=== "Example CRM"

    ```js
    {!> src/adapters/testCRM/index.js [ln:121-155] !}
	```
	
=== "Pipedrive"

	```js
    {!> src/adapters/pipedrive/index.js [ln:67-101] !}
	```

