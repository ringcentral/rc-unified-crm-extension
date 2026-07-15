---
type: operations
title: Dependency Security Remediation TODO
description: Coordinated migrations required to close dependency advisories that cannot be fixed safely with compatible lockfile updates.
owner: NEEDS_OWNER
status: proposed
risk_level: critical
tags: [security, dependencies, dependabot]
---

# Dependency Security Remediation TODO

## Purpose

This document tracks the dependency advisories deliberately left open after applying compatible patch and minor updates to the three tracked npm lockfiles. The remaining 12 advisories occur in the root and template lockfiles; the MCP UI lockfile has no remaining OSV findings.

These items require parent-package or workflow migrations. They MUST NOT be closed with untested major-version overrides because the affected packages participate in deployment, archive extraction, native module installation, and developer tunneling.

## Required security outcome

- Build and deployment tooling MUST NOT allow an archive to create or overwrite files outside its extraction target.
- AWS regions used by deployment tooling MUST come from trusted, validated configuration.
- Developer tunnel commands MUST NOT concatenate or execute untrusted arguments.
- Resolved dependencies MUST NOT contain a vulnerable `uuid` implementation, even though the affected `v3`, `v5`, and `v6` buffer call pattern is not currently observed in repository code.
- Remediation MUST preserve packaging, deployment, SQLite-backed tests, and the port 6066 development-tunnel workflow.

## Remaining work

### 1. Migrate Serverless Framework v3

`serverless@3.40.0` owns the largest cluster in both affected lockfiles:

