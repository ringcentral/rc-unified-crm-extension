# getContactWidget

Returns a read-only widget for the contacts matched on a call. The client shows it in a side panel app named after the CRM, such as **Clio Contact**.

!!! info "Optional interface"
    Implement this when you want call agents to see CRM details for the caller, such as open cases or matters, without leaving the phone.

## How it works

1. When a call rings, the client runs [`findContact`](findContact.md). If at least one real contact matches and `getContactWidget` is reported by `/implementedInterfaces`, the client registers the **{CRM name} Contact** app in the phone's side panel.
2. The widget is requested only when the user opens that app. The client then calls `getContactWidget` with the matched contacts it has cached.
3. The widget is not cached by the server or the client. Pressing the refresh button in the app asks the connector again.

When several contacts match, the client adds a **Contact** dropdown at the top and shows the widget of the selected contact. The first contact is selected by default.

## Signature

```js
async function getContactWidget({
  user,
  authHeader,
  phoneNumber,
  contacts,
  proxyConfig
}) {
  return {
    successful: true,
    widgets: [],
    returnMessage: null
  };
}
```

## Input

| Field | Description |
| --- | --- |
| `user` | Connected CRM user. |
| `authHeader` | Prepared CRM auth header. |
| `phoneNumber` | Phone number of the call. |
| `contacts` | The matched contacts the client has cached for this phone number, exactly as [`findContact`](findContact.md) returned them, including `additionalInfo`. Only real contacts are sent, never the "Create new contact..." option. Use it for basic info and call the CRM only when you need more. |
| `proxyConfig` | Proxy configuration when applicable. |

## Return

| Field | Description |
| --- | --- |
| `successful` | `true` when the widgets were built. |
| `widgets` | Array of `{ contactId, widget }`. `contactId` is the `id` of a contact from `contacts`. Contacts without an entry show an empty widget. |
| `returnMessage` | Optional message shown in the app when `successful` is `false`. |
| `extraDataTracking` | Optional analytics/tracing data. |

Each `widget` is an Embeddable JSON schema page. Adaptive Cards are not supported.

```json
{
  "contactId": "123",
  "widget": {
    "schema": {
      "type": "object",
      "properties": {
        "title": { "type": "string", "description": "Jane Doe" },
        "openInCrm": { "type": "string", "title": "Open in CRM" },
        "caseList": { "type": "string", "oneOf": [{ "const": "c1", "title": "Case 1", "description": "Open" }] }
      }
    },
    "uiSchema": {
      "title": { "ui:field": "typography", "ui:variant": "subheading1" },
      "openInCrm": { "ui:field": "button", "ui:variant": "outlined", "ui:fullWidth": true },
      "caseList": { "ui:field": "list", "ui:showSelected": false },
      "ui:order": ["title", "openInCrm", "caseList"]
    },
    "formData": {},
    "links": {
      "openInCrm": "https://crm.example.com/contacts/123",
      "c1": "https://crm.example.com/cases/c1"
    }
  }
}
```

| Field | Description |
| --- | --- |
| `schema`, `uiSchema`, `formData` | The JSON schema page. See the [Embeddable JSON schema page reference](https://ringcentral.github.io/ringcentral-embeddable/jsonschema-page/?path=/docs/jsonschemapage-documentation--docs). Do not set `type`; the client adds it. |
| `actions` | Optional buttons in the widget's actions menu: `{ id, label, color? }`, at most 10. A button placed in the page itself (`ui:field: button`) is usually clearer. |
| `links` | Optional map from a button property name, an `actions[].id`, or a `list` item `const` value to an `http(s)` URL. The client opens the URL when that button or item is clicked. A `link` field does not need an entry: it opens its own `ui:href`. |

Rendering notes:

- A `typography` field shows the Markdown in its schema `description`, not a `formData` value. A `button` shows its schema `title`.
- Typography variants: `title1`, `title2`, `subheading1`, `subheading2`, `body1`, `body2`, `caption1`, `caption2`.
- Embeddable does not preserve the order of `schema.properties` (fields can come out alphabetical), so list every property in `uiSchema["ui:order"]` to control the order.

Rules enforced by core:

- v1 does not support form elements. Only properties whose `ui:field` is `typography`, `link`, `list`, `button` or `admonition`, or whose `ui:widget` is `hidden`, are kept. A `link` field is kept only when `ui:href` is an `http(s)` URL. Other properties are removed and logged.
- A widget larger than 20 KB when serialized is dropped.
- A malformed widget is dropped without failing the request.

## Endpoint

`POST /contact/widget` with a JSON body of `{ "phoneNumber": "+14155550100", "contacts": [...] }` and the usual `jwtToken`. The response is `{ successful, returnMessage, widgets }`.

## Example

The Clio connector (`src/connectors/clio/index.ts`, `getContactWidget` and `buildContactWidget`) builds each widget from the cached contact: a heading, a one-line summary (type, created and updated dates), an **Open in Clio** button and the matters list, each matter linking to its Clio page. It makes no extra Clio request.

## Reference

=== "Template"

    ```js
    --8<-- "packages/template/src/connectors/interfaces/getContactWidget.ts"
    ```
