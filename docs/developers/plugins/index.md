---
type: contract
title: App Connect Plugins
description: Overview of App Connect plugins: what they do, when to use them, and how the documentation is organized.
owner: RingCentral
status: proposed
tags: [app-connect, plugins]
---

# App Connect Plugins

!!! info "Connecting a CRM?"
    Use a [connector](../getting-started.md) when App Connect needs to authenticate to a CRM, match contacts, create contacts, or save CRM activity records. Use a plugin when you need to enrich or side-effect the logging workflow around an existing connector.

Plugins run during call, SMS, or fax logging. They can transform logging payloads before the connector receives them, or run background work that should not block CRM logging.

## Plugin types

| Type | Runs | Use it for |
| --- | --- | --- |
| [Synchronous](endpoints.md#synchronous-plugins) | Inline, before the connector saves the activity. | Fast, deterministic payload transformations such as redaction or enrichment. |
| [Asynchronous](endpoints.md#asynchronous-plugins) | After the connector save succeeds, in the background. | Side effects or delayed enrichment such as uploading recordings or generating summaries. |

## Documentation map

| Page | What it covers |
| --- | --- |
| [Getting started](getting-started.md) | Create a plugin profile, scaffold a server, configure its secret key, and install it for testing. |
| [Manifest and configuration](manifest.md) | Manifest fields, custom configuration, and publishing new versions. |
| [Server endpoints](endpoints.md) | Required endpoints, request and response shapes, synchronous and asynchronous behavior. |
| [User OAuth](oauth.md) | Letting users connect a third-party service from the plugin configuration page. |
| [Licensing and pricing](licensing.md) | License checks, paid listings, and refusing service to unlicensed accounts. |

Implementing the server in another programming language? Use the [Plugin server API reference](../plugin-server-api/index.md) as the language-neutral contract for requests, responses, authentication, and async callbacks, or [download the OpenAPI specification](../downloads/plugin-server-openapi.json) directly.
