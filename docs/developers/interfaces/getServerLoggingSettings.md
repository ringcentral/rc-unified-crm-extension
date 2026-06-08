# getServerLoggingSettings

This lifecycle hook retrieves the server-side logging configuration for the current user's organization. It is called by the framework whenever server-side logging settings are needed — for example, before processing a call log or when rendering the server-side logging setup UI.

Server-side logging settings are stored per-tenant and typically include CRM credentials (username and password) used by the server to log calls on behalf of users, along with any connector-specific configuration.

## Input parameters

| Parameter | Description                                                                                       |
|-----------|---------------------------------------------------------------------------------------------------|
| `user`    | The user object stored in the database, used to look up the organization's server-side logging settings. |

## Return value(s)

The settings object stored for the user's organization. The shape is defined by the connector's [`serverSideLogging.additionalFields`](../manifest.md#server-side-logging) manifest configuration, but typically includes:

| Property      | Description                                                                               |
|---------------|-------------------------------------------------------------------------------------------|
| `apiUsername` | The CRM username the server uses to authenticate when logging calls server-side.          |
| `apiPassword` | The CRM password associated with the above username.                                      |

Additional fields may be present depending on what the connector's manifest defines.

**Example**
```js
return {
  apiUsername: 'admin@example.com',
  apiPassword: 'secret'
};
```
