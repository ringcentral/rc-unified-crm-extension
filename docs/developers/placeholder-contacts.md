# Creating a placeholder contact

{! docs/developers/beta_notice.inc !}

In the event that no contact could be found with an associated phone number, then the client application will prompt a user to create a placeholder contact. If the user elects to create a placeholder contact, then this interface on the server will be invoked. 

### Endpoint

* HTTP method: POST
* HTTP endpoint: `<server base URL>/contact`

### Request parameters

| Name             | Description                                                                     |
|------------------|---------------------------------------------------------------------------------|
| `jwtToken`       | An encrypted string that includes the current user's ID and the associated CRM. |
| `phoneNumber`    | The phone number associated with the contact that will be created.              |
| `newContactName` | The name of the contact that will be created.                                   |
| `newContactType` | The type of contact that will be created.                                       |

### Response

| Name   | Description                                              |
|--------|----------------------------------------------------------|
| `id`   | The ID of the newly created contact in the target CRM.   |
| `name` | The name of the newly created contact in the target CRM. |

### Sample code

=== "Sample adapter"
    ```js
    {!> server/src/platformModules/testCRM.js [ln:313-373]!}
    ```

=== "Pipedrive adapter"
    ```js
    {!> server/src/platformModules/pipedrive.js [ln:154-169]!}
    ```
