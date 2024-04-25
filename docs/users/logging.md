# Logging phone calls in the CRM

One of the central features of the Unified CRM extension is the ability to automatically log calls that are received or placed while the extension is active. All calls made or received can be logged manually. To manually log a call, open the "Call history" tab in the extesion, find the call you wish to log in the list, and click the call log icon. You will then be prompted to enter call notes for the call. Clicking "save" will result in the call be logged, associated with the proper contact, and any notes you entered being saved with the associated activity.

<figure markdown>
  ![Logging calls](../img/log-calls.png)
  <figcaption>The Unified CRM extension quick access button</figcaption>
</figure>

If you wish to edit a call you have previously logged, you will need to do so from within your CRM directly. Once a call has been logged using the extension, it cannot be edited by the extension.

## Logging calls when no contact is found

In order for a call to be logged properly, a contact record within the connected CRM must exist and be associated with the phone call. Calls are matched to a contact via the phone number associated with the call.

When no contact can be found associated with a given phone number, the Unified CRM extension makes it easy to create a placeholder contact associated with the corresponding phone number. To create a placeholder contact, provide the name of the contact and the extension will do the rest. 

<figure markdown>
  ![Logging calls](../img/no-contacts.png)
  <figcaption>Creating a placeholder contact in the connected CRM</figcaption>
</figure>

It is the intention for someone to edit the placeholder contact after the call has been logged, to make sure all the correct and appropriate information about the contact has been captured. 

!!! tip "What if no contact was found, when a contact is known to exist?"
    Sometimes a contact is not found, even though one knows for a fact that the contact exists. This happens with some CRMs whose search mechanisms are overly strict. You can address this through [advanced settings](settings.md#phone-number-formats).
	
## Logging calls when multiple possible contacts found

When logging calls, a call must be associated with one and only contact record. But what happens if more than one contact in the CRM shares the same phone number? This is common when communicating with multiple employees from the same company, as it is not uncommon for the incoming phone number of two employees in the same building to present incoming phone numbers of their company's main company number. 

When multiple contacts are found, users are given an opportunity to disambiguate and select the correct contact record. This is done via a pull-down menu on the call logging screen. 

<figure markdown>
  ![Logging calls](../img/multi-contacts.png)
  <figcaption>Disambiguating between contacts when multiple matches are found in the connected CRM</figcaption>
</figure>

## Automatically logging calls

The Unified CRM extension can be configured to log calls automatically so that you do not need to remember to do so manually. To log calls automatically, there are two configuration parameters that are relevant to you. Both of these parameters can be found under Settings accessed from the More tab.

* **Auto pop up call logging page after call**. This determines if you will be prompted to enter notes or not. 
* **Auto log with countdown**. This determines how long the extension will wait for you to begin entering notes before logging the call automatically. 

*Remember: calls from unknown contact won't trigger auto pop up nor auto log. For those calls, users can only manually log them along with the action to create new contacts for them.*

**How do you know if a contact record has been found?**

You will know if a contact record has been found if you see a contact's name in the call history tab of the Unified CRM extension. If you see a phone number only, chances are a contact record could not be found. 

*Pro tip: you can still log the call as long as you fill in a contact name in the call log form for the extension to create a placeholder contact and then log the call against it*

**Limitations**

Users should be aware, that calls received while the browser is closed, or while the extension is not actively running will NOT be logged. 

## Logging past calls

The Unified CRM extension has the ability to automatically log calls in your connected CRM (see "Automatically logging calls" above). However, for calls to be logged automatically, the extension must be actively running. So if you receive a call overnight for example, the next morning when you login, you can navigate to the Call History tab, see the calls you missed, and click the call log icon to record notes or call disposition for that particular call. 

What you are prompted to log will vary depending upon the CRM you are connected to, as we tailor the logging behavior to best fit with the conventions of the corresponding CRM. 

