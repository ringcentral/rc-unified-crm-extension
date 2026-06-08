# Contact Matching

Contact matching maps RingCentral phone numbers to CRM records. It powers call pop, call logging, message logging, manual refresh, and contact creation flows.

## Interfaces

Implement:

- [`findContact`](interfaces/findContact.md)
- [`findContactWithName`](interfaces/findContactWithName.md), optional manual search
- [`createContact`](interfaces/createContact.md), optional contact creation

## Phone Lookup

Core calls `findContact` with the connected user, prepared auth header, phone number, optional overriding formats, and extension-number context.

Return:

- one or more contacts when matches exist
- an empty `matchedContactInfo` array when no match exists
- a `createNewContact` pseudo-contact only when you want to show a create-contact option

Core caches non-new contact matches per RingCentral account/platform/phone number. A forced refresh bypasses the cache.

## Alternative Phone Formats

Users can configure overriding phone formats for CRMs that require exact matches. The connector is responsible for converting the E.164 number into those formats and searching them.

Example:

```js
const formats = overridingFormat ? overridingFormat.split(',') : [];
```

See [phone number formats](../users/phone-number-formats.md) for the user-facing setting.

## Contact-Dependent Form Options

If the manifest defines a contact-dependent field:

```json
{
  "const": "matters",
  "title": "Matter",
  "type": "selection",
  "contactDependent": true
}
```

Return matching options on each contact:

```js
{
  id: '123',
  name: 'Jane Smith',
  additionalInfo: {
    matters: [
      { const: 'matter-1', title: 'Matter 1' }
    ]
  }
}
```

## Name Search

When phone lookup does not find the right contact, users can search by name if:

- `page.useContactSearch` is true in the manifest
- the connector implements [`findContactWithName`](interfaces/findContactWithName.md)

## Contact Creation

When users or auto-logging rules create a contact, core calls [`createContact`](interfaces/createContact.md). Keep contact creation out of `findContact` so lookup remains a read-only operation.

## Testing

1. Connect a CRM user.
2. Search a phone number that exists in the CRM.
3. Search a number that does not exist and confirm the no-match/create-contact flow.
4. Test manual name search.
5. Test contact-dependent fields in the call and message log forms.
