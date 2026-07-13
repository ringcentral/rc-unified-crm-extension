---
type: contract
title: App Connect Server API
description: Interactive OpenAPI reference for App Connect server endpoints, authentication, requests, and responses.
owner: RingCentral
status: proposed
tags: [app-connect, api, openapi]
hide:
  - navigation
  - toc
---

# App Connect Server API

Explore the App Connect server endpoints, authentication requirements, request and response schemas, and error responses. Request submission is disabled because this reference describes both hosted and self-managed deployments and does not provide a shared sandbox.

[Download the public OpenAPI specification](crm-server-openapi-public.json){ .md-button }

<swagger-ui nocache src="./crm-server-openapi-public.json"/>

## Verification

Stable HTTP payloads are defined as typed transport contracts in `packages/core/contracts`. The OpenAPI generator derives their schemas and checked examples, then the public-spec generator removes non-public tag groups for this page. During the staged migration, connector-defined payloads that do not yet have transport contracts remain explicitly open in the canonical specification.

Run `npm run generate:openapi` after changing a transport contract, example, route contract, or public-tag policy. CI rejects stale generated files, validates every registered example against its runtime schema, lints both OpenAPI documents, and builds this Swagger page in strict mode.
