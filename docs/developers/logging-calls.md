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
    {!> server/src/platformModules/testCRM.js [ln:179-214]!}
    ```

=== "Pipedrive adapter"
    ```js
    {!> server/src/platformModules/pipedrive.js [ln:264-283]!}
    ```

## Loading a log for a phone call

TODO

### Endpoint

* HTTP method: GET
* HTTP endpoint: `<server base URL>/callLog`

### Request parameters

| Name             | Description                                                                     |
|------------------|---------------------------------------------------------------------------------|
| `jwtToken`       | An encrypted string that includes the current user's ID and the associated CRM. |

### Response

| Name  | Description |
|-------|-------------|
| `TODO` | TODO         |

### Sample code

=== "Sample adapter"
    ```js
    {!> server/src/platformModules/testCRM.js [ln:313-373]!}
    ```

=== "Pipedrive adapter"
    ```js
    {!> server/src/platformModules/pipedrive.js [ln:154-169]!}
    ```

## Updating the log for a phone call

TODO

### Endpoint

* HTTP method: PATCH
* HTTP endpoint: `<server base URL>/callLog`

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
    {!> server/src/platformModules/testCRM.js [ln:242-279]!}
    ```

=== "Pipedrive adapter"
    ```js
    {!> server/src/platformModules/pipedrive.js [ln:198-234]!}
    ```
