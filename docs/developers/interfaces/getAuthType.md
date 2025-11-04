# getAuthType

This method returns either `oauth` or `apiKey`. 

## Request parameters

None.

## Return value(s)

This interface returns a single string, either `oauth` or `apiKey` to indicate what kind of auth is supported by the target CRM. 

## Reference

=== "Example CRM"

    ```js
    {!> packages/template/src/connectors/interfaces/getAuthType.js !}
	```
	
=== "Pipedrive"

	```js
    {!> src/connectors/pipedrive/index.js [ln:11-13] !}
	```

