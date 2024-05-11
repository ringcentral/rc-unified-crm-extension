# Logging an SMS message or conversation

{! docs/developers/beta_notice.inc !}

The Unified CRM extension allows users to log in their CRM all forms of communication with a customer, which includes SMS or text messages. This interface describes how to log an SMS conversation within the target CRM. 

### Endpoint

* HTTP method: POST
* HTTP endpoint: `<server base URL>/messageLog`

### Request parameters

| Name             | Description                                                                     |
|------------------|---------------------------------------------------------------------------------|
| `jwtToken`       | An encrypted string that includes the current user's ID and the associated CRM. |

### Response

| Name   | Description |
|--------|-------------|
| `TODO` | TODO        |

### Sample code

=== "Sample adapter"
    ```js
    {!> server/src/platformModules/testCRM/index.js [ln:281-312]!}
    ```

=== "Pipedrive adapter"
    ```js
    {!> server/src/platformModules/pipedrive/index.js [ln:236-262]!}
    ```
