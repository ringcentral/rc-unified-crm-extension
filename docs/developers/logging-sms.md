# Logging an SMS message or conversation

{! docs/developers/beta_notice.inc !}

App Connect allows users to log in their CRM all forms of communication with a customer, which includes SMS or text messages. This interface describes how to log an SMS conversation within the target CRM. 

## Important note

Message logging is slightly different from call logging. Message logs could become pretty messy. This framework applies an idea to group messages together, and here is how:

Message logs are grouped per conversation per day, meaning there will be just one CRM activity for all messages that happen under the same conversation on the same day.

Therefore, the first message during the day will be logged using `createMessageLog` to create a new CRM activity, while the following messages are added to the existing activity using `updateMessageLog`. And the framework already takes care of separating the 1st message and the rest.

## Implement server endpoints

Within your connector's `index.js` file, implement the following methods.

* [`createMessageLog`](interfaces/createMessageLog.md) 
* [`updateMessageLog`](interfaces/updateMessageLog.md)

## Test

1. Send a SMS message to a known contact
2. Click `+` button near a conversation record to log all unlogged messages under this conversation
3. Check if message log is saved on CRM platform and database (`CHECK.7`)
4. Send another SMS message to the same contact
5. Click `+` button near a conversation record to log all unlogged messages under this conversation
6. Check if message log is added to previously created log on CRM platform and as a new record in database (`CHECK.8`)

### Tips

The framework checks database to see if there's existing message log on the day. If you want to setup a scenario to test 1st message, you could delete all message log records in database.

