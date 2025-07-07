# Release notes

## 1.5.6:

- New: Users can now log messages in Google Sheets. A new sheet titled "Message Logs" will be created for that.
- New: Ringtone can now be set up in Audio settings
- Better: Improve user settings presentation
- Fix: Bullhorn retroactive call log mistakenly putting 'pending note...' in Note Action
- Fix: AI notes are now attached when doing retroactive call logging
- Better: Message logs within the CRM are now consistently displayed in chronological order
- Better: Added functionality to log Sales Orders and Opportunities in NetSuite with individual contacts in addition to customers.

## 1.5.5:

- New: Add Freskdesk and Gohighlevel 
- New: Insightly has new setting in Insightly options to input custom phone field names
- Better: Google Sheets users will get notified with clearer information to set up the sheet
- Better: Click-to-dial enablement is now controled by user settings with 4 modes. (previous whitelist is deprecated)
- Fix: Google Sheets issue on undefined values in fields
- Fix: A bug on GoogleSheet getting call log if no note provide while editing call log

## 1.5.4

- New: Clio now supports EU and CA
- New: Notification-level setting to control what types of notification would be shown
- Better: DisableRetroCallLogging in user setting is changed to EnableRetroCallLogging
- Better: Clio view log will go to contact communication tab
- Better: Contacts are shown with source icon
- Better: When Netsuite users log calls against contacts that have no company, a placeholder company will be assigned so to be able to associate the log with the contact
- Fix: An issue when opening contact page
- Fix: An issue when getting user settings

## 1.5.3

- New: Quick access button and click-to-dial can be configured to be shown on other pages rather than CRM page. Set it up in user settings -> general -> allowed pages
- Better: Bullhorn Server-side call logging will use admin's role and try to find user role to assign Note to if user's Bullhorn name matches with user's RingCentral profile name 
- Better: Clio and Insightly users can use # or * in alternative number formats
- Better: Bullhorn authorization is more stable now
- Better: NetSuite improved error message when attempting to log calls for contacts without an associated company. A clearer guidance is now provided when a contact is not linked to a company
- Fix: Bullhorn issue when creating a new Contact/Candidate/Lead

## 1.5.2

- New: Contact search in call/message log page to add contact searched by name
- New: Pipedrive now supports Lead (need to log out and log back in to activate)
- New: Bullhorn users can now create Contact/Candidate/Lead with Status field
- New: Include tab visibility control in Admin settings
- New: NetSuite now supports selecting Opportunity in call/message log page
- Better: Bullhorn server-side logging will now try to create Note from admin role and assign to users (require users to connect to Bullhorn first)
- Better: If Bullhorn session becomes invalid, the extension will try to re-connect automatically
- Fix: Netsuite now truncates AI transcript if it's over 4000 words

## 1.5.1

- New: Redtail now supports categories for notes. Default value can be set up in user/admin settings
- New: Clio now supports Australia region
- New: Call session id can now be included in call log notes. This can be turned ON in user settings
- Fix: Developer mode can be turned ON before connecting to CRM
- Fix: User setting now shows correct connect status right after open
- Fix: Bullhorn. If Note Action is empty, it'll now show 'pending note'
- Fix: Clio now won't show duplicated contacts
- Fix: User settings are not applied immediately after connecting to CRM
- Fix: Bullhorn now won't show converted Leads
- Fix: Call queue calls cannot be logged in a few cases

## 1.5.0

- New: Fax log support
- New: If user is admin, '(Admin)' will be shown after user name on user setting page
- New: Clio now supports upload fax document files
- Fix: Redtail AI transcript setting turned OFF but still logging transcript
- Fix: Netsuite log failure when local computer time is ahead
- Fix: Pipedrive SMS logging not associated with deal


## 1.4.2

- Fix: Show "Cannot find call log" and "Cannot find contact" even when contact is known
- Fix: Contact call-pop for known contact

## 1.4.1

- New: Netsuite now supports contact match customization
- New: Server-side call logging support using user credentials if possbile
- New: Server-side call logging new selection for logging by Agent/user (if possible) OR Admin
- Change: "Tabs" setting is renamed as "Customize tabs" and is moved under "General" setting
- Change: Netsuite, Clio and Insightly -> Number formats are moved to options setting
- Change: Relocate active call auto logging to call log event
- Change: Google Sheet file picker now has more polished UI
- Fix: Call queue not answered cannot be logged
- Fix: Authorization error and Note Action missing. If user does not have EDIT permission, instead of creating Note then update Note Action, one-time logging setting should be turned ON

