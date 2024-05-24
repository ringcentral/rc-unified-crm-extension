# Server

This doc contains knowledge you might need to write up you own server from scratch

## JWT token

The frontend client helps to maintain a user's current authentication context, and transmits to the server with every API call a `jwtToken` parameter that encodes the data associated with the user making the current request. A JWT token, once decoded looks like this:

```js
{
  id: "<User ID in CRM>",
  platform: "<the CRM being integrated with>"
}
```

With this information, server can validate and identify users so to perform API actions under their accounts on CRM platforms. 

### Decoding JWT tokens

The JWT token created by the framework uses the `APP_SERVER_SECRET_KEY` environment variable as the secret to encode the token. To decode a token, we recommend using a third party library accordingly.

=== "Javascript"

    ```js
	const { verify } = require('jsonwebtoken');
    function decodeJwt(token) {
      try {
        return verify(token, process.env.APP_SERVER_SECRET_KEY);
      } catch (e) {
        return null;
      }
    }
    ```

## OpenAPI specification

To assist developers in implementing their CRM adapter server, an OpenAPI specification has been produced that defines the input and output of that server and its various endpoints. 

[Download the OpenAPI specification](openapi.md)

## Unauthorizing users

{! docs/developers/beta_notice.inc !}

The framework will automatically present to a user the controls they need to connect or disconnect from a CRM. In the event that a user is logged in, a "Logout" button will be made available to them. 

![Logout button](../../img/logout.png)

When this logout button is clicked, the CRM extension will call the server to deauthorize the current user in the corresponding CRM. In so doing, the adapter should revoke the user's access token for the CRM, and ensure it is properly disposed of..

### Endpoint

* HTTP method: POST
* HTTP endpoint: `<server base URL>/unAuthorize`

### Request parameters

| Parameter  | Description                                                                     |
|------------|---------------------------------------------------------------------------------|
| `jwtToken` | An encrypted string that includes the current user's ID and the associated CRM. |

The server will need to decrypt the `jwtToken` received in the request using the `APP_SERVER_SECRET_KEY` configuration parameter. The decrypted string will have the following structure:

```js
{
  'id': 'some_user_id',
  'platform': 'the_associated_crm'
}
```

The server then needs to lookup the [User](https://github.com/ringcentral/rc-unified-crm-extension/blob/FrameworkRefactor/src/models/userModel.js) associated with the provided `id` in the server's database. 

Finally, now that you have in your context the full user record, your adapter will need to make the necessary API calls to deauthorize the user's session with the associated CRM. 

### Sample code

=== "Sample adapter"
    ```js
    {!> src/adapters/testCRM/index.js [ln:86-106]!}
    ```

=== "Pipedrive adapter"

    ```js
    {!> src/adapters/pipedrive/index.js [ln:42-64]!}
    ```

## Contact matching

### Endpoint

* HTTP method: GET
* HTTP endpoint: `<server base URL>/contact`

### Request parameters

| Name               | Description                                                                                            |
|--------------------|--------------------------------------------------------------------------------------------------------|
| `jwtToken`         | An encrypted string that includes the current user's ID and the associated CRM.                        |
| `phoneNumber`      | The phone number in E.164 format that should be searched for in the associated CRM.                    |
| `overridingFormat` | A comma-delimitted list of phone number formats that should be used when searching the associated CRM. |

### Response

The server should return an ARRAY of possible matches for the given phone number. 

| Name             | Description                                                       |
|------------------|-------------------------------------------------------------------|
| `id`             | The unique ID of the contact in the target CRM.                   |
| `name`           | The full name of the contact in the target CRM.                   |
| `phone`          | The phone number of the contact as stored in the CRM.             |
| `organization`   | The company name or affiliation of the contact in the target CRM. |
| `additionalInfo` | Correspondes to contact-dependent `additionalFields` for Call/Message page |

### Example

```js
[
  {
    'id': 80723490120943,
    'name': 'Luke Skywalker',
    'phone': '+16505551212',
    'organization': 'Rebel Alliance',
    'additionalInfo': {
	    'associations': [
		   {
		      'id': 1837202932,
			    'label': 'Jedi Order' 
		   }
		]
	}
  }
]
```

#### Sample code

=== "Sample adapter"
    ```js
    {!> src/adapters/testCRM/index.js [ln:335-363]!}
    ```

=== "Pipedrive adapter"
    ```js
    {!> src/adapters/pipedrive/index.js [ln:66-100]!}
    ```

## Contact creation

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
    {!> src/adapters/testCRM/index.js [ln:312-372]!}
    ```

=== "Pipedrive adapter"
    ```js
    {!> src/adapters/pipedrive/index.js [ln:113-128]!}
    ```

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

## Logging new messages

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
    {!> src/adapters/testCRM/index.js [ln:246-310]!}
    ```

=== "Clio adapter"
    ```js
    {!> src/adapters/clio/index.js [ln:250-344]!}
    ```
