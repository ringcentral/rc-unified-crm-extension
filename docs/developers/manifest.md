# Configuring your adapter's manifest

{! docs/developers/beta_notice.inc !}

An adapter's manifest file helps a developer to instruct the framework on how to interface with your adapter. It enables developers to customize the user interface within certain boundaries, enables authentication and connectivity with the target CRM and more. 

Below you will find an explanation of the many properties found within a manifest file. 

## Turn on developer mode

To use a custom manifest, we'll need to turn on developer mode and assign a custom manifest url to the extension. Here's how:

1. Open DevTools
2. In console, execute `window.postMessage({type: 'toggle-developer-mode', toggle: true})` and reload the extension
3. In user settings, there's a section for `Developer settings`. Input your custom manifest url and save
4. Reload the extension to make it work

## Basic properties

These basic properties 

| Name          | Type   | Description                                                                                                           |
|---------------|--------|-----------------------------------------------------------------------------------------------------------------------|
| `author`      | string | The author of the adapter. This is displayed to end users within the Chrome extension.                                |
| `platforms`   | ARRAY of object | An array of [platforms](#platform-configuration) being integrated with. Each element of this array defines a different CRM. |
| `serverUrl`   | string | The base URL the Chrome extension will used when composing requests to your adapter. The URL should utilize HTTPS and should omit the trailing slash (`/`). For example: `https://my-adapter.myserver.com` |
| `version`     | string | The version of your adapter. This is displayed to end users within the Chrome extension. |

### Platform configuration

Each manifest file contains an array of `platform` objects. This is helpful for developers who manage multiple CRM adapters from the same server. 

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
| `embeddedOnCrmPage` | object       | The rendering config for embedded page, explained [here](#customizing-the-welcome-message) |
| `logPageUrl`|string |  A format string to open CRM log page. Eg.`https://{hostname}/activity/{logId}`. Supported parameters: `{hostname}`, `{logId}`, `{contactType}`|
| `page`           | object          | The rendering config for all pages, explained [here](#customizing-pages-within-the-client-application) |
|`requestConfig`| object| Contains http request config for client extension, including `timeout` (number in seconds)|

The client-side authorization url that is opened by the extension will be: `{authUrl}?responseType=code&client_id={clientId}&{scope}&state=platform={name}&redirect_uri=https://ringcentral.github.io/ringcentral-embeddable/redirect.html`

## Authorization

`platform` has `auth` object which has following parameters:

| Name             | Type            | Description |
|------------------|-----------------|-------------|
| `type`       | string          | The authorization mode utilized by the target CRM. Only two values are supported: `oauth` and `apiKey`. Setting up auth is covered in more detail in the [Authorization](auth.md) section. |
| `oauth`        | object       | Only used with `type` equal to `oauth`. It contains `authUrl`, `clientId` and `redirectUri`. |
| `apiKey`| object| Only used with `type` equal to `apiKey`. It contains [`page`](#apikey-auth-page) |

### oauth parameters

| Name          | Type   | Description |
|-|-|-|
| `authUrl`     | string | Only used with `authType` equal to `oauth`. The auth URL to initiate the OAuth process with the CRM. |
| `clientId`    | string | Only used with `authType` equal to `oauth`. The client ID of the application registered with the CRM to access it's API. |
| `redirectUri` | string | The Redirect URI used when logging into RingCentral (not the CRM). It's recommended to use the default value of `https://ringcentral.github.io/ringcentral-embeddable/redirect.html`. |
| `customState` | string | (Optional) Only if you want to override state query string in OAuth url. The state query string will be `state={customState}` instead. |
| `scope`       | string | (Optional) Only if you want to specify scopes in OAuth url. eg. "scope":"scopes=write,read" |

## Customizing pages within the client application

There are a number of pages within the App Connect client application that often need to be customized in some way for the corresponding CRM. Those pages are:

* CRM authentication page (ONLY for `apiKey` auth)
* Call logging form
* Message logging form

### apiKey auth page

=== "Sample adapter"

    ```js
    {!> src/adapters/testCRM/manifest.json [ln:22-36] !}
    ```

    ![Auth page](../img/test-auth-page.png)

=== "Insightly adapter"

    ```js
    {!> src/adapters/manifest.json [ln:262-294] !}
    ```

    ![Auth page](../img/insightly-auth-page.png)

### Adding custom fields to logging forms

CRMs almost always have a set of fields associated with logging an activity that are relatively unique. Consider for example Clio, a CRM used by legal professionals, in which users link calls to "matters" (e.g. a "legal matter"). Where CRMs like Insightly link calls to opportunities. To account for this, the framework makes it easy to add new custom form fields to two key forms users interact with frequently:

* Call logging page
* Create contact page

For each page, you will define an array of `additionalFields`. Each additional field element consists of the properties below.

| Name               | Type    | Description |
|--------------------|---------|-------------|
| `const`            | string  | A unique key identifying the field. |
| `title`            | string  | The display name of the field. |
| `type`             | string  | The data type associated with the field. |
| `contactDependent` | boolean | Set to `true` if this field would change when the selected contact is changed, or `false` if the value is static.  |

#### Custom call log fields

Set up associated deals as dropdown options:

1. Christmas special A351
2. Easter A22
3. Anniversary C92

And then setup "Address" as free input field.

```js
{! src/adapters/testCRM/manifest.json [ln:113-129] !}
```

#### Custom SMS log fields

Set up associated deals the same as call log

```js
{! src/adapters/testCRM/manifest.json [ln:130-145] !}
```

## Customizing the welcome message

When a user installs App Connect for the first time and accesses it from their CRM, a welcome page or splash screen appears to the user. This screen can be very effective in educating the end user about how to setup and connect to the associated CRM. 

Currently welcome pages are relatively simple, providing developers with the ability to direct users to two key resources under `embeddedOnCrmPage.welcomePage`:

* `docLink`: A URL to read documentation
* `videoLink`: A URL to watch a video

## User settings for default log form values

This topic is closely related to the use of [auto log](../users/automatic-logging.md). For manual log cases, using Bullhorn as example, users would need to manually select one of the `Note action` codes. In auto log scenarios, the extension would refuse to auto log because it misses selection for `Note action` code value. Now, default log form values would be able to help. It has 4 cases: `inbound call`, `outbound call`, `message` and `voicemail` where we can predefine default values.

Here's the example from Bullhorn. In `settings`, we want to add a new custom setting, and on log page render, we want to link the default values from user settings.

![Bullhorn default Note Action page](../img/bullhorn-default-note-action-page.png)

```json
{
    "settings": 
        [
            {
                "id": "bullhornDefaultNoteAction",
                "type": "section",
                "name": "Bullhorn options",
                "items": [
                    {
                        "id": "noteActionMatchWarning",
                        "name": "Info: note action matching warning",
                        "type": "warning",
                        "value": "Note action value match ignores cases and spaces"
                    },
                    {
                        "id": "bullhornInboundCallNoteAction",
                        "type": "inputField",
                        "name": "Default action for inbound calls",
                        "placeholder": "Enter action value"
                    },
                    {
                        "id": "bullhornOutboundCallNoteAction",
                        "type": "inputField",
                        "name": "Default action for outbound calls",
                        "placeholder": "Enter action value"
                    },
                    {
                        "id": "bullhornMessageNoteAction",
                        "type": "inputField",
                        "name": "Default action for SMS",
                        "placeholder": "Enter action value"
                    },
                    {
                        "id": "bullhornVoicemailNoteAction",
                        "type": "inputField",
                        "name": "Default action for voicemails",
                        "placeholder": "Enter action value"
                    }
                ]
            }
        ]
}
```

Page fields need to be set to use default values mapped from user settings. 

```json
{
    "page": {
        "callLog": {
            "additionalFields": [
                {
                    "const": "noteActions",
                    "title": "Note action",
                    "type": "selection",
                    "contactDependent": false,
                    "defaultSettingId": "bullhornDefaultNoteAction",
                    "defaultSettingValues": {
                        "inboundCall": {
                            "settingId": "bullhornInboundCallNoteAction"
                        },
                        "outboundCall": {
                            "settingId": "bullhornOutboundCallNoteAction"
                        }
                    }
                }
            ]
        },
        "messageLog": {
            "additionalFields": [
                {
                    "const": "noteActions",
                    "title": "Note action",
                    "type": "selection",
                    "contactDependent": false,
                    "defaultSettingId": "bullhornDefaultNoteAction",
                    "defaultSettingValues": {
                        "message": {
                            "settingId": "bullhornMessageNoteAction"
                        },
                        "voicemail": {
                            "settingId": "bullhornVoicemailNoteAction"
                        }
                    }
                }
            ]
        }
    }
}
```
