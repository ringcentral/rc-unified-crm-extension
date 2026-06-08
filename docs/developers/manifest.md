# Connector Manifest

The manifest tells App Connect how to present a connector in the client, how users authenticate, which CRM pages can be opened, which custom fields appear in log forms, and which optional features are enabled.

In App Connect 2.0, the Developer Console is the primary place to manage manifests. The local `src/connectors/manifest.json` file still matters for bundled connectors, local development, and backward compatibility with older clients.

## Top-Level Shape

```json
{
  "serverUrl": "https://connector.example.com",
  "redirectUri": "https://ringcentral.github.io/ringcentral-embeddable/redirect.html",
  "author": {
    "name": "Developer Name",
    "websiteUrl": "https://example.com"
  },
  "platforms": {
    "myCRM": {
      "name": "myCRM",
      "displayName": "My CRM",
      "auth": {
        "type": "oauth"
      }
    }
  },
  "version": "1.7.30"
}
```

| Field | Description |
| --- | --- |
| `serverUrl` | Base URL for connector server HTTP calls. Omit the trailing slash. |
| `redirectUri` | Default RingCentral Embeddable redirect page. Individual OAuth configs can override this. |
| `author` | Developer metadata shown in the client. `author.name` is required by the legacy `/crmManifest` route. |
| `platforms` | Object keyed by platform name. Each value is one connector profile. |
| `version` | Manifest version displayed to users and used for compatibility checks. |

## Platform Fields

| Field | Description |
| --- | --- |
| `name` | Platform key used by routes, JWT payloads, connector registration, and `platforms` lookup. |
| `displayName` | User-facing CRM name. |
| `developer` | Optional developer metadata for this platform. |
| `environment` | Setup-time hostname/server selection. See [Environment](#environment). |
| `urlIdentifier` | Legacy URL matcher for CRM pages. Wildcards are supported. |
| `embedUrls` | CRM page URL patterns where the embedded experience can run. |
| `logoUrl`, `documentationUrl`, `releaseNotesUrl`, `getSupportUrl`, `writeReviewUrl` | User-facing links and assets. |
| `auth` | Auth configuration. See [Authorization](auth.md). |
| `serverSideLogging` | Optional server-side logging config. |
| `contactTypes` | Optional list of CRM entity types users can create/select. |
| `contactPageUrl` | Template for opening a contact page. Supports `{hostname}`, `{contactId}`, and `{contactType}`. |
| `logPageUrl` | Template for opening a log/activity page. Supports `{hostname}`, `{logId}`, `{contactId}`, and `{contactType}` where available. |
| `canOpenLogPage` | When true, App Connect opens `logPageUrl` for logged activities. When false, it opens `contactPageUrl`. |
| `settings` | Connector-specific user/admin settings. See [Custom settings](custom-settings.md). |
| `page` | Auth, call log, message log, feedback, and contact-search UI config. See [Manifest pages](manifest-pages.md). |
| `requestConfig` | Client HTTP config. `timeout` is in seconds. |
| `enableExtensionNumberLoggingSetting` | Shows the user setting for internal extension-number contact lookup/logging. |
| `trackSmsTypingDuration` | Sends SMS typing duration data for connectors that bill/track SMS time. |
| `rcAdditionalSubmission` | Adds selected RingCentral cached data into logging submissions. |
| `override` | Runtime manifest overrides. See [Regional services](regional-services.md). |

## Environment

`environment` controls how the client determines the CRM hostname/server.

### Fixed

```json
{
  "environment": {
    "type": "fixed",
    "url": "https://app.example.com"
  }
}
```

Use this when every customer uses the same CRM URL.

### Dynamic

```json
{
  "environment": {
    "type": "dynamic",
    "urlIdentifier": "*.example.com",
    "instructions": [
      "Log in to your CRM",
      "Copy the whole URL and paste it here"
    ]
  }
}
```

Use this for tenant-specific subdomains.

### Selectable

```json
{
  "environment": {
    "type": "selectable",
    "selections": [
      { "const": "https://app.example.com", "name": "US" },
      { "const": "https://eu.app.example.com", "name": "EU" }
    ]
  }
}
```

Use this for regional deployments with a known list of hosts.

## Authorization

At minimum, every platform needs:

```json
{
  "auth": {
    "type": "oauth"
  }
}
```

or:

```json
{
  "auth": {
    "type": "apiKey",
    "apiKey": {
      "page": {
        "title": "My CRM",
        "content": [
          {
            "const": "apiKey",
            "title": "API key",
            "type": "string",
            "required": true
          }
        ]
      }
    }
  }
}
```

OAuth platforms usually include client-visible authorization fields:

```json
{
  "auth": {
    "type": "oauth",
    "oauth": {
      "authUrl": "https://app.example.com/oauth/authorize",
      "clientId": "public-client-id",
      "redirectUri": "https://ringcentral.github.io/ringcentral-embeddable/redirect.html",
      "scope": "scope=contacts.read contacts.write",
      "customState": "platform=myCRM"
    }
  }
}
```

Keep client secrets out of the manifest. Return them from [`getOauthInfo`](interfaces/getOauthInfo.md), environment variables, managed OAuth, or proxy configuration.

## Server-Side Logging

```json
{
  "serverSideLogging": {
    "url": "https://crm-logging.labs.ringcentral.com",
    "useAdminAssignedUserToken": true,
    "enableUserMapping": true
  }
}
```

| Field | Description |
| --- | --- |
| `url` | Server-side logging service URL. |
| `useAdminAssignedUserToken` | When true, logging can use the admin-assigned CRM user mapping. |
| `enableUserMapping` | Enables admin mapping between CRM users and RingCentral users. Requires [`getUserList`](interfaces/getUserList.md). |

## Pages And Settings

Use:

| Manifest area | Purpose |
| --- | --- |
| `auth.apiKey.page.content[]` | API-key login form fields, including managed-auth fields. |
| `page.callLog.additionalFields[]` | Custom call log form fields. |
| `page.messageLog.additionalFields[]` | Custom message log form fields. |
| `page.feedback` | Feedback form and target URL. |
| `page.useContactSearch` | Enables manual contact search by name when [`findContactWithName`](interfaces/findContactWithName.md) is implemented. |
| `settings[]` | Connector-specific settings available under user/admin settings. |

## Validation

The current manifest validator checks for:

- top-level `platforms`
- matching platform key
- `platform.auth.type`
- OAuth `authUrl` and `clientId` when auth type is OAuth
- `auth.apiKey` when auth type is API key
- valid `environment.type` when environment is present
- `environment.selections[]` for selectable environments
- platform `name`
- arrays for `settings`, `contactTypes`, and `override` when present

The Developer Console performs additional validation and should be treated as the preferred authoring surface.

