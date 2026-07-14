# Executive Summary

Audit date: July 13, 2026

Overall Score: 49/100

Security Score: 34/100

Code Quality Score: 61/100

Performance Score: 61/100

Maintainability Score: 56/100

Test Coverage Score: 62/100

Technical Debt Score: 44/100

Risk Level: High

The repository has broad functionality and substantial tests, but high-risk authorization, OAuth/SSRF, account-binding, and plugin media-fetch issues exist in production route paths. The most urgent problems are missing RingCentral admin checks, untrusted OAuth/API/media URLs, unscoped connector/call-log lookups, weak credential storage, and query-string token handling.

## Scope

- 722 tracked files reviewed/inventoried.
- Approximately 203,565 tracked lines including docs and assets metadata.
- 696 files under main source/docs/test/CI paths.
- 285 TypeScript files and 148 Markdown files under the main paths.
- `npm audit` was confirmed for the locked MCP UI package. Root/core audit could not run deterministically because root `package-lock.json` is intentionally absent.

## Category Counts

| Category | Critical | High | Medium | Low |
|---|---:|---:|---:|---:|
| Security | 0 | 16 | 16 | 4 |
| Code Quality | 0 | 3 | 10 | 4 |
| Performance | 0 | 1 | 6 | 2 |
| Unit Tests | 0 | 10 | 5 | 0 |
| API Review | 0 | 11 | 9 | 2 |
| Database | 0 | 1 | 2 | 1 |
| Dependencies | 0 | 4 | 3 | 2 |
| CI/CD | 0 | 1 | 2 | 2 |
| Architecture | 0 | 4 | 5 | 1 |
| Documentation | 0 | 0 | 2 | 3 |

## Top 20 Issues

1. High: Non-admin CRM users can read account-wide RingCentral admin reports. See `SEC-01`.
2. High: Non-admin CRM users can query another RingCentral extension's report. See `SEC-02`.
3. High: Non-admin users can overwrite stored RingCentral admin OAuth tokens. See `SEC-03`.
4. High: Insightly API-key login allows unauthenticated SSRF to caller-controlled URLs. See `SEC-04`.
5. High: Bullhorn OAuth callback trusts caller-supplied token and API URLs. See `SEC-05`.
6. High: Pipedrive OAuth callback can persist arbitrary hostname for later bearer-token calls. See `SEC-24`.
7. High: Clio OAuth callback sends bearer tokens to caller-controlled hostnames. See `SEC-25`.
8. High: Clio message logging can SSRF via caller-supplied attachment URIs. See `SEC-26`.
9. High: Google Drive plugin can SSRF and exfiltrate recording data via attacker-selected URLs. See `SEC-27`.
10. High: Proxy connector loads private connector config by unscoped `proxyId`. See `SEC-28`.
11. High: Call-log lookup/update trust caller-supplied identity filters. See `SEC-29`.
12. High: Proxy OAuth connector allows token URL override. See `SEC-06`.
13. High: MCP cached session can bypass live bearer-token validation. See `SEC-07`.
14. High: Plugin license status lookup is not bound to authenticated account. See `SEC-08`.
15. High: Weak deterministic encryption and plaintext token storage. See `SEC-09`.
16. High: Deployed/template `dbAccessor` executes arbitrary SQL if invoked. See `SEC-10`.
17. Medium: OAuth callback trusts query `rcAccountId` for managed OAuth binding. See `SEC-30`.
18. Medium: Bullhorn contact-name search builds DSL from unescaped input. See `SEC-32`.
19. High: MCP UI dependency tree has high npm advisories in `vite`, `rollup`, `picomatch`, and `lodash`.
20. Medium: HTML call-log composer injects unescaped CRM log content. See `SEC-34`.

## Quick Wins

