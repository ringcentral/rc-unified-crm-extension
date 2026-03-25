# Building your App Connect plugin server

## Authentication

When your plugin is configured to "Support OAuth" (the `showAuthorizationButton` manifest field), App Connect will render either a "Connect" or "Logout: button depending upon the current user's login state. These buttons effectively delegate the actual auth flow to the following plugin endpoints.

### `plugins/generateAuthUrl/:pluginId`

This endpoint should be a public server endpoint and should return a URL the user can click to initiate the authentication process. The URL will be placed behind the "Connect" button that will be displayed on the plugin config page.

**Request**

```http
GET /plugins/generateAuthUrl/my_plugin
```
	
**Response**

```js
{
   authUrl: "https://test.com/authUrl"
}
```

### `plugins/checkAuth/:pluginId`

This endpoint will be called to ensure that a user is authenticated to the service properly. This will help App Connect know whether to render a "Connect" button or a "Logout" button. 

**Request**

```http
GET /plugins/checkAuth/my_plugin
```

**Response**

```js
{
   successful: true
}
```

### `plugins/logout/:pluginId`

This endpoint will be call when a user wishes to logout. The intention of course is for the plugin to properly destroy any active login session. 

**Request**

```http
POST /plugins/logout/my_plugin

{
   jwtToken: 'xxxxxxxxxxxxxxxx.xxxxxxxxxxxx.xxxxxxxxxxxxxx'
}
```

**Response**

Return HTTP status code of 200

## Monetization

Developers may wish to monetize the plugin they have developed. If this is the case for the plugin you are building then you will be required to implement the following server endpoint. 

### `plugins/licenseStatus/:pluginId`

This endpoint will respond with the following properties:

| Property                   | Type    | Description                                              |
|----------------------------|---------|----------------------------------------------------------|
| `licenseStatus`            | boolean | Return true if the user is permitted to use this plugin. |
| `licenseStatusDescription` | string  | Return a message to display to the user.                 |
| `errorMessage`             | string  | This message will appear in the plugin list page and will be used to signal to admins that their attention is required. |

**Request**

```http
GET /plugins/licenseStatus/my_plugin`
```

**Responses**

The `licenseStatusDescription` can contain markdown for limited formating and can include links if you wish to provide a link to a purchase page for example. 

```js
{
   licenseStatus: true,
   licenseStatusDescription: "License: Personal"
}
```

```js
{
   licenseStatus: false,
   licenseStatusDescription: "License missing. Please go to [our website](https://license.com/info) for more license package info.",
   errorMessage: "This plugin is not working" // this will be shown in plugin list page, one step before plugin config page
}
```

## Processing content

Your plugin will be invoked often to process content in some way share or form. To process content you will need to implement the following endpoint.

### `plugin/<pluginId>`

**Request**

```http
POST /plugin/my_plugin

{
}
```

**Synchronous Response**

```js
{

}
```

**Asynchronous Response**

```js
{

}
```
