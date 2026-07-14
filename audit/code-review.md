# Code Review

Audit date: July 13, 2026

## Summary

The repository is functional and has broad test coverage, but its maintainability is constrained by very large route/connector modules, mixed JavaScript and TypeScript conventions, weak central validation, and security-sensitive behavior embedded directly in route handlers. The strongest refactoring opportunities are to centralize authorization, URL validation, credential storage, and connector contracts.

## Findings

### CR-01: Core router is too large and owns too many responsibilities

- Severity: High
- File: [packages/core/index.ts](/Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension/packages/core/index.ts:1)
- Explanation: `packages/core/index.ts` is 3,357 lines and mixes middleware, OAuth, admin, user settings, logging, MCP, CORS, analytics, and route behavior. This makes auth gaps easy to introduce, as seen in several admin-report routes.
- Suggested refactoring: Split into route modules by domain: `adminRoutes`, `authRoutes`, `userRoutes`, `logRoutes`, `pluginRoutes`, `mcpRoutes`. Apply shared route guards at module boundaries.

### CR-02: Connector modules are large and mix API, mapping, auth, and formatting

- Severity: High
- Files: [src/connectors/netsuite/index.ts](/Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension/src/connectors/netsuite/index.ts:1), [src/connectors/bullhorn/index.ts](/Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension/src/connectors/bullhorn/index.ts:1)
- Explanation: NetSuite is 2,464 lines and Bullhorn is 2,429 lines. Each mixes auth, contact lookup, appointments, reports, logging, note formatting, query construction, and error mapping.
- Suggested refactoring: Split each connector into `auth.ts`, `contacts.ts`, `calls.ts`, `messages.ts`, `appointments.ts`, `queries.ts`, and `errors.ts`. Keep only the interface export in `index.ts`.

### CR-03: Authorization logic is duplicated instead of enforced centrally

- Severity: High
- Files: [packages/core/index.ts](/Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension/packages/core/index.ts:537), [packages/core/index.ts](/Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension/packages/core/index.ts:2721)
- Explanation: Some admin routes call `adminCore.validateAdminRole`, but admin report routes and RingCentral admin OAuth callback do not. This is a direct result of per-route ad hoc authorization.
- Suggested refactoring: Create middleware such as `requireCrmUser`, `requireRcUser`, `requireRcAdmin`, and `requireSameAccount`. Use declarative route metadata and tests to prevent unguarded admin routes.

### CR-04: TypeScript strict mode is partially disabled

- Severity: Medium
- File: [tsconfig.base.json](/Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension/tsconfig.base.json:14)
- Explanation: `strict` is true, but `noImplicitAny`, `strictNullChecks`, `strictPropertyInitialization`, and `useUnknownInCatchVariables` are disabled. This hides null and shape bugs in security-sensitive request handling.
- Suggested refactoring: Enable `useUnknownInCatchVariables` first, then `strictNullChecks` module-by-module. Add request DTO types for route inputs.

### CR-05: Many `.ts` files still use CommonJS and `any`

- Severity: Medium
- Files: [packages/core/handlers/log.ts](/Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension/packages/core/handlers/log.ts:1), [packages/core/handlers/plugin.ts](/Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension/packages/core/handlers/plugin.ts:1)
- Explanation: The code uses `// @ts-check`, `require`, and explicit `any` casts in TypeScript files. This weakens type contracts and makes refactors riskier.
- Suggested refactoring: Convert core handlers to typed imports and exported interfaces incrementally. Start with handlers involved in auth and admin flows.

### CR-06: Logger lacks centralized redaction

- Severity: Medium
- File: [packages/core/lib/logger.ts](/Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension/packages/core/lib/logger.ts:82)
- Explanation: `DebugTracer` redacts selected keys, but `logger.error` and `logger.info` can log arbitrary context, URLs, response bodies, and SQL strings. Redaction should be a logger invariant.
- Suggested refactoring: Add recursive redaction to `Logger._formatMessage` or `_log`, and redact query strings from URLs.

### CR-07: Build/deploy scripts use shell commands and fragile command construction

- Severity: Medium
- Files: [scripts/serverless-deploy.ts](/Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension/scripts/serverless-deploy.ts:28), [scripts/run-tests.ts](/Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension/scripts/run-tests.ts:46), [scripts/run-coverage.ts](/Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension/scripts/run-coverage.ts:28)
- Explanation: `serverless-deploy.ts` builds a command path with arguments inside `path.resolve`, which creates a path-like string containing spaces. Test runners use `shell: true`.
- Suggested refactoring: Use `spawn(binaryPath, ['deploy', '--force', '--verbose'], { shell: false })`. Keep shell mode only where required for Windows, and isolate quoting.

### CR-08: Tests encode vulnerable behavior for admin routes

- Severity: Medium
- File: [packages/core/test/routes/coreRouterBroadRoutes.test.ts](/Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension/packages/core/test/routes/coreRouterBroadRoutes.test.ts:732)
- Explanation: Existing tests assert that `/ringcentral/admin/report`, `/ringcentral/admin/userReport`, and `/ringcentral/oauth/callback` succeed with normal auth query data. They should assert admin-only behavior.
- Suggested refactoring: Replace those with negative authorization tests plus positive tests using mocked `validateAdminRole`.

### CR-09: Root and core test coverage are split and easy to misread

