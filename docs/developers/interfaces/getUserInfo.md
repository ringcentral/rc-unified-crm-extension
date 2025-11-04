# getUserInfo

This method results in the connector calling the CRM to retrieve key information about the currently logged in user. This method should return an associative array containing the following keys and values.

| Key                      | Value                                                                                                       |
|--------------------------|-------------------------------------------------------------------------------------------------------------|
| `authHeader`                     | The HTTP Authorization header to be transmitted with the API request to the target CRM.   |

=== "Example CRM"

    ```js
    {!> packages/template/src/connectors/interfaces/getUserInfo.js !}
	```
	
=== "Pipedrive"

	```js
    {!> src/connectors/pipedrive/index.js [ln:28-82] !}
	```
