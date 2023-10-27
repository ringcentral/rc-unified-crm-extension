# User guide

The following content is intended for the every-day user of the Unified CRM extension. It describes all of the major features provided by the extension, and how to address common needs users have.

## Accessing the extension to make calls

The Unified CRM extension makes available to users a fully-functional web phone for placing and receiving calls, as well as recording notes and call dispositions related to those calls -- not to mention numerous other features. The web phone can be accessed in one of two ways.

### Click the quick access button

When logged into and viewing your CRM, a blue "R" handle/button will appear in the lower-righthand corner of your browser window. Hovering over it will show a dialer icon. Click the dialer icon to open the dialer window and bring it to the foreground. 

*Pro tip: if the blue handle obscures page content, or if you wish to hide it for other reasons, you may turn this off using an advanced configuration parameter.*

### Click "RingCentral CRM Extension" from the extensions menu

You can open the Unified CRM extension dialer by finding the extension in your list of installed extensions and clicking "RingCentral CRM Extension."

*Pro tip: if you need to access the extension often, you can "pin" the extension to your location bar so that it is more readily available.*

## Logging phone calls

One of the central features of the Unified CRM extension is the ability to automatically log calls that are received or placed while the extension is active. All calls made or received can be logged manually. To manually log a call, open the "Call history" tab in the extesion, find the call you wish to log in the list, and click the call log icon. You will then be prompted to enter call notes for the call. Clicking "save" will result in the call be logged, associated with the proper contact, and any notes you entered being saved with the associated activity.

If you wish to edit a call you have previously logged, you will need to do so from within your CRM directly. Once a call has been logged using the extension, it cannot be edited by the extension.

### Automatically logging calls

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

## Setting your presence/status

Using the embedded phone provided by the Unified CRM extension one can easily set their presence and/or status and instantly have that synced across the network. Similarly, your presence status will always be reflected in your embedded dialer as it changes via mechanisms outside of the extension. 

There are two ways to change your status:

* Click the presence indicator in the upper-lefthand corner of the embedded dialer
* Navigate to the Settings page under the more menu and modify it from there

## Placing and receiving calls

It is hard to believe this needs to be documented at all. As soon as you login to your RingCentral account via the extension when it is first loaded and initialized, you will be able to make and receive calls. 

When you receive a call, you will hear a ringing sound. Bring the extension to the foreground and click "Answer" to begin the call.

To place a call, bring the extension to the foreground, open up the dialer, and dial the phone number. It is as simple as that. 

## Click-to-dial

When using your CRM, all phone numbers in your CRM will become clickable, allowing you to easily initiate a call with that phone number, or send an SMS message to that phone number. This helps users more quickly and easily engage with contacts, leads, candidates and people whom your CRM tracks. 

### Call-pop

If this feature is enabled, when you receive a phone call the Unified CRM extension will open a browser tab to the contact record of the person calling you. That way when you answer the call, you will have all pertinent information about them at your fingertips, helping you to create a personalized experience for your customer. 

*Pro tip: call-pop functionality can easily be disabled via Settings accessed via the More menu.* 

## Logging past calls

The Unified CRM extension has the ability to automatically log calls in your connected CRM (see "Automatically logging calls" above). However, for calls to be logged automatically, the extension must be actively running. So if you receive a call overnight for example, the next morning when you login, you can navigate to the Call History tab, see the calls you missed, and click the call log icon to record notes or call disposition for that particular call. 

What you are prompted to log will vary depending upon the CRM you are connected to, as we tailor the logging behavior to best fit with the conventions of the corresponding CRM. 

## Sending SMS

The Unified CRM extension also has the ability to send and receive SMS messages. You can access this functionality from the Messages tab and works more or less like your phone. Click on the conversation you want to view, and then send messages to that individual or group. 

### SMS templates

Engaging with communications from customers can be overwhelming, and responding to the same questions individually can be taxing. SMS templates allow you to compose responses to common inquiries ahead of time. Then when it comes time to author a message, rather than composing your response manually, select from one of your pre-written responses, populate the message into the messaging box, make any small edits you need, and then click send. 

<figure markdown>
  ![Google Chrome Web store](img/sms-templates.png)
  <figcaption>Use SMS templates to quickly compose responses to common inquiries</figcaption>
</figure>

**Importing and exporting SMS templates**

Right now, all pre-written SMS messages are stored locally in your browser. But one can share their responses with their colleagues by exporting their templates to a file which is downloaded automatically, and then having their coworkers import that file into their instance of the Unified CRM extension. 

<figure markdown>
  ![Google Chrome Web store](img/sms-import.png)
  <figcaption>Share templates with coworkers by importing and exporting templates you have created</figcaption>
</figure>

*Warning: when importing templates all previous templates will be erased. So if you have made changes, be sure to export them or save them somewhere so that those changes can be preserved.*

**Limitations**

* SMS templates are stored locally in your browser, and are not shared with others in your organization or account. 

