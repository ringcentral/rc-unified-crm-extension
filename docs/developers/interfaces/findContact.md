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
| `title`, `company`, `email`, `createdDate`, `mostRecentActivityDate` | Optional display/search metadata. |
| `additionalInfo` | Object keyed by manifest `additionalFields[].const` values. Use this for contact-dependent options such as matters, deals, or opportunities. |
| `isNewContact` | Use only for the special "Create new contact..." option. Core does not cache contacts marked this way. |
| `widget` | Optional call pop widget shown in the **App Connect Contact** side panel during a call. See [Call pop widget](#call-pop-widget). |

## Call pop widget

A connector can attach a read-only widget to a matched contact. When the contact is matched for a call, the client shows it in the **App Connect Contact** widget of the phone's side panel. The content is an Embeddable JSON schema page, so it renders natively. Adaptive Cards are not supported.

Enable it by setting `page.contactWidget.supported` to `true` in the manifest (see [manifest](../manifest.md)). Without it the client reuses the locally cached contact and never asks the server for the widget.

```json
{
  "id": "123",
  "name": "Jane Doe",
  "type": "Contact",
  "phone": "+16505550100",
  "widget": {
    "schema": {
      "type": "object",
      "properties": {
        "title": { "type": "string" },
        "caseList": { "type": "string" }
      }
    },
    "uiSchema": {
      "title": { "ui:field": "typography", "ui:variant": "body2" },
      "caseList": { "ui:field": "list" }
    },
    "formData": { "title": "Open cases" },
    "actions": [{ "id": "open-crm", "label": "Open in CRM" }],
    "links": { "open-crm": "https://crm.example.com/contacts/123" }
  }
}
```

| Field | Description |
| --- | --- |
| `schema`, `uiSchema`, `formData` | The JSON schema page. See the [Embeddable JSON schema page reference](https://ringcentral.github.io/ringcentral-embeddable/jsonschema-page/?path=/docs/jsonschemapage-documentation--docs). Do not set `type`; the client adds it. |
| `actions` | Optional buttons in the widget's actions menu: `{ id, label, color? }`, at most 10. |
| `links` | Optional map from an `actions[].id`, a button property name, or a `list` item `const` value to an `http(s)` URL. The client opens the URL when that button or item is clicked. |

Rules enforced by core:

- v1 does not support form elements. Only properties whose `ui:field` is `typography`, `list`, `button` or `admonition`, or whose `ui:widget` is `hidden`, are kept. Other properties are removed and logged.
- A widget larger than 20 KB when serialized is dropped.
- A malformed widget is dropped without failing the lookup.
- Contacts that carry a widget are not cached in account data, so the widget always reflects the CRM at call time.
- When several matched contacts have widgets, the client shows one titled section per contact. Keep `links` ids unique across contacts.

## Created-Date Resolver Support

Auto logging can resolve multiple matched contacts by selecting the earliest created CRM record. To support that option, every real contact returned by `findContact` SHOULD include `createdDate`.

Rules:

| Rule | Verification |
| --- | --- |
| `createdDate` MUST be the CRM record creation timestamp for that contact, not the last activity or last update timestamp. | Compare with the CRM API response field used in the connector, such as `created_at`, `DATE_CREATED_UTC`, `dateAdded`, or `add_time`. |
| `createdDate` SHOULD be returned for every matched real contact when more than one contact may be returned. | Exercise `findContact` with a phone number shared by multiple contacts. |
| Do not add `createdDate` to the `isNewContact` placeholder. | The placeholder is not a CRM record and is ignored by the resolver. |

Use an ISO 8601 date-time with a timezone when possible, such as `2024-01-01T00:00:00Z`. The client also accepts Unix timestamps in seconds, milliseconds, microseconds, or nanoseconds; numeric timestamp strings; `YYYY-MM-DD HH:mm:ss`; `YYYY-MM-DD`; `YYYYMMDD`; `YYYYMMDDHHmmss`; RFC-style named dates; and `.NET /Date(1704067200000)/` values. Ambiguous slash formats such as `01/02/2024` are not accepted.

If any matched real contact does not include a valid `createdDate`, the client will not use the earliest-created resolver for that log. It will show a warning asking the user to contact the connector developer to add support.

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
    --8<-- "packages/template/src/connectors/interfaces/findContact.ts"
    ```

