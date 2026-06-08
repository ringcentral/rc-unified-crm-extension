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
| `includeNoneOption` | For `selection` fields, controls whether the client prepends an empty "None" option. Default: false. |
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

