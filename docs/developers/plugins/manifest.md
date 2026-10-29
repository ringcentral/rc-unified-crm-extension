---
type: contract
title: Plugin Manifest and Configuration
description: Plugin manifest fields, registration flow, custom configuration, and publishing new versions.
owner: RingCentral
status: proposed
tags: [app-connect, plugins]
---

# Plugin Manifest and Configuration

## Registration flow

1. Register a plugin profile in the [Developer Console](https://appconnect.labs.ringcentral.com/console).
2. Deploy the plugin server and configure its manifest URLs.
3. An App Connect admin installs the plugin for an account.
4. App Connect resolves the plugin manifest and calls `userRegisterEndpointUrl`.
5. The plugin server validates the RingCentral admin identity and returns `{ jwtToken }`.
6. App Connect stores that plugin JWT in account data and uses it as a bearer token when invoking plugin endpoints.

## Manifest fields

Current plugin runtime reads these fields from the plugin platform manifest:

| Field | Purpose |
| --- | --- |
| `endpointUrl` | Main plugin invocation endpoint. |
| `userRegisterEndpointUrl` | Account registration endpoint. Must return `{ jwtToken }`. |
| `requireLicense` | Optional. When `true`, App Connect calls `licenseStatusUrl` and warns administrators when the plugin is not licensed. It does not show any pricing. |
| `licenseStatusUrl` | Optional license endpoint. Called with `Authorization: Bearer <pluginJwtToken>`. |
| `licensing` | Optional. Pricing information for a paid plugin. See [Pricing and paid listings](licensing.md#pricing-and-paid-listings). A paid plugin must also set `requireLicense` and `licenseStatusUrl`. |
| `supportedLogTypes` | Activity types that should invoke the plugin: `call`, `sms`, and/or `fax`. |
| `isAsync` | Marks the plugin as asynchronous. For call logs, App Connect dispatches after create or update succeeds and expects a callback. |
| `tokenSyncUrl` | Required for async plugins. App Connect calls this before invoking `endpointUrl` so the plugin can refresh its stored token. |
| `showAuthorizationButton` | Optional. Shows a user-facing **Connect** or **Logout** action on the plugin configuration page. |
| `authorizationUrl` | Optional. Endpoint that returns the third-party OAuth authorization URL as `{ "authUrl": "..." }`. |
| `authStateUrl` | Optional. Endpoint that returns the user's plugin auth state as `{ "successful": true }` or `{ "successful": false }`. |
| `logoutUrl` | Optional. Endpoint that disconnects the user's third-party account for this plugin. |
| Config fields | Stored in user settings under `plugin_<pluginId>` and passed to plugin calls as `config`. |

Keep plugin secrets on the plugin server. The manifest should contain URLs and UI/config metadata, not secret values.

## Custom configuration

Plugin configuration is similar to connector custom settings. The saved config is passed to the plugin invocation as `config`; core reads it from user settings under:

```text
plugin_<pluginId>.value.config
```

Validate config defaults on the plugin server. Older clients or admin-managed settings can omit optional config values.

## Publishing a new version

Accounts that already installed your plugin pick up a new published version automatically. You do not need administrators to reinstall it, and they keep the configuration they entered.

- **Execution.** When App Connect handles an activity, it checks the published manifest `version` (at most once every 10 minutes per plugin). If the version differs from the one the account installed, App Connect replaces the stored copy of the manifest with the new one. The plugin JWT issued at registration is kept. If the manifest cannot be fetched, the account keeps running the version it already has.
- **Admin Console.** When an administrator opens **Plugins**, the stored settings of each installed plugin are brought up to the published version. Values and locks the administrator already set are kept, newly declared configuration fields are added with their defaults, and fields you removed from `pageContent` stay in the stored settings.
- **Change the version string.** An update is detected only when `version` changes. Publishing a manifest change without changing `version` is not picked up by installed accounts.

!!! warning "A new registration host still needs a reinstall"
    The plugin JWT is issued by your plugin server. If `userRegisterEndpointUrl` moves to a different host, App Connect does not upgrade accounts that installed the earlier version, because their token would not be valid there. Ask administrators to uninstall and reinstall the plugin. Keep the registration host stable across versions where you can.

Every installed account moves to the new `endpointUrl`, `supportedLogTypes`, `isAsync`, and license settings as soon as the new version is approved and published, so keep your plugin server compatible with requests and configuration from the previous version.
