---
type: contract
title: App Connect Plugin Server API
description: Interactive OpenAPI reference for plugin servers implemented in any programming language.
owner: RingCentral
status: proposed
tags: [app-connect, plugins, api, openapi]
hide:
  - navigation
  - toc
---

# App Connect Plugin Server API

Use this contract to implement an App Connect plugin server in Java, Python, Go, .NET, or any other language that can expose HTTPS and JSON endpoints. It describes the provider-side API that App Connect and its browser client call; the [App Connect server API](server-api.md) documents the opposite boundary.

The paths shown here follow the JavaScript plugin template. A plugin may use different paths because the complete URLs in its Developer Console manifest are authoritative. Request submission is disabled because every plugin server is independently hosted and this documentation does not provide a shared sandbox.

The current protocol does not notify the plugin server when an administrator uninstalls a plugin. App Connect removes its local registration only, so plugin servers need their own retention and stale-account cleanup policy.

[Download the OpenAPI specification](plugin-server-openapi.json){ .md-button }
[Read the plugin guide](plugins/index.md){ .md-button }

<swagger-ui nocache src="./plugin-server-openapi.json"/>

## Verification

The checked-in OpenAPI document is the source of truth for the public provider contract. Contract tests validate its structure, metadata, security boundaries, JavaScript-template route coverage, and shared async callback schemas. The current uninstall boundary is verified by the plugin handler tests: App Connect removes account data without calling the plugin server. Redocly applies the same strict rules used by the App Connect server specifications, and the documentation build verifies both the downloadable artifact and Swagger UI output.

Run `npm run lint:openapi` after changing the contract and `python -m mkdocs build --strict` after changing its page, navigation, or links.
