# updateServerLoggingSettings

This lifecycle hook persists updated server-side logging settings for the current user's organization. It is called when an administrator saves or updates the server-side logging configuration through App Connect's Admin settings.

## Input parameters

| Parameter              | Description                                                                                          |
|------------------------|------------------------------------------------------------------------------------------------------|
| `user`                 | The user object, used to identify the organization whose settings are being updated.                  |
| `additionalFieldValues`| An object containing the new settings values as submitted by the admin. Keys match the `const` values defined in the connector's `serverSideLogging.additionalFields` manifest configuration. |
| `oauthApp`             | The OAuth application instance, provided in case token refresh is needed during the settings update. |

## Return value(s)

No return value is required. If the update fails, throw an error or return an object with `successful: false` and a `returnMessage`.

**Example**
```js
async function updateServerLoggingSettings({ user, additionalFieldValues, oauthApp }) {
  await ServerLoggingSettings.upsert({
    organizationId: user.organizationId,
    apiUsername: additionalFieldValues.apiUsername,
    apiPassword: additionalFieldValues.apiPassword
  });
}
```
