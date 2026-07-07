# Connector Manifest

The manifest tells App Connect how to present a connector in the client, how users authenticate, which CRM pages can be opened, which custom fields appear in log forms, and which optional features are enabled.

In App Connect 2.0, the Developer Console is the primary place to manage manifests. The local `src/connectors/manifest.tson` file still matters for bundled connectors, local development, and backward compatibility with older clients.

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
| `contactPageUrl` | Template for opening a contact page. Supports built-in URL tokens and custom setting tokens. See [URL template tokens](#url-template-tokens). |
| `enableFallbackContactPageUrl` | Enables the fallback contact page URL for call-pop when no existing contact is matched. Defaults to `false`. |
| `fallbackContactPageUrl` | Optional fixed URL opened by call-pop when fallback is enabled and no existing contact is matched. Supports built-in URL tokens and custom setting tokens. |
| `logPageUrl` | Template for opening a log/activity page. Supports built-in URL tokens and custom setting tokens. See [URL template tokens](#url-template-tokens). |
| `canOpenLogPage` | When true, App Connect opens `logPageUrl` for logged activities. When false, it opens `contactPageUrl`. |
| `settings` | Connector-specific user/admin settings. See [Custom settings](custom-settings.md). |
| `page` | Auth, call log, message log, feedback, and contact-search UI config. See [Manifest pages](manifest-pages.md). |
| `requestConfig` | Client HTTP config. `timeout` is in seconds. |
| `enableExtensionNumberLoggingSetting` | Shows the user setting for internal extension-number contact lookup/logging. |
| `trackSmsTypingDuration` | Sends SMS typing duration data for connectors that bill/track SMS time. |
| `rcAdditionalSubmission` | Adds selected RingCentral cached data into logging submissions. |
| `override` | Runtime manifest overrides. See [Regional services](regional-services.md). |

## URL Template Tokens

URL templates can include built-in runtime tokens and connector custom setting tokens.

Built-in tokens include:

| Token | Value |
| --- | --- |
| `{hostname}` | The connected user's CRM hostname. |
| `{contactId}` | The matched CRM contact ID, when available. |
| `{contactType}` | The matched CRM contact type, when available. |
| `{logId}` | The CRM activity/log ID returned after logging, when available. |
| `{thirdPartyAppointmentId}` | The CRM appointment ID for appointment links, when available. |

Custom setting tokens use the setting item `id` directly. For example, if the connector defines an input field with `id: "contactBoardId"`, URL templates can reference `{contactBoardId}`:

```json
{
  "settings": [
    {
      "id": "mondayOptions",
      "type": "section",
      "name": "Monday options",
      "items": [
        {
          "id": "contactBoardId",
          "type": "inputField",
          "name": "Contact board ID"
        }
      ]
    }
  ],
  "contactPageUrl": "https://{hostname}/boards/{contactBoardId}/pulses/{contactId}",
  "logPageUrl": "https://{hostname}/boards/{contactBoardId}/pulses/{logId}"
}
```

The runtime resolves custom setting tokens from the merged user/admin settings object, using `userSettings.<settingId>.value`. Built-in tokens take precedence over custom setting tokens with the same name.

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
| `page.disableContactCache` | Forces phone-number contact lookups to refresh server-side account contact data instead of returning cached account matches. Client-side local matched-contact cache can still be used. |
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

## Embed URLs

The `embedUrls` property lists the pages of the CRM's web application where App Connect should automatically appear. When a user navigates to a matching URL, the extension panel is opened without the user having to manually click the App Connect icon.

This is distinct from `urlIdentifier`, which controls when the App Connect quick-access button is visible in the browser toolbar. `embedUrls` controls when the panel opens automatically.

Values support `*` as a wildcard. Use it to match any subdomain or any path segment.

```json
"embedUrls": [
  "https://*.pipedrive.com/*"
]
```

All built-in connectors use a single wildcard pattern that matches the CRM's entire domain:

| CRM          | embedUrls pattern                        |
|--------------|------------------------------------------|
| Pipedrive    | `https://*.pipedrive.com/*`              |
| Insightly    | `https://*.insightly.com/*`              |
| Clio         | `https://*.clio.com/*`                   |
| Bullhorn     | `https://*.bullhornstaffing.com/*`       |
| NetSuite     | `https://*.app.netsuite.com/*`           |
| Google Sheets| `https://docs.google.com/*`              |

You can supply multiple patterns if the CRM spans more than one domain, or if you want to restrict embedding to specific sections of the UI:

```json
"embedUrls": [
  "https://app.example.com/contacts/*",
  "https://app.example.com/deals/*"
]
```

## Server-side logging

The `serverSideLogging` property configures App Connect's server-side call logging service, which logs calls automatically on behalf of users without requiring them to interact with the extension.

| Name                      | Type            | Description |
|---------------------------|-----------------|-------------|
| `url`                     | string          | The URL of the server-side logging endpoint on your connector. |
| `useAdminAssignedUserToken` | boolean       | When `true`, the framework uses an admin-assigned token to make API calls on behalf of users rather than each user's individual OAuth token. |
| `enableUserMapping`       | boolean         | When `true`, the Admin settings in App Connect show a user-mapping UI that allows admins to map RingCentral users to CRM users. |
| `additionalFields`        | array of object | (Optional) Connector-specific configuration fields shown in the Admin settings UI. Each element has the same structure as [`page.callLog.additionalFields`](manifest-pages.md#additional-field-shape). |

### additionalFields for server-side logging

The `additionalFields` array under `serverSideLogging` defines extra fields that an administrator must fill in once when configuring server-side logging. These values are then available to the [`getServerLoggingSettings`](interfaces/getServerLoggingSettings.md) and [`updateServerLoggingSettings`](interfaces/updateServerLoggingSettings.md) lifecycle hooks.

Common uses include collecting CRM API credentials (username and password) that the server uses to log calls on behalf of all users.

```json
"serverSideLogging": {
  "url": "https://my-connector.example.com",
  "useAdminAssignedUserToken": false,
  "enableUserMapping": true,
  "additionalFields": [
    {
      "const": "apiUsername",
      "title": "CRM API Username",
      "type": "inputField"
    },
    {
      "const": "apiPassword",
      "title": "CRM API Password",
      "type": "inputField"
    }
  ]
}
```

## Manifest overrides

The `override` property allows you to define conditions under which certain manifest values are replaced with alternative values at runtime. This is primarily used to support regional CRM deployments. See [Regional services](regional-services.md) for full documentation.

```json
"override": [
  {
    "triggerType": "hostname",
    "triggerValue": "au.app.clio.com",
    "overrideObjects": [
      {
        "path": "auth.oauth.authUrl",
        "value": "https://au.app.clio.com/oauth/authorize"
      }
    ]
  }
]
```

