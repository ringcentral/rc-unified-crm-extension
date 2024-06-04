# createMessageLog

This function is to create logs for SMS messages, ONLY in the following case:
* First message from/to the contact during the day

To explain it better, here's how message logging works:

The framework logs SMS messages like "daily conversations", meaning all messages to/from the same contact on the same day will be logged in one CRM log, in which the first message logging creates a new log and the rest will update onto the existing log.

#### Example
1. I send a message to John, and I log it -> `createMessageLog` to create a new log
2. I send another message to John, and I log it -> [`updateMessageLog`](./updateMessageLog.md) to add new message onto existing log
3. I send a message to Jane, and I log it -> `createMessageLog` to create a new log
4. John replies my message, and I log it -> [`updateMessageLog`](./updateMessageLog.md) to add new message onto existing log
5. Tomorrow I send John a message, and I log it -> `createMessageLog` to create a new log

#### Params
`Input`:
- `user`: user entity
- `contactInfo`: has `id`, `phoneNumber`, `type`, `name`
- `authHeader`: auth header for CRM API call
- `message`: message text
- `additionalSubmission`: user submission for contact's `additionalInfo`
- `recordingLink`: if it's a voicemail, this will be the link for it

`Output`:
- `id`: message log id

#### Reference
=== "Example CRM"

    ```js
    {!> src/adapters/testCRM/index.js [ln:270-301] !}
	```
	
=== "Pipedrive"

	```js
    {!> src/adapters/pipedrive/index.js [ln:197-247] !}
	```

