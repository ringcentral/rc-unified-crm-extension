# Manifest Pages

The `page` section of a platform manifest configures CRM-specific UI inside App Connect. Use it for API-key auth fields, call log fields, message log fields, contact search, and feedback collection.

## API-Key Auth Page

API-key auth fields live under `auth.apiKey.page`, not under `page`:

```json
{
  "auth": {
    "type": "apiKey",
    "apiKey": {
      "page": {
        "title": "My CRM",
        "warning": "Paste your CRM credentials.",
        "content": [
          {
            "const": "apiKey",
            "title": "API key",
            "type": "string",
            "required": true
          },
          {
            "const": "tenantId",
            "title": "Tenant ID",
            "type": "string",
            "required": true,
            "managed": true,
            "managedScope": "account",
            "hidden": true
          }
        ]
      }
    }
  }
}
```

Values are passed to [`getUserInfo`](interfaces/getUserInfo.md) as `additionalInfo`. The `apiKey` field also becomes the stored `user.accessToken` unless `getUserInfo()` returns `platformUserInfo.overridingApiKey`.

## Call And Message Log Fields

Call-log fields:

```json
{
  "page": {
    "callLog": {
      "additionalFields": [
        {
          "const": "matters",
          "title": "Matter",
          "type": "selection",
          "contactDependent": true,
          "required": false
        }
      ]
    }
  }
}
```

Message-log fields:

```json
{
  "page": {
    "messageLog": {
      "additionalFields": [
        {
          "const": "caseId",
          "title": "Case",
          "type": "selection",
          "contactDependent": true
        }
      ]
    }
  }
}
```

Submitted values are passed to logging interfaces as `additionalSubmission`.

## Appointment Fields

`page.appointment` controls the appointment page title, title/status input
visibility, status choices, attendee email requirements, and available actions.
Add it inside your connector's platform definition at
`platforms.<platformName>.page.appointment` in the Developer Console manifest
(or the bundled manifest for local development). Merge it with any existing
`page` configuration:

```json
{
  "page": {
    "appointment": {
      "appointmentPageUrl": "https://{atsUrl}/BullhornStaffing/OpenWindow.cfm?Entity=Appointment&id={thirdPartyAppointmentId}",
      "canOpenAppointmentPage": true,
      "emailMandatoryInAttendee": false,
      "filterStatus": {
        "value": ["All", "Scheduled"]
      },
      "showConfirm": false,
      "status": {
        "isVisible": true,
        "value": ["Scheduled"]
      },
      "supported": true,
      "title": "Appointment",
      "titleField": {
        "isVisible": true,
        "value": "Title"
      }
    }
  }
}
```

**The Appointment tab requires `page.appointment.supported: true`.** If this
field is missing or false, the tab is hidden even when the server implements
appointment APIs. The user/admin **Show Appointments tab** setting must also
be enabled; it defaults to enabled for supported connectors. Manifest settings
configure the UI; implement the corresponding appointment interfaces on the
server to make its actions work.

The example above uses a Bullhorn appointment URL. For another CRM, replace
`appointmentPageUrl` with that CRM's URL template and configure only the statuses
and actions your connector supports.

| Field under `page.appointment` | Type | Description |
| --- | --- | --- |
| `supported` | boolean | Enables the Appointment tab and its visibility setting. Set to `true` when the connector supports appointments. Missing or `false` hides the tab. |
| `title` | string | User-facing appointment page/tab label and the basis for create/edit action labels. Defaults to `Appointments`. The example uses `Appointment`. |
| `appointmentPageUrl` | string | CRM URL template used by **Open Appointment Info** when `canOpenAppointmentPage` is enabled. `{thirdPartyAppointmentId}` is replaced with the CRM appointment ID. `{atsUrl}` is Bullhorn-specific and resolves to the connected user's ATS host/base path without the `https://` prefix, which the example supplies. Other CRMs can use `{hostname}` and supported [URL template tokens](manifest.md#url-template-tokens). |
| `canOpenAppointmentPage` | boolean | Enables opening the configured `appointmentPageUrl` template. If disabled or the template is missing, the client falls back to an `appointmentUrl` returned with the record, when available. This field does not control tab visibility. |
| `emailMandatoryInAttendee` | boolean | Requires selected attendees to have an email address before form submission when `true`. Set to `false` for CRMs that allow attendees without email addresses. |
| `filterStatus.value` | array of strings | Status filters offered on the appointment list. `All` includes every status; `Scheduled` includes scheduled and confirmed records. Other labels match normalized status values (`Canceled` also matches `cancelled`). This configures filtering, not the editable status choices. |
| `showConfirm` | boolean | Shows the list's **Confirm** action unless explicitly `false`. Use `false` when the connector does not support confirmation. This does not hide the form's status selector. |
| `status.isVisible` | boolean | Shows the create/edit status selector unless explicitly `false`. When hidden, the client omits initial status on create and does not submit status changes on edit. |
| `status.value` | array of strings | Status choices offered in create/edit forms. Values are trimmed and lowercased for submission, so `Scheduled` becomes `scheduled`. The first choice supplies the default for new appointments. An omitted or empty list defaults to `Scheduled`, `Confirmed`, and `Canceled`; configure only values your connector supports. |
| `titleField.isVisible` | boolean | Set explicitly to `true` to show the title input, or `false` to hide it. A hidden title gets a generated value on create and is omitted on update. |
| `titleField.value` | string | Label for the title input, such as `Title` or `Subject`. Defaults to `Title`; this is a label, not the appointment's title value. |

