# Appointments

<!-- md:version 2.0 -->

The Appointments feature brings your CRM calendar directly into App Connect, giving you a unified view of scheduled meetings and events alongside your communications. You can create, view, update, confirm, and cancel appointments without ever leaving the App Connect interface.

## What are Appointments?

Appointments in App Connect are synchronized representations of calendar events stored in your connected CRM. They allow you to:

- **View upcoming meetings** — see all scheduled events for a contact in one place
- **Create new appointments** — schedule meetings and have them written back into your CRM calendar
- **Update existing appointments** — change the time, duration, title, attendees, or description
- **Confirm or cancel appointments** — change the status of an appointment directly from the dialer
- **Sync attendees** — associate contacts from your CRM as attendees on an appointment

## Supported CRMs

Appointments are currently available for the following CRM integrations:

| CRM | List | Create | Update | Confirm | Cancel |
|-----|------|--------|--------|---------|--------|
| **Bullhorn** | :white_check_mark: | :white_check_mark: | :white_check_mark: | | :white_check_mark:|
| **Clio** | :white_check_mark: | :white_check_mark: | :white_check_mark: | | :white_check_mark: |
| **NetSuite** | :white_check_mark: | :white_check_mark: | :white_check_mark: | :white_check_mark: | :white_check_mark: |

## How to enable Appointments

The Appointments tab is **hidden by default**. You must manually enable it from the tab customization settings. Once enabled, an **Event** tab appears in the App Connect navigation bar, giving you direct access to your appointments.

!!! info "App Connect 2.0 required"
    Appointments is a feature of App Connect 2.0. Make sure you are running the latest version of App Connect before expecting this feature to be available.

### Steps to show the Appointment tab

1. Open App Connect and navigate to **Settings**
2. Go to **General** → **Appearance** → **Customize tabs**
3. Toggle **Show Appointment tab** to the **on** position
4. Click **Save**

## CRM-specific setup and behavior

### Bullhorn

Appointments in Bullhorn are stored as native **Appointment** records in the Bullhorn staffing platform and can be associated with Candidates, Client Contacts, or Leads.

**What is synced:**

- App Connect fetches appointments within a rolling window: from **1 month in the past** to **3 months in the future**
- Each appointment can be associated with a single primary contact (Candidate, ClientContact, or Lead)

**Notes for Bullhorn administrators:**

- The Bullhorn user account used to authenticate with App Connect must have permission to read and write `Appointment` and `AppointmentAttendee` records in Bullhorn
- Bullhorn does not currently support a native "confirmed" status via App Connect; use the Bullhorn web application if confirmation workflows are required

---

### Clio

Appointments in Clio are mapped to **Calendar Entries** in the Clio API. App Connect uses Clio's calendar system to store and retrieve appointments, writing additional metadata back as external properties on each calendar entry.

**What is synced:**

- Calendar entries are fetched from the user's primary writable calendar in Clio
- Attendees correspond to Clio contacts associated with the calendar entry

**Notes for Clio administrators:**

- The Clio user must have calendar access and permission to read and write calendar entries
- App Connect writes Events to the first writable calendar found for the authenticated user. Ensure users have at least one non-read-only calendar configured in Clio

---

### NetSuite

Events in NetSuite are stored as **Calendar Events** using NetSuite's REST Record API. NetSuite provides the richest appointment lifecycle support, including native confirm and cancel status transitions.

**What is synced:**

- Calendar events are fetched using a custom RESTlet bundled with the [RingCentral SuiteApp](https://www.suiteapp.com/RingCentral-Unified-CRM-Extension)
- Attendees are stored as `attendee` sub-records on the calendar event record
- Appointment times are converted to and from the user's configured **timezone offset** in NetSuite to ensure accurate scheduling
- Confirming an appointment sets the NetSuite status to `CONFIRMED`
- Cancelling an appointment sets the NetSuite status to `CANCELLED`

**Prerequisites for NetSuite:**

- The [RingCentral SuiteApp](../crm/netsuite.md) must be installed in your NetSuite account
- The user's NetSuite role must have **REST Web Services** enabled and read/write permission to Calendar Event records
- See the [NetSuite setup guide](../crm/netsuite.md) for full role and permission requirements

## Using Appointments in App Connect

### Viewing appointments

Once the Event tab is enabled, click **Event** in the App Connect navigation bar (or find it under the **More** menu) to open your appointments view. The tab displays appointments fetched from your connected CRM and lets you browse, create, and manage them without leaving App Connect.

### Creating an appointment

1. Navigate to Event or Appointment tab in App Connect
2. Click **New Appointment** or Plus button
3. Fill in the title, start time, duration, and any additional details
4. Select attendees from your CRM contacts
5. Click **Save** — the appointment is created in your CRM and appears immediately

### Updating an appointment

Open an existing appointment from the contact's activity timeline and click **Edit**. You can modify the:

- Title and description
- Start time and duration
- Attendee list

Changes are saved back to your CRM in real time.

### Confirming an appointment (NetSuite only)

From an appointment detail view, click **Confirm** to mark the appointment as confirmed. This updates the status on the corresponding NetSuite Calendar Event record to `CONFIRMED`.

### Cancelling an appointment

From an appointment detail view, click **Cancel Appointment**. The behavior differs by CRM:

- **Clio** — the calendar entry is deleted from Clio
- **NetSuite** — the calendar event status is set to `CANCELLED` (the record is preserved)