- Add admin guard middleware to `/ringcentral/admin/report`, `/ringcentral/admin/userReport`, and `/ringcentral/oauth/callback`.
- Reject query-string `jwtToken` and `rcAccessToken` in new flows; start deprecation warnings for legacy routes.
- Add URL allowlists for Insightly, Bullhorn, Pipedrive, Clio, Google Drive media, and proxy connectors.
- Remove `tokenUrl` callback overrides from Bullhorn and proxy OAuth flows.
- Scope `proxyId`, call-log lookup keys, and admin settings keys to authenticated account/user context.
- Replace `shortid` with `crypto.randomUUID()` where ids do not need sortability.
- Mask secrets in CLI env output.
- Add request timeouts to a shared Axios client.
- Update MCP UI vulnerable dependencies and rebuild the UI.

## Technical Debt

- `packages/core/index.ts` is a 3,357-line route monolith.
- Large connectors mix auth, query construction, API calls, and response formatting.
- Root and core route surfaces overlap.
- Credential handling is spread across multiple models and handlers.
- Tests are broad but some assert insecure behavior.
- Dynamic connector/plugin URLs are handled per feature instead of through one egress policy.
- Root dependency audit is limited by missing lockfile.

## Recommended Refactoring

1. Introduce auth guard middleware and apply it to all routes.
2. Split core router into domain routers.
3. Add schema validation for every route input.
4. Create shared URL policy and HTTP client for CRM, media, plugin, and proxy egress.
5. Create a credential service with envelope encryption.
6. Split large connector modules by capability.
7. Replace raw SQL utilities with formal migrations/admin-only tools.

## Suggested Architecture Improvements

- Declarative route registry with auth policy, rate limit, request schema, and response schema.
- Server-side OAuth state store for every OAuth callback.
- Central RingCentral account/extension identity binding service.
- Central connector outbound HTTP policy.
- Unified audit logging for credential writes, admin actions, OAuth callbacks, and blocked SSRF.
- Authenticated ownership service for account, extension, call-log, proxy connector, and plugin resources.
- Combined coverage reporting across root and core.

## API Review

- Reviewed REST routes in root `src/index.ts` and core `packages/core/index.ts`; no GraphQL API was found.
- High-risk API issues are broken authorization and object ownership in admin reports, RingCentral admin OAuth, plugin license status, preload/user settings, proxy connector login, and call-log lookup/update.
- Validation is ad hoc: handlers read `req.query` and `req.body` directly, and route-level schema validation is missing.
- Status-code handling is inconsistent; many auth/validation failures return 400 instead of 401/403.
- Pagination/range controls are weak on report and lookup APIs; date ranges and fan-out inputs need explicit caps.
- OpenAPI documentation exists at `docs/developers/crm-server-openapi.json`, but auth policy is not generated from the route implementation and can drift.

## Database Review

- Confirmed raw SQL execution risk in `dbAccessor` deployment/template handlers. See `SEC-10`.
- Confirmed owner-scope gaps in persisted call-log lookup keys. See `SEC-29`.
- No ORM-level N+1 query bug was confirmed in Sequelize routes.
- Token and credential columns are stored as plain strings or weakly encrypted helper output; this is a data-layer security risk. See `SEC-09`.
- Recommended database work: add owner/account keys to object lookups, create reviewed migrations, remove SQL helper Lambdas, and index ownership plus session lookup paths after the access model is fixed.

## CI/CD Review

- GitHub Actions workflows were reviewed; no Jenkins, GitLab CI, Azure Pipelines, Dockerfiles, or Compose files were found.
- `tests.yml` runs install, server typecheck, core typecheck, coverage tests, Codecov upload, and E2E tests.
- Gaps: no CodeQL/Semgrep/SAST workflow, no dependency audit/dependency-review gate, no secret scanning workflow, and no container/image scanning target because no Docker image is present.
- `github-pages.yml` installs MkDocs packages without pins, reducing docs-build reproducibility.
- `release.yml` still uses `actions/checkout@v2` and `actions/setup-node@v2`; upgrade to current pinned major versions.

## Documentation Review

