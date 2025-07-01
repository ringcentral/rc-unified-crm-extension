# App Connect adapter interfaces

Each adapter exposes an API that the App Connect server connects and exchanges data with. Each endpoint or interface of this API corresponds to a function supported by App Connect, and is responsible for fulfilling that function within the context of the CRM being connected to. 

Every App Connect adapter needs to implement each of the following interfaces.

| Interface                                 | Description                                                                      |
|-------------------------------------------|----------------------------------------------------------------------------------|
| [`createCallLog`](createCallLog.md)       | Creates a new call log or activity needs to be recorded in the CRM.              |
| [`createMessageLog`](createMessageLog.md) | Createa a new SMS conversation needs to be recorded in the CRM.                  |
| [`createContact`](createContact.md)       | Creates a new contact, when a contact is not found for a phone number.           |
| [`getAuthType`](getAuthType.md)           | Returns the auth type specific to this CRM.                                      |
| [`getCallLog`](getCallLog.md)             | Loads the current state of the call log from the CRM in the event that the user may have edited the record directly. |
| [`findContact`](findContact.md)           | Attempts to find and return one or more contacts associated with a phone number. |
| [`findContactWithName`](findContactWithName.md) | Attempts to find and return one or more contacts associated with a name input by a user. |
| [`getOauthInfo`](getOauthInfo.md)         | Returns key OAuth details to facilitate connect to a CRM.                        |
| [`unAuthorize`](unAuthorize.md)           | Logs a user out of the CRM, invalidates credentials, etc.                        |
| [`updateCallLog`](updateCallLog.md)       | Updates an existing call log record in the CRM.                                  |
| [`updateMessageLog`](updateMessageLog.md) | Updates an existing message log in the CRM.                                      |