The request shape stays the same across these configurations:

- Create requests use `{ "payload": { ... } }`; edits use `{ "patch": { ... } }`.
- Attendees are submitted as `contacts` with IDs and optional CRM types. Contact
  names and email-check metadata stay in the client for display and validation.
- Times are submitted as `startTimeUtc` with `durationMinutes`.
- `titleField.isVisible: false` hides the input. On create the client supplies a
  title derived from the manifest's appointment title, since the API requires a
  non-empty title. On update the hidden title is omitted to preserve the CRM value.
- `status.isVisible: false` omits status from create and prevents edit status
  submissions. A visible status selector uses the configured `status.value`
  choices. Unchanged statuses are not submitted during edits; changed statuses
  use the separate status action after saving the appointment details.
- Response aliases such as `attendees` and `attendeeIds` remain available for
  displaying existing records and opening contacts. They are not mutation fields.

See [createAppointment](interfaces/createAppointment.md) and
[updateAppointment](interfaces/updateAppointment.md) for the server contracts.

## New-Contact Fields

The `page.newContact.additionalFields` array adds extra fields to the "Create contact" form shown to users when they log a call against an unknown phone number.

Use this to collect CRM-specific data needed at contact creation time — for example, a contact type selector or a company name field.

```json
{
  "page": {
    "newContact": {
      "additionalFields": [
        {
          "const": "contactType",
          "title": "Contact Type",
          "type": "selection",
          "required": true,
          "includeNoneOption": false
        },
        {
          "const": "company",
          "title": "Company",
          "type": "inputField",
          "required": false
        }
      ]
    }
  }
}
```

The values collected here are passed to the [`createContact`](interfaces/createContact.md) interface as part of the `additionalSubmission` parameter.

## Additional Field Shape

| Field | Description |
| --- | --- |
| `const` | Stable key used in `additionalSubmission` and contact `additionalInfo`. |
| `title` | User-facing label. |
| `type` | Input type. Common values are `selection`, `inputField`, `checkbox`, `date`, `string`, and `warning`. |
| `contactDependent` | When true, options come from the selected contact's `additionalInfo[const]`. |
| `contactTypeDependent` | When true, options depend on the selected contact type. |
| `required` | Prevents submission until a value is selected or entered. |
| `description` | Help text shown beneath the field label to guide the user. |
| `includeNoneOption` | For `selection` fields, controls whether the client appends a "None" option. Default: true. Set to `false` to require the user to pick one of the provided options. |
| `searchable` | For `selection` fields. When true, the field renders as a type-to-filter autocomplete instead of a plain dropdown. Option values and the submitted value are handled as strings, so numeric option `const` values reach `additionalSubmission` (and saved dispositions) as strings. Default: false. |
| `allowCustomValue` | For `selection` fields. When true, the user can type a custom value not in the predefined list. |
| `options` | Static options for `selection` fields. Each option uses `{ "const": "...", "title": "..." }`. |
| `defaultSettingId` | The `const` key of a connector setting whose value is used as this field's default. |
| `defaultSettingValues` | A map from a parent field value to a default value for this field. Used for conditional defaults. |

## Contact-Dependent Options

When a manifest field has `contactDependent: true`, the selected contact returned by [`findContact`](interfaces/findContact.md) or [`findContactWithName`](interfaces/findContactWithName.md) should include matching values:

```js
return {
  matchedContactInfo: [
    {
      id: '123',
      name: 'Jane Smith',
      additionalInfo: {
        matters: [
          {
            const: 'matter-1',
            title: 'Matter 1',
            description: 'Open - Estate planning'
          }
        ]
      }
    }
  ]
};
```

The key `matters` matches the manifest field `const`.

## Contact Search

Set `page.useContactSearch` to true and implement [`findContactWithName`](interfaces/findContactWithName.md):

```json
{
  "page": {
    "useContactSearch": true
  }
}
```

Set `page.disableContactCache` to true when phone-number contact lookups should refresh server-side account contact data on each online lookup:

```json
{
  "page": {
    "disableContactCache": true
  }
}
```

This does not disable the client's local matched-contact cache. If the client already has a local match and the lookup does not explicitly force a local refresh, it can still use that local match without making an online request.

## Feedback Page

```json
{
  "page": {
    "feedback": {
      "url": "https://docs.google.com/forms/d/e/example/viewform?entry.1={score}&entry.2={crmName}",
      "elements": [
        {
          "const": "score",
          "title": "Score from 1 to 10",
          "type": "selection",
          "required": true,
          "selections": [
            { "const": "1", "title": "1" },
            { "const": "10", "title": "10" }
          ]
        },
        {
          "const": "feedback",
          "title": "Feedback",
          "type": "inputField",
          "placeholder": "Please share your feedback",
          "required": true
        }
      ]
    }
  }
}
```

The URL can include built-in tokens such as `{crmName}`, `{userName}`, `{userEmail}`, and `{version}` plus any feedback element `const`.
