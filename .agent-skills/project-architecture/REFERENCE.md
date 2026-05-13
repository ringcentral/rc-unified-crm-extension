# Project Architecture — Detailed Reference

## Handlers (packages/core/handlers/)

| Handler | File | Purpose |
|---------|------|---------|
| Auth | `auth.js` | OAuth flow, token refresh, API key auth |
| ManagedAuth | `managedAuth.js` | Managed authentication flows |
| Contact | `contact.js` | Contact search, matching, creation |
| Log | `log.js` | Call/message logging, updates |
| Admin | `admin.js` | Admin settings, user mappings |
| User | `user.js` | User settings, preferences |
| Disposition | `disposition.js` | Call dispositions |
| Calldown | `calldown.js` | Calldown list management |
| Plugin | `plugin.js` | Plugin handler integration |

## Models (packages/core/models/)

| Model | File | Purpose |
|-------|------|---------|
| UserModel | `userModel.js` | User auth, tokens, settings |
| CallLogModel | `callLogModel.js` | Call log records |
| MessageLogModel | `messageLogModel.js` | SMS/message logs |
| AdminConfigModel | `adminConfigModel.js` | Admin configurations |
| CacheModel | `cacheModel.js` | Caching layer |
| AccountDataModel | `accountDataModel.js` | Account data storage |
| CallDownListModel | `callDownListModel.js` | Calldown list records |
| LlmSessionModel | `llmSessionModel.js` | LLM session tracking |

## Key Libraries (packages/core/lib/)

| Library | File | Purpose |
|---------|------|---------|
| JWT | `jwt.js` | Token encoding/decoding |
| Analytics | `analytics.js` | Usage tracking |
| Logger | `logger.js` | Structured logging |
| Constants | `constants.js` | Shared constants (LOG_DETAILS_FORMAT_TYPE, etc.) |
| CallLogComposer | `callLogComposer.js` | Compose call log details |
| ErrorHandler | `errorHandler.js` | Standardized error handling |
| OAuth | `oauth.js` | OAuth utility functions |
| RingCentral | `ringcentral.js` | RingCentral API client integration |
| Util | `util.js` | General utilities |

## API Routes

Core routes provided by `@app-connect/core`:

### Authentication
- `GET /authValidation` - Validate auth
- `GET /oauth-callback` - OAuth callback
- `POST /apiKeyLogin` - API key login
- `POST /unAuthorize` - Logout

### Contacts
- `GET /contact` - Find by phone
- `POST /contact` - Create contact
- `GET /custom/contact/search` - Search by name

### Logging
- `GET /callLog` - Get call log
- `POST /callLog` - Create call log
- `PATCH /callLog` - Update call log
- `PUT /callDisposition` - Set disposition
- `POST /messageLog` - Create message log

### Settings
- `GET /user/settings` - User settings
- `POST /user/settings` - Update user settings
- `GET /admin/settings` - Admin settings
- `POST /admin/settings` - Update admin settings

## Environment Variables

Key environment variables:

```bash
# Database
DATABASE_URL=postgres://...
DISABLE_SYNC_DB_TABLE=false

# Server
APP_SERVER_SECRET_KEY=secret
HASH_KEY=hash-key
IS_PROD=false

# DynamoDB (local dev)
DYNAMODB_LOCALHOST=http://localhost:8000

# CRM-specific (example for Pipedrive)
PIPEDRIVE_CLIENT_ID=...
PIPEDRIVE_CLIENT_SECRET=...
PIPEDRIVE_ACCESS_TOKEN_URI=...
PIPEDRIVE_REDIRECT_URI=...
```
