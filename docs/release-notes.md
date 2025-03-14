# Release notes

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
