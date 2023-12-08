# Setting up the Unified CRM extension for Clio

Clio provides legal client relationship management software to help law firms manage business development functions such as client intake, client scheduling and follow-up, revenue tracking, and more. In short, Clio addresses the client intake process of turning potential new clients into retained clients.

RingCentral's integration with Clio helps streamline communications with clients, and helps staff servicing clients to better support them through the entire intake process by helping to manage and store communication history with clients, report on billable time and more.

## Install the extension

If you have not already done so, begin by [installing the Unified CRM extension](./getting-started.md) from the Chrome web store. 

<iframe width="825" height="464" src="https://www.youtube.com/embed/pQgdsAR1UCI?si=PaSTDhHkTUa9fMtk" title="Unified CRM extension for Clio - quick start" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>

## Setup the extension

Once the extension has been installed, follow these steps to setup and configure the extension for Clio. 

1. [Login to Clio](https://account.clio.com/).

2. While visiting a Clio application page, click the quick access button to bring the dialer to the foreground. 

3. Navigate to the Settings screen in the Unified CRM extension's CTI, and find the option labeled "clio."

    ![Connect to Clio](img/clio-connect.png){ style="max-width: 200px" }

4. Click the "Authorize" button. 

5. A window will be opened prompting you to enter your Bullhorn username and password. Login to Bullhorn. 

When you login successfully, the Chrome extension will automatically update to show you are connected to Clio. If you are connected, the button next to Clio will say, "unauthorize."

And with that, you will be connected to Clio and ready to begin using the integration. 

## Tailoring your configuration

Clio's contact lookup method is very strict. As a result, if the phone numbers in Clio are not stored using the E.164 standard, e.g. `+1##########`, then the CRM extension will fail to find the contact record for call logging and call pop. 

To address this, short of reformatting every phone number stored in Clio, is to go our [advanced settings](./configuration.md#advanced-configuration-options) and setting the phone number formats to conform with the conventions used by your company. 

Making this change will improve your experience with the extension considerably. 
