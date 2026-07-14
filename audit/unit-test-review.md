# Unit Test Review

Audit date: July 13, 2026

## Summary

The repository has a substantial test suite: 112 test files under `tests/` and `packages/core/test/`. Tests cover routes, handlers, connectors, MCP tools, models, and E2E smoke flows. The main gap is not volume; it is missing negative security assertions for admin-only routes, SSRF defenses, OAuth state binding, and connector query escaping.

No coverage summary existed locally at audit time. `coverage/` and `packages/core/coverage/` were absent. Root Jest coverage ignores `/packages/`, while the core package collects coverage separately.

## Existing Coverage Estimate By Module

| Area | Evidence | Estimated quality |
|---|---|---|
| Core handlers | Many files under `packages/core/test/handlers` | Good, but missing security negative tests |
| Core routes | `coreRouterBroadRoutes`, focused route tests | Medium, some tests assert vulnerable behavior |
| Connectors | Large integration suites under `tests/connectors` | Good breadth, uneven injection/SSRF coverage |
| MCP tools | Focused tests under `packages/core/test/mcp` | Good functional coverage, missing cached-session auth negative test |
| Models | Sequelize and Dynamo model tests | Good |
| Root routes/plugins | Several integration tests | Medium |
| CI/E2E | Smoke tests present | Medium |
| Security properties | Scattered | Weak |

## Key Test Gaps

### TEST-01: Admin report routes need negative authorization tests

- Severity: High
- File: [packages/core/test/routes/coreRouterBroadRoutes.test.ts](/Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension/packages/core/test/routes/coreRouterBroadRoutes.test.ts:732)
- Gap: Current tests assert `/ringcentral/admin/report` and `/ringcentral/admin/userReport` succeed with normal auth query data.
- Add tests:
  - Non-admin CRM JWT returns 403.
  - Missing `rcAccessToken` returns 401/403.
  - Admin token account mismatch returns 403.
  - Admin token same account succeeds.

Example test:

```ts
test('GET /ringcentral/admin/report rejects non-admin CRM JWT', async () => {
  adminCore.validateAdminRole.mockResolvedValue({ isValidated: false, rcAccountId: 'rc-account-1' });

  const res = await request(app)
    .get('/ringcentral/admin/report')
    .query(authQuery())
    .set('X-RC-Access-Token', 'non-admin-rc-token');

  expect(res.status).toBe(403);
  expect(adminCore.getAdminReport).not.toHaveBeenCalled();
});
```

### TEST-02: RingCentral admin OAuth callback needs state and role tests

- Severity: High
- File: [packages/core/test/routes/coreRouterBroadRoutes.test.ts](/Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension/packages/core/test/routes/coreRouterBroadRoutes.test.ts:734)
- Gap: Existing test expects the callback to succeed with normal auth. It should require server-side state and admin validation.
- Add tests:
  - Missing state fails.
  - Expired state fails.
  - Non-admin state fails.
  - State account mismatch fails.
  - Valid admin state stores tokens.

### TEST-03: Insightly API-key login SSRF defense

- Severity: High
- Files: [src/connectors/insightly/index.ts](/Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension/src/connectors/insightly/index.ts:28), `tests/connectors/insightly.int.test.ts`
- Gap: Tests should prove private/loopback URLs are rejected before `axios.get`.

Example test:

```ts
test('rejects Insightly apiUrl outside allowlist', async () => {
  const result = await insightly.getUserInfo({
    authHeader: 'Basic abc',
    additionalInfo: { apiUrl: 'http://127.0.0.1:8080' }
  });

  expect(result.successful).toBe(false);
  expect(axios.get).not.toHaveBeenCalled();
});
```

### TEST-04: OAuth callback must reject callback-supplied tokenUrl overrides

- Severity: High
- Files: [packages/core/handlers/auth.ts](/Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension/packages/core/handlers/auth.ts:30), [src/connectors/bullhorn/index.ts](/Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension/src/connectors/bullhorn/index.ts:96), [packages/core/connector/proxy/index.ts](/Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension/packages/core/connector/proxy/index.ts:57)
- Gap: No test proves untrusted `tokenUrl` cannot override configured OAuth endpoints.
- Add tests using Nock to assert no request is made to attacker-controlled token endpoints.

### TEST-05: NetSuite SuiteQL escaping and validation

- Severity: Medium
- File: [src/connectors/netsuite/index.ts](/Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension/src/connectors/netsuite/index.ts:1862)
- Gap: Existing NetSuite tests exercise many query branches but do not assert quote escaping for `phoneNumber` with `overridingFormat`.
- Add tests:
  - Reject `phoneNumber` containing `'`.
  - Verify generated SuiteQL cannot break out of string literal.

### TEST-06: MCP cached session must validate current bearer token

- Severity: High
- File: [packages/core/test/mcp/mcpHandlerMore.test.ts](/Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension/packages/core/test/mcp/mcpHandlerMore.test.ts:1)
- Gap: Add a test with cached `openaiSessionId` and invalid RingCentral bearer token. Expected result should be OAuth/token error, not injected CRM JWT.

