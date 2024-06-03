# addCallLog

This function is to add call log onto a matched contact on CRM. A call log has 4 parts:
1. call metadata from RingCentral (eg. call start time, call duration, all in input `callLog`)
2. call subject (in `callLog.customSubject`)
3. call note (in input `note`)
4. call associations from CRM (in input `additionalSubmission`)

#### Params
`Input`:
- `user`: user entity
- `contactInfo`: has `id`, `phoneNumber`, `type`, `name`
- `authHeader`: auth header for CRM API call
- `callLog`: all call log info
- `note`: user note
- `additionalSubmission`: user submission for contact's `additionalInfo`
- `timezoneOffset`: (optional) to be used in case that CRM platform requires timezone info

`Output`:
- `id`: crm call log id

#### Reference
=== "Example CRM"

    ```js
    {!> src/adapters/testCRM/index.js [ln:162-197] !}
	```
	
=== "Pipedrive"

	```js
    {!> src/adapters/pipedrive/index.js [ln:131-156] !}
	```

