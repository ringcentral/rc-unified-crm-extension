# Setting up the Unified CRM extension for Insightly

Growing businesses across the globe rely on Insightly to help them build lasting customer relationships. Insightly delivers a platform that can take businesses to the next level: a powerful CRM, plus marketing automation, a customer service app, and an integration tool.

RingCentral's integration with Insightly helps streamline communications between customers, and helps sales staff to better support them through their entire lifecycle by helping to manage and store communication history with customers, capture important communication metadata and more.

## Install the extension

If you have not already done so, begin by [installing the Unified CRM extension](../getting-started.md) from the Chrome web store. 

<iframe width="825" height="464" src="https://www.youtube.com/embed/5hWvVI12UAc?si=IX1PjO__Njki_60i" title="Unified CRM extension for Insightly - quick start" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>

## Setup the extension

Once the extension has been installed, follow these steps to setup and configure the extension for Insightly. 

1. [Login to Insightly](https://login.insightly.com/User/Login).

2. While visiting an Insightly application page, click the quick access button to bring the dialer to the foreground. 

3. Navigate to the Settings screen in the Unified CRM extension's CTI, and find the option labeled "insightly."

    ![Connect to Insightly](../img/insightly-connect.png){ style="max-width: 200px" }

4. Click the "Connect" button. 

5. A window will be opened prompting you to enter numerous attributes from Insightly, including:
    * API key
    * API URL

    ![Connect to Insightly](../img/insightly-setup.png){ style="max-width: 200px" }


6. Click the "Get Key" button and the extension will attempt to retrieve these values for you. You may also enter these values manually. In Insightly, navigate to User Settings from the pull down menu in the upper-righthand corner. Scroll down until you see a section labeled "API." Copy and paste your API key and API URL into the corresponding fields. 

    ![Insightly API credentials](../img/insightly-apicreds.png){ style="max-width: 600px" }

When you login successfully, the Chrome extension will automatically update to show you are connected to Insightly. If you are connected, the button next to Insightly will say, "logout".

And with that, you will be connected to Insightly and ready to begin using the integration. 

## Tailoring your configuration

Insightly's contact lookup method is very strict. As a result, if the phone numbers in Insightly are not stored using the E.164 standard, e.g. `+1##########`, then the CRM extension will fail to find the contact record for call logging and call pop. 

To address this, short of reformatting every phone number stored in Insightly, is to go our [Phone number format setting](../users/settings.md#phone-number-formats) under `Contact setting` and setting the phone number formats to conform with the conventions used by your company. 

Making this change will improve your experience with the extension considerably. 
