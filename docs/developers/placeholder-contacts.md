# Creating a placeholder contact

{! docs/developers/beta_notice.inc !}

In the event that no contact could be found with an associated phone number, then the client application will prompt a user to create a placeholder contact.

In the framework's logic, contact creation is coupled with call/message logging. It'll only be used in one case: logging a call/message against an unknown contact. Therefore, it can be described as:

logging against an unknown contact = create a placeholder contact + logging against it

## Implement server endpoints

Within your connector's `index.js` file, implement the following methods.

* [`createContact`](interfaces/createContact.md) 

## Test

1. Make a call to an uknown contact
2. Click `+` button near a call record to log the call
3. Check if the contact is created on CRM platform (`CHECK.9`)
4. Check if call log is saved on CRM platform and database (`CHECK.9`)
