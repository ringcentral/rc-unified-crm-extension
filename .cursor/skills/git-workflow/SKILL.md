---
name: git-workflow
description: Git workflow guide for the rc-unified-crm-extension monorepo. Covers commit message conventions, branching strategy, release process, and version bumping. Use when committing changes, creating branches, cutting releases, updating release notes, or asking about the project's Git conventions.
---

# Git Workflow — rc-unified-crm-extension

## Project Context

npm workspaces monorepo with three packages (`packages/core`, `packages/template`, `packages/cli`) plus the root app (`src/connectors/`). Tests run on every push via GitHub Actions (`tests.yml`). Releases are triggered by pushing a semver tag.

---

## Commit Messages

Use a **`<type>: <short description>`** format. Keep the description lowercase and concise.

| Type | When to use |
|------|-------------|
| `feat` | New feature or capability |
| `fix` | Bug fix |
| `update` | Incremental improvement to existing behavior |
| `add` | New file, config, or data (non-feature) |
| `docs` | Documentation only |
| `refactor` | Code restructuring, no behavior change |
| `test` | Test additions or fixes |
| `chore` | Build scripts, CI, dependencies |

**Examples from this repo:**
```
feat: group sms logging
feat: return 401 would log user out
fix: clio image issue
fix: sms log tracking issue
update: version
update: data tracking for transcripts
docs: clio demo video link
add: sample UI
```

For quick one-off fixes that don't warrant a type, `quick fix` or `quick patch` are acceptable locally — but prefer typed messages for anything pushed to `main`.

---

## Branching Strategy

| Branch | Purpose |
|--------|---------|
| `main` | Primary development — all day-to-day work lands here |
| `release` | Release staging — merge `main` → `release` before tagging |
| `feat/<name>` | Feature branches — e.g. `feat/group-sms-support` |
| `docs/<name>` | Docs-only branches — e.g. `docs/zoho` |

**Typical flow:**
1. Branch off `main`: `git checkout -b feat/<feature-name>`
2. Commit work, push, open PR → `main`
3. When ready to release: merge `main` → `release`, then tag

---

## Release Process

### 1. Update version

```bash
npm run update
```

This runs `scripts/update-version.js` to bump the version across packages.

### 2. Update release notes

Edit `docs/release-notes.md`. Add a new section at the top:

```markdown
## <new-version>

- New: <description of new feature>
- Better: <description of improvement>
- Fix: <description of bug fix>
```

Use only `New:`, `Better:`, and `Fix:` categories. Keep each bullet to one sentence.

### 3. Commit

```bash
git add .
git commit -m "update: version"
```

### 4. Tag and push

Releases are auto-created by `.github/workflows/auto-release.yml` when a semver tag is pushed:

```bash
git tag <version>          # e.g. git tag 1.7.19
git push origin main
git push origin <version>
```

The workflow extracts the matching section from `docs/release-notes.md` and creates the GitHub Release automatically.

---

## CI/CD Quick Reference

| Trigger | What runs |
|---------|-----------|
| Any push / PR | `npm run test-coverage` on Node 20 |
| Push of `*.*.*` tag | Extract release notes → create GitHub Release |
| Push/PR to `stable` | Test coverage + Coveralls report |

Before pushing, run tests locally:

```bash
npm test                    # all tests (root + core)
npm run test:root           # integration tests only
cd packages/core && npm test  # core unit tests only
```

---

## Connector-Specific Notes

When adding or modifying a CRM connector:
- Connector logic lives in `src/connectors/<name>/index.js`
- Platform config (auth, URLs, fields) lives in `src/connectors/manifest.json`
- Pass-through connectors (no custom code) are manifest-only — see GoHighLevel/Freshdesk entries as examples
- Core handler logic shared across all connectors is in `packages/core/handlers/`

Commit scope examples for connector work:
```
feat: clio time entries associated with matters
fix: bullhorn note author assignment for contacts
update: follow-up changes for data tracking for transcripts
```