## 1.4.0

- New: One-time log in user setting to reduce Rate Limit issue and make logging more stable
- New: Server side call logging for all platforms
- New: Hide or show tabs in user settings
- New: Call queue presence setting
- New: Display voicemail transcript
- New: Google Sheets is now supported
- Better: Auto-logging happens right after call is connected (unless one-time log is ON)
- Better: Bullhorn authorization management
- Better: Multiple matched contact handling
- Fix: Clio should not return closed matters
- New: Matter description for Clio

## 1.3.10

- Fix: New users cannot save auto log setting
- Fix: Randomly dial previous number

## 1.3.9

- New: User settings for ai related features (applicable accounts only)
- Better: Token refresh lock to reduce issues of invalid authorization
- Fix: Clio not able to log message issue
- Fix: Bullhorn log page bug of not having NoteAction field in a few cases
- Fix: Agent note title inserted in log description when there's no note
- Fix: Fix spamming of contact not found warning notification
- Fix: Fix contact match issue on multiple contact case
- Better: Clearer sign on case where auto call log setting disabled by Server Side Call Logging
- Better: User settings are kept after logout and auto-loaded after re-connect
- Better: Redtail timezone in user setting

## 1.3.8

- Fix: Contact match timeout issue
- Fix: Auto log in user setting isn't set unless reloaded
- Bullhorn: User authorization validation issue
- Bullhorn: Server side logging now has AI summary and transcript

## 1.3.7

- Fix: Timeout issue (mostly affecting call logging)
- Fix: Admin users now get admin setting right after login
- New: A new setting to turn ON/OFF retroactive call logging

## 1.3.6

- Fix: Retro call logging now has recording link if applicable, instead of showing "(pending...)"
- Better: User settings are synced more frequently and stably
- Better: Some settings now have additional explanations of how it works
- Change: "Call log details" setting is now under "Call and SMS logging" 
- New: Server side logging (BETA) has a trial mode now which only works for admin user's extension only instead of across the whole account
- Clio: "Time entry" is now always TRUE, only "non-billable" is tickable
- Redtail: You can now define your timezone offset value in authorization page. Re-auth if you already logged in
- Bullhorn: Authorization checker is updated to be more reliable and check if user's current session is valid
- Bullhorn: Appointment draft page now won't attach unintended logo
- NetSuite: Fix empty note won't create sales order issue

## 1.3.5

- Upgrade: Error messages are more accurate
- Clio: Support user setting customization with logging time entry and non-billable default values

## 1.3.4

- Upgrade: More accurate call info, including better tracking on call recording link save status
- New: Call info details can be selectively logged based on new toggles in user settings
- New: (RingCentral AI license only) Smart Notes to be enabled in user advanced settings
- Bullhorn(Beta): Server side logging (not to be used with client side auto logging)
- Bullhorn: Heartbeat mechanism for auth check. It reminds you if auth becomes invalid
- Bullhron: Lead support
- Fix: Admin users can see admin tab on first login now

## 1.3.3

- Update: This extension's name is now changed to RingCentral App Connect
- Fix: (for Clio and Insightly user only) Overriding phone number format missing issue
- Fix: Admin icon in dark theme
- Fix: Auto pop up log page after call setting not working
- Fix: Inbound call contact pop not working

## 1.3.2

- New: User setting inside call pop to control behavior of multiple matched contacts (disabled, all open, prompt to select)
- Fix: SMS logging issue
- Fix: Auto open extension now only opens when main page is opened

## 1.3.1

- New: (Only for admin users) Admin tools. Admins have an extra tab in the extension to control end users' settings
- Fix: SMS logging date format 

## 1.2.0

- Fix: SMS log issue
- Fix: Missing recording link when doing retroactive auto call logging
- Bullhorn: New user setting to allow custom action note

## 1.1.4

- Bullhorn: Fix default SMS note action issue
- Bullhorn: Fix message log timezone issue

## 1.1.3

