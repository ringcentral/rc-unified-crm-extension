# Libraries

The `lib/` directory contains cross-cutting helpers used by routes, handlers, and connectors.

## Infrastructure And Security

| File | Responsibility |
| --- | --- |
| `lib/jwt.ts` | Signs and verifies long-lived JWTs with `APP_SERVER_SECRET_KEY` |
| `lib/oauth.ts` | Builds OAuth clients and refreshes access tokens with lock protection |
| `lib/authSession.ts` | Stores and updates auth-session records used by auth flows |
| `lib/encode.ts` | Small encoding and decoding helpers for encrypted values |
| `lib/errorHandler.ts` | Normalizes API and database errors and exports Express error middleware |
| `lib/logger.ts` | Structured logger plus exported `Logger` class and log-level constants |
| `lib/debugTracer.ts` | Request-scoped trace collector used when debug mode is enabled |
| `lib/s3ErrorLogReport.ts` | S3 bucket setup and presigned upload URL generation for debug reports |

## RingCentral And Analytics Helpers

| File | Responsibility |
| --- | --- |
| `lib/ringcentral.ts` | RingCentral API wrapper plus token-validity helpers |
| `lib/analytics.ts` | Mixpanel initialization and event tracking |
| `lib/generalErrorMessage.ts` | Shared user-facing warning messages for auth and rate-limit cases |

## Formatting And Utility Helpers

| File | Responsibility |
| --- | --- |
| `lib/callLogComposer.ts` | Builds plain text, HTML, or Markdown call-log bodies |
| `lib/sharedSMSComposer.ts` | Builds shared-SMS conversation log content |
| `lib/constants.ts` | Defines `LOG_DETAILS_FORMAT_TYPE` values |
| `lib/util.ts` | Hashing, timezone lookup, media-reader links, plugin setting extraction, and date helpers |

## Notes By File

### `lib/analytics.ts`

- no-op unless `MIXPANEL_TOKEN` is present
- attaches package version, app name, connector name, browser, OS, device, and caller metadata to events
- requires `extensionId` to emit an event

### `lib/jwt.ts`

- `generateJwt()` signs with a very long expiration window
- `decodeJwt()` logs and returns `null` on verification failure instead of throwing

### `lib/errorHandler.ts`

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

### `lib/callLogComposer.ts`

This module centralizes log-body generation for call logs.

It supports:

- plain text
- HTML
- Markdown
- note insertion
- session id, subject, duration, result, recording, and timestamp formatting
- transcript and AI note insertion
- leg journey formatting
- ACE transcript, summary, score, bullet summary, and deep link sections

### `lib/sharedSMSComposer.ts`

This module formats shared SMS conversations for CRM logging.

It handles:

- message, note, and assignment entities
- owner and assignee metadata
- per-format output generation
- summary counts and formatted timeline entries

### `lib/util.ts`

Exports:

- `getTimeZone()`
- `getHashValue()`
- `secondsToHoursMinutesSeconds()`
- `getMostRecentDate()`
- `getMediaReaderLinkByPlatformMediaLink()`