### TEST-07: Plugin license status must bind to authenticated account

- Severity: High
- File: [packages/core/test/routes/pluginRoutes.test.ts](/Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension/packages/core/test/routes/pluginRoutes.test.ts:134)
- Gap: Existing tests validate response shape, but not cross-account rejection.
- Add tests:
  - JWT user in account A requests `rcAccountId=B`; handler must reject or ignore B.

### TEST-08: Async plugin callback signature verification

- Severity: Medium
- File: [packages/core/test/handlers/log.test.ts](/Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension/packages/core/test/handlers/log.test.ts:1841)
- Gap: Current tests cover task missing/success/failure/expiry. Add tests for invalid/missing callback signature after implementing signing.

### TEST-09: Coverage thresholds are absent

- Severity: Medium
- Files: [jest.config.ts](/Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension/jest.config.ts:9), [packages/core/jest.config.ts](/Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension/packages/core/jest.config.ts:16)
- Gap: No `coverageThreshold` exists.
- Recommendation: Add module-level thresholds after establishing current baseline, then enforce changed-file coverage in CI.

### TEST-10: Pipedrive and Clio OAuth hostname allowlists are untested

- Severity: High
- Files: [src/connectors/pipedrive/index.ts](/Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension/src/connectors/pipedrive/index.ts:32), [src/connectors/clio/index.ts](/Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension/src/connectors/clio/index.ts:72)
- Gap: Add tests proving OAuth callback state cannot persist or call arbitrary hostnames and that valid regional Clio/Pipedrive domains still work.

### TEST-11: Media download URL policy needs connector/plugin tests

- Severity: High
- Files: [src/plugins/googleDrivePlugin.ts](/Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension/src/plugins/googleDrivePlugin.ts:146), [src/connectors/clio/index.ts](/Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension/src/connectors/clio/index.ts:1403)
- Gap: Add tests that reject `http://127.0.0.1`, link-local metadata IPs, unexpected hostnames, oversized responses, missing content length, and token-in-query URLs.

### TEST-12: Proxy connector ownership and egress policy are untested

- Severity: High
- Files: [packages/core/models/dynamo/connectorSchema.ts](/Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension/packages/core/models/dynamo/connectorSchema.ts:129), [packages/core/connector/proxy/engine.ts](/Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension/packages/core/connector/proxy/engine.ts:122)
- Gap: Add tests proving a user in account A cannot load account B's `proxyId`, and that proxy operations reject disallowed absolute URLs.

### TEST-13: Call-log object ownership regression tests are missing

- Severity: High
- Files: [packages/core/index.ts](/Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension/packages/core/index.ts:2144), [packages/core/handlers/log.ts](/Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension/packages/core/handlers/log.ts:729)
- Gap: Add negative tests for `GET /callLog` and `PATCH /callLog` where the JWT belongs to one user but the supplied `hashedExtensionId` or legacy `extensionNumber` points to another user's persisted call log.

### TEST-14: Output encoding tests are missing for HTML call-log format

- Severity: Medium
- File: [packages/core/lib/callLogComposer.ts](/Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension/packages/core/lib/callLogComposer.ts:147)
- Gap: Add unit tests for notes, subject, AI notes, transcripts, RingSense data, and recording links containing `<script>`, quotes, and `javascript:` URLs.

### TEST-15: Query-builder escaping tests are incomplete

- Severity: Medium
- Files: [src/connectors/bullhorn/index.ts](/Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension/src/connectors/bullhorn/index.ts:920), [src/plugins/googleDrivePlugin.ts](/Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension/src/plugins/googleDrivePlugin.ts:63)
- Gap: Add tests for Bullhorn contact-name DSL escaping and Google Drive folder query escaping.

## Generated Test Plan

1. Add `packages/core/test/routes/adminReportAuthz.test.ts` for SEC-01, SEC-02, SEC-03.
2. Add `packages/core/test/routes/pluginLicenseAuthz.test.ts` for SEC-08.
3. Add `packages/core/test/mcp/mcpSessionBinding.test.ts` for SEC-07.
4. Add connector-focused tests:
   - `tests/connectors/insightlySecurity.int.test.ts`
   - `tests/connectors/bullhornOAuthSecurity.int.test.ts`
   - `tests/connectors/pipedriveOAuthSecurity.int.test.ts`
   - `tests/connectors/clioSecurity.int.test.ts`
   - `tests/connectors/netsuiteQuerySecurity.int.test.ts`
5. Add plugin/proxy tests:
   - `tests/googleDrivePluginSecurity.int.test.ts`
   - `packages/core/test/connector/proxySecurity.test.ts`
6. Add `packages/core/test/routes/callLogOwnership.test.ts`.
7. Add `packages/core/test/lib/callLogComposerEncoding.test.ts`.
8. Add crypto migration tests for AES-GCM or KMS envelope records.
9. Add logger redaction tests for URL query strings and nested token fields.

## Commands Not Run During Report Creation

Project tests were not run before report file generation because no source/config/test files were changed and the local root dependency tree is not installed. Verification commands attempted after report generation are listed in the final repository audit report.