- Fix: Auto log association
- New: User setting in advanced features to turn on "Auto open extension" to open itself when opening a CRM page
- Redtail: Fix domain matching

## 1.1.2

- Change: Auto pop up log page is not dependent on auto log setting anymore

## 1.1.1

- Fix: Call/SMS logging issue

## 1.1.0

- New: Show error page when CRM initialization fails
- Better: Use local cached contact info to avoid rate limit issue
- Better: Auto call log now supports retrospectively logging up to 100 unlogged records upon extension open
- Bullhorn: Default note action matching ignores case and spaces
- Bullhorn: Fix issue on user id confusion

## 1.0.10

- Change: Unreolved tab is removed now. To check out unlogged calls, there's now a filter on call history page
- Change: Updated notification UI.
- Fix: Numbers can now be copied from call page and call history page
- Fix: Click-to-dial now supports detecting phone numbers in input fields
- Fix: Click-to-dial now supports detecting extension numbers with format as eg. +13334445555#134

## 1.0.9

- New: Call history page now has a search bar with filters
- New: Contact pop settings now support both inbound and outbound calls on different timings
- New: RingCentral team message is added as a new tab

## 1.0.8

- New: More historical call records can be viewed from call history page with 'Load more' button

## 1.0.7

- Fix: Incoming call pop contact page fixed

## 1.0.6

- Better: User settings are organized in a better way 
- New: Support page is added to user settings
- New: Community forum is created, can be accessed via support page -> 'Get support'
- Clio&Insightly: Number formatters are in user setting contact page now

## 1.0.5

- Better: Bullhorn now has Voicemail default note action
- Fix: SMS template remembers orders after close

## 1.0.4

- New: An About page in user settings to show info and helper links
- Better: Factor reset now also cleans up unresolved conflicts
- Better: SMS template supports drag and drop to arrange item orders

## 1.0.3

- Better: Use SMS template that syncs with RingCentral App's SMS template
- New: Show notification when a call recording link is uploaded. Typically, a call recording link won't be immediately ready upon hang up. If call is logged right after, call recording will be uploaded when it's ready

## 1.0.2

- Fix: SMS template cannot apply issue
- New: Factor reset button in user settings

## 1.0.1

- Fix: RingCentral sign in issue where pop up sign in window is stuck at loading screen
- Better: Auto log conflict messages now contain more meaningful info

**Bullhorn**

- Better: Default Note Action is now moved to User Settings where you can setup default actions. Can also work for auto log.

## 1.0.0

- New: Auto log with conflict resolver
- New: Manual refersh contact info with button
- New: Audio volume controls
- Better: SMS messages are now logged as in conversations per day
- Better: New UIs
- Fix: Fax view and logging
- Fix: Open contact page from call history now only opens selected one if there are multiple matched contacts
- Fix: Copy meeting info
- Remove: Auto log with countdown

New features video demo:

<iframe width="825" height="464" src="https://www.youtube.com/embed/x1GDk0ncm9A" title="App Connect 1.0.0 updates" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>

## 0.8.7

- Fix: Call disposition not cleared if opening under a contact without disposition options

## 0.8.6

- Fix: Incoming call contact pop up called twice issue
- Fix: Log event mixed up issue

## 0.8.5

- Fix: Bullhorn and Redtail SMS message log issue

## 0.8.4

- Fix: Pipedrive deal mismatch issue

## 0.8.3

- Change: Updated logo icon
- Fix: SMS log issue in multiple contacts matched case
- Fix: In-call note button will disappear if user opens message conversation so to not cover SMS send button
- Bullhorn: Clear user session info when log out

## 0.8.2

- Fix: Message conversation log page open issue
- Feature: Clicking log button for a logged call will open corresponding contact/log page

## 0.8.1

- Fix: Sign up button now opens RingCentral plan page

## 0.8.0

- Feature: Now support logging calls for unknown contacts. Users will see extra fields on call log page to fill in placeholder contact info and click "Save" button to create a new placeholder contact and then log the call against it
- Feature: Now support multiple matched contacts in call logging. Users can select target contact if it's a multiple match case
- New setting - "Open contact web page after creating it": Auto open placeholder contact page so that users can do further editing more easily
- UI: Polished the looking of some UIs
