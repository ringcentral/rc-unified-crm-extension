# Getting started building a connector

{! docs/developers/beta_notice.inc !}

## Step.1 Register on Developer Portal

Go to https://appconnect.labs.ringcentral.com/console and login with your RingCentral account and fill in your developer profile.

## Step.2 Create a new app profile

- Click `Create new connector`
- `Connector name`: Your connector name, normally it would be the name of the platform you want to connect to
- `Connector server URL` and `CRM URL`: If you don't have an url, fill in a random test url. We'll come back and update it later
- Scroll to the bottom and click `Create`

## Step.3 Setup your project

Upon creating the app profile, you'll be given quick setup instrutions to setup your project. Please follow that.

## Step.4 Play

Now you have:

1. A local server
2. A web tunnel that exposes your server via a public url
3. A Chrome extension

Let's try and see it everything works:

- Open the Chrome extension and login with your RingCentral account
- Select the app profile you just created
- Input an arbitrary API key 

> **Note**: The auth type is default to API key. You can change it to OAuth if that's applicable to your actual use case.

- Try with making a call and log it. When you make the first call, it'll be display as phone number in your call history. Click `+` button to log it. Since it's not matched to any contact yet (you are running under a mock server), you'll have to create this number as a new contact.
- After logging the call, next call from the same number will be recognized as the contact.

> **Note**: In this mock server, contact info only exists with current server run. If server is re-started, mock contact info will be lost

- There are a lot more features. Please check out our user guide & developer guide to find out. Code implementation suggestions are commented inside template connector script as well.