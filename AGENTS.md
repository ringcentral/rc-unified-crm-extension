# App Connect Server Agent Rules

This project is `rc-unified-crm-extension/`. It contains the root App Connect Server app and the `@app-connect/core` workspace.

## Existing Project Context

- This repo also contains the MkDocs website. For docs-site redesign work, inspect `mkdocs.yml` and the relevant files under `docs/` before changing content or navigation.

## Test Enforcement

- For any code, route, handler, connector, MCP, model, config, or test change, run the smallest relevant test command before finishing. In PowerShell, use `npm.cmd` and `npx.cmd` when `npm.ps1` or `npx.ps1` is blocked.
- For broad or shared behavior changes, run full verification before handoff:
  - `npm.cmd test`
  - `npm.cmd run test-coverage`
- For changes under `packages/core/`, run focused core tests with:
  - `npm.cmd test --workspace=@app-connect/core -- <test paths> --runInBand`
- For root server, connector, plugin, or `src/index.js` route changes, run focused root tests with:
  - `npm.cmd run test:root -- <test paths> --runInBand`
- If no focused test exists for changed behavior, add or update one in `packages/core/test/` or `tests/`, unless the behavior is explicitly documented as not testable in the final summary.
- Mock external services with Nock, Jest mocks, local SQLite, local DynamoDB, or existing test fixtures. Do not call live RingCentral, CRM, AWS, analytics, or Customer.io services from tests.
- Keep coverage stable or improving for changed areas. CI runs `npm run test-coverage`; do not claim CI-equivalent confidence unless the local equivalent passed or the reason for skipping is stated.
- Final summaries must list the exact verification commands run and any skipped commands with the reason.

## MCP Changes

- Before changing files under `packages/core/mcp/`, read `packages/core/mcp/README.md`.
- If MCP tools, endpoints, auth flow, widget UI, or file layout changes, update `packages/core/mcp/README.md` in the same task.
- For MCP UI component changes, run the relevant UI build/version workflow already used by this project before handoff.
