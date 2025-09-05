# Is your CRM App Connect-ready? 

The App Connect framework from RingCentral can be used to build an integration with any CRM, even a home-grown or proprietary one. If you are seeking to build an adapter for a commercial or home-grown CRM, here is a check list to see if the system you are integrating with is compatible with this framework. 

## Compatibility checklist for CRMs

**:fontawesome-solid-clipboard-check: OAuth 2.0 support**

Ideally, your CRM supports the [OAuth 2.0 authorization protocol](https://oauth.net/2/). From the perspective of building the adapter, this will by far be the easiest most turn-key way to connect the App Connect client application to your CRM. 

Technically, the framework can be made to work with alternative authentication mechanisms, like API keys and other tokenized methods. However, there is no guarantee such mechanisms will work out of the box. 

A similar API is needed to log a user out. This API would effectively invalidate an access key so that it cannot be used again. 

**:fontawesome-solid-clipboard-check: API to create a call log, note or activity record**

Every CRM has its own unique vernacular, but at the end of the day the core function of an adapter is to facilitate the process of recording communications in the CRM in question. To do that, the CRM needs an API that allows the adapter to store in the CRM's database a record of a phone call or SMS message.

A similar API will be needed for fetching, and editing/updating call logs as well. 

**:fontawesome-solid-clipboard-check: API to lookup associations with a phone number**

To execute a call pop, which describes the process of opening a web page or fetching information about the person or contact one is calling or receiving a call from, the CRM needs an API that can receive as input a phone number, and return information about the person corresponding to that phone number. 

Ideally, that API will take as input a phone number in [E.164 format](https://en.wikipedia.org/wiki/E.164) but search the CRM for phone numbers stored in any other format. The stricter the search syntax is for phone numbers, the less reliably contacts/associations will be found when a search is conducted. 

**:fontawesome-solid-clipboard-check: API to create a contact**

When a call is received for which no association or contact exists, users are given the opportunity to create a contact record to associate the activity record with. To facilitate this user flow, an API must exist that allows a contact to be created and associated with a given phone number. 

**:fontawesome-solid-clipboard-check: API to fetch the name of the currently logged in user**

Finally, in order to show users that they have connected to the CRM successfully, an API needs to exist that returns the current user's name, and validates that the access key or API key used to authenticate with the CRM is valid. 

## Server recommendations

Technically, an adapter's server could be implemented in any language. However, the fastest and easiest way to implement an adapter's server is using our pre-made Javascript [adapter server framework](https://github.com/ringcentral/rc-unified-crm-extension).
