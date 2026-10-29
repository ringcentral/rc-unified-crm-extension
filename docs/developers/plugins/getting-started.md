---
type: contract
title: Plugin Getting Started
description: Create, scaffold, configure, and install an App Connect plugin.
owner: RingCentral
status: proposed
tags: [app-connect, plugins]
---

# Plugin Quick Start

This guide registers a plugin in the Developer Console, scaffolds a plugin server from the App Connect template, and installs the plugin for an account.

## Prerequisites

- Node.js 20 or newer
- A RingCentral account for the Developer Console and App Connect extension, with App Connect admin rights for the install step
- A public tunnel for local testing, such as ngrok

## 1. Register a plugin profile

Open the [Developer Console](https://appconnect.labs.ringcentral.com/console), create a plugin, and note its secret key from the plugin's **Quick setup** section. Configure the plugin's URLs later, once you have a tunnel URL.

## 2. Scaffold a plugin server

```bash
npx @app-connect/cli init my-plugin --template plugin
cd my-plugin
```

The generated project includes:

- `src/app.ts`, which wires the routes App Connect expects a plugin server to expose
- `src/plugins/syncPlugin.ts` and `src/plugins/asyncPlugin.ts`, starter implementations
- `src/handlers/license.ts` and `src/handlers/oauth.ts`, optional license and OAuth handlers
- `src/lib/pluginToken.ts`, which issues and validates the plugin JWT
- `.env.test`, copied to `.env` by the CLI

## 3. Configure the secret key

Run the following inside the project and paste the plugin secret key from the Developer Console when prompted:

```bash
npx @app-connect/cli env
```

The CLI detects a plugin project and saves the value as `PLUGIN_SERVER_SECRET_KEY` in `.env`. The template ships a placeholder for this variable, which the CLI treats as not yet configured. To skip the prompt:

```bash
npx @app-connect/cli env --secret-key <your-plugin-secret-key>
```

## 4. Start the server and expose it

```bash
npm run dev
```

The plugin template listens on port `6067` by default. Expose it with a tunnel, for example `ngrok http 6067`, then update **all URLs** in the plugin settings in the Developer Console to the tunnel URL.

!!! note
    The plugin `dev` script rebuilds and starts the server once. Restart it after changing code.

## 5. Install and test

1. Open the App Connect extension and connect to a connector as an admin user.
2. Open the **Admin** tab and install the plugin.
3. Make or receive a test call and log it. The plugin runs according to its `supportedLogTypes`.

See [Registration flow](manifest.md#registration-flow) for what happens during install, and [Server endpoints](endpoints.md) for the request and response contracts.

## Next steps

- [Manifest and configuration](manifest.md)
- [Server endpoints](endpoints.md)
- [User OAuth](oauth.md)
- [Licensing and pricing](licensing.md)
