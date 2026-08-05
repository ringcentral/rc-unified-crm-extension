---
title: Contact Not Found During Call Lookup | App Connect Troubleshooting
description: Learn why App Connect fails to find a contact in your CRM during a call, and how to fix phone number format mismatches and lookup timing issues.
---

# Contact not found during call lookup

When a call arrives, App Connect searches your CRM for a contact whose phone number matches the caller's number. If you know the contact exists but App Connect fails to find them, the problem is almost always a phone number format mismatch or a CRM indexing delay.

## Symptom

App Connect displays an "unknown caller" or prompts you to create a new contact, even though the caller's contact record already exists in your CRM.

## Cause

Contact lookup works by comparing the incoming phone number against the phone numbers stored in your CRM. This lookup can fail for two reasons:

**Phone number format mismatch.** Many CRMs store phone numbers in a local or custom format (for example, `(510) 555-1234` or `510-555-1234`), while App Connect receives numbers from RingCentral in E.164 format (for example, `+15105551234`). If the formats do not match exactly, the lookup returns no results. This is the most common cause.

**CRM indexing delay.** If a contact was just created, some CRMs do not make new records immediately searchable. The CRM's internal index may take seconds to minutes to reflect the change, even if you can already see the record on screen.

## Resolution

### Fix a phone number format mismatch

There are two approaches:

**Reformat the numbers in your CRM.** Update contact phone numbers to use the E.164 standard (`+` followed by country code and number, no spaces or punctuation). This is the most reliable and performant solution, though it may not be practical for large contact databases.

**Add phone number formats to App Connect.** In App Connect's advanced settings, you can specify the phone number formats your organization uses. App Connect will then search for contacts using each format, increasing the chance of a match. This approach is easier to deploy but may introduce a small delay, as it requires multiple API calls per lookup.

See [Phone number formats](../users/phone-number-formats.md) for instructions on configuring this setting.

### Fix a CRM indexing delay

Wait a minute or two after creating the contact, then retry the lookup. If the contact consistently appears after a short delay, this is expected CRM behavior and does not require any configuration change.

## Related topics

- [Phone number formats](../users/phone-number-formats.md)
- [Call logging overview](../users/logging.md)
- [Resolving logging conflicts](../users/logging-conflicts.md)
