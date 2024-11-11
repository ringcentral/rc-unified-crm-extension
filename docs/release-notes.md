# Release notes

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
