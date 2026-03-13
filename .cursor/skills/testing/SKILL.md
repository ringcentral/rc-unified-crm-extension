---
name: testing
description: Governs how to examine, write, fix, and run tests in the rc-unified-crm-extension monorepo. Use when writing new tests, debugging failing tests, examining test coverage, adding tests for new features or connectors, or asking about test conventions, test structure, mocking strategies, or running tests.
---

# Testing Guide

## Project Test Layout

```
rc-unified-crm-extension/
├── packages/core/test/          # Unit tests for @app-connect/core
│   ├── setup.js                 # Syncs SQLite models, silences console, registers testUtils
│   ├── lib/                     # Pure utility tests (jwt, oauth, callLogComposer, util…)
│   ├── handlers/                # Handler tests (auth, contact, log, admin)
│   ├── models/                  # Sequelize model CRUD tests
│   ├── connector/               # Registry + proxy engine tests
│   └── mcp/tools/               # One test file per MCP tool
├── tests/                       # Root integration tests
│   ├── setup.js                 # Syncs SQLite models before all root tests
│   ├── fixtures/connectorMocks.js  # Shared mock data + factory functions for all CRMs
│   ├── platformInfo.json        # CRM platform config used in parameterised tests
│   └── connectors/              # One *.int.test.js per CRM connector
└── packages/template/test/      # Smoke tests for the template package
```

## Running Tests

| Command | Scope |
|---|---|
| `npm test` | All tests (root + core), combined summary |
| `npm run test:root` | Root integration tests only |
| `npm test --workspace=@app-connect/core` | Core unit tests only |
| `npm run test:coverage` | All tests with coverage report |
| `npm run test:watch --workspace=@app-connect/core` | Watch mode for core |

**Environment**: Tests automatically load `packages/core/.env.test` (for core) or `.env.test` at repo root (for integration tests). Never modify production `.env` for tests.

## Test Type Decision

| Test type | File location | File name pattern | When to use |
|---|---|---|---|
| Unit | `packages/core/test/<area>/` | `*.test.js` | Testing a single module in isolation |
| Integration | `tests/connectors/` | `*.int.test.js` | Testing a full CRM connector end-to-end |
| MCP tool | `packages/core/test/mcp/tools/` | `*.test.js` | Testing an MCP tool's `definition` + `execute()` |

## Writing Unit Tests (`packages/core/test/`)

### Template

```js
const moduleUnderTest = require('../../../path/to/module');

// Mock ALL external dependencies at the top
jest.mock('../../../lib/jwt');
jest.mock('../../../models/callLogModel');

describe('Module Name', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('functionName', () => {
    test('should <expected behaviour> when <condition>', async () => {
      // Arrange
      dependency.method.mockReturnValue(value);

      // Act
      const result = await moduleUnderTest.functionName(input);

      // Assert
      expect(result).toEqual(expected);
      expect(dependency.method).toHaveBeenCalledWith(expectedArg);
    });
  });
});
```

### Key conventions

- `jest.mock()` declarations go at the top of the file, before any `require` of the module under test.
- `jest.clearAllMocks()` in `beforeEach` (the jest config also sets `clearMocks: true`, but be explicit).
- Use `// Arrange … // Act … // Assert` comments for non-trivial tests.
- Use `global.testUtils` helpers from `packages/core/test/setup.js`:
  - `createMockUser(overrides)`, `createMockCallLog(overrides)`, `createMockContact(overrides)`
  - `resetConnectorRegistry()`, `createMockConnector(overrides)`
- For tests that need Sequelize models, use the in-memory SQLite pattern:
  ```js
  jest.mock('../../models/sequelize', () => {
    const { Sequelize } = require('sequelize');
    return { sequelize: new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false }) };
  });
  ```
  Then `await Model.sync({ force: true })` in `beforeAll` and `await Model.destroy({ where: {} })` in `afterEach`.

## Writing Integration Tests (`tests/connectors/`)

### Template

```js
const nock = require('nock');
const connector = require('../../src/connectors/<name>');
const { createMockUser, createMockCallLog, … } = require('../fixtures/connectorMocks');

jest.mock('@app-connect/core/lib/jwt', () => ({ decodeJwt: jest.fn().mockReturnValue({ id: 'decoded-user-id' }) }));
jest.mock('@app-connect/core/models/userModel', () => ({ UserModel: { findByPk: jest.fn() } }));

describe('<Name> Connector', () => {
  let mockUser;

  beforeEach(() => {
    nock.cleanAll();
    jest.clearAllMocks();
    mockUser = createMockUser({ platform: '<name>', hostname: 'test.<crm>.com' });
  });

  afterEach(() => { nock.cleanAll(); });

  describe('getAuthType', () => {
    it('should return oauth', () => {
      expect(connector.getAuthType()).toBe('oauth');
    });
  });

  describe('findContact', () => {
    it('should find a contact successfully', async () => {
      // Arrange — nock intercepts the real HTTP call
      nock('https://test.<crm>.com')
        .get('/api/contacts')
        .query({ query: '+1234567890' })
        .reply(200, { data: [{ id: 1, name: 'Jane Doe' }] });

      // Act
      const result = await connector.findContact({ user: mockUser, phoneNumber: '+1234567890' });

      // Assert
      expect(result.successful).toBe(true);
      expect(result.contact[0].name).toBe('Jane Doe');
    });
  });
});
```