- Severity: Medium
- Files: [jest.config.ts](/Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension/jest.config.ts:34), [packages/core/jest.config.ts](/Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension/packages/core/jest.config.ts:37)
- Explanation: Root coverage ignores `/packages/`, while core has separate coverage collection. There is no coverage threshold in either config.
- Suggested refactoring: Publish a combined coverage summary or document the two coverage gates clearly. Add thresholds for changed files.

### CR-10: CLI environment helper can print secrets

- Severity: Low
- File: [packages/cli/src/lib/env.ts](/Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension/packages/cli/src/lib/env.ts:134)
- Explanation: Environment variables are printed partially in overview and fully in `viewAllValues`.
- Suggested refactoring: Mask sensitive keys by default and add an explicit `--show-secrets` option if truly needed.

### CR-11: Console logging remains in production connector paths

- Severity: Low
- Files: [src/connectors/netsuite/index.ts](/Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension/src/connectors/netsuite/index.ts:2169), [src/plugins/googleDrivePlugin.ts](/Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension/src/plugins/googleDrivePlugin.ts:291)
- Explanation: Production code uses `console.log` for payloads, upload names, and errors. These bypass structured logger controls.
- Suggested refactoring: Replace with `logger.debug/info` and redaction-aware context.

### CR-12: Magic timeouts and TTLs are scattered

- Severity: Low
- Files: [packages/core/handlers/log.ts](/Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension/packages/core/handlers/log.ts:48), [packages/core/lib/s3ErrorLogReport.ts](/Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension/packages/core/lib/s3ErrorLogReport.ts:13), [packages/core/mcp/mcpHandler.ts](/Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension/packages/core/mcp/mcpHandler.ts:235)
- Explanation: One-week plugin callback TTL, five-minute presigned URL TTL, and 24-hour MCP cache TTL are embedded directly.
- Suggested refactoring: Move security-relevant TTLs to named config constants with environment validation and documented defaults.

### CR-13: No centralized request validation layer

- Severity: Medium
- Files: [packages/core/index.ts](/Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension/packages/core/index.ts:1331), [packages/core/index.ts](/Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension/packages/core/index.ts:1477)
- Explanation: Route handlers read `req.query` and `req.body` directly. This contributes to URL trust, query injection, and inconsistent error behavior.
- Suggested refactoring: Use a schema validator such as Zod, Joi, or JSON Schema for route inputs. Reject unknown fields for security-sensitive endpoints.

### CR-14: Error handling frequently returns provider error strings directly

- Severity: Low
- Files: [packages/core/index.ts](/Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension/packages/core/index.ts:1023), [packages/core/mcp/mcpHandler.ts](/Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension/packages/core/mcp/mcpHandler.ts:512)
- Explanation: Error messages from exceptions are often surfaced to clients. This can leak provider details, query shape, or internal state.
- Suggested refactoring: Map internal/provider errors to user-safe codes and log full details server-side.

### CR-15: Plugin route does not await async plugin execution

- Severity: Medium
- File: [src/index.ts](/Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension/src/index.ts:364)
- Explanation: `POST /plugin/:pluginId` assigns `result = googleDrivePlugin.uploadToGoogleDrive(...)` and immediately sends it. That returns a pending Promise to Express serialization and lets plugin failures escape route error handling.
- Suggested refactoring: `await` plugin calls, return a typed response shape, and add tests that rejected plugin promises produce a controlled non-200 response.

### CR-16: Ownership-sensitive lookup filters are request DTO fields

- Severity: Medium
- Files: [packages/core/index.ts](/Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension/packages/core/index.ts:2144), [packages/core/lib/callLogLookup.ts](/Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension/packages/core/lib/callLogLookup.ts:44)
- Explanation: Call-log lookup helpers accept `hashedExtensionId` and `extensionNumber` from request data. This keeps ownership logic as a caller contract rather than a server invariant.
- Suggested refactoring: Create an ownership context object from the authenticated user/RingCentral token and pass only that object into lookup helpers.

### CR-17: HTML composition lacks an escaping abstraction

- Severity: Medium
- File: [packages/core/lib/callLogComposer.ts](/Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension/packages/core/lib/callLogComposer.ts:147)
- Explanation: The composer concatenates HTML strings in many branches. Text nodes, attributes, Markdown, and plain text are handled in the same module, making it easy to forget escaping.
- Suggested refactoring: Split HTML, Markdown, and plain-text composers. The HTML composer should expose `text()`, `attr()`, and `safeLink()` helpers and make unescaped insertion hard to express.

### CR-18: Admin-named server logging settings return decoded connector passwords

- Severity: Low
- Files: [packages/core/index.ts](/Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension/packages/core/index.ts:910), [src/connectors/bullhorn/index.ts](/Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension/src/connectors/bullhorn/index.ts:400)
- Explanation: `/admin/serverLoggingSettings` returns decoded `apiPassword` for the authenticated CRM user. This may be intended for an edit form, but returning full stored passwords increases exposure and the route name suggests admin scope that is not enforced.
- Suggested refactoring: Return presence/status flags instead of stored passwords, require re-entry for changes, and rename or guard the route according to intended product scope.

## Positive Observations

- There is substantial existing test coverage across handlers, connectors, MCP tools, and routes.
- External services are commonly mocked with Nock or Jest mocks.
- MCP docs exist and describe auth/tool behavior.
- Several newer admin routes already validate RingCentral admin role correctly; this pattern should be applied consistently.
