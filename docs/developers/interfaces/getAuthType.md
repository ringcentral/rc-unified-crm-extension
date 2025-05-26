# getAuthType

This method returns either `oauth` or `apiKey`. 

## Request parameters

None.

## Return value(s)

This interface returns a single string, either `oauth` or `apiKey` to indicate what kind of auth is supported by the target CRM. 

## Reference

=== "Example CRM"

    ```js
    {!> src/adapters/testCRM/index.js [ln:15-17] !}
	```
	
=== "Pipedrive"

	```js
    {!> src/adapters/pipedrive/index.js [ln:8-10] !}
	```