- Reviewed README, MkDocs navigation, developer docs, OpenAPI JSON, connector docs, plugin docs, and MCP README.
- Strengths: docs cover connector interfaces, manifests, proxy connectors, plugin registration, server-side logging, deployment env vars, and MCP auth flow.
- Gaps: docs do not describe the required auth/ownership policy for sensitive routes, URL allowlist/SSRF requirements for connectors/plugins, credential encryption expectations, or the deprecation plan for query-string tokens.
- The MCP README documents cached `rcExtensionId` behavior; update it after fixing session binding.

## Static Analysis Summary

- Performed static-analysis-style review with `rg`, route tracing, dependency audit, TypeScript/Jest config inspection, and deep multi-agent discovery.
- Confirmed classes include broken access control, SSRF, injection, weak cryptography, sensitive logging, dependency advisories, missing rate limiting, and output encoding defects.
- No confirmed request-handler OS command injection, XXE exploitation, committed private keys, cookie-session CSRF, Maven/Gradle/Go/Cargo vulnerabilities, or Docker image issues were found.
- ESLint config exists, but no lint command was confirmed in CI. Add `npm run lint` or equivalent if the repository wants Sonar/Semgrep-style hygiene gates.

## Security Roadmap

### 0-7 days
- Patch SEC-01, SEC-02, SEC-03, SEC-04, SEC-05, SEC-06, SEC-24, SEC-25, SEC-26, SEC-27, SEC-28, and SEC-29.
- Add tests proving the patched authorization and URL-policy behavior.
- Rotate any admin/plugin/user tokens if production logs or callbacks may have leaked them.

### 2-4 weeks
- Migrate query-token flows to headers or one-time state.
- Implement AES-GCM/KMS credential storage migration.
- Sign async plugin callbacks.
- Add rate limiting.
- Bind managed OAuth, plugin registration, plugin license, and user settings to authenticated account context.
- Update dependency tree and add dependency review CI.

### 1-2 quarters
- Route registry and auth middleware architecture.
- Connector URL policy across all CRMs.
- Formal database migrations and removal of SQL helper Lambdas.
- Combined coverage and security regression suite.

## Testing Roadmap

- Add route-level authorization tests for admin reports, admin OAuth, plugin license status, preload settings, proxy connector login, and call-log lookup/update.
- Add SSRF tests for Insightly, Bullhorn, Pipedrive, Clio, Google Drive media, and proxy OAuth.
- Add injection escaping tests for NetSuite, Bullhorn DSL, Google Drive queries, and HTML call-log composition.
- Add MCP session binding tests with cached session id and invalid bearer token.
- Add logger redaction tests.
- Add coverage thresholds after capturing a baseline.

## Performance Roadmap

- Add shared Axios timeout/retry policy.
- Cap report date ranges and async large reports.
- Cap NetSuite overriding format fan-out.
- Cap Google Drive and Clio media downloads and upload buffers.
- Route-scope body parser limits.
- Add cache TTL/normalization for contact lookup.

## TODO Checklist

- [ ] Require RingCentral admin validation for admin report routes.
- [ ] Require server-side OAuth state for RingCentral admin OAuth callback.
- [ ] Bind plugin license status to authenticated account.
- [ ] Remove unauthenticated account-hash preload lookup.
- [ ] Add URL allowlists and private-network blocking across CRM, media, plugin, and proxy egress.
- [ ] Remove OAuth token URL callback overrides.
- [ ] Scope `proxyId` and call-log lookups to authenticated owners.
- [ ] Bind OAuth callback account context to server-side state.
- [ ] Escape Bullhorn DSL, Google Drive query strings, and HTML call-log output.
- [ ] Fix MCP cached session binding.
- [ ] Replace AES-CBC helper with authenticated encryption.
- [ ] Encrypt stored user/admin/plugin tokens.
- [ ] Remove or lock down `dbAccessor`.
- [ ] Deprecate query-string tokens.
- [ ] Sign async plugin callbacks.
- [ ] Update MCP UI dependencies.
- [ ] Add missing security tests.
- [ ] Add CI dependency scanning and coverage thresholds.

