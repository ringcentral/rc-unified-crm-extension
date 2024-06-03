# unAuthorize

It is to remove user data from our database when user chooses to log out. Some CRMs have token invalidation mechanism, if so, please implement that as well.

#### Params
`Input`:
- `user`: user entity

#### Reference
=== "Example CRM"

    ```js
    {!> src/adapters/testCRM/index.js [ln:97-117] !}
	```
	
=== "Pipedrive"

	```js
    {!> src/adapters/pipedrive/index.js [ln:43-65] !}
	```

