# Proxy Connector

Proxy mode lets you build a connector from JSON configuration instead of a custom Node.js connector server. App Connect stores a `proxyConfig`, renders HTTP requests from that config, sends requests to your API, and maps responses back into the normal connector interface shapes.

Use proxy mode when your CRM or integration platform has predictable REST APIs and does not require complex connector-side logic.

## When To Use Proxy Mode

Proxy mode fits when:

- the CRM has documented REST endpoints
- each App Connect operation maps to one HTTP request
- response data can be mapped with dot paths
- you do not need custom database work or multi-step orchestration
- you are comfortable storing user credentials in App Connect's managed backend

Use a code connector when logging one call requires several dependent API calls, custom retry behavior, connector-specific token refresh logic, or complex side effects.

## Runtime Flow

1. The user selects a proxy connector profile from the Developer Console.
2. Auth data is saved with the App Connect user record, including `platformAdditionalInfo.proxyId`.
3. Core loads `proxyConfig` from the connector store by `proxyId`.
4. The proxy connector implements the same interfaces as a code connector.
5. For each operation, `proxy/engine.ts` renders URL, headers, query, and body values, performs the request with axios, and maps the response.

## Top-Level Config

```json
{
  "meta": {
    "name": "myProxyCrm",
    "displayName": "My Proxy CRM",
    "logFormat": "text/plain"
  },
  "auth": {},
  "requestDefaults": {},
  "operations": {}
}
```

| Field | Description |
| --- | --- |
| `meta` | Connector metadata. `meta.logFormat` controls core log composition. |
| `auth` | Default outbound auth header behavior. |
| `requestDefaults` | Base URL, timeout, and default headers. |
| `operations` | Operation definitions keyed by interface name. |

## Auth

```json
{
  "auth": {
    "type": "apiKey",
    "scheme": "Basic",
    "headerName": "Authorization",
    "credentialTemplate": "{{apiKey}}:",
    "encode": "base64"
  }
}
```
| Field | Description |
| --- | --- |
| `type` | `apiKey` or `oauth`. Defaults to `apiKey` when config is missing. |
| `scheme` | Prefix added before the credential, such as `Basic` or `Bearer`. |
| `headerName` | Header to set. Defaults to `Authorization`. |
| `credentialTemplate` | Template used to build the credential. |
| `encode` | `base64` by default. Use `none` to send the credential as rendered. |

If `credentialTemplate` is omitted, the proxy connector uses the `authHeader` prepared by core. For OAuth with no template, it can build `Bearer {{user.accessToken}}`.

Operations can override auth with their own `auth` object.

## Request Defaults

```json
{
  "requestDefaults": {
    "baseUrl": "https://api.example.com/v1",
    "timeoutSeconds": 30,
    "defaultHeaders": {
      "Accept": "application/json",
      "X-Connector-Secret": "{{secretKey}}"
    }
  }
}
```

`url` values under operations are joined with `baseUrl` unless they are already absolute HTTP URLs.

## Operation Shape

```json
{
  "operations": {
    "findContact": {
      "method": "GET",
      "url": "/contacts",
      "headers": {},
      "query": {},
      "body": {},
      "responseMapping": {}
    }
  }
}
```

| Field | Description |
| --- | --- |
| `method` | HTTP method. Defaults to `GET`. |
| `url` | Absolute URL or path joined to `requestDefaults.baseUrl`. |
| `headers` | Operation-specific headers. |
| `query` | Query parameters. |
| `body` | JSON request body. |
| `auth` | Optional per-operation auth override. |
| `responseMapping` | Dot-path mapping from response JSON to App Connect data. |

## Templates

Templates use `{{path.to.value}}`. If a string is exactly one template expression, the raw value is inserted. Otherwise the value is converted to a string.

Example:

```json
{
  "query": {
    "phone": "{{phoneNumber}}",
    "includeClosed": "{{additionalSubmission.includeClosed}}"
  }
}
```

Common variables:

| Variable | Description |
| --- | --- |
| `apiKey` | Submitted/stored API key. |
| `authHeader` | Header prepared by core. |
| `secretKey` | Connector secret decoded from Developer Console storage. |
| `user.id` | App Connect user ID without the platform suffix where proxy context builds it. |
| `user.hostname` | Stored CRM hostname. |
| `user.accessToken`, `user.refreshToken`, `user.tokenExpiry` | Stored CRM credentials. |
| `user.platformAdditionalInfo.*` | Values saved from `getUserInfo` mapping. |
| `additionalInfo.*` | API-key auth page fields during `getUserInfo`. |
| `proxyConfig` | Not directly injected; config values should be referenced through templates you define. |

## Operation Variables

