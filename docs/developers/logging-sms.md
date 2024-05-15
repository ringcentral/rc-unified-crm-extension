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
|`logInfo`| RingCentral message log |
| `additionalSubmission` | Submitted form data from `additionalFields`|
|`contactId`| Contact ID|
|`contactType`| Contact type|
|`contactName`| Contact name|

### Response

| Name   | Description |
|--------|-------------|
| `successful` | `true` or `false` |
|`logIds`| Log IDs        |

### Sample code

=== "Sample adapter"
    ```js
    {!> server/src/adapters/testCRM/index.js [ln:246-310]!}
    ```

=== "Clio adapter"
    ```js
    {!> server/src/adapters/clio/index.js [ln:250-344]!}
    ```
