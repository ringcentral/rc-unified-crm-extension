# Plugin analytics

App Connect emits plugin telemetry centrally. Plugins do not need Mixpanel credentials or SDKs. Analytics failure must not interrupt logging. Events use the existing [raw-ID contract](mixpanel-raw-ids.md): hashed `distinct_id`/`rcAccountId` stay unchanged, raw IDs are string properties, and schema version remains `2`.

## Events and emitters

| Event | Emitter | Meaning |
| --- | --- | --- |
| `Plugin Register`, `Plugin Unregister` | Server | Existing operation outcomes, enriched with plugin metadata and normalized failure codes |
| `Plugin Configuration Saved` | Extension | Settings persisted successfully; `settingsScope` is `admin` or `user` |
| `Plugin Connection Result` | Extension | OAuth completion, callback failure, or failure to start authorization; `operation` is `connect` |
| `Plugin Execution Started` | Server | One plugin execution attempt starts |
| `Plugin Execution Finished` | Server | Attempt reaches `success`, `failure`, or `timeout` |
| `Created plugin`, `Updated plugin` | Developer Console | Successful persistence, enriched with safe manifest metadata |
| `Viewed plugins` | Extension / Developer Console | `surface` distinguishes `marketplace` from `developer_console` |
| `Viewed plugin overview`, `Viewed plugin settings` | Extension / Developer Console | Plugin details; `surface` identifies `admin`, `user`, or `developer_console` |

Execution dimensions: `pluginId`, `pluginVersion`, `pluginAccess` (when known), `adapterName`, `logType` (`call`, `sms`, `fax`), `operation`, `executionMode` (`sync`, `async`), `executionId`, and `attemptNumber` (currently `1`; each fresh invocation gets a new ID). Finished events include `success`, `outcome`, and `durationMs`. Failures add `failureStage` (`dispatch`, `processing`, `callback`, `crm_update`) and a bounded `errorCode`. Existing route `requestDuration` remains in seconds; execution `durationMs` is milliseconds. Existing `version` identifies the emitting application/core version, while `pluginVersion` identifies the plugin.

Do not send tokens, API keys, configuration values, notes, transcripts, phone numbers, callback URLs or provider response bodies as event properties. Metadata helpers explicitly select fields. Developer Console adds `supportedLogTypes`; its access dimension describes public/private publication state. Installation/runtime access uses the registered public/shared/private access when available. Installation is account-level and may span CRM workflows, so installation events do not invent an adapter name when none is known.

## Execution lifecycle

Sync success means the plugin returned its processed data; the subsequent CRM logging operation has its own existing outcome event. Async dispatch acceptance is not execution success. Call, SMS and fax async requests include `asyncTaskId` and `callbackUrl`. Providers should POST `{ "successful": true }` or `{ "successful": false }` to that callback. A call plugin can also send `note`; App Connect records `crm_update_failed` if appending that note fails. SMS/fax callbacks record processing completion without changing CRM content. Existing providers may ignore the additive callback fields, in which case tasks remain pending until expiry; deploy callback support to establish completion coverage.

Completed/failed tasks remain as tombstones until the existing seven-day expiry. Conditional database status transitions suppress duplicate/concurrent callback events and repeated CRM note writes. Cleanup records timeout for overdue pending/processing tasks before deleting them. Keep the existing cache-cleanup job enabled; timeout visibility follows that job's cadence. Historical tasks without tracking context produce no synthetic execution events.

Each lifecycle event has a stable `$insert_id` based on execution ID and event name. This deduplicates delivery retries in Mixpanel. The cache transition and analytics delivery are not an atomic transaction: a process crash or transport failure can still lose telemetry. Do not use these events as a billing ledger. Process retries are new attempts with new IDs. OAuth window cancellation produces no result because there is no completed authorization response.

Execution identity uses the stored log owner's hashed extension when available. A supplied raw extension is included only when it hashes to that owner; never substitute the admin's raw extension on server-side logging. Raw-ID completeness can therefore be partial when owner details are unavailable. Use existing hashed account groups for historical continuity. Never swap `distinct_id` to a raw ID.

## Installed-base reconciliation

Behavioral registration counts do not establish current installation state. Export a read-only inventory from the appropriate deployment database, using its existing `HASH_KEY` and `DATABASE_URL` environment variables:

```powershell
npm.cmd run build:ts
node .ts-build/scripts/plugin-analytics-snapshot.js <new-output-path.json>
```

The script does not load application `.env` files automatically. It selects `pluginData` records, exports plugin metadata plus hashed account IDs, refuses to overwrite an existing file, and never sends Mixpanel events. Keep snapshots outside source control. Snapshot rows represent account/plugin installations, not per-CRM installations. Deduplicate account IDs per plugin for installed-account counts; maintain dated snapshots in the reporting system if historical installed-base counts are needed.

## Mixpanel setup and rollout

1. Validate events in Dev & QA, then deploy Server before the extension/Console. Update async providers to use the supplied callback fields. This is an additive request contract, with no plugin-side Mixpanel emission.
2. Document and verify the events/properties in Lexicon. Separate raw event properties from raw User Profile properties. Existing `App Connect UIDs` mapping coverage and historical identity mode still require verification before profile enrichment.
3. Build an account-level install-to-first-success funnel, holding `pluginId` constant. Verify `rcAccountId` Group Analytics configuration so an admin installing and another user executing can convert together.
4. Build active account/user and retention reports from successful execution, broken down by plugin/version. Exclude Developer Console activity from customer adoption. Use inventory snapshots for installed accounts.
5. For reliability, count one terminal outcome per execution ID, show pending separately, and break down errors by stage. Measure sync/async durations separately. Compare processing versus CRM-update failures.
6. Monitor raw identity status by emitter/version. Old clients, pre-instrumentation events, anonymous views and raw-ID-disabled deployments are separate populations. Do not interpret missing raw IDs as churn.

Dashboards, Lexicon edits, scheduling inventory exports, provider deployments, historical profile migration and production data validation are operational steps; committing this code does not perform them.
