# Configuring your connector's manifest

{! docs/developers/beta_notice.inc !}

An connector's manifest file helps a developer to instruct the framework on how to interface with your connector. It enables developers to customize the user interface within certain boundaries, enables authentication and connectivity with the target CRM and more. 

Below you will find an explanation of the many properties found within a manifest file. 

## Editing your manifest file

The [App Connect Developer Console](https://appconnect.labs.ringcentral.com/console) provides a user interface for editing and managing your connector's manifest file. This is the recommended way to edit your manifest file as it will allow you to preview many of your changes in real time, and ensures the manifest created is valid. 

![Editing Bullhorn manifest](../img/bullhorn-manifest-console.png)

### Editing your manifest directly

Some developers may prefer to edit and manage their manifest file directly by editing its source. You can do this on your local filesystem, or via the App Connect developer console. 

![Editing manifest source](../img/manifest-source-editor.png)

## Basic properties

These basic properties 

| Name          | Type   | Description                                                                                                           |
|---------------|--------|-----------------------------------------------------------------------------------------------------------------------|
| `author`      | string | The author of the connector. This is displayed to end users within the Chrome extension.                                |
| `platforms`   | ARRAY of object | An array of [platforms](#platform-configuration) being integrated with. Each element of this array defines a different CRM. |
| `serverUrl`   | string | The base URL the Chrome extension will used when composing requests to your connector. The URL should utilize HTTPS and should omit the trailing slash (`/`). For example: `https://my-connector.myserver.com` |
| `version`     | string | The version of your connector. This is displayed to end users within the Chrome extension. |

### Platform configuration

Each manifest file contains an array of `platform` objects. This is helpful for developers who manage multiple CRM connectors from the same server. 

The platforms property is an associative array. Each key should be a unique identifier for the crm. The value of each element is an object with the following properties. 

| Name             | Type            | Description |
|------------------|-----------------|-------------|
| `name`           | string          | The name of the CRM. |
| `displayName`           | string          | The display name of the CRM. |
| `urlIdentifier`  | string          | The URL for which this CRM will be enabled. When the CRM is enabled for a domain, the extension's orange quick access button will appear. (`*` for wildcard match is supported) |
| `auth`       | object          | Contains all info for authorization. [Details](#authorization) |
| `canOpenLogPage` | boolean         | Set to `true` if the corresponding CRM supports permalinks for a given activity/log. When set to `true` users will have the option view/open the activity log in the CRM from the call history page. When set to `false`, users will open the contact page instead. |
| `contactTypes`   | ARRAY of object | (Optional) CRMs often adopt unique vernaculars to describe contacts. Provide the enumerated list of contact types supported by the corresponding CRM. Each object has `display` and `value`. |
| `contactPageUrl` | string          | A format string to open a CRM's contact page, e.g.`https://{hostname}/person/{contactId}`. Supported parameters: `{hostname}`, `{contactId}`, `{contactType}`|
| `embeddedOnCrmPage` | object       | The rendering config for embedded page. |
| `logPageUrl`|string |  A format string to open CRM log page. Eg.`https://{hostname}/activity/{logId}`. Supported parameters: `{hostname}`, `{logId}`, `{contactType}`|
| `page`           | object          | The rendering config for all pages. |
|`requestConfig`| object| Contains http request config for client extension, including `timeout` (number in seconds)|

The client-side authorization url that is opened by the extension will be: `{authUrl}?responseType=code&client_id={clientId}&{scope}&state=platform={name}&redirect_uri=https://ringcentral.github.io/ringcentral-embeddable/redirect.html`

## Authorization

`platform` has `auth` object which has following parameters:

| Name             | Type            | Description |
|------------------|-----------------|-------------|
| `type`       | string          | The authorization mode utilized by the target CRM. Only two values are supported: `oauth` and `apiKey`. Setting up auth is covered in more detail in the [Authorization](auth.md) section. |
| `oauth`        | object       | Only used with `type` equal to `oauth`. It contains `authUrl`, `clientId` and `redirectUri`. |
| `apiKey`| object| Only used with `type` equal to `apiKey`. It contains [`page`](manifest-pages.md#customizing-apikey-auth-page) |

### oauth parameters

| Name          | Type   | Description |
|-|-|-|
| `authUrl`     | string | Only used with `authType` equal to `oauth`. The auth URL to initiate the OAuth process with the CRM. |
| `clientId`    | string | Only used with `authType` equal to `oauth`. The client ID of the application registered with the CRM to access it's API. |
| `redirectUri` | string | The Redirect URI used when logging into RingCentral (not the CRM). It's recommended to use the default value of `https://ringcentral.github.io/ringcentral-embeddable/redirect.html`. |
| `customState` | string | (Optional) Only if you want to override state query string in OAuth url. The state query string will be `state={customState}` instead. |
| `scope`       | string | (Optional) Only if you want to specify scopes in OAuth url. eg. "scope":"scopes=write,read" |

