# Is Your CRM App Connect-Ready?

App Connect can integrate with commercial, vertical, or proprietary CRMs when the CRM exposes enough API surface for contact lookup and communication logging.

## Minimum API Surface

| Capability | Why App Connect needs it |
| --- | --- |
| Auth validation | `getUserInfo` must verify the user's credentials and return a stable CRM user ID/name. |
| Contact lookup by phone | `findContact` powers call pop, call logging, message logging, and refresh. |
| Activity or note creation | `createCallLog` and `createMessageLog` need somewhere to write communications. |
| Activity update | `updateCallLog` and `updateMessageLog` add recordings, final call data, later messages, AI artifacts, and user edits. |
| Activity retrieval | `getCallLog` lets App Connect edit existing CRM logs without overwriting user changes. |
| Contact creation | `createContact` supports unknown-contact logging and placeholder-contact flows. |
| Logout or token cleanup | `unAuthorize` lets users disconnect cleanly. |

## Strongly Recommended API Surface

| Capability | Enables |
| --- | --- |
| Contact search by name | Manual search through `findContactWithName`. |
| User list with emails | Server-side logging user mapping through `getUserList`. |
| Related entities | Contact-dependent fields such as matters, deals, opportunities, cases, or jobs. |
| Disposition/category update | `upsertCallDisposition` after a call log exists. |
| Media upload or durable links | Voicemail, fax, MMS, and call recording handling. |
| Calendar/event APIs | Optional appointment support. |

## Auth Fit

OAuth is the cleanest option because core can refresh tokens and support admin-managed OAuth. API-key auth is also supported, including admin-managed API-key fields for credentials shared across a RingCentral account or assigned per user.

If the CRM requires tenant-specific OAuth apps, use admin-managed OAuth instead of asking every user for client credentials.

## Server Choice

Choose a connector mode based on CRM complexity:

| Mode | Fit |
| --- | --- |
| Proxy connector | Simple REST APIs with one request per App Connect operation and predictable JSON mappings. |
| Code connector | Multi-step CRM workflows, custom token refresh, CRM-specific caching, uploads, side effects, or database work. |

## Compatibility Checklist

- Can users authenticate without sharing unsafe credentials?
- Can the connector reliably map a phone number to zero, one, or many CRM records?
- Can the CRM create exactly one activity per RingCentral call or message group?
- Can later updates target that same activity by ID?
- Can the connector avoid overwriting CRM-side edits?
- Can user-facing CRM pages be opened with stable URL templates?
- Are rate limits and permission failures understandable enough to return actionable `returnMessage` details?