### Key conventions

- Use `nock` (not `jest.mock`) for all external HTTP calls.
- Call `nock.cleanAll()` in both `beforeEach` and `afterEach`.
- Prefer `it()` in integration tests, `test()` in unit tests (both work — stay consistent per file).
- Import mock factories from `tests/fixtures/connectorMocks.js`; do not inline large mock objects.
- Cover at minimum: `getAuthType`, `getOauthInfo`/`getApiKeyInfo`, `getUserInfo`, `findContact`, `createCallLog`, `updateCallLog`, `createMessageLog` — and their error paths.

## Writing MCP Tool Tests (`packages/core/test/mcp/tools/`)

Each file must test both sub-sections:

1. **`tool definition`** — verify `definition.name`, `definition.description`, `definition.inputSchema`, and required fields.
2. **`execute`** — happy path(s) + every named error condition (missing params, invalid JWT, connector not found, DB conflict, unexpected throws).

Error returns must use `{ success: false, error: '...' }` shape; success returns `{ success: true, data: { … } }`.

## Examining Failing Tests

1. Run the specific file in isolation first:
   ```bash
   npx jest packages/core/test/mcp/tools/createCallLog.test.js --no-coverage
   ```
2. Read the failure message carefully — most failures are either:
   - A mock not set up (`undefined is not a function`) → add/fix `jest.mock()`.
   - Wrong assertion shape → diff actual vs expected object.
   - `nock: No match for request` → the interceptor URL/method/body doesn't match the real call.
3. Use `--verbose` to see individual test names:
   ```bash
   npx jest tests/connectors/pipedrive.int.test.js --verbose --no-coverage
   ```
4. Check `packages/core/.env.test` is present and `DATABASE_URL='sqlite::memory:'` is set.

## Is It the Test or the Code?

Before touching anything, decide which side is wrong. Getting this wrong wastes time or, worse, silences a real bug.

### Ask these questions first

| Question | Points toward… |
|---|---|
| Was this test passing before a recent code change? | **Code is wrong** — the test caught a regression |
| Did the test always pass vacuously (e.g. mock returns anything, assertion is too loose)? | **Test is wrong** — it wasn't actually testing real behaviour |
| Does the new behaviour make semantic sense for the function's contract? | If yes → **test needs updating**; if no → **code is wrong** |
| Is the test asserting an implementation detail (exact internal call args) rather than observable output? | **Test is wrong** — over-specified, should be loosened |
| Do multiple tests fail together in the same area? | Likely **code is wrong** (a shared dependency broke) |
| Is only one very specific test failing while others in the same file pass? | More likely **that test is wrong** or its mock setup is stale |

### Decision rules for this codebase

**Fix the code when:**
- A connector function returns a different shape than what the integration test expects and the test was written against the documented CRM API contract.
- A handler test fails because error-handling logic was removed or changed in `packages/core/handlers/`.
- An MCP tool test fails on `{ success: false }` but the tool was supposed to succeed — the tool's `execute()` is throwing unexpectedly.

**Fix the test when:**
- A refactor renamed an internal helper but the external behaviour is unchanged — update `jest.mock()` paths and call assertions.
- A mock was returning a stale data shape (e.g. `UserModel.findByPk` now returns an extra field) — update the mock return value in the test, not the model.
- The test was asserting on a hardcoded string that changed for a legitimate UX/copy reason.
- `expect(...).toHaveBeenCalledWith(...)` fails because the function signature gained a new optional param — update the assertion, not the code.

### When it's genuinely unclear

1. Read the **git blame / git log** for the file under test — identify what changed and when.
2. Revert just that change locally (`git stash` or a temp branch) and re-run the test. If it goes green, the code change broke it.
3. If the test was *never* green (new test file), manually trace the code path by reading the source — don't assume the test is right.
4. Prefer fixing the code if the test was written before the code change; prefer fixing the test if the test was written after.

## Fixing Tests

- **Mock drift**: When the module under test changes its internal calls, update the corresponding `jest.mock()` return values and `expect(...).toHaveBeenCalledWith(...)` assertions.
- **nock mismatch**: Log the real outgoing request with `nock.recorder.rec()` temporarily to capture the exact URL/body, then match the interceptor.
- **SQLite schema mismatch**: If a model adds a new column, add it to the `createMockUser/CallLog` factory and re-sync with `{ force: true }`.
- **Timeout**: Increase the specific test with `test('…', async () => { … }, 60000)` or check for an unresolved promise (missing `await`).

## Coverage

The core package collects coverage automatically. View the HTML report after running:
```bash
npm run test:coverage --workspace=@app-connect/core
# Report at packages/core/coverage/index.html
```

Target: keep coverage stable or improving — CI runs `npm run test-coverage` on every push and PR.

## Additional Reference

- Fixtures: [`tests/fixtures/connectorMocks.js`](../../../tests/fixtures/connectorMocks.js)
- Core test setup: [`packages/core/test/setup.js`](../../../packages/core/test/setup.js)
- Jest config (core): [`packages/core/jest.config.js`](../../../packages/core/jest.config.js)
- Jest config (root): [`jest.config.js`](../../../jest.config.js)
- CI workflow: [`.github/workflows/tests.yml`](../../../.github/workflows/tests.yml)
