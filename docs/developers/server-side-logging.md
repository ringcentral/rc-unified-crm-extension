# Server-side logging

Server-side logging is an optional feature that allows App Connect to log calls automatically on behalf of all users in an organization, without requiring anyone to have the extension open or installed. The server observes call events from RingCentral, looks up the relevant contact, and calls your connector's standard logging interfaces directly.

This page explains what a connector author needs to implement to support this feature.

!!! info "User-facing documentation"
    For information on how administrators enable and configure server-side logging, see [Server-side call logging](../users/server-side-logging.md).

## How it works

When an admin enables server-side logging for their organization, App Connect subscribes to call events across the entire RingCentral account. When a call ends, the framework:

1. Resolves the contact via `findContact`
2. Determines the correct user mapping (agent → CRM user) if configured
3. Calls `createCallLog` with the resolved contact and call data — using the admin's stored credentials or agent-mapped credentials depending on the connector's configuration

Your connector's existing `findContact` and `createCallLog` implementations handle server-side logs exactly as they handle client-side logs. No separate code path is required. What you do need to implement are the **configuration and management interfaces** described below.

## Manifest configuration

Declare server-side logging support in your manifest by adding a `serverSideLogging` object to the platform:

```json
"serverSideLogging": {
  "url": "https://my-connector.example.com",
  "useAdminAssignedUserToken": false,
  "enableUserMapping": true,
  "additionalFields": [
    {
      "const": "apiUsername",
      "title": "CRM API Username",
      "type": "inputField",
      "required": true
    },
    {
      "const": "apiPassword",
      "title": "CRM API Password",
      "type": "inputField",
      "required": true
    }
  ]
}
```

| Property                    | Type    | Description                                                                                        |
|-----------------------------|---------|----------------------------------------------------------------------------------------------------|
| `url`                       | string  | The base URL of your connector's server-side logging endpoint.                                     |
| `useAdminAssignedUserToken` | boolean | When `true`, logging calls use the admin's own OAuth token. When `false`, the connector retrieves its own credentials via `getServerLoggingSettings`. |
| `enableUserMapping`         | boolean | When `true`, the Admin settings UI shows a user-mapping table so admins can map RingCentral users to CRM users. Your connector must implement `getUserList` to populate this table. |
| `additionalFields`          | array   | Configuration fields shown in the Admin settings UI. Values collected here are accessible via `getServerLoggingSettings`. Supports the same field properties as [`page.callLog.additionalFields`](manifest-pages.md#additional-field-shape). |

## Interfaces to implement

### Required

**[`getServerLoggingSettings`](interfaces/getServerLoggingSettings.md)**

Called by the framework whenever it needs the stored server-side logging credentials — for example, before processing a logged call. Returns the settings object previously saved by `updateServerLoggingSettings`.

**[`updateServerLoggingSettings`](interfaces/updateServerLoggingSettings.md)**

Called when an admin saves the server-side logging configuration form. Persist the submitted `additionalFieldValues` (matching your `additionalFields` manifest definitions) so they are available to `getServerLoggingSettings`.

### Conditional

**[`getUserList`](interfaces/getUserList.md)**

Required when `enableUserMapping` is `true`. Returns the list of users in the CRM so the admin can map RingCentral extensions to CRM user accounts. The framework uses this mapping when assigning ownership of logged call records.

**[`getLicenseStatus`](interfaces/getLicenseStatus.md)**

Required if your CRM has per-user licensing that gates access to the API. The framework calls this to determine whether a given CRM user has the necessary license before attempting to log on their behalf.

## Credential handling

The `additionalFields` you define in the manifest are the mechanism by which you collect whatever credentials or configuration the server needs to log calls autonomously. For most CRMs this means a dedicated API username and password — a service account that the server uses to authenticate without relying on any individual user's session.

```
Admin fills form                 updateServerLoggingSettings stores values
      │                                       │
      ▼                                       ▼
additionalFieldValues = {            { apiUsername: 'svc@co.com',
  apiUsername: 'svc@co.com',           apiPassword: 'secret' }
  apiPassword: 'secret'                stored per organization
}
                                             │
                        getServerLoggingSettings retrieves them
                                             │
                                             ▼
                              createCallLog runs with service
                              account credentials
```

## User mapping

When `enableUserMapping: true`, the framework surfaces a user-mapping UI in the Admin settings. Admins use it to match RingCentral extensions to CRM user accounts, so that call records are created under the correct agent's name rather than the admin's.

Your `getUserList` implementation supplies the CRM side of this table. Return a list of CRM users; the framework handles the matching UI and stores the resulting map.

When logging a call server-side, the framework passes the mapped CRM user's details to your `createCallLog` implementation via the `user` parameter, allowing you to set the correct record owner in the CRM.

## Testing

1. Enable server-side logging in the Admin settings for your test account
2. Make a call from a RingCentral extension in the test account
3. After the call ends, verify that a log entry appears in the CRM
4. Confirm the record owner is correct (admin vs. agent-mapped user)
5. Test with an unknown contact to verify the no-match behavior is handled gracefully
