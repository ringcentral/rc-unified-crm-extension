# Custom Settings

Connector settings live in `platforms.<crmName>.settings[]`. They appear in App Connect user settings and can also appear in admin managed settings.

## Location

```json
{
  "settings": [
    {
      "id": "myCrmOptions",
      "type": "section",
      "name": "My CRM options",
      "items": []
    }
  ]
}
```

Each section groups related setting items.

## Setting Types

### Input Field

```json
{
  "id": "defaultDuration",
  "type": "inputField",
  "name": "Default duration",
  "description": "Duration in seconds.",
  "placeholder": "30",
  "defaultValue": "30"
}
```

### Boolean

```json
{
  "id": "createTimeEntries",
  "type": "boolean",
  "name": "Create time entries",
  "description": "Create time entries when logging calls.",
  "defaultValue": true
}
```

### Warning

```json
{
  "id": "extraLookupWarning",
  "type": "warning",
  "name": "Extra lookup warning",
  "value": "Extra lookup fields can slow contact matching."
}
```

### Option

```json
{
  "id": "defaultBillableStatus",
  "type": "option",
  "name": "Default billable status",
  "options": [
    { "id": "billable", "name": "Billable" },
    { "id": "non-billable", "name": "Non-billable" }
  ],
  "defaultValue": "billable",
  "required": true
}
```

Multiple-choice checkbox options are supported:

```json
{
  "id": "phoneFields",
  "type": "option",
  "name": "Phone fields to search",
  "options": [
    { "id": "phone", "name": "Main Phone" },
    { "id": "mobilePhone", "name": "Mobile Phone" }
  ],
  "multiple": true,
  "checkbox": true,
  "defaultValue": ["phone", "mobilePhone"]
}
```

## Reading Settings In Code

Settings are stored on the connected user:

```js
const value = user.userSettings?.defaultBillableStatus?.value ?? 'billable';
```

The key is the setting item `id`, not the section `id`.

## Admin Managed Settings

Settings defined in the manifest can be controlled by administrators in the managed settings area. Connector code reads them the same way from `user.userSettings`; the runtime resolves user/admin values before the connector sees the settings object.

## Connector Hooks

If a setting change needs validation or side effects, implement:

```js
async function onUpdateUserSettings({ user, userSettings, updatedSettings }) {
  return {
    successful: true,
    returnMessage: {
      message: 'Settings updated.',
      messageType: 'success',
      ttl: 1000
    }
  };
}
```

Core persists `updatedSettings` only when the hook returns `successful: true`.
