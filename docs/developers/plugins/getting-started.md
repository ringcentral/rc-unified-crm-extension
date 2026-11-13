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
- A public HTTPS tunnel when the Core server runs in production, or when it cannot reach the local plugin directly

## Plugin server network policy

The network policy is selected by the **Core server's** `NODE_ENV`, not the plugin server's environment or catalog visibility:

| Core environment | Plugin server URLs |
| --- | --- |
| Exactly `NODE_ENV=production` | Absolute HTTPS URLs resolving exclusively to public Internet unicast addresses. |
| Any other value, including `development`, `test`, `staging` or an unset variable | Absolute HTTP or HTTPS URLs; localhost and private-network destinations are allowed for local testing. |

All environments reject malformed URLs, unsupported protocols and embedded URL credentials. HTTPS certificate verification remains enabled. Set `NODE_ENV=production` explicitly in production **before starting Core**; an absent value does not enable production network restrictions. The connector deployment environment template includes this setting.

The same policy applies to registration, processing, token synchronization and license checks, including endpoints retained in old installation snapshots. When both Core and the plugin run locally, start Core with `NODE_ENV=development` and configure the plugin URLs with the local host and port. A production Core still requires a public HTTPS tunnel to reach a developer's plugin. `localhost` always refers to the machine running Core.

Each request retains the selected policy for its connection and redirects. The transport uses the checked DNS addresses for the connection, supports IPv4 and IPv6, and does not route through ambient HTTP proxies or alternate transports. Redirect method/body behavior and the HTTP client's existing credential stripping remain intact; callbacks do not restore removed credentials. No new application timeout or port-443-only restriction is imposed.

`private` and `shared` describe catalog visibility; their server URLs follow the same network policy. Browser pricing, purchase and subscription links keep their separate [licensing URL contract](licensing.md). A rejected snapshot update retains the previous snapshot, and every invocation is checked again.

Verification: `packages/core/test/lib/pluginHttp.test.ts`, `packages/core/test/handlers/plugin.test.ts`, and `packages/core/test/handlers/log.test.ts`. Review the production plugin DNS/redirect paths and Node address-family behavior before rollout. The address classification follows [IANA IPv6 allocation](https://www.iana.org/assignments/ipv6-address-space/) and also excludes [Azure's virtual platform address](https://learn.microsoft.com/en-us/azure/virtual-network/what-is-ip-address-168-63-129-16).

## 1. Register a plugin profile

Open the [Developer Console](https://appconnect.labs.ringcentral.com/console), create a plugin, and note its secret key from the plugin's **Quick setup** section. Configure the plugin's URLs later, once the plugin server is reachable from Core.

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

The plugin template listens on port `6067` by default. If Core also runs locally with `NODE_ENV=development`, use a local address reachable from Core, such as `http://localhost:6067`, for the configured plugin URLs, retaining each endpoint's path. When Core runs in production or on another machine without direct access, expose the plugin with a public HTTPS tunnel, for example `ngrok http 6067`, and update **all configured URLs** in the Developer Console to its HTTPS address.

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
