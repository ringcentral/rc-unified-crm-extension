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

Each supported CRM has its own requirements, permissions, and behavioral nuances. Refer to the relevant setup guide for details:

- [Bullhorn — Appointments](../crm/bullhorn.md#appointments)
- [Clio — Appointments](../crm/clio.md#appointments)
- [NetSuite — Appointments](../crm/netsuite.md#appointments)

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
