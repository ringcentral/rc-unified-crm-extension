# Associating calls with CRM records

One of the most powerful things App Connect can do for a CRM integration is link a logged call or SMS not just to a contact, but to a specific record in the CRM that is associated with that contact — a legal matter, an open deal, a support ticket, a project, a job order. This turns a basic call log into a properly contextualized activity in the CRM.

This page describes the data-binding system that makes this possible. Understanding it is essential before building any non-trivial connector.

## The core concept

App Connect uses a two-phase approach to call logging:

1. **Contact resolution** — when a call arrives, the framework calls your connector's `findContact` interface to find the contact associated with the incoming phone number. At this point your connector has access to the full CRM record for that contact, and can return any associated CRM objects alongside the contact.

2. **Call logging** — when the user logs the call, they see a form. Fields on that form can be populated with the CRM objects you returned in step one. The user selects the relevant record (a matter, a deal, a ticket), and that selection is passed back to your connector when the form is submitted.

The binding between step one and step two is declared entirely in your manifest. No additional interface work is required — you return the data once during contact resolution, and the framework takes care of rendering and binding it.

## How the binding works

### Step 1 — Return associated records from `findContact`

When your `findContact` implementation resolves a contact, include an `additionalInfo` object on each contact. The keys of `additionalInfo` correspond to the fields you intend to populate on the call logging form. The values are arrays of option objects, each with a `const` (the value that will be submitted) and a `title` (the display label).

```js
// findContact return value
matchedContactInfo.push({
  id: contact.id,
  name: contact.name,
  additionalInfo: {
    matters: contact.matters.map(m => ({
      const: m.id,
      title: m.display_number,
      description: m.description   // optional, shown as subtitle
    })),
    billableStatus: [
      { const: 'billable',     title: 'Billable' },
      { const: 'non-billable', title: 'Non-billable' }
    ]
  }
});
```

The keys (`matters`, `billableStatus`) are entirely up to you — they just need to match what you declare in the manifest.

### Step 2 — Declare the fields in your manifest

In your manifest's `page.callLog.additionalFields` array, define a field for each key you returned in `additionalInfo`. Set `contactDependent` to `true` to tell the framework that this field's options come from the matched contact.

```json
"page": {
  "callLog": {
    "additionalFields": [
      {
        "const": "matters",
        "title": "Matter",
        "type": "selection",
        "contactDependent": true
      },
      {
        "const": "billableStatus",
        "title": "Billable?",
        "type": "selection",
        "contactDependent": true
      }
    ]
  }
}
```

The value of `const` must match the key in `additionalInfo` exactly. That is the binding — there is no other configuration required.

### Step 3 — Receive the selection in `createCallLog`

When the user submits the call log form, the framework calls your `createCallLog` interface with an `additionalSubmission` object containing the user's selections, keyed by the field's `const` value.

```js
async function createCallLog({ additionalSubmission, ... }) {
  const matterId = additionalSubmission?.matters;         // e.g. "matter-123"
  const billable  = additionalSubmission?.billableStatus; // e.g. "billable"

  // Use these values when creating the log entry in the CRM
  await crmApi.createActivity({
    matter_id: matterId,
    billable: billable === 'billable',
    ...
  });
}
```

## Where bindings can be declared

The `contactDependent` binding works across three form contexts:

| Context                          | Manifest path                          | When it appears                                      |
|----------------------------------|----------------------------------------|------------------------------------------------------|
| Call logging form                | `page.callLog.additionalFields`        | Whenever a call is being logged                      |
| SMS / message logging form       | `page.messageLog.additionalFields`     | Whenever an SMS thread is being logged               |
| New contact form                 | `page.newContact.additionalFields`     | When the user creates a contact during call logging  |

All three forms receive `additionalSubmission` in their respective interfaces (`createCallLog`, `createMessageLog`, `createContact`).

