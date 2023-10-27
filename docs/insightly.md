# Setting up the Unified CRM extension for Insightly

Growing businesses across the globe rely on Insightly to help them build lasting customer relationships. Insightly delivers a platform that can take businesses to the next level: a powerful CRM, plus marketing automation, a customer service app, and an integration tool.

RingCentral's integration with Insightly helps streamline communications between customers, and helps sales staff to better support them through their entire lifecycle by helping to manage and store communication history with customers, capture important communication metadata and more.

## Install the extension

If you have not already done so, begin by [installing the Unified CRM extension](../getting-started/) from the Chrome web store. 

## Setup the extension

Once the extension has been installed, follow these steps to setup and configure the extension for Insightly. 

1. [Login to Insightly](https://login.insightly.com/User/Login).

2. While visiting an Insightly application page, click the quick access button to bring the dialer to the foreground. 

3. Navigate to the Settings screen in the Unified CRM extension's CTI, and find the option labeled "insightly."

    ![Connect to Clio](img/insightly-connect.png){ style="max-width: 200px" }

4. Click the "Authorize" button. 

5. A window will be opened prompting you to enter your Insightly username and password. Login to Insightly. 

When you login successfully, the Chrome extension will automatically update to show you are connected to Insightly. If you are connected, the button next to Insightly will say, "unauthorize."

And with that, you will be connected to Insightly and ready to begin using the integration. 

## Tailoring your configuration

Insightly's contact lookup method is very strict. As a result, if the phone numbers in Insightly are not stored using the E.164 standard, e.g. `+1##########`, then the CRM extension will fail to find the contact record for call logging and call pop. 

To address this, short of reformatting every phone number stored in Insightly, is to go our [advanced settings](../configuration/#advanced-configuration-options) and setting the phone number formats to conform with the conventions used by your company. 

Making this change will improve your experience with the extension considerably. 