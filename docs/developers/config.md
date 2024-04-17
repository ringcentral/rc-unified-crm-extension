# Configuring your adapter

{! docs/developers/beta_notice.inc !}

## Config file

TODO - describe where the config file is

## Configuration options

| Name             | Type            | Description |
|------------------|-----------------|-------------|
| `urlIdentifier`  | string          | The URL for which this CRM will be enabled. When the CRM is enabled for a domain, the extension's organge quick access button will appear. |
| `name`           | string          | The name of the CRM. |
| `authType`       | string          | The supported auth type for the corresponding CRM. Only two values are supported: `oauth` and `apiKey`. |
| `authUrl`        | string          | Only used with `authType` equal to `oauth`. The auth URL to initiate the OAuth process with the CRM. |
| `clientId`       | string          | Only used with `authType` equal to `oauth`. The client ID of the application registered with the CRM to access it's API. |
| `canOpenLogPage` | boolean         | Set to `true` if the corresponding CRM supports permalinks for a given activity/log. When set to `true` users will have the option view/open the activity log in the CRM from the call history page. When set to `false`, users will open the contact page instead. |
| `contactTypes`   | ARRAY of string | CRMs often adopt unique vernaculars to describe contacts. Provide the enumerated list of contact types supported by the corresponding CRM. |

## Customizing the welcome message

embedded - welcomePage that only shows when user first time open crm page

```js
{! client/src/config-copy.json [ln:54-59] !}
```

## Customing pages within the client application

There are a number of pages within the Unified CRM client application that often need to be customized in some way for the corresponding CRM. Those pages are:

* CRM authentication page
* Call logging form
* Message logging form

### Authentication page

```js
{! client/src/config-copy.json [ln:16-26] !}
```

### Adding custom fields to logging forms

CRMs almost always have a set of fields associated with logging an activity, or with a contact record that are relatively unique. Therefore, the framework makes it easy to add new custom form fields to two key forms users interact with frequently:

* Call logging page
* Create contact page

For each page, you will define an array of `additionalFields`. Each additional field element consists of the following properties.

| Name               | Type    | Description |
|--------------------|---------|-------------|
| `const`            | string  | A unique key identifying the field. |
| `title`            | string  | The display name of the field. |
| `type`             | string  | The data type associated with the field. |
| `contactDependent` | boolean | Set to `true` if this field would change when the selected contact is changed, or `false` if the value is static.  |

#### Custom call log fields

TODO provide realistic example

```js
{! client/src/config-copy.json [ln:27-42] !}
```

#### Custom SMS log fields

TODO provide realistic example

```js
{! client/src/config-copy.json [ln:43-52] !}
```

## Sample config file

Here is a [sample config file](https://github.com/ringcentral/rc-unified-crm-extension/blob/FrameworkRefactor/client/src/config-copy.json) that illustrates the full syntax and structure of the config file. 

```js
{! client/src/config-copy.json !}
```
