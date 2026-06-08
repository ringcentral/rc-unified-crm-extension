---
title: Lead creation
---

# Lead Creation

Some CRMs use leads instead of contacts for unknown callers. App Connect supports this through the same lookup and contact-creation interfaces; the connector decides which CRM entity to create.

## Recommended Pattern

Keep lookup and creation separate:

```js
async function findContact({ phoneNumber }) {
  const matchedContactInfo = await crm.searchContactsByPhone(phoneNumber);
  return {
    successful: true,
    matchedContactInfo
  };
}
```

Then create the lead/contact only when core calls `createContact`:

```js
async function createContact({ phoneNumber, newContactName, newContactType }) {
  const lead = await crm.leads.create({
    name: newContactName,
    phone: phoneNumber,
    type: newContactType
  });

  return {
    contactInfo: {
      id: lead.id,
      name: lead.name,
      type: 'lead'
    }
  };
}
```

## Why Not Create In findContact

`findContact` runs for contact display and matching, not only logging. Creating a CRM lead there can create records for calls the user never intended to log.

Use:

- [`findContact`](interfaces/findContact.md) for lookup only
- [`createContact`](interfaces/createContact.md) for user-approved or auto-logging-approved creation
- manifest `contactTypes` when the user should choose `Lead`, `Contact`, or another CRM entity type

## Auto-Logging

When a user's auto-logging rule says to create a placeholder for unknown contacts, core calls `createContact` automatically. Your connector does not need separate code for manual and automatic creation.
