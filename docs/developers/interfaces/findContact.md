# findContact

Looks up CRM contacts by phone number. This powers call pop, call logging, SMS/fax logging, and manual refresh.

## Signature

```js
async function findContact({
  user,
  authHeader,
  phoneNumber,
  overridingFormat,
  isExtension,
  proxyConfig,
  tracer,
  isForceRefreshAccountData
}) {
  return {
    successful: true,
    matchedContactInfo: [],
    returnMessage: null,
    extraDataTracking: {}
  };
}
```

## Input

| Field | Description |
| --- | --- |
| `user` | Connected CRM user. |
| `authHeader` | Prepared CRM auth header. |
| `phoneNumber` | Phone number to search, usually in E.164 format. |
| `overridingFormat` | Comma-separated phone formats from advanced user settings. Convert and search these if the CRM requires exact formatting. |
| `isExtension` | Indicates an internal extension-number lookup when extension-number logging is enabled. |
| `proxyConfig` | Proxy configuration when applicable. |
| `tracer` | Debug tracer when the request has `is-debug: true`. |
| `isForceRefreshAccountData` | True when the caller wants to bypass cached contact data. |

## Return

| Field | Description |
| --- | --- |
| `successful` | `true` when lookup completed, even if no contact was found. |
| `matchedContactInfo` | Array of contacts. Return `[]` for no matches. |
| `returnMessage` | Optional UI message. If omitted and no contact is found, core supplies a default warning. |
| `extraDataTracking` | Optional analytics/tracing data, such as rate-limit state or `{ isCached: true }`. |

Each contact can include:

| Field | Description |
| --- | --- |
| `id` | CRM contact ID. |
| `name` | Contact display name. |
| `phone` | Matched phone number. |
| `type` | Contact type used by `contactPageUrl` and CRM-specific logic. |
| `title`, `company`, `email`, `mostRecentActivityDate` | Optional display/search metadata. |
| `additionalInfo` | Object keyed by manifest `additionalFields[].const` values. Use this for contact-dependent options such as matters, deals, or opportunities. |
| `isNewContact` | Use only for the special "Create new contact..." option. Core does not cache contacts marked this way. |

## Caching

Core caches non-new contact matches by RingCentral account, platform, and phone number. A forced refresh bypasses the cache and removes stale cached data when the CRM returns no contacts.

## Create-Contact Option

If you want the UI to offer contact creation, append:

```js
matchedContactInfo.push({
  id: 'createNewContact',
  name: 'Create new contact...',
  isNewContact: true,
  additionalInfo: null
});
```

Do not create contacts inside `findContact` just because no match was found. Return an empty list and let the user or auto-logging rules trigger [`createContact`](createContact.md).

## Reference

=== "Template"

    ```js
    --8<-- "packages/template/src/connectors/interfaces/findContact.js"
    ```

