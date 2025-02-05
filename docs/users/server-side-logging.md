# Server-side call logging

!!! warning "Server-side call logging is currently in beta"
    This feature is currently in beta and may exhibit some issues. We encourage users to try the feature out in order to help us refine the feature. Known issues and limitations:
    
	* Can only be enabled for entire organization (no partial enablement)
	* Limited UI for determining which phone number(s) to block from logging
	* May briefly result in double-logging when initially turned on
	
!!! info "Server-side call logging may become a premium feature"
    The costs associated with operating a server-side call logging service may require us to charge for this feature in the future. 
	
Right out of the box App Connect allows users to log calls from the App Connect client (Chrome extension). App Connect can even be configured to [log calls automatically](logging.md#automatically-logging-calls). However, when logging is done exclusively from the client, it may present some trade-offs or risks. This includes the following:

* Not all calls will be logging in real-time. 
* Only calls for users who have installed App Connect can be logged.

Server-side call logging addresses these issues because it is a service that operates across all users within your entire organization, even if they do not have App Connect installed. It also logs calls as soon as the call is completed, ensuring with greater reliability that all calls will be logged in a timely manner. 

## Enabling server-side call logging

Currently the server-side call logging feature is in beta, and can be enabled from the Admin settings screen as shown below. 

![Server-side call logging setup](../img/sscl-setup.png)

Click "Server side logging" to enable the feature.

## Configuring server-side call logging

From the Server side logging page, an admin can enable call logging for their entire organization. Once enabled, automatic logging from the client will be disabled across your entire organization. Users will still be able to log calls manually, or edit call log entries made by the server-side call logging service. 

![Server-side call logging setup](../img/sscl-config.png)

### Blocking some phones from being logged

From the "Server-side call logging" page, you can specify a list of phone numbers and/or extensions for which you do not wish to log calls. Phone numbers must be represented usig the E.164 format, e.g. `+15105551234`. Multiple phone numbers and extension numbers can be specified provided they are separated by a `,` comma. 

!!! info "Special considerations when using server-side call logging"
    * Calls to the main company number that are dropped before being redirected to an extension will not be logged.
    * When a call is made to the main company number and redirected to a user, the call duration recorded may appear longer than the actual time spent by the user. This is because the recorded duration includes the time taken for the call to be redirected.
    * Logs created through server-side logging use admin credentials, so extension users may not be able to edit them. Normal users require the appropriate CRM permissions to update log data.