!!! note "The new contact form is different"
    On the new contact form, there is no existing contact yet, so `contactDependent` fields cannot be populated from `additionalInfo`. For the new contact form, use `contactTypeDependent` instead — see [below](#contact-type-dependent-fields).

## Other dependency mechanisms

`contactDependent` covers the most common case. The framework also provides other ways to make fields context-aware.

### Contact-type-dependent fields

When a field's options should change based on the *type* of contact being created or logged against (e.g. Candidate vs. Contact vs. Lead), set `contactTypeDependent: true`. The framework will pass the selected contact type alongside the form data, and you return different options per type from your connector.

```json
{
  "const": "status",
  "title": "Status",
  "type": "selection",
  "contactTypeDependent": true
}
```

This is most useful on the `newContact` form, where the user first selects a contact type (e.g. Candidate) and the remaining fields update to reflect the valid statuses and options for that type.

### Dynamic options

When a field's options cannot be defined statically in the manifest — for example, because the list is large, changes frequently, or depends on user permissions — set `dynamicOptions: true`. The framework will fetch the options from your connector at form-render time rather than relying on data returned during contact lookup.

```json
{
  "const": "projects",
  "title": "Project",
  "type": "selection",
  "dynamicOptions": true
}
```

### Default values from user settings

Two properties let you tie a field's default value to the user's saved preferences rather than requiring manual selection every time:

**`defaultSettingId`** — sets this field's default to the value of a named user setting. Useful when users have a preferred default for most calls (e.g. a default note action).

**`defaultSettingValues`** — maps call context (inbound vs. outbound) to different default setting IDs, so the field can pre-select different defaults depending on the direction of the call.

```json
{
  "const": "noteAction",
  "title": "Note Action",
  "type": "selection",
  "defaultSettingId": "defaultNoteAction",
  "defaultSettingValues": {
    "inboundCall":  { "settingId": "inboundNoteAction" },
    "outboundCall": { "settingId": "outboundNoteAction" }
  }
}
```

## Injecting RingCentral metadata automatically

In addition to user-selected form fields, you can configure your manifest to automatically include RingCentral-side metadata in every `additionalSubmission`. Use the `rcAdditionalSubmission` manifest property to define a list of values to extract from the RingCentral user's cached data and inject alongside the user's selections.

```json
"rcAdditionalSubmission": [
  {
    "id": "departmentName",
    "path": "cachedData.extensionInfo.contact.department"
  }
]
```

This causes `additionalSubmission.departmentName` to be populated automatically with the agent's department on every call log — no user interaction required.

## Complete data flow

Here is how data moves from call arrival to a fully contextualized log entry in the CRM:

```
Call arrives
    │
    ▼
findContact called
    │   Returns: contact + additionalInfo{ matters:[...], deals:[...] }
    │
    ▼
User opens call log form
    │   Framework reads manifest: page.callLog.additionalFields
    │   Fields with contactDependent:true are populated from additionalInfo
    │   (e.g. "Matter" dropdown shows the contact's open matters)
    │
    ▼
User selects values and submits
    │   additionalSubmission = { matters: "m-123", billableStatus: "billable" }
    │
    ▼
createCallLog called
    │   Receives: callLog, contactInfo, additionalSubmission, ...
    │
    ▼
Connector creates log entry in CRM, linked to the selected matter/deal/etc.
```

## Example: Clio (legal matters)

Clio is the clearest example of this pattern. Clio users work with "matters" — the legal cases that all billable activity is tracked against. When a call is received:

1. `findContact` fetches the contact's open matters from the Clio API and returns them in `additionalInfo.matters`.
2. The manifest declares a `"Matter"` selection field with `contactDependent: true` and `const: "matters"`.
3. The agent sees a "Matter" dropdown populated with the contact's open cases.
4. When the agent selects a matter and submits, `createCallLog` receives the matter ID in `additionalSubmission.matters` and links the call activity to that matter in Clio.

## Example: Pipedrive (deals and leads)

Pipedrive uses the same mechanism for two objects simultaneously. `findContact` returns both `additionalInfo.deals` and `additionalInfo.leads` for the matched contact. The manifest declares two fields — "Deal" and "Lead" — each `contactDependent`. The agent can associate a call with either an open deal or a lead, and `createCallLog` receives both values in `additionalSubmission` to link appropriately.

## Implementation checklist

- In `findContact`, populate `additionalInfo` with keys matching your intended field names
- Each value is an array of `{ const, title, description? }` objects
- In the manifest, add fields to `page.callLog.additionalFields` (and/or `messageLog`, `newContact`) with `contactDependent: true`
- Set the field's `const` to exactly match the corresponding `additionalInfo` key
- In `createCallLog` and `createMessageLog`, read `additionalSubmission` and use the selected values to link the log to the correct CRM record
- If the same associations are needed on SMS logs, repeat the manifest fields under `page.messageLog.additionalFields`
