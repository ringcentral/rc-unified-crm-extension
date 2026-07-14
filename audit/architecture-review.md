# Architecture Review

Audit date: July 13, 2026

## Current Architecture

The repository contains:
- Root App Connect server and connector implementations under `src/`.
- `@app-connect/core` workspace under `packages/core/`.
- CLI, connector template, plugin template, MCP UI, and MkDocs site.
- Sequelize models for app state, DynamoDB/Dynamoose models for some cache/config paths, and external CRM/RingCentral integrations.

## Strengths

- Connector abstraction gives a common shape for many CRM integrations.
- Core package has dedicated docs for handlers, models, routes, and MCP.
- MCP implementation has a documented README and focused tests.
- CI runs typecheck, core typecheck, coverage, and E2E in the main `tests.yml` workflow.
- The codebase already uses Nock/Jest mocks heavily instead of live services.

## Architecture Issues

### ARCH-01: Authorization is a route-level convention, not an architectural invariant

- Severity: High
- Evidence: Some admin routes call `validateAdminRole`; admin report and admin OAuth callback routes do not.
- Impact: New routes can accidentally expose admin behavior by omitting the check.
- Recommendation: Introduce guard middleware and route grouping:
  - `requireAppJwt`
  - `requireRcAccessToken`
  - `requireRcAdmin`
  - `requireSameRcAccount`
  - `requireMcpBearerBoundSession`

### ARCH-02: Credential storage is spread across models and handlers

- Severity: High
- Evidence: Tokens live in `UserModel`, `AdminConfigModel`, `AccountDataModel`, `LlmSessionModel`, managed auth records, and plugin data.
- Impact: Encryption, rotation, redaction, and access policy are inconsistent.
- Recommendation: Create a credential service with typed secret classes, envelope encryption, audit logging, rotation support, and redaction-aware serialization.

### ARCH-03: Connector URL policy is not centralized

- Severity: High
- Evidence: Insightly, Bullhorn, proxy connectors, plugin endpoints, and OAuth callbacks accept or use dynamic URLs.
- Impact: SSRF and credential forwarding bugs recur per connector.
- Recommendation: Add a shared URL policy service:
  - scheme allowlist
  - hostname allowlist per connector
  - DNS/IP private range blocking
  - max redirects
  - request timeout
  - outbound audit event

### ARCH-04: Root app and core workspace overlap

- Severity: Medium
- Evidence: Root `src/index.ts` and `packages/core/index.ts` both define server routes and plugin-like behavior.
- Impact: Behavior can diverge and tests can miss one surface.
- Recommendation: Move all route behavior into core route modules and keep root as composition/registration only.

### ARCH-05: Large connector modules reduce cohesion

- Severity: Medium
- Evidence: Bullhorn and NetSuite files exceed 2,400 lines each.
- Impact: Query construction, auth refresh, note formatting, and appointment logic are difficult to reason about independently.
- Recommendation: Split connectors by capability and share a typed connector SDK.

### ARCH-06: Database migrations are code-driven and partially raw SQL

- Severity: Medium
- Evidence: `packages/core/lib/migrateCallLogsSchema.ts` uses raw SQL migration logic; `dbAccessor` handlers execute arbitrary SQL.
- Impact: Operational changes are hard to audit and can drift across deployments.
- Recommendation: Adopt a migration tool with reviewed migration files and remove raw SQL Lambda utilities.

### ARCH-07: MCP session binding crosses RingCentral and CRM identities

- Severity: Medium
- Evidence: MCP handler caches `rcExtensionId`, then maps it to App Connect CRM JWT.
- Impact: Identity binding is complex and currently easy to bypass if session ids leak.
- Recommendation: Make MCP session state first-class:
  - server-generated session ids
  - token-bound cache entries
  - explicit RingCentral-to-CRM account mapping
  - short TTL and revocation path

### ARCH-08: Documentation and OpenAPI are not clearly tied to route guards

- Severity: Low
- Evidence: `docs/developers/crm-server-openapi.json` exists, but route auth policy is enforced in code, not generated from spec.
- Impact: API documentation can drift from actual security requirements.
- Recommendation: Generate route docs from typed route declarations that include auth, scopes, input schema, and response schema.

### ARCH-09: Ownership checks are not modeled as a shared domain service

- Severity: High
- Evidence: Plugin license, preload/user settings, proxy connector lookup, and call-log lookup each accept resource/account identifiers from request data.
- Impact: Each feature must remember to bind supplied identifiers to the authenticated RingCentral/App Connect identity. This produced multiple IDOR-style findings.
- Recommendation: Add a shared ownership service that resolves and enforces ownership for `rcAccountId`, `rcExtensionId`, `proxyId`, `callLogId/sessionId`, plugin account data, and admin settings.

### ARCH-10: Plugin/media execution is not isolated from core API trust boundaries

- Severity: Medium
- Evidence: The Google Drive plugin accepts request-body media URLs and uploads downloaded content to a third-party account; Clio message logging downloads attachment URIs from log payloads.
- Impact: Plugin convenience paths inherit full server egress and memory privileges.
- Recommendation: Route all plugin and connector media downloads through a media service with host allowlists, size caps, streaming, content-type checks, and audit logs.

## Suggested Target Architecture

1. Route layer:
   - Thin Express routers per domain.
   - Declarative route metadata: method, path, auth policy, input schema, output schema, rate limit.

2. Auth layer:
   - App JWT verification with issuer/audience.
   - RingCentral token validation and admin role checks as middleware.
   - OAuth state store with nonce, flow owner, account, and expiry.

3. Connector layer:
   - Typed connector capability modules.
   - Shared HTTP client and URL policy.
   - Query builder/escaping helpers for CRM query languages.
   - Media download/upload service for CRM attachments and recordings.

4. Secret layer:
   - One credential service for user tokens, admin tokens, plugin tokens, and managed auth values.
   - Envelope encryption and redaction-safe logging.

5. Observability:
   - Structured logs with automatic redaction.
   - Security audit events for admin actions, OAuth callbacks, credential writes, SSRF-blocked requests, and authorization failures.

6. Data layer:
   - Formal migrations.
   - Remove deployed raw SQL helpers.
   - Add indexes and TTLs for cache/session tables.
   - Store authenticated owner keys on resources that are later read or updated by object id/session id.

## Immediate Architecture Improvements

- Create `packages/core/routes/adminReports.ts` and enforce `requireRcAdmin`.
- Create `packages/core/security/urlPolicy.ts` and use it in Insightly, Bullhorn, proxy OAuth, plugin endpoint calls, and managed OAuth.
- Create `packages/core/security/ownership.ts` for account/extension/proxy/call-log/plugin ownership checks.
- Create `packages/core/media/mediaFetcher.ts` for bounded, policy-checked media retrieval.
- Create `packages/core/security/credentials.ts` and migrate `encode.ts` usage.
- Create `packages/core/security/oauthState.ts` for app OAuth and RingCentral admin OAuth callbacks.
- Add `packages/core/security/rateLimit.ts` and apply to unauthenticated routes.
