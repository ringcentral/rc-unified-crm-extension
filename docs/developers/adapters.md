# Building a custom CRM adapter

!!! tip "The developer framework is currently in BETA"
    This framework is in beta. Please [submit a Github issue](https://github.com/ringcentral/rc-unified-crm-extension/issues) if you encounter any problems or have a question.

## The structure of an adapter

CRM adapters are made up of two core elements:

* A **manifest** or **config file** describing your adatper
* A **client-side javascript file** that not only provides customizations to the front-end client application, but implements a few key interfaces with the target CRM platform.
* A **server component** that acts as a broker or proxy between the client application and the target CRM platform. 

## Configuring your adapter

| Name             | Type            | Description |
|------------------|-----------------|-------------|
| `urlIdentifier`  | string          |             |
| `name`           | string          |             |
| `authType`       | string          |             |
| `authUrl`        | string          |             |
| `clientId`       | string          |             |
| `canOpenLogPage` | boolean         |             |
| `contactTypes`   | ARRAY of string |             |

### Defining custom form fields

| Name               | Type    | Description |
|--------------------|---------|-------------|
| `const`            | string  |             |
| `title`            | string  |             |
| `type`             | string  |             |
| `contactDependent` | boolean |             |

#### Form fields for logging calls

#### Form fields for logging SMS messages

### Customizing the welcome page for your CRM

## Implementing client-side functions

The client-side portion of your adapter performs the following browser functions:

* Open a tab corresponding to an incoming call's associated contact record
* Open a tab corresponding to the activity record associated with a phone call
* Perform any garbage collection when a user logs out of a CRM

### Call-pop

=== "Sample adapter"
    ```js
    {!> client/src/platformModules/testCRM.js [ln:1-9]!}
    ```

=== "Pipedrive adapter"
    ```js
    {!> client/src/platformModules/pipedrive.js [ln:1-3]!}
    ```

### Open call log

=== "Sample adapter"
    ```js
    {!> client/src/platformModules/testCRM.js [ln:14-23]!}
    ```

=== "Pipedrive adapter"
    ```js
    {!> client/src/platformModules/pipedrive.js [ln:5-7]!}
    ```

### Deauthorizing users

=== "Sample adapter"
    ```js
    {!> client/src/platformModules/testCRM.js [ln:10-12]!}
    ```

=== "Pipedrive adapter"
    ```js
    {!> client/src/platformModules/pipedrive.js [ln:9-11]!}
    ```

=== "Bullhorn adapter"
    ```js
    {!> client/src/platformModules/bullhorn.js [ln:14-17]!}
    ```


## Implementing your CRM adapter server

Each adapter will be configured to communicate with the corresponding server for that adapter. While the [sample server](https://github.com/ringcentral/rc-unified-crm-extension/blob/FrameworkRefactor/server/src/platformModules/testCRM.js) that is provided through this framework is implemented in Javascript, you are free to implement your server in whatever language you prefer -- provided that it implements the interface properly. 

!!! hint "The included sample server will save you time"
    The sample server that comes bundled with this developer framework handles a lot of the mundane and predictable work for you. To save time, we encourage you to implement your adapter in Javascript as well. 

### Loading a contact record

A critical function performed by the server is looking up a contact record in the target CRM given a phone number, and returning a list of matches for that phone number. In addition, the framework will transmit a list of alternative phone number formats to search for. 

!!! tip "Alternative phone number formats"
    Some CRMs expose a contact search API that is very strict with regards to phone number lookup. For example, if a CRM only supports an EXACT MATCH then searching for an E.164 phone number may not yield any results if the phone number is stored in any other format.
	
	As a workaround, the CRM framework allows users to specify additional phone number formats that they typically store phone numbers in. This list of phone numbers is transmitted to the adapter's server, so that the associated adapter can search for a contact using multiple phone number formats until one is found.

#### Endpoint

* HTTP method: GET
* HTTP endpoint: `<server base URL>/contact`

#### Request parameters

| Name               | Description                                                                                            |
|--------------------|--------------------------------------------------------------------------------------------------------|
| `jwtToken`         | An encrypted string that includes the current user's ID and the associated CRM.                        |
| `phoneNumber`      | The phone number in E.164 format that should be searched for in the associated CRM.                    |
| `overridingFormat` | A comma-delimitted list of phone number formats that should be used when searching the associated CRM. |

#### Response

The server should return an ARRAY of possible matches for the given phone number. 

| Name             | Description                                                       |
|------------------|-------------------------------------------------------------------|
| `id`             | The unique ID of the contact in the target CRM.                   |
| `name`           | The full name of the contact in the target CRM.                   |
| `phone`          | The phone number of the contact as stored in the CRM.             |
| `organization`   | The company name or affiliation of the contact in the target CRM. |
| `additionalInfo` | TBD                                                                  |

**Example**

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
    {!> server/src/platformModules/testCRM.js [ln:143-177]!}
    ```

=== "Pipedrive adapter"
    ```js
    {!> server/src/platformModules/pipedrive.js [ln:107-141]!}
    ```

### Creating a placeholder contact

In the event that no contact could be found with an associated phone number, then the client application will prompt a user to create a placeholder contact. If the user elects to create a placeholder contact, then this interface on the server will be invoked. 

#### Endpoint

* HTTP method: POST
* HTTP endpoint: `<server base URL>/contact`

#### Request parameters

| Name             | Description                                                                     |
|------------------|---------------------------------------------------------------------------------|
| `jwtToken`       | An encrypted string that includes the current user's ID and the associated CRM. |
| `phoneNumber`    | The phone number associated with the contact that will be created.              |
| `newContactName` | The name of the contact that will be created.                                   |
| `newContactType` | The type of contact that will be created.                                       |

#### Response

| Name   | Description                                              |
|--------|----------------------------------------------------------|
| `id`   | The ID of the newly created contact in the target CRM.   |
| `name` | The name of the newly created contact in the target CRM. |

#### Sample code

=== "Sample adapter"
    ```js
    {!> server/src/platformModules/testCRM.js [ln:313-373]!}
    ```

=== "Pipedrive adapter"
    ```js
    {!> server/src/platformModules/pipedrive.js [ln:154-169]!}
    ```

### Logging an SMS message/conversation

Foo

#### Endpoint

* HTTP method: POST
* HTTP endpoint: `<server base URL>/messageLog`

#### Request parameters

| Name             | Description                                                                     |
|------------------|---------------------------------------------------------------------------------|
| `jwtToken`       | An encrypted string that includes the current user's ID and the associated CRM. |

#### Response

| Name  | Description |
|-------|-------------|
| `foo` | bar         |

#### Sample code

=== "Sample adapter"
    ```js
    {!> server/src/platformModules/testCRM.js [ln:281-312]!}
    ```

=== "Pipedrive adapter"
    ```js
    {!> server/src/platformModules/pipedrive.js [ln:236-262]!}
    ```

### Loading a log for a phone call

Foo

#### Endpoint

* HTTP method: GET
* HTTP endpoint: `<server base URL>/callLog`

#### Request parameters

| Name             | Description                                                                     |
|------------------|---------------------------------------------------------------------------------|
| `jwtToken`       | An encrypted string that includes the current user's ID and the associated CRM. |

#### Response

| Name  | Description |
|-------|-------------|
| `foo` | bar         |

#### Sample code

=== "Sample adapter"
    ```js
    {!> server/src/platformModules/testCRM.js [ln:313-373]!}
    ```

=== "Pipedrive adapter"
    ```js
    {!> server/src/platformModules/pipedrive.js [ln:154-169]!}
    ```

### Logging a new phone call

Foo

#### Endpoint

* HTTP method: POST
* HTTP endpoint: `<server base URL>/callLog`

#### Request parameters

| Name             | Description                                                                     |
|------------------|---------------------------------------------------------------------------------|
| `jwtToken`       | An encrypted string that includes the current user's ID and the associated CRM. |

#### Response

| Name  | Description |
|-------|-------------|
| `foo` | bar         |

#### Sample code

=== "Sample adapter"
    ```js
    {!> server/src/platformModules/testCRM.js [ln:179-214]!}
    ```

=== "Pipedrive adapter"
    ```js
    {!> server/src/platformModules/pipedrive.js [ln:264-283]!}
    ```

### Updating the log for a phone call

Foo

#### Endpoint

* HTTP method: PATCH
* HTTP endpoint: `<server base URL>/callLog`

#### Request parameters

| Name             | Description                                                                     |
|------------------|---------------------------------------------------------------------------------|
| `jwtToken`       | An encrypted string that includes the current user's ID and the associated CRM. |

#### Response

| Name  | Description |
|-------|-------------|
| `foo` | Bar         |

#### Sample code

=== "Sample adapter"
    ```js
    {!> server/src/platformModules/testCRM.js [ln:242-279]!}
    ```

=== "Pipedrive adapter"
    ```js
    {!> server/src/platformModules/pipedrive.js [ln:198-234]!}
    ```

### Unauthorizing users

The framework will automatically present to a user the controls they need to connect or disconnect from a CRM. In the event that a user is logged in, a "Logout" button will be made available to them. 

![Logout button](../img/logout.png)

When this logout button is clicked, the CRM extension will call the server to deauthorize the current user in the corresponding CRM. In so doing, the adapter should revoke the user's access token for the CRM, and ensure it is properly disposed of..

#### Endpoint

* HTTP method: POST
* HTTP endpoint: `<server base URL>/unAuthorize`

#### Request parameters

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

The server then needs to lookup the [User](https://github.com/ringcentral/rc-unified-crm-extension/blob/FrameworkRefactor/server/src/models/userModel.js) associated with the provided `id` in the server's database. 

Finally, now that you have in your context the full user record, your adapter will need to make the necessary API calls to deauthorize the user's session with the associated CRM. 

#### Sample code

=== "Sample adapter"
    ```js
    {!> server/src/platformModules/testCRM.js [ln:121-141]!}
    ```

=== "Pipedrive adapter"

    ```js
    {!> server/src/platformModules/pipedrive.js [ln:83-105]!}
    ```

<!--

## Add your own CRM platform

*It's recommended to apply changes to following mock files to build up your CRM support.*

### CRM module on server side

Please follow TODO and CHECK in comments.

Convenient tools:

1. `moment`: It parses, validates, manipulates and displays dates and times
2. `awesome-phonenumber`: It parses phone numbers

### CRM module on client side

Not much here, just have the functions open contact/log pages.

### CRM config on client side

Most fields are self-explanatory. Some may need extra explanation:

1. `name`: need to be the same as `crmName` in server script
2. `canOpenLogPage`: if CRM supports dedicated log view page, set this to true and use `openLogPage` function in client script to open it
3. `page`: `auth` page is only needed when it's `apiKey` auth
4. `additionalFields`: if `contactDependent` is set to false, then it won't be changed if contact selection is changed.
5. `embedded`: set up a welcome page that show first time open info
6. `authUrl` and `clientId` are only for `oauth`

### Working example - Clio (OAuth)

`Clio` is used as a working example. Here's how to try it

1. Create a `Clio manage` account
2. Register as a Clio developer and create an app
3. In `config.json`, copy Clio app's `clientId` over
4. Refer to https://ringcentral.github.io/rc-unified-crm-extension/clio/ on how it works

## Deploy

We provide server config file for AWS deployment under `serverless-deploy` folder (supported by [serverless framework](https://www.serverless.com/)). 

1. Rename `sample.env.yml` to `env.yml` and fill in required fields.
2. Rename `sample.serverless.yml` to `serverless.yml`.
3. Open a terminal and `cd server`
4. `npm run build` then `npm run deploy`

*OR, if you want to deploy it to other platform. Run `npm run build` and you'll get built out folder in `serverless-deploy`, then you can deploy it to elsewhere*

-->
