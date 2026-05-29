# Creating a placeholder contact

--8<-- "docs/developers/beta_notice.inc"

In the event that no contact could be found with an associated phone number, the client application will prompt a user to create a placeholder contact.

In the framework's logic, contact creation is coupled with call/message logging. It'll only be used in one case: logging a call/message against an unknown contact. Therefore, it can be described as:

logging against an unknown contact = create a placeholder contact + logging against it

## Automating placeholder contact creation

Users don't have to wait for a prompt — App Connect can handle this automatically. Under **Settings > Auto-logging rules**, users can configure what happens when a call comes in for an unknown contact. One of the available options is to create a placeholder contact automatically, using the caller's Caller ID name if available, or a default placeholder name set by the admin.

This means your `createContact` implementation handles both flows with no extra work:

- **Automated** — the framework calls `createContact` silently based on the user's auto-logging preference
- **Manual** — the user clicks "Create contact" in the call log prompt and the same interface is called

See [Auto-logging rules](../users/logging-conflicts.md#resolving-conflicts-automatically) in the user documentation for the full user-facing configuration options.

!!! tip "Avoid implementing contact creation inside `findContact`"
    A common pattern is to auto-create contacts within the `findContact` interface when no match is found. This bypasses user intent and creates contacts for calls that were never meant to be logged. The auto-logging rules flow described above is the correct way to handle this. See [Lead creation](lead-creation.md) for a full explanation and recommended implementation.

## Implement server endpoints

Within your connector's `index.js` file, implement the following methods.

* [`createContact`](interfaces/createContact.md)

## Test

1. Make a call to an unknown contact
2. Click `+` button near a call record to log the call
3. Check if the contact is created on CRM platform (`CHECK.9`)
4. Check if call log is saved on CRM platform and database (`CHECK.9`)
