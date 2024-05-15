# Loading a contact record

{! docs/developers/beta_notice.inc !}

A critical function performed by the server is looking up a contact record in the target CRM given a phone number, and returning a list of matches for that phone number. In addition, the framework will transmit a list of alternative phone number formats to search for. 

!!! tip "Alternative phone number formats"
    Some CRMs expose a contact search API that is very strict with regards to phone number lookup. For example, if a CRM only supports an EXACT MATCH then searching for an E.164 phone number may not yield any results if the phone number is stored in any other format.
	
	As a workaround, the CRM framework allows users to specify additional phone number formats that they typically store phone numbers in. This list of phone numbers is transmitted to the adapter's server, so that the associated adapter can search for a contact using multiple phone number formats until one is found.

### Endpoint

* HTTP method: GET
* HTTP endpoint: `<server base URL>/contact`

### Request parameters

| Name               | Description                                                                                            |
|--------------------|--------------------------------------------------------------------------------------------------------|
| `jwtToken`         | An encrypted string that includes the current user's ID and the associated CRM.                        |
| `phoneNumber`      | The phone number in E.164 format that should be searched for in the associated CRM.                    |
| `overridingFormat` | A comma-delimitted list of phone number formats that should be used when searching the associated CRM. |

### Response

The server should return an ARRAY of possible matches for the given phone number. 

| Name             | Description                                                       |
|------------------|-------------------------------------------------------------------|
| `id`             | The unique ID of the contact in the target CRM.                   |
| `name`           | The full name of the contact in the target CRM.                   |
| `phone`          | The phone number of the contact as stored in the CRM.             |
| `organization`   | The company name or affiliation of the contact in the target CRM. |
| `additionalInfo` | Correspondes to contact-dependent `additionalFields` for Call/Message page |

### Example

```js
[
  {
    'id': 80723490120943,
    'name': 'Luke Skywalker',
    'phone': '+16505551212',
    'organization': 'Rebel Alliance',
    'additionalInfo': {
	    'associations': [
		   {
		      'id': 1837202932,
			    'label': 'Jedi Order' 
		   }
		]
	}
  }
]
```

#### Sample code

=== "Sample adapter"
    ```js
    {!> src/adapters/testCRM/index.js [ln:335-363]!}
    ```

=== "Pipedrive adapter"
    ```js
    {!> src/adapters/pipedrive/index.js [ln:66-100]!}
    ```

