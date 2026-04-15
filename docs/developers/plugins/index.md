---
title: "App Connect Plugins"
---
# Extending App Connect with plugins

!!! info "Looking to connect your CRM to App Connect? Try a [connector](../getting-started.md) instead."

Plugins are a lightweight way to process activity data before (or alongside) CRM logging. A plugin focuses on call/SMS/fax logging workflows by intercepting log payloads to enrich them, or performing extra workflow like sending data to AI for longer processes.

In a word, use a plugin when you want to extend logging behavior.

## Start with the plugin template

You can scaffold a plugin server directly from the CLI:

```bash
npx @app-connect/cli init my-plugin --template plugin
```

The generated project includes a simple codebase that's fully running.

## Plugin development workflow

!!! info "Directly check out README.md in downloaded template, or look at steps below"

Creating a plugin is a multi-step process:

1. A developer **registers a plugin** profile in the [Developer Console](https://appconnect.labs.ringcentral.com/console).
2. The plugin server is deployed and its manifest URLs are configured.
3. An admin logs into App Connect and installs that plugin to their account.
4. App Connect performs account-level plugin registration and stores a plugin JWT token.
5. An admin, if the plugin supports it, can then customize and configure the plugin.
6. During logging, App Connect invokes installed plugins that match the current log type.

![Editing a plugin in the Developer Console](../../img/plugin-dev-console.png){ .mw-350 }

### Supported log types

Plugins can process one or more communication modalities. Set these in `logTypes`:

* `call`
* `sms`
* `fax`

App Connect only invokes the plugin when the current activity matches one of those types.

### Synchronous vs asynchronous plugins

When developing a plugin you will choose between two ways of interfacing with App Connect - either synchronously or asynchronously.

* A **synchronous** plugin modifies payload before delivery to the connector. It should be performant because logging waits for it.
* An **asynchronous** plugin runs in the background and should not mutate the main payload used for CRM logging.

#### Synchronous processing

!!! warning "Please make sure not to remove fields as the data structure must be kept the same for logging process to work properly"

Synchronous plugins run inline during logging. The server sends the current payload to the plugin endpoint, waits for a response, and then continues normal logging using the plugin's returned data.

Use this mode when your plugin needs to transform the final payload that App Connect saves into the CRM.

#### Asynchronous processing

Asynchronous plugins run as a background job. When a communication is being prepared for logging, App Connect creates an async task record, invokes the plugin, and continues normal logging without waiting for the plugin to finish.

App Connect returns `pluginAsyncTaskIds` in create/update log responses. The client then polls `/pluginAsyncTask` to retrieve status updates.

Use this mode when your plugin performs side effects that do not need to block the main CRM log save.

### Support OAuth

Enable this if users must sign in to a third-party service to use your plugin.

### Require License

Enable this if your plugin requires entitlement checks. App Connect calls your `licenseStatusUrl` endpoint using the account-level plugin JWT token.

### Define custom configuration options

Just as you can with connectors, you can define custom configuration properties for plugins. These properties can be set by users, or if an admin chooses, can be forcibly set by an admin.

![Custom config settings for a plugin](../../img/plugin-custom-config.png){ .mw-350 }
