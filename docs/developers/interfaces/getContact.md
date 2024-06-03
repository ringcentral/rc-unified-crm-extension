# getContact

This interface is a central interface to the Unified CRM adapter framework as it is responsible for matching phone numbers with contacts in the target CRM. This interface powers the following key features:

* call pop
* call logging
* sms logging

This interface can return one or more contacts. If multiple contacts are returned, the Unified CRM extension will prompt the end user to select the specific contact to be used when logging calls. 

## Request parameters

| Parameter          | Description                                                                                           |
|--------------------|-------------------------------------------------------------------------------------------------------|
| `user`             | TODO                                                                                                  |
| `authHeader`       | The HTTP Authorization header to be transmitted with the API request to the target CRM.               |
| `phoneNumber`      | The phone number to search for within the target CRM, provided in an E.164 format, e.g. +11231231234. |
| `overridingFormat` | (Optional) If defined by the user under advanced settings, this will contain alternative formats the user may wish to use when searching for the `phoneNumber`                                                                                           |

!!! warning "Alternative formats"
    Some CRM's have very restrictive APIs with regards to searching for phone numbers, meaning they require an *exact match* in order to find a contact with that phone number. To work around this restriction, users are allowed to specify a list of phone number formats which they often use when entering phone numbers into the CRM. It is the intention that each adapter when provided a list of `overridingFormat` values to convert the E.164 phone number into each of the overriding formats, and to search for each one until a contact is found.

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

## Examples

=== "Example CRM"

    ```js
    {!> src/adapters/testCRM/index.js [ln:117-151] !}
	```
	
=== "Pipedrive"

	```js
    {!> src/adapters/pipedrive/index.js [ln:67-101] !}
	```

