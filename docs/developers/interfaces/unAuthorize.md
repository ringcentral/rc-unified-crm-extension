# unAuthorize

It is to remove user data from our database when user chooses to log out. Some CRMs have token invalidation mechanism, if so, please implement that as well.

## Request parameters

| Parameter    | Description                                                                                              |             |
|--------------|----------------------------------------------------------------------------------------------------------|-------------|
| `user`       | An object describing the Chrome extension user associated with the action that triggered this interface. |             |

## Return value(s)

| Parameter              | Description                                         |
|------------------------|-----------------------------------------------------|
| `returnMessage`|       `message`, `messageType` and `ttl`|

**Example**

```js
{
  returnMessage:{
    message: 'Successfully unauthorized',
    messageType: 'success', // 'success', 'warning' or 'danger'
    ttl: 30000 // in miliseconds
  }
}
```

## Reference

=== "Example CRM"

    ```js
    {!> src/adapters/testCRM/index.js [ln:115-137] !}
	```
	
=== "Pipedrive"

	```js
    {!> src/adapters/pipedrive/index.js [ln:63-92] !}
	```

