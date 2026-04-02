# Plugin Template Plan

This note is a working design and implementation plan for adding a developer-friendly plugin template under `packages/core`.

It is written to support follow-up discussion, not to lock us into final file names yet.

## Goal

Make it easy for developers to build App Connect plugins without reverse-engineering:

- the server-side plugin endpoints
- the client-side manifest and config behavior
- the difference between sync and async execution
- the optional OAuth and license hooks

The template should feel as approachable as `packages/template` does for connectors, while still reflecting the real plugin runtime in this repo.

## What the current system does

### Server flow

Current plugin execution is centered around the core logging handlers plus app-specific plugin routes:

- `packages/core/handlers/log.js`
  - discovers enabled plugins from user settings
  - fetches each plugin manifest from the developer portal
  - invokes the plugin endpoint
  - creates async task records in `CacheModel` for async plugins
- `packages/core/handlers/plugin.js`
  - exposes async task polling behavior
  - removes completed and failed task cache entries after they are reported
- `src/index.js`
  - contains the app-specific plugin route switch
  - wires `all_cap` and `googleDrive`
  - implements plugin auth, logout, and license routes

### Client flow

Current client behavior is mostly manifest-driven:

- `rc-unified-crm-extension-client/src/service/manifestService.js`
  - loads plugin manifests and plugin lists from the developer portal
- `rc-unified-crm-extension-client/src/service/pluginService.js`
  - checks license status
  - stores async task IDs in local storage
  - polls `/pluginAsyncTask`
- `rc-unified-crm-extension-client/src/components/pluginConfigurePage.js`
  - renders plugin config fields from `pageContent`
  - shows Connect or Logout when `showAuthorizationButton` is enabled
  - shows license state when `requireLicense` is enabled
- `rc-unified-crm-extension-client/src/eventHandlers/.../plugins/selectPlugin.js`
  - ties together plugin details, user settings, auth-state lookup, and rendered config pages

## Good examples already in the repo

### `ALL_CAPS` as the sync example

`src/plugins/allCapPlugin.js` is a strong teaching example because it is small and shows the core sync idea clearly:

- read plugin config from user settings
- transform the logging payload
- return the same payload shape

This should be the main sync example in the template.

### Simplified `APP_CAPS` as the async example

Google Drive proves the async shape, but it is too large for a starter template because it mixes:

- OAuth
- database models
- token refresh
- file download
- external upload
- idempotency

A better async example is a small `APP_CAPS` plugin that demonstrates the async contract without all the Google Drive complexity.

Recommended behavior for `APP_CAPS`:

- accepts the same payload as `ALL_CAPS`
- reads a simple config value
- simulates or performs a small side effect
- updates the async task status in cache
- does not require OAuth in the first version

This keeps the mental model simple: sync changes the payload, async performs side work.

## Main design recommendation

Build the template around two intentionally small examples:

1. `ALL_CAPS`
   - sync
   - no OAuth
   - no license
   - one or two config fields
   - pure payload transform
2. `APP_CAPS`
   - async
   - no OAuth in the starter version
   - no license in the starter version
   - same config style as `ALL_CAPS`
   - demonstrates task lifecycle: `initialized` -> `processing` -> `completed` or `failed`

Then add advanced recipes, not advanced starter code:

- OAuth recipe
- license-check recipe
- persistent plugin model recipe
- external API recipe

## Why this is the right abstraction level

This approach teaches the plugin platform in layers:

1. Understand the manifest and config page shape.
2. Understand the sync endpoint contract.
3. Understand the async endpoint contract and task polling.
4. Add optional capabilities only when needed.

That is much easier for developers than starting from Google Drive.

## Proposed deliverables

### 1. A new plugin template area under `packages/core`

Suggested location:

- `packages/core/plugin-template/`

Suggested contents:

- `README.md`
- `server/`
- `examples/`
- `manifests/`
- `snippets/`

Alternative location if we want to keep docs and assets together:

- `packages/core/docs/plugin-template/`

I lean toward a real template directory, with docs next to it, because developers will want copyable files rather than only prose.

### 2. Two example plugin implementations

Suggested structure:

```text
packages/core/plugin-template/
  README.md
  server/
    pluginRouter.js
    shared/
      getPluginConfig.js
      pluginTask.js
      payloadGuards.js
  examples/
    all-caps-sync.js
    app-caps-async.js
  manifests/
    all-caps.sync.manifest.json
    app-caps.async.manifest.json
  snippets/
    oauth-routes.js
    license-status.js
```

### 3. A guide that explains both server and client responsibilities

The guide should explicitly separate:

- what the plugin developer controls
- what App Connect core already does
- what the extension client infers from manifest fields

This is important because the current behavior is spread across server and client repos.

## Proposed template content

### README structure

The top-level template README should cover:

1. What a plugin is
2. Sync vs async in one screen
3. Required manifest fields
4. Required server endpoints
5. How config fields map to the client UI
6. How async tasks are tracked
7. How to test locally
8. Where to add OAuth later

### Sync example content

The sync example should show:

- expected input payload
- how to read plugin config safely
- how to preserve the payload shape
- how to return modified `note` or `additionalSubmission`
- guardrails around performance and error handling

