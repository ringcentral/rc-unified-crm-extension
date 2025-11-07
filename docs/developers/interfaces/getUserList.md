# getUserList

!!! info "Optional interface"
    If this interface is implemented, "**User mapping**" feature would be provided on Server-side call logging page.

The `getUserList` interface is used exclusively with the server-side call logging feature to assist in mapping RingCentral user identities to their corresponding identity within the connected CRM or application. This ensures that the notes created by the server-side call logging framework are assigned to the correct owner in the CRM so that attribution is accurate and that user can also edit the notes created on their behalf. 

App Connect will call this endpoint when server-side call logging is enabled, and periodically after that to keep systems in sync. It will then systematically call the [`getUserInfo`](getUserInfo.md) interface to attempt to map it to a RingCentral user via their email address. 

Any identity that is not successfully mapped using this method can be mapped manually by admins using the [user mapping](../../users/server-side-logging.md) feature. 

## Request parameters

| Key                      | Value                                                                                                       |
|--------------------------|-------------------------------------------------------------------------------------------------------------|
| `user`                 | An object describing the Chrome extension user associated with the action that triggered this interface. | 
| `authHeader`                     | The HTTP Authorization header to be transmitted with the API request to the target CRM.   |

## Return value(s)

This interface returns an array of users in the connected CRM or application. Each user record should contain the user's ID, name and email address. 

**Example**

```js
[
  { 
     'id': '123',
	 'name': 'Luke Skywalker',
	 'email': 'luke@jedicouncil.org'
  },
  { 
     'id': '456',
	 'name': 'Han Solo',
	 'email': 'han@rebelalliance.gov'
  }
]
```

## Reference

=== "Example CRM"

  ```js
    {!> packages/template/src/connectors/interfaces/getUserList.js !}
  ```

=== "Pipedrive"

	```js
    {!> src/connectors/bullhorn/index.js [ln:328-340] !}
	```

