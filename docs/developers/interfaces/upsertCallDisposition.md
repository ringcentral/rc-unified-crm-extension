# upsertCallDisposition

!!! info "Optional interface"
    If this interface is implemented, **additional disposition** action will be triggered in **log editting** process.

Some platforms may have the ability to associate the log activity to other entities, which is independent from the logging call action itself. We provide another interface for dispositioning the call.

## Input parameters

| Parameter              | Description                                                                                              |
|------------------------|----------------------------------------------------------------------------------------------------------|
| `user`                 | An object describing the Chrome extension user associated with the action that triggered this interface. | 
| `existingCallLog`      | All the metadata associated with the call to be logged. [Call Log schema](https://developers.ringcentral.com/api-reference/Call-Log/readUserCallRecord) is described in our API Reference. |
| `authHeader`           | The HTTP Authorization header to be transmitted with the API request to the target CRM.                  | 
| `callDisposition`      | Contain call disposition data in log form |

## Return value(s)


An object with following properties:

| Parameter              | Description                                                                                              |
|------------------------|----------------------------------------------------------------------------------------------------------|
|`logId`| existing log id |

## Reference

=== "Example CRM"

    ```js
    {!> packages/template/src/connectors/interfaces/upsertCallDisposition.js !}
	```
	
=== "Pipedrive"

	```js
    {!> src/connectors/pipedrive/index.js [ln:482-514] !}
	```