## Prioritized Remediation Plan

1. PR 1: Admin authorization fixes and tests for SEC-01, SEC-02, SEC-03.
2. PR 2: URL policy and OAuth callback hardening for SEC-04, SEC-05, SEC-06, SEC-24, SEC-25.
3. PR 3: Media/plugin/proxy egress hardening for SEC-26, SEC-27, SEC-28, SEC-31.
4. PR 4: Account and object binding fixes for plugin license, preload/user settings, and call logs.
5. PR 5: MCP session binding fix and tests.
6. PR 6: Query/HTML injection validation for NetSuite, Bullhorn, Google Drive, and call-log composer.
7. PR 7: Remove/lock down `dbAccessor`.
8. PR 8: Credential encryption migration.
9. PR 9: Query token deprecation and short-lived state.
10. PR 10: Dependency and CI hardening.

## Pull Request Recommendations

- Keep security fixes isolated by behavior category so each can be reviewed and rolled back independently.
- Each PR should include negative tests proving the old exploit path fails.
- For encryption migration, ship backwards-compatible read and new-write first, then run migration, then remove legacy decrypt.
- For dependency updates, include MCP UI build artifacts only if that is the established project workflow.

## Files Needing Immediate Attention

- [packages/core/index.ts](/Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension/packages/core/index.ts:2721)
- [packages/core/handlers/admin.ts](/Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension/packages/core/handlers/admin.ts:114)
- [packages/core/handlers/auth.ts](/Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension/packages/core/handlers/auth.ts:30)
- [packages/core/mcp/mcpHandler.ts](/Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension/packages/core/mcp/mcpHandler.ts:211)
- [packages/core/lib/encode.ts](/Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension/packages/core/lib/encode.ts:3)
- [src/connectors/insightly/index.ts](/Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension/src/connectors/insightly/index.ts:28)
- [src/connectors/bullhorn/index.ts](/Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension/src/connectors/bullhorn/index.ts:96)
- [src/connectors/pipedrive/index.ts](/Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension/src/connectors/pipedrive/index.ts:32)
- [src/connectors/clio/index.ts](/Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension/src/connectors/clio/index.ts:72)
- [src/plugins/googleDrivePlugin.ts](/Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension/src/plugins/googleDrivePlugin.ts:146)
- [packages/core/connector/proxy/engine.ts](/Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension/packages/core/connector/proxy/engine.ts:122)
- [packages/core/lib/callLogLookup.ts](/Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension/packages/core/lib/callLogLookup.ts:44)
- [packages/core/lib/callLogComposer.ts](/Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension/packages/core/lib/callLogComposer.ts:147)
- [src/connectors/netsuite/index.ts](/Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension/src/connectors/netsuite/index.ts:353)
- [src/dbAccessor.ts](/Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension/src/dbAccessor.ts:11)
- [packages/core/mcp/ui/package.json](/Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension/packages/core/mcp/ui/package.json:1)

## Estimated Effort

Small:
- Mask CLI secrets.
- Replace `shortid`.
- Add dependency audit workflow for MCP UI.
- Add request timeouts to shared HTTP wrapper if one is introduced narrowly.

Medium:
- Admin authorization route patches.
- Plugin license account binding.
- Preload settings auth fix.
- NetSuite/Bullhorn escaping tests and validation.
- Pipedrive/Clio hostname allowlists.
- Google Drive and Clio media URL policy.
- Proxy connector ownership checks.
- Call-log owner binding.
- MCP session cache binding.

Large:
- Credential encryption migration.
- Query-token deprecation across clients.
- Route module split and declarative auth policy.
- Formal migration replacement for raw SQL helpers.

## Verification Commands Run

