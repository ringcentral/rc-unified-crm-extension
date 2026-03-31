# Models

The package uses Sequelize for durable application data and Dynamoose for selected config and cache workflows.

## Sequelize Models

### `models/sequelize.js`

Creates the shared Sequelize instance from `DATABASE_URL`.

### `models/userModel.js`

Stores CRM-authenticated users.

| Field | Notes |
| --- | --- |
| `id` | Primary key; effectively `{crmUserId}-{platform}` |
| `rcAccountId` | RingCentral account id |
| `hostname` | CRM hostname or tenant host |
| `timezoneName` | User timezone name when available |
| `timezoneOffset` | Offset stored as a string |
| `platform` | Connector platform name |
| `accessToken` | OAuth access token or API key |
| `refreshToken` | OAuth refresh token |
| `tokenExpiry` | Access token expiry |
| `platformAdditionalInfo` | Connector-specific metadata such as `proxyId` or token URL |
| `hashedRcExtensionId` | Hashed RingCentral extension id |
| `userSettings` | Per-user settings JSON |

### `models/callLogModel.js`

Stores the mapping between telephony sessions and CRM call logs.

| Field | Notes |
| --- | --- |
| `id` | Telephony call id |
| `sessionId` | Session id; also part of the composite primary key |
| `platform` | Connector platform |
| `thirdPartyLogId` | CRM log id |
| `userId` | App Connect user id |
| `contactId` | CRM contact id used for the log |

### `models/messageLogModel.js`

Stores message-log linkage records.

| Field | Notes |
| --- | --- |
| `id` | Message id or conversation log id |
| `platform` | Connector platform |
| `conversationId` | Conversation identifier |
| `conversationLogId` | Shared key used to group related message logs |
| `thirdPartyLogId` | CRM log id |
| `userId` | App Connect user id |

### `models/adminConfigModel.js`

Stores account-level admin configuration.

| Field | Notes |
| --- | --- |
| `id` | Hashed RingCentral account id |
| `userSettings` | Account-level settings policy |
| `customAdapter` | Obsolete field kept for compatibility |
| `adminAccessToken` | RingCentral admin access token |
| `adminRefreshToken` | RingCentral admin refresh token |
| `adminTokenExpiry` | Admin token expiry |
| `userMappings` | JSON mapping between CRM users and RingCentral extensions |

### `models/cacheModel.js`

Stores temporary task state, mainly for async plugin work.

| Field | Notes |
| --- | --- |
| `id` | Task id, commonly `{userId}-{uuid}` |
| `status` | Task status such as `initialized`, `completed`, or `failed` |
| `userId` | Owning user |
| `cacheKey` | Logical task family |
| `data` | Optional task payload |
| `expiry` | Cleanup cutoff |

### `models/accountDataModel.js`

Stores account-scoped cached data.

Composite primary key:

- `rcAccountId`
- `platformName`
- `dataKey`

Main usage in current code:

- cached contact lookups keyed as `contact-${phoneNumber}`

Helper export:

- `getOrRefreshAccountData()` which returns cached data unless `forceRefresh` is set

### `models/callDownListModel.js`

Stores user-owned call-down queue items.

| Field | Notes |
| --- | --- |
| `id` | Primary key |
| `userId` | Owning user |
| `contactId` | CRM contact id |
| `contactType` | Contact entity type |
| `status` | Queue state such as `scheduled` or `called` |
| `scheduledAt` | Requested follow-up time |
| `lastCallAt` | Last call timestamp |

This model enables timestamps and indexes on `userId`, `status`, `scheduledAt`, and `userId + status`.

### `models/llmSessionModel.js`

Stores a lightweight mapping from an LLM session id to a JWT token.

## Dynamoose Models

### `models/dynamo/connectorSchema.js`

Stores connector metadata used by proxy integrations.

Important role:

- source of truth for `Connector.getProxyConfig(proxyId)`

This schema is a dependency of auth, contact, log, admin, and proxy connector flows.

### `models/dynamo/lockSchema.js`

Stores distributed lock state used by token refresh and similar coordination logic.

### `models/dynamo/noteCacheSchema.js`

Stores note cache entries keyed by `sessionId`.

Main usage:

- `handlers/log.js` can read cached notes during server-side call logging
- `saveNoteCache()` writes entries with a TTL
