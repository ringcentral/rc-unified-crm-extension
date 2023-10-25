# Unified CRM extension for Google Chrome and Microsoft Edge

[![Build Status](https://github.com/ringcentral/rc-unified-crm-extension/workflows/CI%20Pipeline/badge.svg?branch=master)](https://github.com/ringcentral/rc-unified-crm-extension/actions)

RingCentral's Unified CRM extension for Google Chrome and Microsoft Edge is a browser plugin that helps connect your RingCentral account to a number of different CRM services. This browswer plugin, to the extent that each CRM allows, provides the following features:

* **Embedded CTI**. A fully functional phone is embedded into your CRM so that you can place and receive phone calls. The CTI is also enhanced with specific capabilities designed specifically for use cases common to users of most CRMs. These enhancements are enumerated below. 
* **Click-to-dial**. Make any phone number in your CRM clickable to easily call or send an SMS to that phone number. 
* **Call logging**. Every call you make or receive on RingCentral can easily be logged into your CRM ensuring important communications are recorded there. Options are available that allow you to log calls and messages automatically, and more. 
* **Call pop**. When you receive a phone call, the extension will automatically open the caller's contact page in your CRM so that you have the customer's full context before answering the phone.
* **Send/receive SMS**. Not only can you place calls, but you can also send and receive SMS using the CTI. 
* **SMS templates**. Respond to SMS more quickly, by storing and accessing messages you commonly send over SMS using a simple UI. 

### Prerequisites

The Unified CRM extension requires the following:

* Google Chrome or Microsoft Edge

### Supported CRMs

RingCentral currently supports the following CRMs using the Unified CRM extension:

* Bullhorn
* Clio
* Insightly
* Pipedrive
* Redtail CRM

Don't see your CRM listed above? Visit our [Ideas portal](https://ideas.ringcetral.com/) to tell us more about the CRM you would like us to integrate with. 

**Are you a developer? Build support for your own CRM**

The Unified CRM extension is built on top of an [open source framework](https://github.com/ringcentral/rc-unified-crm-extension), and can be used by third-party developers to create a custom CRM integration more easily than building one from scratch. Visit our github page to learn how to build and contribute support for additional CRMs. 

## Getting started

### Installing the browser plugin

**Google Chrome**

The Unified CRM extension was initially architected for Google Chrome, and is therefore installed easily from the [Google Chrome web store](https://chrome.google.com/webstore/detail/ringcentral-crm-extension/kkhkjhafgdlihndcbnebljipgkandkhh). 

**Microsoft Edge**

Microsoft Edge supports most Chrome extensions. To install them, however, you will need to [make configuration changes](https://support.microsoft.com/en-us/microsoft-edge/add-turn-off-or-remove-extensions-in-microsoft-edge-9c0ec68c-2fbc-2f2c-9ff0-bdc76f46b026) to Edge. In summary:

1. In Microsoft Edge, navigate to the Chrome Web Store. 
2. Select "Allow extensions from other stores" in the banner at the top of the page, then select "Allow" to confirm.
3. Navigate to the [Unified CRM extension](https://chrome.google.com/webstore/detail/ringcentral-crm-extension/kkhkjhafgdlihndcbnebljipgkandkhh) and select "Add to Chrome."
4. Follow any additional prompts to complete the installation process. 

### Managing software updates

Updates to the Unified CRM extension are installed automatically by Chrome and Edge when you restart your browser. You can see what version of the Unified CRM extension is currently installed by navigating to the "Manage extensions" area of your browser, finding the Unified CRM extension in your list of installed plugins, and clicking "Show details." On the resulting page you can see the currently installed version. 

To ensure you are actively running the most recent version, please restart your browser. 

### Connecting to your CRM

The process of connecting the Unified CRM extension to your CRM is more or less the same at a high-level. 

1. First, navigate to and login to your CRM. 
2. While viewing a page in your CRM, open up the CTI.
3. Open the "More" tab and select "Settings."
4. Scroll down to find your CRM, and click the "Connect" button. 
5. Follow the on-screen instructions for your CRM. 

Each CRM may have a slightly different approach in order to install the extension fully. Consult the CRM-specific documentation to setup and configure your CRM below.

#### Bullhorn

1. From the Settings screen in the Unified CRM extension's CTI, find the option labeled "bullhorn."
2. Click the "Connect" button. 
3. ??

#### Clio

1. From the Settings screen in the Unified CRM extension's CTI, find the option labeled "clio."
2. Click the "Connect" button. 
3. ??

#### Insightly

1. From the Settings screen in the Unified CRM extension's CTI, find the option labeled "insightly."
2. Click the "Connect" button. 
3. ??

#### Pipedrive

1. From the Settings screen in the Unified CRM extension's CTI, find the option labeled "pipedrive."
2. Click the "Connect" button. 
3. ??

#### Redtail

1. From the Settings screen in the Unified CRM extension's CTI, find the option labeled "redtail."
2. Click the "Connect" button. 
3. ??

## Configuration options

The Unified CRM extension provides numerous options so that end-users can customize their specific settings and experience. 

*Please note that currently all options are user-specific. We do not currently support account-wide configuration options.*

Below you will find information on the various ways in which the CRM extension can be configured and customized. You can access all of these options from the Settings page accessed from the More menu. 

### Setting your preferred phone device

RingCentral customers may sometimes have multiple devices or ways of initiating a phone call. To better control what device you use for placing calls, from the Settings screen select "Calling." Then, select the device you prefer to use. Options include the following:

* **Browser**. Select this if you wish to place calls using the CRM extension itself. 
* **RingCentral App**. If you prefer to use the main RingCentral desktop app to make calls, select this. 
* **RingCentral Phone**. This option is not recommended as RingCentral Phone is no longer supported. However, if you still have this app installed and if you prefer to use it, select this. 
* **RingOut**. RingOut is helpful if you prefer to make a call from your desk phone. When RingOut is selected you will be called, and your desk/hard phone will ring. Answer the phone and we will then connect you to the person you are calling. 

### Changing your region and default area code

To customize your default country and area code, from the Settings screen select "Region." Then enter your preferred defaults. 

### Customizing your preferred audio devices

To customize your preferred input and output devices, e.g. headphones, laptop speakers, etc, from the Settings screen select "Audio." Then select your preferred default devices. 

### Automatically prompt to capture call notes

Many end users would like confidence in knowing that every call they place or receive is logged properly in the CRM they are connected to. Furthermore, users also want to be prompted to capture notes about a call immediately upon a call ending. To automatically be prompted to enter and save notes relating to a call that has just ended, enable "Prompt to enter notes when calls end" from the Settings page. 

### Automatically prompt to capture SMS and text messaging notes

As with phone calls, many end users would like to reliably capture the SMS messages transmitted to contacts. To be prompted automatically to enter notes upon sending an SMS, enable "Prompt to enter notes after sending SMS" from the Settings page. 

### Automatically log calls and SMS messages

Sometimes users may not be present at their computer when a call is received, yet they still wish to record the call was received and possibly that the call was never responded to. To ensure all calls are captured whether you are present or not, enable "Auto-log save delay."

When this is enabled, the call will be logged automatically after a set number of seconds, which can be configured under "Advanced configuration options" below. If you have also configured the extention to prompt you to enter notes automatically, then you will observe that when a call ends the call log form appears, and a auto-save timer will start. If you do not interact with the form before the timer runs out, the call be logged automatically. 

### Advanced configuration options

Most users will not need to access these advanced configuration options. However, they have been provided to assist in resolving less common, low-level challenges. These options can be accessed both in Chrome and Edge by opening the "Manage Extensions" area from the Window menu, or from the extension menu found adjacent to your browser's location bar. 

* Open [Manage extensions](chrome://extensions/) in Chrome
* Open [Manage extensions](?) in Microsoft Edge

#### Click-to-dial inject delay

The embedded phone/dialer from the Unified CRM extension is injected into the CRM via a mechanism that some web servers will reject. This is circumvented by delaying the loading of the CTI by a couple of seconds. This config parameter controls this delay. 

*This should only be used in rare circumstances.*

CRMs known to need this parameter set are:
* 

#### Auto-log countdown timer

When auto-logging calls, the parameter controls how many seconds the CRM extension will wait before auto-saving the call to the CRM. If the call log form is interacted with prior to the countdown terminating, the countdown will stop. 

#### Render quick access button

The Unified CRM extension injects a small handle in the lower right hand corner of your CRM. Some users have expressed concern that this handle obscures the page content, and therefore wish to remove it. Toggle this parameter to turn off/on the dialer handle in the lower-righthand corner. 

*Disabling the quick access button does not impact the operability of the extension.*

#### Phone number formats

In order to match a call to a contact in a CRM, the Unified CRM extension needs to search the CRM for a contact using a phone number. Some CRMs have more rudimentary APIs that require phone numbers to EXACTLY match the string searched for. For these CRMs, reliably finding a contact record for a phone number can be difficult, which in turn impacts your ability to log a call and associate it with the proper entity in your CRM. Let's look at an example to help you understand. The following phone numbers are all functionally equivalent, even though they are not literally identical. 

* (###) ###-####
* ###.###.####
* ###-###-####
* +1-###-###-####
* etc

RingCentral phone numbers are all formatted using the [E.164 standard](https://en.wikipedia.org/wiki/E.164). If you are not storing phone numbers that utilize this format, and if your particular CRM does not support a more rigorous search mechanism, the Unified CRM extension may fail to associate calls with contacts properly. 

This configuration parameter allows you to specify multiple formats used by your team. The Unified CRM extension will then search for contacts using each of the formats provided until a record is found. This may have performance impacts.

CRMs known to exhibit this problem are:
* ??? 

## User guide

The following content is intended for the every-day user of the Unified CRM extension. It describes all of the major features provided by the extension, and how to address common needs users have.

### Accessing the extension to make calls

The Unified CRM extension makes available to users a fully-functional web phone for placing and receiving calls, as well as recording notes and call dispositions related to those calls -- not to mention numerous other features. The web phone can be accessed in one of two ways.

#### Click the quick access button

When logged into and viewing your CRM, a blue "R" handle/button will appear in the lower-righthand corner of your browser window. Hovering over it will show a dialer icon. Click the dialer icon to open the dialer window and bring it to the foreground. 

*Pro tip: if the blue handle obscures page content, or if you wish to hide it for other reasons, you may turn this off using an advanced configuration parameter.*

#### Click "RingCentral CRM Extension" from the extensions menu

You can open the Unified CRM extension dialer by finding the extension in your list of installed extensions and clicking "RingCentral CRM Extension."

*Pro tip: if you need to access the extension often, you can "pin" the extension to your location bar so that it is more readily available.*

### Logging phone calls

One of the central features of the Unified CRM extension is the ability to automatically log calls that are received or placed while the extension is active. All calls made or received can be logged manually. To manually log a call, open the "Call history" tab in the extesion, find the call you wish to log in the list, and click the call log icon. You will then be prompted to enter call notes for the call. Clicking "save" will result in the call be logged, associated with the proper contact, and any notes you entered being saved with the associated activity.

If you wish to edit a call you have previously logged, you will need to do so from within your CRM directly. Once a call has been logged using the extension, it cannot be edited by the extension.

#### Automatically logging calls

The Unified CRM extension can be configured to log calls automatically so that you do not need to remember to do so manually. To log calls automatically, there are two configuration parameters that are relevant to you. Both of these parameters can be found under Settings accessed from the More tab.

* **Auto pop up call logging page after call**. This determines if you will be prompted to enter notes or not. 
* **Auto log with countdown**. This determines how long the extension will wait for you to begin entering notes before logging the call automatically. 

**Creating contact records prior to logging calls**

Calls can currently only logged if a contact record in the CRM can be found with the associated phone number. If you find that you cannot log a call we recommend you do the following:

* Log into your CRM
* Create a contact record
* Associate with that contact the phone number as it appears in your RingCentral call history. This is typically in the following format: `+1 (###) ###-####`.

**How do you know if a contact record has been found?**

You will know if a contact record has been found if you see a contact's name in the call history tab of the Unified CRM extension. If you see a phone number only, chances are a contact record could not be found. 

*Remember: you can only log calls if a contact record for that phone call can be found.*

**Limitations**

Users should be aware, that calls received while the browser is closed, or while the extension is not actively running will NOT be logged. 

### Setting your presence/status
### Placing and receiving calls
### Click-to-dial
### Call-pop
### Logging past calls
### Sending SMS
### SMS templates

## Troubleshooting and FAQ

### Unable to find contact
### Submitting feedback
### Common remedies
#### Restarting Chrome
#### Uninstalling, reinstalling extension
### Can't find contact
