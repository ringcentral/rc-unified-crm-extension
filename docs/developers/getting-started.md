# Getting started building a custom CRM adapter

{! docs/developers/beta_notice.inc !}

Every CRM adapter requires a manifest file which provides developers a way to configure and customize the framework properly for the associated CRM. Via the adapter's manifest, developers can:

* Provide CRM connectivity and authorization details
* Define custom fields for:
    * call logging and disposition forms
    * SMS and messagig logging forms
* Customize the "Connect to CRM" or authorization screen
* Define custom contact record types/categories
* Customize the welcome screen for a given CRM

### Clone or fork the framework's repository

Let's begin by downloading the framework to your development machine.

    > git clone https://github.com/ringcentral/rc-unified-crm-extension.git
    > cd rc-unified-crm-extension

Next, copy the contents of the test CRM adapter to a new folder where your adapter will be placed.

    > cp src/adapters/testCRM src/adapters/my-crm-adatper

### Setup and start your server

Each adapter requires a server to be running. This server exposes a canonical API to the Unified CRM integration framework, and in a sense acts as a broker or proxy between the front-end client, and the CRM. Let's setup and start the sample server bundled with the framework. 

Open up a console and within it, follow these instructions.

1. Install the necessary prerequisites

    ```
	npm i
	```

2. Start [ngrok](https://ngrok.com/)

    ```
	npm run ngrok
	```
	
    Make note of your personalized ngrok URL (referred as `https://xxxx.ngrok.app` below).
	
3. Edit your server's manifest file in the `rc-unified-crm-extension/server` directory

    ```
	cp .env.test .env
	```
	
	Edit `.env` and set `APP_SERVER` equal to your personalized ngrok URL above. 

4. Edit test CRM manifest file in the `rc-unified-crm-extension/src/adapters/testCRM` directory

	Change `serverUrl` in `manifest.json` to `https://xxxx.ngrok.app`

5. Start your server from the `rc-unified-crm-extension/server` directory

    ```
	npm run start
	```

## Next step: edit your manifest file

With this step complete, you now have a shell of an adapter in place and you are ready to begin development. Let's start by customizing your adapter's manifest file. 

[Implement an authorization layer](auth.md){.md-button}
