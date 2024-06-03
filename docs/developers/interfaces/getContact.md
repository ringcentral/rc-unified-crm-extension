# getContact

This interface is a central interface to the Unified CRM adapter framework as it is responsible for matching phone numbers with contacts in the target CRM. This interface powers the following key features:

* call pop
* call logging
* sms logging

This interface can return one or more contacts. If multiple contacts are returned, the Unified CRM extension will prompt the end user to select the specific contact to be used when logging calls. 

This interface is called in the following circumstances:

* When a call is received.
* When a user manually clicks the "refresh contact" action for a contact or phone call. 
* When a user accesses the Unified CRM Chrome extension the first time in an attempt to perform an initial contact match operation for recent phone calls. 

<figure markdown>
  ![Manually refresh contact](../../img/manually-refresh-contact.png)
  <figcaption>The "Refresh contact" action in the Unified CRM extension's contact list</figcaption>
</figure>

## Request parameters

| Parameter          | Description                                                                                           |
|--------------------|-------------------------------------------------------------------------------------------------------|
| `user`           | An object describing the Chrome extension user associated with the action that triggered this interface. |
| `authHeader`       | The HTTP Authorization header to be transmitted with the API request to the target CRM.               |
| `phoneNumber`      | The phone number to search for within the target CRM, provided in an E.164 format, e.g. +11231231234. |
| `overridingFormat` | (Optional) If defined by the user under advanced settings, this will contain alternative formats the user may wish to use when searching for the `phoneNumber`                                                                                           |

!!! warning "Alternative formats"
    Some CRM's have very restrictive APIs with regards to searching for phone numbers, meaning they require an *exact match* in order to find a contact with that phone number. To work around this restriction, users are allowed to specify a [list of phone number formats](../../users/settings.md#phone-number-formats) which they often use when entering phone numbers into the CRM. It is the intention that each adapter when provided a list of `overridingFormat` values to convert the E.164 phone number into each of the overriding formats, and to search for each one until a contact is found.
	
	*Remember: only a single call the* `getContact` *interface will be made. The developer is responsible for searching for each alternative format.*

## Return value(s)

This interface should return an ARRAY of object. Each object in the array represents a contact found in the CRM that is associated with the given phone number. 

**Example**

```js
{
  id: "<string>",
  name: "<string>",
  phone: "<string>",
  additionalInfo: <object>
}
```

## Reference

=== "Example CRM"

    ```js
    {!> src/adapters/testCRM/index.js [ln:121-156] !}
	```
	
=== "Pipedrive"

	```js
    {!> src/adapters/pipedrive/index.js [ln:67-101] !}
	```