| Operation | Important variables |
| --- | --- |
| `getUserInfo` | `apiKey`, `hostname`, `platform`, `userEmail`, `additionalInfo.*` |
| `findContact` | `phoneNumber`, `parsedPhoneNumber.*`, `overridingFormat`, `isExtension` |
| `createContact` | `phoneNumber`, `newContactName`, `newContactType`, `additionalSubmission.*` |
| `findContactWithName` | `name` |
| `createCallLog` | `contactInfo.*`, `callLog.*`, `subject`, `startTime`, `endTime`, `note`, `additionalSubmission.*`, `aiNote`, `transcript`, `composedLogDetails`, `hashedAccountId`, `isFromSSCL`, ACE/RingSense fields |
| `getCallLog` | `thirdPartyLogId`, `contactId` |
| `updateCallLog` | `thirdPartyLogId`, `existingCallLog`, `recordingLink`, `recordingDownloadLink`, `subject`, `note`, `startTime`, `endTime`, `duration`, `result`, `legs`, `additionalSubmission.*`, `composedLogDetails`, `existingCallLogDetails`, ACE/RingSense fields |
| `upsertCallDisposition` | `thirdPartyLogId`, `existingCallLog`, `dispositions.*` |
| `createMessageLog` | `contactInfo.*`, `message.*`, `creationTime`, `additionalSubmission.*`, `recordingLink`, `faxDocLink`, `faxDownloadLink`, `imageLink`, `videoLink` |
| `updateMessageLog` | `thirdPartyLogId`, `existingMessageLog`, `message.*`, `creationTime`, `additionalSubmission.*`, `imageLink`, `videoLink` |
| `getUserList` | `user.*` |
| `getLicenseStatus` | `userId`, `platform`, `user.*` |
| `unAuthorize` | `user.*` |

## Response Mappings

Response paths are dot paths against `{ body: response.data }`.

### getUserInfo

```json
{
  "responseMapping": {
    "idPath": "body.user.id",
    "namePath": "body.user.name",
    "timezoneNamePath": "body.user.timezone",
    "overridingApiKeyPath": "body.session.token",
    "messagePath": "body.message",
    "platformAdditionalInfoPaths": {
      "tenantId": "body.user.tenant_id"
    }
  }
}
```

Proxy mode saves `platformAdditionalInfo` after removing any `password` field from submitted auth data.

### findContact And findContactWithName

```json
{
  "responseMapping": {
    "listPath": "body.contacts",
    "item": {
      "idPath": "id",
      "namePath": "name",
      "phonePath": "phone",
      "typePath": "type",
      "titlePath": "title",
      "companyPath": "company",
      "createdDatePath": "created_at",
      "mostRecentActivityDatePath": "updated_at",
      "additionalInfoPath": "additionalInfo"
    }
  }
}
```

`createdDatePath` should map to the CRM record creation timestamp. Auto logging needs it when users choose the "earliest created contact" resolver for multiple contact matches.

Prefer ISO 8601 values with a timezone, such as `2024-01-01T00:00:00Z`. The client also accepts Unix timestamps in seconds, milliseconds, microseconds, or nanoseconds; numeric timestamp strings; `YYYY-MM-DD HH:mm:ss`; date-only `YYYY-MM-DD`; compact `YYYYMMDD` or `YYYYMMDDHHmmss`; RFC-style named dates; and `.NET /Date(1704067200000)/` values. Ambiguous slash formats such as `01/02/2024` are intentionally rejected.

### createContact

```json
{
  "responseMapping": {
    "idPath": "body.id",
    "namePath": "body.name",
    "typePath": "body.type"
  }
}
```

### createCallLog And createMessageLog

```json
{
  "responseMapping": {
    "idPath": "body.activity.id"
  }
}
```

### getCallLog

```json
{
  "responseMapping": {
    "subjectPath": "body.activity.subject",
    "notePath": "body.activity.note",
    "fullBodyPath": "body.activity.description"
  }
}
```

### getUserList

```json
{
  "responseMapping": {
    "listPath": "body.users",
    "idPath": "id",
    "namePath": "name",
    "emailPath": "email"
  }
}
```

### getLicenseStatus

```json
{
  "responseMapping": {
    "isLicenseValidPath": "body.isLicenseValid",
    "licenseStatusPath": "body.licenseStatus",
    "licenseStatusDescriptionPath": "body.licenseStatusDescription"
  }
}
```

## Minimal Example

```json
{
  "meta": {
    "name": "myProxyCrm",
    "displayName": "My Proxy CRM",
    "logFormat": "text/plain"
  },
  "auth": {
    "type": "apiKey",
    "scheme": "Bearer",
    "credentialTemplate": "{{apiKey}}",
    "encode": "none"
  },
  "requestDefaults": {
    "baseUrl": "https://api.example.com/v1",
    "timeoutSeconds": 30,
    "defaultHeaders": {
      "Accept": "application/json"
    }
  },
  "operations": {
    "getUserInfo": {
      "method": "GET",
      "url": "/me",
      "responseMapping": {
        "idPath": "body.id",
        "namePath": "body.name"
      }
    },
    "findContact": {
      "method": "GET",
      "url": "/contacts",
      "query": {
        "phone": "{{phoneNumber}}"
      },
      "responseMapping": {
        "listPath": "body.contacts",
        "item": {
          "idPath": "id",
          "namePath": "name",
          "phonePath": "phone",
          "typePath": "type",
          "createdDatePath": "created_at"
        }
      }
    },
    "createCallLog": {
      "method": "POST",
      "url": "/activities",
      "headers": {
        "Content-Type": "application/json"
      },
      "body": {
        "contact_id": "{{contactInfo.id}}",
        "subject": "{{subject}}",
        "body": "{{composedLogDetails}}",
        "start_at": "{{startTime}}",
        "end_at": "{{endTime}}"
      },
      "responseMapping": {
        "idPath": "body.id"
      }
    },
    "updateCallLog": {
      "method": "PATCH",
      "url": "/activities/{{thirdPartyLogId}}",
      "body": {
        "subject": "{{subject}}",
        "body": "{{composedLogDetails}}"
      }
    }
  }
}
```
