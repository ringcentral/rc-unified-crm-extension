---
title: "Plugins"
---
# Extending App Connect with Plugins

{! docs/developers/beta_notice.inc !}

Plugins are a lighter-weight processors that work on top of CRM connectors. A plugin focuses on activity logging workflows by intercepting log data to enrich it, or performing additional parallel actions.

Use a plugin when you want to extend logging behavior.

## Plugins vs Connectors

Both plugins and connectors are created in the App Connect Developer Console, but they solve different problems.

| Capability | Connector | Plugin |
|---|---|---|
| Main purpose | Integrate App Connect with a CRM | Extend logging inside an existing App Connect CRM connector |
| Typical scope | Authentication, contact lookup, logging, screen pop, settings, CRM navigation | Log processing, async task automation, optional authorization |
| Core endpoint | CRM server implementing App Connect interfaces | HTTPS endpoint that App Connect calls during logging |
| Installed by | User selecting a CRM connector | Admin installing plugins for an account |
| Configured by | User connecting the CRM | Admin and/or end users, depending on field lock settings |

For connector-specific guidance, continue using the main [developer framework guide](index.md).

## Cross-project architecture

The Plugins feature spans three projects:

* **Developer Console**: developers create plugin profiles, manage private sharing and submit plugins for review and publication
* **Client extension**: admins browse and install plugins, admins manage plugin defaults; End users configure installed plugins or complete plugin-specific OAuth
* **Server backend**: App Connect resolves installed plugins from user settings, executes plugin endpoints during logging, and tracks async plugin tasks

Brief flow:

1. A developer creates a plugin profile in the Developer Console.
2. An admin installs that plugin for an App Connect account.
3. App Connect stores the installed plugin in admin and user settings.
4. During call, SMS, or fax logging, the server loads matching plugins from those settings.
5. App Connect calls each plugin endpoint and either:
   * uses the returned payload before saving the CRM log, or
   * schedules the plugin as an async side task and polls for completion later.

## Specifications

### Endpoint url

It should be your server endpoint where the connector server will call during logging process.

### Supported log types

A plugin declares the log types it supports using `supportedLogTypes`. The current client and server branches support:

* `call`
* `sms`
* `fax`

App Connect only invokes the plugin when the current activity matches one of those types.

### Processing mode

#### Sync

!!! warning "Please make sure not to remove fields as the data structure must be kept the same for logging process to work properly"

Sync plugins run inline during logging. The server sends the current payload to the plugin endpoint, waits for a response, and then continues normal logging using the plugin's returned data.

Use this mode when your plugin needs to transform the final payload that App Connect saves into the CRM.

#### Async

Async plugins run as background work. App Connect creates an async task record, invokes the plugin, and continues normal logging without waiting for the plugin to finish.

The client stores async task IDs locally and polls App Connect every five minutes to summarize task status back to the user.

Use this mode when your plugin performs side effects that do not need to block the main CRM log save.

### Support OAuth

When `showAuthorizationButton` is enabled, App Connect renders **Connect** or **Logout** on the plugin configuration page and delegates the actual auth flow to those plugin endpoints.

Plugins must expose:

* `Generate auth url endpoint`
```
[GET] Response example:

{
   authUrl: "https://test.com/authUrl"
}
```
* `Check auth endpoint`
```
[GET] Response example:

{
   successful: true
}

```
* `Logout endpoint`
```
[POST] *Request example:

{
   jwtToken: 'xxxxxxxxxxxxxxxx.xxxxxxxxxxxx.xxxxxxxxxxxxxx'
}
```

### Require license

Your service may require license from users. Tick this to enable it.

Plugins must expose:

* `License status url`
```
[GET] Response example:

{
   licenseStatus: true,
   licenseStatusDescription: "License: Personal"
}
```
```
[GET] Response example:

{
   licenseStatus: false,
   licenseStatusDescription: "License missing. Please go to [our website](https://license.com/info) for more license package info.",
   errorMessage: "This plugin is not working" // this will be shown in plugin list page, one step before plugin config page
}
```