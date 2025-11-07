# findContactWithName

!!! info "Optional interface"
    If this interface is implemented, "**Search contacts**" (with name) would be provided as an option in contact matching.

It is not uncommon that when logging a call, a contact cannot be found using the [findContact](findContact.md) interface which attempts to lookup a contact into the target CRM via a phone number. Sometimes however, a contact cannot be found, but is in fact known to be in the CRM. This is when this interface comes into play. 

<figure markdown>
  ![Search contacts in a CRM](../../img/search-contacts.png)
  <figcaption>Searching contacts in a CRM via App Connect</figcaption>
</figure>


When a contact cannot be found, users are given the option to search the CRM for a contact by name. This allows users to associate calls with contacts in a more manual fashion when a contact is not found via a phone number. 

This interface is called to facilitate that search process. 

## Request parameters

| Parameter    | Description                                                                                              |
|--------------|----------------------------------------------------------------------------------------------------------|
| `user`       | An object describing the Chrome extension user associated with the action that triggered this interface. |
| `authHeader` | The HTTP Authorization header to be transmitted with the API request to the target CRM.                  |
| `name`       | The text entered by the user that should be searched for within the CRM.                                 |

## Return value(s)

This interface returns a single object. That object describes the contacts that were found. It has following properties:

| Parameter            | Description                                                                                     |
|----------------------|-------------------------------------------------------------------------------------------------|
| `successful`         | True or false is a contact was found or not.                                                    |
| `matchedContactInfo` | An array of objects containing `id`, `name` and optionally `additionalInfo` and `isNewContact`. |

**Example**

```js
{
  successful: true,
  matchedContactInfo:[
    {
      id: 'contact id',
      name: 'John Doe',
	  phone: '(123) 456-7890',
	  type: 'Lead',
      additionalInfo: null,
      isNewContact: false
    }
  ]
}
```

## Reference


=== "Example CRM"

    ```js
    {!> packages/template/src/connectors/interfaces/findContactWithName.js !}
	```


=== "Clio"

	```js
    {!> src/connectors/pipedrive/index.js [ln:204-261] !}
	```

