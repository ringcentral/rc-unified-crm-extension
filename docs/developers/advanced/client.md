# Implementing client-side callbacks

{! docs/developers/beta_notice.inc !}

### Register a RingCentral application

The first step is to login to the [RingCentral Developer Console](https://developers.ringcentral.com/), and register an application. When you register an application, be sure to use the following settings:

* Set the auth type to "Client-side web app"
* Set the OAuth Redirect URI to `https://ringcentral.github.io/ringcentral-embeddable/redirect.html` 
* Set the application scopes to the following: Read Messages, Read Presence, Read Contacts, Read Call Log, Read Accounts, Call Control, VoIP Calling, WebSocket Subscriptions, Ring Out, SMS, Internal Messages, Webhook Subscription, Edit Messages, Edit Presence.

Upon registering your application, you will be provisioned a Client ID and Clien Secret. Navigate to the "Credentials" tab and copy these values to your clipboard. You will need them later.

There a number of behaviors that are triggered in response to key events associated with using the Unified CRM extension. These callbacks are invoked with the intent of performing one of the following browser functions:

* Open a tab corresponding to an incoming call's associated contact record
* Open a tab corresponding to the activity record associated with a phone call
* Perform any garbage collection when a user logs out of a CRM

## Call-pop

"Call-pop" refers to the action of opening the relevant contact record in the associated CRM in response to an incoming call. The typical function of this callback is to formulate the URL to a contact record stored in the CRM, and open a new browser tab to that URL. 

* **Triggering event**: call received
* **Callback input parameters**: 
    * `hostname` = The hostname of the CRM that will form the base of the formulated URL 
    * `incomingCallContactInfo` = a hash summarizing the associated contact record

### Incoming call contact info

The following hash is sent to the callback as an input parameter.

```js
{
  id: '1234829292',
  name: 'John Doe',
  phone: '+11234567890'
}
```

### Example callback

=== "Sample adapter"
    ```js
    {!> client/src/adapters/testCRM.js [ln:1-9]!}
    ```

=== "Pipedrive adapter"
    ```js
    {!> client/src/adapters/pipedrive.js [ln:1-3]!}
    ```

## Opening call log page

When the `canOpenLogPage` config option is set to `true` in the [config file](config.md), then a new menu item will appear in the more menu for each call in the call history page. When a user clicks on This menu item labeled "Open log page," this callback is executed. The callback's function is to formulate a URL to the call log page, and open a new browser tab to that URL. 

* **Triggering event**: user clicks "Open call log" in the more menu of the phone's call history tab
* **Callback input parameters**: 
    * `hostname` = The hostname of the CRM that will form the base of the formulated URL 
    * `logId` = `<Unique log ID of record in CRM>`

### Example callback

=== "Sample adapter"
    ```js
    {!> client/src/adapters/testCRM.js [ln:14-23]!}
    ```

=== "Pipedrive adapter"
    ```js
    {!> client/src/adapters/pipedrive.js [ln:5-7]!}
    ```

### Deauthorizing users

When a user logs out of a CRM via the Unified CRM extension, then this callback is executed -- giving developers an opportunity to perform any garbage collection or other clean up activities. 

* **Triggering event**: user clicks "Logout" on the settings page for the CRM
* **Callback input parameters**: none

=== "Sample adapter"
    ```js
    {!> client/src/adapters/testCRM.js [ln:10-12]!}
    ```

=== "Pipedrive adapter"
    ```js
    {!> client/src/adapters/pipedrive.js [ln:9-11]!}
    ```

=== "Bullhorn adapter"
    ```js
    {!> client/src/adapters/bullhorn.js [ln:14-17]!}
    ```

## Building the Chrome extension

Build scripts have been provided to assist you in building the Chrome extension you will install in your browser. 

1. Build the Chrome extension

    ```
	cd rc-unified-crm-extension/client
	npm run build
	```

    When you have completed the above, inside the `rc-unified-crm-extension/client` directory you will find a `build/dist` directory. The dist folder contains your Chrome extension. 
	
2. Install the Chrome extension

    * Open your Chrome web browser
	* From the "Window" menu, select "Extensions"
	* Click "Load unpacked"
	* Select the `dist` folder created in the previous step