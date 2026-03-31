# Libraries

The `lib/` directory contains cross-cutting helpers used by routes, handlers, and connectors.

## Infrastructure And Security

| File | Responsibility |
| --- | --- |
| `lib/jwt.js` | Signs and verifies long-lived JWTs with `APP_SERVER_SECRET_KEY` |
| `lib/oauth.js` | Builds OAuth clients and refreshes access tokens with lock protection |
| `lib/authSession.js` | Stores and updates auth-session records used by auth flows |
| `lib/encode.js` | Small encoding and decoding helpers for encrypted values |
| `lib/errorHandler.js` | Normalizes API and database errors and exports Express error middleware |
| `lib/logger.js` | Structured logger plus exported `Logger` class and log-level constants |
| `lib/debugTracer.js` | Request-scoped trace collector used when debug mode is enabled |
| `lib/s3ErrorLogReport.js` | S3 bucket setup and presigned upload URL generation for debug reports |

## RingCentral And Analytics Helpers

| File | Responsibility |
| --- | --- |
| `lib/ringcentral.js` | RingCentral API wrapper plus token-validity helpers |
| `lib/analytics.js` | Mixpanel initialization and event tracking |
| `lib/generalErrorMessage.js` | Shared user-facing warning messages for auth and rate-limit cases |

## Formatting And Utility Helpers

| File | Responsibility |
| --- | --- |
| `lib/callLogComposer.js` | Builds plain text, HTML, or Markdown call-log bodies |
| `lib/sharedSMSComposer.js` | Builds shared-SMS conversation log content |
| `lib/constants.js` | Defines `LOG_DETAILS_FORMAT_TYPE` values |
| `lib/util.js` | Hashing, timezone lookup, media-reader links, plugin setting extraction, and date helpers |

## Notes By File

### `lib/analytics.js`

- no-op unless `MIXPANEL_TOKEN` is present
- attaches package version, app name, connector name, browser, OS, device, and caller metadata to events
- requires `extensionId` to emit an event

### `lib/jwt.js`

- `generateJwt()` signs with a very long expiration window
- `decodeJwt()` logs and returns `null` on verification failure instead of throwing

### `lib/errorHandler.js`

Exports:

- `handleApiError()`
- `handleDatabaseError()`
- `asyncHandler()`
- `errorMiddleware()`
- `getOperationErrorMessage()`

Notable behavior:

- HTTP 429 becomes a rate-limit warning
- HTTP 4xx up to 409 becomes an authorization-style warning
- everything else becomes an operation-specific warning response

### `lib/callLogComposer.js`

This module centralizes log-body generation for call logs.

It supports:

- plain text
- HTML
- Markdown
- note insertion
- session id, subject, duration, result, recording, and timestamp formatting
- transcript and AI note insertion
- leg journey formatting
- RingSense transcript, summary, score, bullet summary, and deep link sections

### `lib/sharedSMSComposer.js`

This module formats shared SMS conversations for CRM logging.

It handles:

- message, note, and assignment entities
- owner and assignee metadata
- per-format output generation
- summary counts and formatted timeline entries

### `lib/util.js`

Exports:

- `getTimeZone()`
- `getHashValue()`
- `secondsToHoursMinutesSeconds()`
- `getMostRecentDate()`
- `getMediaReaderLinkByPlatformMediaLink()`
- `getPluginsFromUserSettings()`

`getPluginsFromUserSettings()` is especially important because logging handlers use it to discover which plugins should run for call, SMS, or fax workflows.
