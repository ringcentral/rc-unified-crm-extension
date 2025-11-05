# App Connect Connector developer quick start 

<!-- md:version 1.7.0 -->

{! docs/developers/beta_notice.inc !}

Welcome to the App Connect developer quick start guide! This quick start guide will walk you through the essential steps for getting your first integration up and running with **App Connect**. By the end of this guide, you will have accomplished two main goals:

* **Register a Connector:** You'll learn how to register a new connector within the **Developer Console**. This is the first step in defining how your external application will interact with the App Connect ecosystem.

* **Set up a Default Mock Server:** We'll deploy a simple mock server. While this server is intentionally basic—it will only **print to the console** the events it receives from App Connect—it serves a vital purpose.

## Building your first connector

By using this mock server, you'll gain a **stronger understanding of the App Connect system's architecture** and the lifecycle of events. This hands-on experience will clearly illustrate **what events (or callbacks)** your application will need to implement when you move to connecting to a real service in the future. Let's get started!

### 1. Register on Developer Portal

Go to the [App Connect Developer Console](https://appconnect.labs.ringcentral.com/console) and login with your RingCentral account and fill in your developer profile.

### 2. Create a new connector

To create a connector, there are only a few mandatory fields you need to provide. In this quick start, our goal is to get you up and running as quickly as possible. You will be able to come back and edit your connector when you are ready to connect to a CRM. 

- Click "Create new connector"
- `Connector name`: Your connector name, normally it would be the name of the platform you want to connect to
- `Connector server URL` and `CRM URL`: If you don't have an url, fill in a random test url. We'll come back and update it later
- Scroll to the bottom and click `Create`

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

## Notes about the default mock server 

* **The default auth type is API key, which is effectively ignored.** Because this is just a mock server that doesn't actually connect to a CRM, you are free to use any arbitrary string as an API key. 


