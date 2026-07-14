# Dependency Report

Audit date: July 13, 2026

## Scope

Reviewed manifests:
- [package.json](/Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension/package.json:1)
- [packages/core/package.json](/Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension/packages/core/package.json:1)
- [packages/core/mcp/ui/package.json](/Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension/packages/core/mcp/ui/package.json:1)
- [packages/template/package.json](/Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension/packages/template/package.json:1)
- [packages/plugin-template/package.json](/Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension/packages/plugin-template/package.json:1)
- [packages/cli/package.json](/Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension/packages/cli/package.json:1)
- [requirements.txt](/Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension/requirements.txt:1)

No `pom.xml`, `build.gradle`, `go.mod`, or `Cargo.toml` was found.

## Confirmed npm Audit Findings

`npm audit --prefix packages/core/mcp/ui --json` completed with registry access and reported 7 vulnerabilities in the locked MCP UI tree:

| Package | Severity | Advisory | CWE | Fix |
|---|---|---|---|---|
| `vite` | High | GHSA-4w7w-66w2-5vf9, GHSA-p9ff-h696-f583, GHSA-v6wh-96g9-6wx3, GHSA-fx2h-pf6j-xcff | CWE-22, CWE-200, CWE-306, CWE-73, CWE-522 | Available |
| `rollup` | High | GHSA-mw96-cpmx-2vgc | CWE-22 | Available |
| `picomatch` | High | GHSA-3v7f-55p6-f55p, GHSA-c2c7-rcm5-vvqj | CWE-1321, CWE-1333 | Available |
| `lodash` | High | GHSA-r5fr-rjxr-66jc, GHSA-f23m-r3pf-42rh, GHSA-xxjr-mmjv-4gpg | CWE-94, CWE-1321 | No direct fix via current `@openai/apps-sdk-ui` tree |
| `@openai/apps-sdk-ui` | Moderate | Via `lodash` | inherited | No direct fix available |
| `postcss` | Moderate | GHSA-qx2v-qp2m-jg93 | CWE-79 | Available |
| `@babel/core` | Low | GHSA-4x5r-pxfx-6jf8 | CWE-22, CWE-200 | Available |

No CVE identifier was returned by npm for these advisories; GHSA identifiers are listed.

Recommended fix:
- Update the MCP UI dependency tree with `npm update --prefix packages/core/mcp/ui`.
- If `@openai/apps-sdk-ui` still pins vulnerable `lodash`, track or override after compatibility testing.
- Rebuild MCP UI and run the MCP UI build/version workflow used by this project.

## Root/Core Audit Limitation

`npm audit --json` and `npm audit --workspace=@app-connect/core --json` failed with `ENOLOCK` because the root lockfile is intentionally absent. AGENTS.md says the root `package-lock.json` is intentionally ignored due environment-specific registries. This prevents a deterministic root/core advisory report from `npm audit` without generating a local lockfile.

Recommendation:
- Add CI-only dependency scanning that can generate an ephemeral lockfile, or maintain a lockfile for audit in a non-committed artifact.
- Do not claim root/core dependency CVE coverage until an auditable dependency graph exists.

## Outdated Packages

`npm outdated --json` with registry access reported:

| Package | Wanted | Latest | Notes |
|---|---:|---:|---|
| `awesome-phonenumber` | 5.11.0 | 7.8.0 | Major behind |
| `dotenv` | 16.6.1 | 17.4.2 | Major behind |
| `express` | 4.22.2 | 5.2.1 | Major migration |
| `googleapis` | 148.0.0 | 173.0.0 | Major behind |
| `moment-timezone` | 0.5.48 | 0.6.2 | Minor/major semantics by package |
| `serverless-http` | 3.2.0 | 4.0.0 | Major migration |
| `react` in MCP UI | 18.3.1 | 19.2.7 | Major migration |
| `react-dom` in MCP UI | 18.3.1 | 19.2.7 | Major migration |

`axios`, `moment`, `pg`, `sequelize`, and `shortid` were at their latest wanted/latest versions per npm outdated output, though `shortid` remains deprecated/unmaintained in ecosystem practice.

## Manifest Concerns

### DEP-01: Root and core use `shortid`

- Severity: Low
- Files: [package.json](/Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension/package.json:62), [packages/core/package.json](/Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension/packages/core/package.json:65)
- Explanation: `shortid` is used for S3 report object ids. It is not suitable for security-sensitive randomness and is no longer a preferred id generator.
- Recommendation: Use `crypto.randomUUID()` or `nanoid`.

### DEP-02: Python requirements contain unpinned packages

- Severity: Medium
- File: [requirements.txt](/Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension/requirements.txt:5)
- Explanation: Several MkDocs packages are unpinned or lower-bound only, including `mkdocs-material`, `mkdocs-badges`, and `mkdocs-print-site-plugin`. This reduces build reproducibility.
- Recommendation: Pin docs dependencies with hashes or use a lock tool such as `pip-tools`.

### DEP-03: Root `node_modules` is absent locally

- Severity: Low
- Evidence: `npm ls --depth=0 --json` reported missing root dependencies.
- Explanation: This prevented local typecheck/test execution without installing dependencies.
- Recommendation: Run `npm install` before CI-equivalent verification or provide a devcontainer/bootstrap script.

## License Review

No comprehensive license scan was run because the root dependency graph was not installed/locked. Package manifests declare MIT for this project and most direct dependencies are typical permissive packages, but transitive license compliance is unverified.

Recommendation:
- Add `license-checker`, `oss-review-toolkit`, or GitHub dependency review to CI.
