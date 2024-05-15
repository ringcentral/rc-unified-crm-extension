# Working with call log records

{! docs/developers/beta_notice.inc !}

One of the most used features across all of RingCentral's CRM integrations is the function of logging a phone call and recording a disposition associated with that phone call in the target CRM. To facilitate various user flows that relate to the logging of calls, developers need to implement three different interfaces in their server implementation.

* Load a call log associated with a phone call
* Create a call log record
* Update a call log record

Below you will find more information about each of these interfaces.

## Logging new phone calls

### Endpoint

* HTTP method: POST
* HTTP endpoint: `<server base URL>/callLog`

### Query parameters

| Name             | Description                                                                     |
|------------------|---------------------------------------------------------------------------------|
| `jwtToken`       | An encrypted string that includes the current user's ID and the associated CRM. |

### Request body

| Name             | Description                                                                     |
|------------------|---------------------------------------------------------------------------------|
| `logInfo` | RingCentral call log |
| `additionalSubmission` | Submitted form data from `additionalFields`|
| `note`| Note taken by user|
|`contactId`| Contact ID|
|`contactType`| Contact type|
|`contactName`| Contact name|


### Response

| Name   | Description |
|--------|-------------|
| `successful` | `true` or `false` |
|`logId`| Log ID        |

### Sample code

=== "Sample adapter"
    ```js
    {!> src/adapters/testCRM/index.js [ln:144-179]!}
    ```

=== "Pipedrive adapter"
    ```js
    {!> src/adapters/pipedrive/index.js [ln:130-155]!}
    ```

## Loading a log for a phone call

### Endpoint

* HTTP method: GET
* HTTP endpoint: `<server base URL>/callLog`

### Request parameters

| Name             | Description                                                                     |
|------------------|---------------------------------------------------------------------------------|
| `jwtToken`       | An encrypted string that includes the current user's ID and the associated CRM. |
|`sessionIds`| Under RingCentral call log|

### Response

| Name  | Description |
|-------|-------------|
| `successful` |  `true` or `false` |
|`logs`| Log info|

### Sample code

=== "Sample adapter"
    ```js
    {!> src/adapters/testCRM/index.js [ln:181-205]!}
    ```

=== "Pipedrive adapter"
    ```js
    {!> src/adapters/pipedrive/index.js [ln:223-242]!}
    ```

## Updating the log for a phone call

### Endpoint

* HTTP method: PATCH
* HTTP endpoint: `<server base URL>/callLog`

### Request parameters

| Name             | Description                                                                     |
|------------------|---------------------------------------------------------------------------------|
| `jwtToken`       | An encrypted string that includes the current user's ID and the associated CRM. |
|`sessionId`| RingCentral call session id |
|`subject`| Log subject |
|`note`| Note taken by user |
|`recordingLink`| RingCentral call recording link |

### Response

| Name   | Description |
|--------|-------------|
| `successful` |  `true` or `false` |
|`logId`| Log ID        |

### Sample code

=== "Sample adapter"
    ```js
    {!> src/adapters/testCRM/index.js [ln:207-244]!}
    ```

=== "Pipedrive adapter"
    ```js
    {!> src/adapters/pipedrive/index.js [ln:157-193]!}
    ```
