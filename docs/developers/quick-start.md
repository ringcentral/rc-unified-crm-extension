# Get started building a custom CRM adapter

{! docs/developers/beta_notice.inc !}

The Unified CRM integration framework help developers connect the embedded RingCentral client application that comes bundled with the Unified CRM extension to a variety of CRMs. Connectivity to each CRM is handled by an "adapter."

This quick start will guide you through the process of configuring and building an instance of the framework using the sample adapter that comes bundled in the framework. This sample adapter does not actually connect to a CRM, and without modification it basically does nothing. Instead, it serves as a template for the custom adapter you will eventually build. 

Let's begin.

### Register a RingCentral application

The first step is to login to the [RingCentral Developer Console](https://developers.ringcentral.com/), and register an application. When you register an application, be sure to use the following settings:

* Set the auth type to "Client-side web app"
* Set the OAuth Redirect URI to `https://ringcentral.github.io/ringcentral-embeddable/redirect.html` 
* Set the application scopes to the following: Read Messages, Read Presence, Read Contacts, Read Call Log, Read Accounts, Call Control, VoIP Calling, WebSocket Subscriptions, Ring Out, SMS, Internal Messages, Webhook Subscription, Edit Messages, Edit Presence.

Upon registering your application, you will be provisioned a Client ID and Clien Secret. Navigate to the "Credentials" tab and copy these values to your clipboard. You will need them later.

### Clone or fork the framework's repository

Let's begin by downloading the framework to your development machine.

```
git clone https://github.com/ringcentral/rc-unified-crm-extension.git
cd rc-unified-crm-extension
```

### Setup and start your server

Each adapter requires a server to be running. This server exposes a canonical API to the Unified CRM integration framework, and in a sense acts as a broker or proxy between the front-end client, and the CRM. Let's setup and start the sample server bundled with the framework. 

Open up a console and within it, follow these instructions.

1. Install the necessary prerequisites

    ```
	cd server
	npm i
	```

2. Start [ngrok](https://ngrok.com/)

    ```
	npm run ngrok
	```
	
    Make note of your personalized ngrok URL.
	
3. Edit your server's config file in the `rc-unified-crm-extension/server` directory

    ```
	cp .env.test .env
	```
	
	Edit `.env` and set `APP_SERVER` equal to your personalized ngrok URL above. 
	
4. Start your server from the `rc-unified-crm-extension/server` directory

    ```
	npm run start
	```

### Build and install the client

Next, you need to build and package the Chrome extension that will provide the integrated phone and client application that end user will interface with. 

1. Install the necessary prerequisites

    ```
	cd client
	npm i
	```

2. Edit the client's config file in the `rc-unified-crm-extension/client/src` directory

    ```
	cp config-copy.json config.json
	```
	
	Edit `config.json` and set the following values:
	* Set `serverUrl` to your personalized ngrok URL above.
	* Set `clientId` to the client of the RingCentral application you registered earlier.

3. Build the Chrome extension from the `rc-unified-crm-extension/client` directory

    ```
	npm run build
	```

    When you have completed the above, inside the `rc-unified-crm-extension/client` directory you will find a `build/dist` directory. 
	
4. Install the client

    * Open your Chrome web browser
	* From the "Window" menu, select "Extensions"
	* Click "Load unpacked"
	* Select the `dist` folder created in the previous step

### Try it out

The sample CRM bundled with the framework is configured to only appear when you access the RingCentral Developer website. 

1. In Chrome, navigate to [https://developers.ringcentral.com](https://developers.ringcentral.com).
2. You will observe an orange "R" docked in the lower righthand corner of the RingCentral Developer website. 
3. Click the "R" and then login with your RingCentral account.
4. Navigate to the "Settings" tab and click the "Connect" button next to "testCRM."
5. Enter any string you would like into the "API key" field. Click Save.

Now that we are "connected" to the CRM, let's try out a few features. 

1. Navigate to the `Phone` tab and make a call
2. Observe that the call you just made can be seen in the "Calls" tab
3. Click `+` button next to the call that was just made. Since the contact is unrecognized, a form will appear prompting you create a new contact associated with this phone number. Fill in the form and click `Save`.
4. Click `Edit log` and set the subject and notes you would like to record for this phone call. 
5. Make another phone call to the same number. You will notice that the call is automatically associated with the contact you previously created. 
6. When you are done, navigate back to the "Settings" tab, and click "Log out" next the "Test CRM."

And that's it. You have successfully built and deployed your own RingCentral/CRM integration. Now, let's learn how to customize your adapter to actually integrate with a CRM provider. 

