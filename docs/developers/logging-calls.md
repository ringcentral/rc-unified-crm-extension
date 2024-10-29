# Working with call log records

{! docs/developers/beta_notice.inc !}

One of the most used features across all of RingCentral's CRM integrations is the function of logging a phone call and recording a disposition associated with that phone call in the target CRM. To facilitate various user flows that relate to the logging of calls, developers need to implement three different interfaces in their server implementation.

* Load a call log associated with a phone call
* Create a call log record
* Update a call log record

## Implement server endpoints

Within your adapter's `index.js` file, implement the following methods.

* [`createCallLog`](interfaces/createCallLog.md)
* [`getCallLog`](interfaces/getCallLog.md)
* [`updateCallLog`](interfaces/updateCallLog.md)

## Test

1. Make a call to a known contact
2. Click `+` button near a call record to log the call
3. Check if call log is saved on CRM platform and database (`CHECK.4`)
4. Click `Edit` button near the call record to update the log
5. Check if call log's subject and note are pulled correctly (`CHECK.5`)
6. Edit subject and note, then click `Update`
7. Check if call log is updated on CRM platform (`CHECK.6`)

## Log page setup

Please go to [manifest](manifest.md#adding-custom-fields-to-logging-forms).

### Internal call logging

To enable internal call logging for extension numbers under your main number, please add `enableExtensionNumberLoggingSetting` under your manifest platform info. Users would need to turn on `Allow extension number logging` under `Contacts` settings. Then on server end, `isExtension` flag will be passed in as in `src/adapters/testCRM/index.js` - `findContact()`.