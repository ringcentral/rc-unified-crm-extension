# App Connect Connector developer quick start 

!!! tip "Make sure you are using App Connect 2.0"
    The new App Connect developer experience requires App Connect 2.0 and is currently in beta. Before you proceed, be sure you have installed the correct version. 
	
	<a href="https://chrome.google.com/webstore/detail/ringcentral-crm-extension/bgpkbcidaabaeioilooghlffdcmlimgk"><img class="mw-450" src="../../img/chrome-web-store.png"></a>

Through this quick start, you will gain a **stronger understanding of the App Connect system's architecture** by registering a manifest and deploying a connector that talks to a mock CRM. This hands-on experience will illustrate **what events (or callbacks)** your application will need to respond to via a set of [interfaces](interfaces/index.md) you will implement when you connect to an actual service in the future. Let's get started!

### 1. Access the Developer Console

Go to the App Connect Developer Console and login with your RingCentral account and create your developer profile.

[Login to the Developer Console](https://appconnect.labs.ringcentral.com/console/){ .md-button .md-button--primary }

### 2. Register a new connector

To create a connector, there are only a few mandatory fields you need to provide. In this quick start, our goal is to get you up and running as quickly as possible. You will be able to come back and edit your connector when you are ready to connect to a CRM. 

Click "Create new connector."

You will be presented with a rather hefty form, but you only need to provide values for the following fields:

* **Connector name**. Your connector name, normally it would be the name of the platform you want to connect to
* **Connector server URL**. Enter any URL here. We will come back and edit this in a subsequent step.
* **CRM URL**. Enter any value for this required field. 

That's it. All other fields are optional at this point. Scroll to the bottom and click "Create."

### 3. Setup your project

Upon creating the app profile, setup instrutions will be displayed in the Developer Console. These instructions will guide you through the process of installing the necessary App Connect libraries, initializing your project, and stubbing out your server's interfaces using a basic template. Follow these instructions.

### 4. Build!

If you have successfully followed the instructions above, you should now have the following:

1. The App Connect Chrome extension installed
1. A local server hosting your connector
2. A web tunnel that exposes your server via a public url

Let's try and see it everything works:

- Open the Chrome extension and login with your RingCentral account
- Select the app profile you just created
- Input an arbitrary API key 
- Conduct a test call to your RingCentral phone number and log it. When you make the first call, it will appear just as a phone in your call history. Click `+` button to log it. Since it's not matched to any contact yet (you are running under a mock server), you'll have to create this number as a new contact.
- After logging the call, next call from the same number will be recognized as the contact.
- There are a lot more features. Please check out our user guide & developer guide to find out. Code implementation suggestions are commented inside template connector script as well.

!!! note "Notes about the default mock server"
    * **The default auth type is API key, which is effectively ignored.** Because this is just a mock server that doesn't actually connect to a CRM, you are free to use any arbitrary string as an API key. 


