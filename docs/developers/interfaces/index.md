# Connector Interface Contract

Connector interfaces are CommonJS functions exported by a connector module, usually from `src/connectors/<platform>/index.js` in a full server or `src/connectors/myCRM.js` in the template. The runtime loads a connector through `connectorRegistry.registerConnector(platform, connector)` and then calls the exported functions from the core handlers.

The core registry only enforces `createCallLog` and `updateCallLog` at registration time. In practice, a usable connector normally implements auth, user lookup, contact lookup, call logging, and the optional features it advertises in the manifest.

## Connector Shapes

App Connect currently supports three connector shapes:

| Shape | Where it is defined | When to use it |
| --- | --- | --- |
| Code connector | A JavaScript module registered with `connectorRegistry.registerConnector()` | Use when the CRM needs custom logic, multiple API calls, database work, or connector-specific behavior. |
| Interface-only connector | Individual functions registered with `connectorRegistry.registerConnectorInterface()` | Use when a platform is assembled from separately registered methods. Registered interface functions are composed over the base connector without mutating it. |
| Proxy connector | Declarative `proxyConfig` stored in the Developer Console | Use when REST calls and response mappings are enough. If no platform connector is registered and the `proxy` connector exists, the registry falls back to proxy mode. |

## Common Runtime Inputs

Most methods receive one object argument. The exact fields vary by flow, but these are common:

| Field | Meaning |
| --- | --- |
| `user` | Persisted App Connect user model for the connected CRM user. Includes `id`, `platform`, `hostname`, `accessToken`, `refreshToken`, `tokenExpiry`, `timezoneName`, `timezoneOffset`, `rcAccountId`, `platformAdditionalInfo`, and `userSettings` when available. |
| `authHeader` | Authorization header already prepared by core. OAuth connectors receive `Bearer <accessToken>` after refresh. API-key connectors receive `Basic <value returned by getBasicAuth()>`. |
| `proxyConfig` | Proxy connector configuration when the user connected through proxy mode. Code connectors can ignore it unless they deliberately support proxy-backed behavior. |
| `returnMessage` | Optional UI message returned by a connector method. See [Returning messages](../errors.md). |
| `extraDataTracking` | Optional analytics/tracing object returned by a connector method. The runtime passes it through where supported. |

## Required For Most Connectors

| Interface | Purpose |
| --- | --- |
| [`getAuthType`](getAuthType.md) | Returns `oauth` or `apiKey`. |
| [`getOauthInfo`](getOauthInfo.md) | Supplies OAuth token exchange details. Required when `getAuthType()` returns `oauth`, unless admin-managed OAuth resolves credentials first. |
| [`getBasicAuth`](getBasicAuth.md) | Builds the Basic auth credential from the stored API key. Required when `getAuthType()` returns `apiKey`. |
| [`getUserInfo`](getUserInfo.md) | Validates credentials and returns stable CRM user identity data. |
| [`findContact`](findContact.md) | Looks up contacts by phone number. |
| [`createCallLog`](createCallLog.md) | Creates a CRM activity for a RingCentral call. Required by the registry. |
| [`updateCallLog`](updateCallLog.md) | Updates an existing CRM call activity. Required by the registry. |

## Feature Interfaces

| Interface | Purpose |
| --- | --- |
| [`getCallLog`](getCallLog.md) | Loads existing CRM log details before edit/update flows. |
| [`createContact`](createContact.md) | Creates a contact when the user or auto-logging rules choose that path. |
| [`findContactWithName`](findContactWithName.md) | Supports manual CRM contact search by name. |
| [`createMessageLog`](createMessageLog.md) | Creates CRM logs for SMS, fax, voicemail, MMS, and shared SMS conversations. |
| [`updateMessageLog`](updateMessageLog.md) | Updates existing message logs in the same conversation/day or shared SMS thread. |
| [`upsertCallDisposition`](upsertCallDisposition.md) | Saves disposition or related-entity selections after a call log exists. |
| [`getUserList`](getUserList.md) | Returns CRM users for server-side logging user mapping. |
| [`getLicenseStatus`](getLicenseStatus.md) | Returns connector-specific entitlement status. |
| [`getLogFormatType`](getLogFormatType.md) | Tells core whether to compose call and message log bodies as plain text, HTML, or Markdown. |
| [`unAuthorize`](unAuthorize.md) | Revokes or clears stored CRM credentials. |

## Optional Hooks Without Dedicated Pages

The runtime also checks for these connector methods:

| Hook | Called from | Contract |
| --- | --- | --- |
| `authValidation({ user })` | `/authValidation` | Return `{ successful, returnMessage, status }`. Used to verify an existing OAuth session. |
| `checkAndRefreshAccessToken(oauthApp, user, tokenLockTimeout)` | OAuth refresh helper | Override the shared token-refresh flow when the CRM needs custom behavior. |
| `getOverridingOAuthOption({ code })` | OAuth callback | Return extra options for the token exchange when the CRM requires non-standard OAuth parameters. |
| `postSaveUserInfo({ userInfo, oauthApp })` or `postSaveUserInfo({ userInfo })` | After successful login | Return the user info object that should be sent back to the client. |
| `getServerLoggingSettings({ user })` | Admin server-side logging settings | Return connector-specific server-side logging settings. |
| `updateServerLoggingSettings({ user, additionalFieldValues, oauthApp })` | Admin server-side logging settings | Return `{ successful, returnMessage }`. |
| `onUpdateUserSettings({ user, userSettings, updatedSettings })` | User settings save | Return `{ successful, returnMessage }`; core persists `updatedSettings` only when `successful` is true. |
| `listAppointments({ user, authHeader, range, mineOnly, forceSync, proxyConfig })` | Appointments feature | Return `{ appointments, returnMessage }`. |
| `createAppointment({ user, authHeader, payload, proxyConfig })` | Appointments feature | Return `{ appointmentId, appointment, returnMessage }`. |
| `updateAppointment({ user, authHeader, appointmentId, patchBody, proxyConfig })` | Appointments feature | Return `{ appointment, returnMessage }`. |
| `refreshAppointment({ user, authHeader, appointmentId, proxyConfig })` | Appointments feature | Return `{ appointment, returnMessage }`. |
| `confirmAppointment({ user, authHeader, appointmentId, proxyConfig })` | Appointments feature | Return `{ appointment, returnMessage }`. |
| `cancelAppointment({ user, authHeader, appointmentId, proxyConfig })` | Appointments feature | Return `{ appointment, returnMessage }`. |

## Return Messages

Most interfaces may return:

```js
return {
  returnMessage: {
    message: 'Call logged.',
    messageType: 'success',
    ttl: 3000
  }
};
```

Use `success`, `warning`, or `error` for `messageType`. Some older code uses `danger`; prefer `error` for new connector code.