- Critical: [`decompress@4.2.1` path traversal](https://github.com/advisories/GHSA-mp2f-45pm-3cg9), with no fixed release in that package line.
- Moderate: [`file-type@16.5.4` malformed-input infinite loop](https://github.com/advisories/GHSA-5v7r-6r5c-r473), fixed only in a later major line.
- Low: [`aws-sdk@2` region validation weakness](https://github.com/advisories/GHSA-j965-2qgj-vjmq), with no AWS SDK v2 fix.
- Additional vulnerable `tar@6.2.1` and `uuid` copies shared with the clusters below.

The candidate remediation is Serverless Framework v4 or a replacement deployment workflow. This is not a lockfile-only update: the official v4 guidance requires authentication, may require a commercial license, and calls for plugin, test-stage, and CI credential review. Version 3 is no longer maintained or receiving security updates.

Acceptance criteria:

- Assign an owner and resolve Serverless v4 license/procurement and CI authentication requirements.
- Validate `serverless-deployment-bucket` and `serverless-plugin-log-retention` compatibility.
- Compare generated packages and CloudFormation output with the current workflow.
- Deploy and remove a dedicated non-production stage, then exercise the health endpoint and representative connector flows.
- Rescan every tracked lockfile and confirm the Serverless-owned advisory cluster is absent.

### 2. Replace the legacy ngrok package

The root and template manifests directly depend on `ngrok@5.0.0-beta.2`, which has [a high-severity command-injection advisory](https://github.com/advisories/GHSA-qr28-p3wr-mxq3) and no patched release. The current `npm run ngrok` script starts a CLI tunnel for port 6066.

The maintained `@ngrok/ngrok` package is an SDK rather than a drop-in CLI replacement, so this change needs either a small, argument-safe wrapper or an explicitly managed standalone CLI workflow.

Acceptance criteria:

- Preserve a documented one-command tunnel workflow for port 6066.
- Read credentials from environment variables and never construct a shell command from user-controlled input.
- Verify startup, public URL reporting, shutdown, and failure behavior on supported developer platforms.
- Remove both legacy `ngrok` package instances and confirm the advisory is absent from both lockfiles.

### 3. Upgrade or replace the SQLite native toolchain

`sqlite3@5.1.7` is used for local and test database support. Its install chain owns four `tar@6.2.1` paths through `sqlite3`, `node-gyp@8`, and `cacache`. Those copies are affected by seven archive extraction advisories:

- High: [GHSA-34x7-hfp2-rc4v](https://github.com/advisories/GHSA-34x7-hfp2-rc4v), [GHSA-83g3-92jg-28cx](https://github.com/advisories/GHSA-83g3-92jg-28cx), [GHSA-8qq5-rm4j-mr97](https://github.com/advisories/GHSA-8qq5-rm4j-mr97), [GHSA-9ppj-qmqm-q256](https://github.com/advisories/GHSA-9ppj-qmqm-q256), [GHSA-qffp-2rhf-9h96](https://github.com/advisories/GHSA-qffp-2rhf-9h96), and [GHSA-r6q2-hw4h-h46w](https://github.com/advisories/GHSA-r6q2-hw4h-h46w).
- Moderate: [GHSA-vmf3-w455-68vh](https://github.com/advisories/GHSA-vmf3-w455-68vh).

`sqlite3@6.0.1` is a candidate short-term migration because it moves to Node 20.17 or newer, `node-gyp@12`, and `tar@7`. It is still a major native-module upgrade, and the upstream project is now archived, so the long-term maintained-driver decision remains NEEDS_REVIEW.

Acceptance criteria:

- Confirm that all CI and supported developer environments satisfy the Node 20.17 minimum.
- Run Sequelize migration and CRUD tests against `sqlite::memory:`.
- Exercise both prebuilt-binary and forced-source installation on the supported OS and architecture matrix.
- Confirm every resulting `tar` copy resolves to a patched version.
- Decide whether `sqlite3@6` is an interim step or whether the project should move to a maintained driver.

### 4. Converge transitive uuid versions through parent upgrades

[`uuid` GHSA-w5hq-g745-h8pq](https://github.com/uuidjs/uuid/security/advisories/GHSA-w5hq-g745-h8pq) affects `v3`, `v5`, and `v6` when a caller supplies an output buffer. No tracked repository source imports the `uuid` package directly, and the vulnerable call pattern was not observed during this review; reachability is therefore **not observed**, not proven impossible.

Vulnerable copies are owned by unrelated parents: Serverless and AWS SDK v2, ngrok, Sequelize, and Google API libraries. A global major-version override would cross their declared compatibility ranges and is not a safe simple fix.

Acceptance criteria:

- Remove or upgrade the owning parents through the Serverless, ngrok, Sequelize, Google API, and AWS SDK workstreams.
- Add or retain identifier-generation behavior tests where an upgraded parent uses UUIDs.
- Confirm that no vulnerable `uuid` version remains in any tracked lockfile.

## Interim constraints

Until the migrations are complete:

- Build, install, and deployment archives MUST come only from trusted project and package-registry sources.
- Untrusted input MUST NOT be passed to the ngrok script, Serverless CLI options, or AWS region configuration.
- These alerts MUST remain open; dismissal or risk acceptance requires an assigned owner and explicit security review.

## Verification

The current dependency graph was validated with `npm ls --package-lock-only --all` in the root, template, and MCP UI directories. An OSV `querybatch` scan of every npm package/version pair in those lockfiles found 12 unique advisories in the root and template locks and zero in the MCP UI lock.

For each future migration:

1. Run `npm ci` with the repository's supported Node version on the CI platform matrix.
2. Run `npm run typecheck`, `npm run typecheck:core`, `npm test`, `npm run test-coverage`, `npm run test:e2e`, `npm run lint:openapi`, and `npm run typecheck:contracts`.
3. Run the MCP UI build and tests.
4. Repeat the OSV batch scan across all three lockfiles and read back the private Dependabot alert page.

Verification: Missing — authenticated readback of the private Dependabot alert page is still required after these migrations.

## Reviewer focus

- Serverless licensing, authentication-secret ownership, plugin compatibility, and package/deployment parity.
- Whether any build or deployment archive can be influenced by an untrusted party.
- Native SQLite installation on platforms that do not receive a prebuilt binary.
- Developer tunnel credential handling and command construction.
- Parent-package compatibility instead of forced `tar` or `uuid` major overrides.

## Citations

- [Serverless Framework v4 migration guide](https://www.serverless.com/framework/docs/guides/upgrading-v4)
- [Serverless Framework license-key guidance](https://www.serverless.com/framework/docs/guides/license-keys)
- [ngrok JavaScript SDK quickstart](https://ngrok.com/docs/getting-started/javascript)
- [ngrok JavaScript SDK repository](https://github.com/ngrok/ngrok-javascript)
- [node-sqlite3 repository and maintenance status](https://github.com/TryGhost/node-sqlite3)
- [`sqlite3@6.0.1` release](https://github.com/TryGhost/node-sqlite3/releases/tag/v6.0.1)
- [node-gyp changelog](https://github.com/nodejs/node-gyp/blob/main/CHANGELOG.md)
- [OSV batch query API](https://google.github.io/osv.dev/post-v1-querybatch/)
