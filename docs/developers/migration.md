# Migration Guide

This guide covers migrating from version 1.6.x to 1.7.x, which introduces a new way to manage manifests. The primary changes are on the manifest management side - there is NO change required for server connector (connector). 

New features can be found in [this post](https://community.ringcentral.com/app-connect-22/announcing-the-major-evolution-of-app-connect-11306).

> **Important:** It's recommended to use a local test instance to try the migration process before applying changes on your production environment. 

> **Important:** Beta extension is not available on Chrome Web Store yet. Please contact Da Kong (da.kong@ringcentral.com) for a beta build.

## Step.1 Migrate your connector manifest

- Navigate to [Developer Console](https://appconnect.labs.ringcentral.com/console) and log in with your RingCentral account
- Enter the basic information for your developer profile
- Create a new connector

While creating a connector, you can reuse your existing `manifest.json` file by following these steps:

**- Switch to JSON Editor**

![click this button to switch to JSON editor](../img/developer-console-json-editor.png)

Click the "JSON" button in the developer console to switch to the JSON editor mode.

**- Copy Your Manifest**

![copy manifest JSON](../img/developer-console-manifest-json.png)

Copy the `CRM object` from your existing `manifest.json` file and paste it into the JSON editor.

- Click button on top right corner to switch back to form view - most fields will be automatically populated and let's resolve the remaining ones
- Copy your server URL to the `Connector server URL` field

## Step.2 Setup Page

> **Note:** In new beta, users don't need to open extension from CRM page to set it up. Instead, they can open the extension directly and choose an app profile to finish the setup. App profiles are fetched from Developer Portal.

Configuring the CRM hostname in your connector profile.

There are 3 types of hostname configurations (using `mycrm.com` as an example):

- **Fixed**: For static URLs (e.g., `mycrm.com` for all requests)
- **Selectable**: For regional servers or predefined options (e.g., `mycrm.com/us`, `mycrm.com/au`)
- **Tenant-specific**: For user-provided URLs (e.g., `mySubDomain.mycrm.com`)

To improve the user experience, you can add setup instructions on the configuration page to guide end users through the process.

After you have made the changes to connector profile, save it and reload the extension, and you should be able to see the changes.

> **Note:** To clear current CRM info, you can either go to extension option or do it in extension UIs under user settings -> developer settings

## Step.3 Create app profile

Scroll down and click `Create`. You now have a private connector that is only visible within your organization.

## Step.4 Database changes

> **Note:** If you are using a new local test instance, this step can be skipped because database will be created from scratch which would automatically use the latest schema. 

Please run following command to add new columns in your database tables:

`ALTER TABLE "adminConfigs"
    ADD COLUMN "adminAccessToken" VARCHAR(512),
    ADD COLUMN "adminRefreshToken" VARCHAR(512),
    ADD COLUMN "adminTokenExpiry" DATE;`

> **Note:** There's also a new table to create, but starting your server should automatically do that for you.

## Step.5 Use npm package

- Go to app profile in Developer Portal. Go to `Overview` tab, `Quick setup` section.
- Follow instructions to create a new project
- Find the latest beta version here: https://www.npmjs.com/package/@app-connect/core?activeTab=versions
- Run `npm i @app-connect/core@1.7.0-beta.2` (if there's newer one, use it instead)
- Copy your connector code over to the new project. Install necessary npm packages that are used in your connector
- Spin up your server (make sure Developer Portal connector profile server url is the same as your server's)

## Step.6 Install the beta extension

Install the extension from [Chrome Web Store](https://chromewebstore.google.com/detail/ringcentral-app-connect/bgpkbcidaabaeioilooghlffdcmlimgk). This will be used as a completely different extension from the existing one but talking to the same server.

To connect with the new client:

1. Logout from the old extension and disable it in chrome://extensions/
2. Open the new extension
3. Log in with your RingCentral account
4. You'll see a list of available connectors, including both public connectors and the private one you just created

> **Note**: 1.7.x is backward compatible. If your users are using 1.6.x extension client, they can still talk to your 1.7.x server.

## Step.7 Test Your Setup

That's it! Congratulations on completing the migration. 

Give your connector a try and feel free to contact da.kong@ringcentral.com if you encounter any issues.