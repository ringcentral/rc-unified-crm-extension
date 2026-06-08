# App Connect connector interfaces

Each connector exposes an API that the App Connect server communicates with. Each endpoint or interface corresponds to a specific capability within App Connect, and is responsible for fulfilling that capability within the context of the CRM being connected to.

Not all interfaces are required. The tables below indicate which are core requirements and which are optional or feature-specific.

## Authentication

These interfaces manage the connection lifecycle between App Connect and the target CRM.

| Interface                           | Description                                                                          |
|-------------------------------------|--------------------------------------------------------------------------------------|
| [`getAuthType`](getAuthType.md)     | Returns the auth method used by this connector (`oauth` or `apiKey`).                |
| [`getOauthInfo`](getOauthInfo.md)   | Returns OAuth credentials and token endpoint details needed to initiate the OAuth flow. |
| [`getBasicAuth`](getBasicAuth.md)   | Returns credentials for Basic Auth. Used only by connectors with `apiKey` auth type. |
| [`getUserInfo`](getUserInfo.md)     | Fetches and returns the authenticated user's profile from the CRM after login.       |
| [`unAuthorize`](unAuthorize.md)     | Logs a user out of the CRM, invalidates credentials, and cleans up any stored session data. |

## Call logging

These interfaces handle the creation and management of call log records in the CRM.

| Interface                                           | Description                                                                                             |
|-----------------------------------------------------|---------------------------------------------------------------------------------------------------------|
| [`findContact`](findContact.md)                     | Finds one or more contacts in the CRM by phone number. Powers call-pop and call logging.                |
| [`findContactWithName`](findContactWithName.md)     | Finds one or more contacts by name. Used when a user searches for a contact manually.                   |
| [`createContact`](createContact.md)                 | Creates a placeholder contact when no matching contact is found for a phone number.                     |
| [`createCallLog`](createCallLog.md)                 | Creates a new call log record in the CRM associated with a contact.                                     |
| [`updateCallLog`](updateCallLog.md)                 | Updates an existing call log record, e.g. to add notes after a call ends.                               |
| [`getCallLog`](getCallLog.md)                       | Fetches the current state of a call log from the CRM, in case the user edited it directly.              |
| [`getLogFormatType`](getLogFormatType.md)           | Returns the preferred format for composing call log detail content.                                     |
| [`upsertCallDisposition`](upsertCallDisposition.md) | Creates or updates the call disposition associated with a log entry.                                    |

## SMS logging

These interfaces handle the creation and management of SMS conversation records in the CRM.

| Interface                                         | Description                                                               |
|---------------------------------------------------|---------------------------------------------------------------------------|
| [`createMessageLog`](createMessageLog.md)         | Creates a new SMS conversation log record in the CRM.                     |
| [`updateMessageLog`](updateMessageLog.md)         | Updates an existing SMS message log, e.g. to append new messages.        |

## Server-side logging

These interfaces support App Connect's server-side logging service, which logs calls automatically without user interaction.

| Interface                                 | Description                                                                               |
|-------------------------------------------|-------------------------------------------------------------------------------------------|
| [`getLicenseStatus`](getLicenseStatus.md) | Returns the license status for a given CRM user, used to gate server-side logging access. |
| [`getUserList`](getUserList.md)           | Returns the list of CRM users for admin-managed user mapping in server-side logging.      |

## Appointments

These interfaces power App Connect's built-in appointment scheduling panel. Implement them if the target CRM supports calendar or appointment management.

| Interface                                         | Description                                                                          |
|---------------------------------------------------|--------------------------------------------------------------------------------------|
| [`listAppointments`](listAppointments.md)         | Retrieves upcoming appointments from the CRM for display in the appointments panel.  |
| [`createAppointment`](createAppointment.md)       | Creates a new appointment in the CRM.                                                |
| [`updateAppointment`](updateAppointment.md)       | Updates an existing appointment in the CRM.                                          |
| [`refreshAppointment`](refreshAppointment.md)     | Fetches the latest state of a single appointment.                                    |
| [`cancelAppointment`](cancelAppointment.md)       | Cancels or deletes an appointment in the CRM.                                        |
| [`confirmAppointment`](confirmAppointment.md)     | Marks an appointment as confirmed (implement only if the CRM supports this status).  |

## Lifecycle hooks

Lifecycle hooks allow connectors to intercept and customize key framework operations. Unlike standard interfaces, lifecycle hooks are optional and connector-specific — implement only the ones your CRM requires.

| Hook                                                                | Description                                                                                         |
|---------------------------------------------------------------------|-----------------------------------------------------------------------------------------------------|
| [`authValidation`](authValidation.md)                               | Validates session tokens before each request. Refresh the session if expired.                       |
| [`checkAndRefreshAccessToken`](checkAndRefreshAccessToken.md)       | Checks whether the OAuth access token is expired and refreshes it if necessary.                     |
| [`getOverridingOAuthOption`](getOverridingOAuthOption.md)           | Overrides token-exchange request parameters for CRMs with non-standard OAuth flows.                 |
| [`getServerLoggingSettings`](getServerLoggingSettings.md)           | Retrieves the server-side logging configuration for the current user's organization.                |
| [`updateServerLoggingSettings`](updateServerLoggingSettings.md)     | Persists updated server-side logging settings for the current user's organization.                  |
| [`postSaveUserInfo`](postSaveUserInfo.md)                           | Called after a user authenticates; use it for CRM-specific post-login setup.                        |