- `python3 /Users/sushilmall/.codex/plugins/cache/openai-curated-remote/codex-security/0.1.11/scripts/config_preflight.py --profile deep_security_scan --cwd /Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension --runtime-check delegation_available=true --runtime-check goal_tools_available=true --multi-agent-runtime-owner native --multi-agent-runtime-version v1 --multi-agent-runtime-provenance tool-surface --available-plugin-skill security-scan --available-plugin-skill threat-model --available-plugin-skill finding-discovery --available-plugin-skill validation --available-plugin-skill attack-path-analysis`
- `python3 /Users/sushilmall/.codex/plugins/cache/openai-curated-remote/codex-security/0.1.11/scripts/resolve_security_md.py --repo /Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension --scope /Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension --out /private/tmp/codex-security-scans/rc-unified-crm-extension/2558bf60bc4c_20260713114955/artifacts/01_context/security_guidance.md`
- `python3 /Users/sushilmall/.codex/plugins/cache/openai-curated-remote/codex-security/0.1.11/scripts/generate_rank_input.py make-repo-rank-input --repo /Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension --scope /Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension --out /private/tmp/codex-security-scans/rc-unified-crm-extension/2558bf60bc4c_20260713114955/artifacts/02_discovery/rank_input.jsonl`
- `python3 /Users/sushilmall/.codex/plugins/cache/openai-curated-remote/codex-security/0.1.11/scripts/generate_rank_input.py copy-deep-review-input --rank-input /private/tmp/codex-security-scans/rc-unified-crm-extension/2558bf60bc4c_20260713114955/artifacts/02_discovery/rank_input.jsonl --out /private/tmp/codex-security-scans/rc-unified-crm-extension/2558bf60bc4c_20260713114955/artifacts/deep_review_input.jsonl`
- `git status --short`
- `git rev-parse --short=12 HEAD`
- `git ls-files`
- `git ls-files | wc -l`
- `find . -type f | wc -l`
- `find src packages/core packages/cli packages/template packages/plugin-template scripts tests docs .github -type f | wc -l`
- `find tests packages/core/test -type f | sort | wc -l`
- `npm audit --prefix packages/core/mcp/ui --json`
- `npm outdated --json`
- `npm outdated --prefix packages/core/mcp/ui --json`
- `npm audit --json`
- `npm audit --workspace=@app-connect/core --json`
- `npm ls --depth=0 --json`
- `npm ls --workspace=@app-connect/core --depth=0 --json`
- `find .audit -maxdepth 1 -type f -name '*.md' -print | sort`
- `wc -l .audit/*.md`
- `node -e "const fs=require('fs'); const files=['security-report.md','code-review.md','performance-report.md','unit-test-review.md','dependency-report.md','architecture-review.md','repository-audit-report.md']; for (const f of files) { const p='.audit/'+f; const s=fs.statSync(p); if(!s.size) throw new Error(p+' empty'); const text=fs.readFileSync(p,'utf8'); if(!text.startsWith('#')) throw new Error(p+' missing heading'); } console.log('audit reports ok: '+files.length);"`
- `rg -n "Critical \| 0|High \| 16|Medium \| 16|SEC-35|API Review|Database Review|CI/CD Review|Documentation Review|Static Analysis Summary" .audit/repository-audit-report.md .audit/security-report.md`
- Multiple targeted `rg`, `find`, `nl`, and `sed` inspections for routes, handlers, connectors, models, CI, docs, tests, and dependency manifests.

## Skipped Or Inconclusive Commands

- `npm audit --json` and `npm audit --workspace=@app-connect/core --json` did not produce advisories because the root lockfile is absent (`ENOLOCK`). This is consistent with repository instructions that root `package-lock.json` is intentionally ignored.
- `npm ls --depth=0 --json` reported missing dependencies because root `node_modules` is not installed locally.
- Full project verification commands (`npm run typecheck`, `npm run typecheck:core`, `npm test`, `npm run test-coverage`, `npm run test:e2e`) were not run before creating reports because this task did not change source/config/test behavior and local dependencies are not installed.
