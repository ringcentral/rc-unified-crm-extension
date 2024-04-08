# Unified CRM extension for Google Chrome and Microsoft Edge

[![Build Status](https://github.com/ringcentral/rc-unified-crm-extension/workflows/CI%20Pipeline/badge.svg?branch=master)](https://github.com/ringcentral/rc-unified-crm-extension/actions)

## Looking for user documentation?

Access our end user [documentation](https://ringcentral.github.io/rc-unified-crm-extension/) through the project's Github pages. 

## Use this framework

### Overview
 
The main task for this framework is to help you develop a service that supports quick integration between RingCentral and other CRM platforms. 

It has client side and server side components, both written in Javascript. Client side components is a Chrome extension.

### Quick start

In typical use, to support a new CRM platform, you'll just need to look at `platformModules` folder and it's recommended to start from modifying `testCRM.js` on both ends.

#### Test run

To quickly understand the overall flow, let's start with a speedy setup for `testCRM`.

##### Register RingCentral App

1. Go to https://developers.ringcentral.com/ and sign up as a developer
2. Create a new app as with Auth type as `Client-side web app`, `OAuth Redirect URI` as https://ringcentral.github.io/ringcentral-embeddable/redirect.html and `Application scopes` as following: Read Messages, Read Presence, Read Contacts, Read Call Log, Read Accounts, Call Control, VoIP Calling, WebSocket Subscriptions, Ring Out, SMS, Internal Messages, Webhook Subscription, Edit Messages, Edit Presence.
3. After creation, go to `Credentials` tab and copy production `Client ID` and `Client Secret`

##### Setup server

1. Open a terminal (T1), `cd client` and `npm i`
2. Open another terminal (T2), `cd server` and `npm i`, and `npm run ngrok`.
3. Under `server` folder, rename `.env.test` to `.env`, and fill in ngrok url to `APP_SERVER`
4. Open one more terminal (T3), `cd server` and `npm run start`

##### Setup client

1. Under `client` folder, rename `config-copy.json`, to `config.json`
2. Fill in `config.json` values
   1. serverUrl: ngrok url
   2. clientId: `Client ID`
3. In T1, `npm run build` to build out a `dist` folder under `client` folder

##### Run

1. Open Chrome, and go to https://developers.ringcentral.com
2. Open chrome://extensions/, and `Load unpacked` to load `dist` folder
3. Login with your RingCentral Account
4. Go to `Settings` tab and connect to `testCRM`