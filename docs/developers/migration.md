# Migration Guide

This guide covers migrating from version 1.6.x to 1.7.x, which introduces a new way to manage manifests. The primary changes are on the manifest management side - there is NO change required for server adapter (connector). This migration involves a few simple steps and takes advantage of the convenient features provided by our developer console.

## Register Your Connector

1. Navigate to https://appconnect.labs.ringcentral.com/console and log in with your RingCentral account
2. Enter the basic information for your connector
3. Create a new connector

You can reuse your existing `manifest.json` file by copying the CRM object (shown below) and pasting it into the JSON editor.

![click this button to switch to JSON editor](../img/developer-console-json-editor.png)

*Click the "JSON" button in the developer console to switch to the JSON editor mode, which allows you to paste your existing manifest configuration directly.*

![copy manifest JSON](../img/developer-console-manifest-json.png)

*Copy the CRM object from your existing manifest.json file and paste it into the JSON editor. This will automatically populate most of the connector configuration fields.*

4. Switch back to form view - most fields will be automatically populated
5. Copy your server URL to the `Connector server URL` field
6. Scroll down and click `Create`

You now have a private connector that is only visible within your organization.

## Connect with the New Client

Download the beta client build from [here](https://rc-unified-crm-extension-serverlessdeploymentbuck-kvb7fti23x1f.s3.us-east-1.amazonaws.com/dist.zip?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=ASIAXUJPC3ZV3KKUYCQF%2F20250912%2Fus-east-1%2Fs3%2Faws4_request&X-Amz-Date=20250912T054720Z&X-Amz-Expires=300&X-Amz-Security-Token=IQoJb3JpZ2luX2VjEK7%2F%2F%2F%2F%2F%2F%2F%2F%2F%2FwEaCXVzLWVhc3QtMSJGMEQCIHjdIMYQsz5gHuUCM2LbUhvdENSskHQIYwajGxCJTJMrAiB%2BvRcsRtNpjCro%2FSpxkT54uAAXh5oYOiZpNE8s9VFi%2FSqIAwgnEAAaDDUyNDYyMTYzNTE3OSIMUiUYUmcWKM0hNdydKuUCmpuxajve%2BUTYWJNB%2FsC%2BNyYqtjHF72HePkqV7xttxJeaRmXncE2%2FOJcVDPfNyRzX7sqG405eAgpPbJUlyP6XPhEl%2B4cix6ErMCOlj%2Fk5oNRQMbzpZ9Ld2a8JerI%2BxxkWJPhqUMMjrkLjrzxIlE3ARBgnqbNH4xf5ZdhMy1RzqtF14EIQ5HtFRXYZnK88%2FXMAU5S5X06aIibOoQk2%2BLoQQ1b%2B%2FC8yIPzbJ8BdHc93PzzztXhxcBWJFq8st2aSxsHJzQcIRAEh10huaPJ%2BoXulzZ%2Fe0z%2BSx39sAzV9HY6X0G%2Be%2FUItXdX6u7qNa4YqNblDe5lqhpRUHoPxttclmavUYKoaeAO9QjNGOw8%2FVKrcxKU8MC0TrIraXJKV7qo%2FkP%2FS%2FdP9U1ACBfcTERy9Dx113pCQniZm6Tw85w0g3O4EojLiJ3%2B92huhMx2eNC%2BY3ZUtnNb0fhyAuroNQIvYtwUQpEqKRQDBMPrljsYGOoUCxND9KmjGFFII4APlr%2FlFUcGTfKclsY4gMp4KK1yxJJWS3ckXH6o8Qw2zocL5ZJlcb%2FxQw8rvwkn6Gxfv3FXXPjuSpv1jguIYzd1l%2BB%2FOOZs1iq9JNknCl2hWGeatA0YhjGru%2F2E7OsPMv8cZIHGwd6yzVgvXcnaEWm%2F%2FOV0PIcG8m1WpspVloS4y8cOuKvVeeuJ1oVjsMCdw66gyd5UiYgXTW9QSLhFC5itDkHKX1IJZ9QRiR1ushADf79wRBYa1f4KmfOJFqlNvNLctrl4LvXYeXnqBo0nrSHuygjgZUvncedxY6ZqBjxl24STfw6QZuPCthmP66k104UQsZpcQ9ac2abOv&X-Amz-Signature=2e355a7ecd3a2b8a282185837fb246c6957d938c80382f1d6889a59ad9bb5823&X-Amz-SignedHeaders=host&response-content-disposition=inline). This beta client requires manual installation from your local machine.

> **Note:** The Chrome Web Store version allows users to register CRM platforms by opening the extension from the CRM page. In this beta version, users select a CRM from a pre-configured list in the developer console.

To connect with the new client:

1. Open the extension from anywhere
2. Log in with your RingCentral account
3. You'll see a list of available connectors, including both public connectors and the private one you just created

### Setup Guide

The final step is configuring the CRM hostname in your connector profile.

There are 3 types of hostname configurations (using `mycrm.com` as an example):

- **Fixed**: For static URLs (e.g., `mycrm.com` for all requests)
- **Selectable**: For regional servers or predefined options (e.g., `mycrm.com/us`, `mycrm.com/au`)
- **Tenant-specific**: For user-provided URLs (e.g., `mySubDomain.mycrm.com`)

To improve the user experience, you can add setup instructions on the configuration page to guide end users through the process.

After you have made the changes to connector profile, save it and reload the extension, and you should be able to see the changes.

> **Note:** To clear current CRM info, you can either go to extension option or do it in extension UIs under user settings -> developer settings

## Test Your Setup

That's it! Congratulations on completing the migration. 

Give your connector a try and feel free to contact da.kong@ringcentral.com if you encounter any issues.