### Async example content

The async example should show:

- expected input payload plus `asyncTaskId`
- how to mark task state changes
- how to avoid blocking the main logging flow
- how to handle success and failure
- why async plugins should not try to mutate the logging payload

### Advanced snippets

Instead of making the starter template complicated, add focused snippets for:

- `showAuthorizationButton`
- `authStateUrl`
- `authUrl`
- `logoutUrl`
- `licenseStatusUrl`
- plugin-specific Sequelize models

## Abstractions we should consider pulling into core

Right now plugin implementation is more switch-based than template-based. To make the template solid, it would help to extract a small plugin helper surface into `packages/core`.

### Candidate helper 1: config lookup

Current examples access config through a hard-coded user-settings key. That is accurate, but not beginner-friendly.

We could add a helper like:

```js
getPluginConfig({ user, pluginSettingKey })
```

or

```js
getPluginConfigValue({ user, pluginId, field })
```

This would reduce repetitive and brittle settings access.

### Candidate helper 2: async task status helper

Google Drive updates `CacheModel` directly. A small helper would make async examples much easier to teach:

```js
markPluginTaskProcessing(taskId)
markPluginTaskCompleted(taskId)
markPluginTaskFailed(taskId)
```

### Candidate helper 3: plugin router registration

The biggest usability improvement would be replacing the manual route switch in `src/index.js` with a registration model.

Possible shape:

```js
pluginRegistry.register('all_cap', {
  run: allCapsSync,
  mode: 'sync'
});

pluginRegistry.register('app_caps', {
  run: appCapsAsync,
  mode: 'async',
  checkAuth,
  getOAuthUrl,
  logout,
  getLicenseStatus,
});
```

Then `createCoreApp()` or a helper router could expose the generic routes.

This is not required for a first template, but it is the cleanest long-term direction.

## Recommended phased plan

### Phase 1: document the current plugin contract

Deliverables:

- improve plugin developer docs
- add a plugin template plan and starter README
- define the exact minimal manifest fields for sync and async plugins

Why first:

- we can align terminology before touching code
- it lowers implementation churn

### Phase 2: create a copyable template package

Deliverables:

- `packages/core/plugin-template/README.md`
- `examples/all-caps-sync.js`
- `examples/app-caps-async.js`
- manifest examples
- comments that explain why each part exists

Why next:

- fast developer value
- low-risk change

### Phase 3: extract light shared helpers

Deliverables:

- helper for reading plugin config
- helper for async task status updates
- maybe a shared payload type/example fixture

Why next:

- reduces duplication in examples and real plugins
- makes future plugins more consistent

### Phase 4: decide whether to productize plugin registration

Deliverables:

- evaluate plugin registry and generic route handling
- move app-specific switch statements toward declarative registration

Why later:

- bigger refactor
- touches real runtime paths
- easier once the template has clarified what the stable developer surface should be

## Proposed first implementation scope

If we want a practical first pass, I would keep scope tight:

- add a planning and design doc
- add a `plugin-template` folder
- provide one sync example and one async example
- provide one guide for manifest plus server endpoints
- do not introduce OAuth into the starter template
- do not refactor current production plugin routing yet

That gives developers a clean starting point fast without forcing a risky platform refactor.

## Suggested file plan

### Docs

- `packages/core/docs/plugin-template-plan.md`
- `packages/core/plugin-template/README.md`

### Example source

- `packages/core/plugin-template/examples/all-caps-sync.js`
- `packages/core/plugin-template/examples/app-caps-async.js`
- `packages/core/plugin-template/server/shared/getPluginConfig.js`
- `packages/core/plugin-template/server/shared/pluginTask.js`

### Example manifests

- `packages/core/plugin-template/manifests/all-caps.sync.manifest.json`
- `packages/core/plugin-template/manifests/app-caps.async.manifest.json`

### Optional later

- `packages/core/plugin-template/snippets/oauth-routes.js`
- `packages/core/plugin-template/snippets/license-status.js`

## Open design decisions for us

These are the main points worth discussing before implementation starts:

1. Should the template live as a real copyable package under `packages/core`, or as docs plus snippets only?
2. Do we want the starter async example to be fully self-contained with no database model, using only `CacheModel` task updates?
3. Should we keep plugin routing app-specific for now, or use this effort to introduce a lightweight plugin registry?
4. Do we want OAuth as an advanced add-on only, or included as a second async example later?
5. Do we want the template to target external plugin developers only, or also serve as the internal pattern for first-party plugins in `src/plugins/`?

## My recommendation

I recommend:

- a copyable `plugin-template` folder under `packages/core`
- `ALL_CAPS` as the sync example
- `APP_CAPS` as a new simplified async example
- no OAuth in the starter template
- advanced capabilities documented as recipes
- no platform refactor in the first delivery
- revisit plugin registration after the template is in use

## Assumptions behind this plan

- "existing template" refers to the connector template style in `packages/template`
- `APP_CAPS` is intended as a new simplified async teaching example, not a production plugin name that already exists
- the immediate need is a developer onboarding template, not a full plugin runtime redesign

