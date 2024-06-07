# Loading a contact record

{! docs/developers/beta_notice.inc !}

A critical function performed by the server is looking up a contact record in the target CRM given a phone number, and returning a list of matches for that phone number. In addition, the framework will transmit a list of alternative phone number formats to search for. 

!!! tip "Alternative phone number formats"
    Some CRMs expose a contact search API that is very strict with regards to phone number lookup. For example, if a CRM only supports an EXACT MATCH then searching for an E.164 phone number may not yield any results if the phone number is stored in any other format.
	
	As a workaround, the CRM framework allows users to specify additional phone number formats that they typically store phone numbers in. This list of phone numbers is transmitted to the adapter's server, so that the associated adapter can search for a contact using multiple phone number formats until one is found.

## Implement server endpoints

Within your adapter's `index.js` file, implement the following methods.

* [`findContact`](interfaces/findContact.md)

## Test

1. Create a new contact on CRM platform and make a call to it
2. In extension, near call record, click `Refresh contact` to check if console prints correct results (`CHECK.3`)

### Multiple contact types

The framework supports multiple contact types at basic levels. Please refer to existing `bullhorn` or `insightly` code implementation and manifest for more details. 