# Mixpanel raw IDs and historical profiles

App Connect adds raw RingCentral IDs to analytics while preserving existing Mixpanel user and account identities. Browser extension, App Connect Server, Server Side Logging, and Developer Console events use the same new fields.

| Property | Type | Meaning |
| --- | --- | --- |
| `rcAccountIdRaw` | string | Original RingCentral account ID |
| `rcExtensionIdRaw` | string | Original extension ID of the person attributed to the event |
| `analyticsSchemaVersion` | number | `2` for the updated emitters |
| `analyticsIdentityStatus` | string | `complete`, `partial`, `missing`, `invalid`, `mismatch`, or `disabled`, as applicable to the emitter |

IDs are positive decimal strings of up to 32 digits. Numbers are accepted by runtime emitters only when they are positive safe integers. Keep large IDs as strings throughout the pipeline. Missing or invalid values are omitted, never replaced with a legacy hash.

`distinct_id`, `rcAccountId`, `extensionId`, account group keys/values, event names and business database keys retain their previous meaning. A business action emits one event. The extension's existing `rcUserInfo` and `/userInfoHash` response are unchanged. Customer.io and shared logging identity helpers retain their existing identities.

## Runtime configuration

Raw properties are enabled by default. Set `MIXPANEL_RAW_IDS_ENABLED=false` independently on each server/service to suppress new raw fields. Developer Console renders this setting into `window.MIXPANEL_RAW_IDS_ENABLED`; reload already-open pages after changing it. For the extension this is a build-time variable: rebuild and distribute the extension with the setting disabled. The schema version and diagnostic status remain on events. Disabling emission does not remove profile values already written or retract historical events.

The extension obtains raw IDs from the current widget extension/account data and sends `rc-analytics-account-id` and `rc-analytics-extension-id` alongside the existing hashed request headers. Raw request headers are restricted to the configured adapter origin and path; requests to other destinations receive none. App Connect Server recomputes each supplied raw value with that deployment's `HASH_KEY` and checks it against the corresponding legacy header before emitting raw attributes. A malformed or mismatched pair is omitted and recorded in `analyticsIdentityStatus`. This consistency check is not a replacement for route authentication. Old clients continue to work and report `missing` when raw IDs are unavailable.

Login establishes the extension's analytics context before subsequent CRM requests. Logout, failed identity setup and account switches clear the context and request headers. Async background error events restore the stored context only when the stored legacy IDs still match the current user and RC is logged in. Server Side Logging attributes the raw extension to the same inbound/outbound/fallback owner as the event's legacy `distinct_id`.

## Querying history

New events carry raw event properties. Existing events keep their original payloads. After enriching an existing User Profile, select the **user property** `rcAccountIdRaw` or `rcExtensionIdRaw` to query that user's earlier events. Filtering on the corresponding **event property** only selects events that actually carried it.

The same raw value on two profiles does not merge those users. Retain existing hashed account group IDs for account retention and other cross-migration reports; add raw account metadata to existing Group Profiles when a verified mapping exists.

## Prepare historical mappings

Run the migration from the Server repository with Node.js 20 or newer. The tool updates profiles only; it never sends tracking, merge, alias or import events.

1. Obtain verified raw IDs and the relevant historical hash keys from the deployments that originally emitted the events. Core uses `HASH_KEY`; the other services use `ANALYTICS_SECRET_KEY`. Different deployments/versions can require different keys.
2. Inspect the existing `App Connect UIDs` lookup table before preparing new mappings. Its completeness has not been established.
3. Resolve each legacy extension ID to its **existing canonical Mixpanel profile ID**, using the App Connect historical event/profile exports or the identity view. This is an operator preparation step; the script does not infer canonical IDs or create replacement identities. Do not map users from other products in the shared project.
4. Export the existing profile properties for an offline dry-run. For groups, obtain the existing group key's `data_group_id` and group ID. Do not substitute the account's user profile.
5. Put secrets in environment variables. Do not place keys or API credentials in input files, shell history or reports. Keep mapping files, snapshots and journals outside version control; these artifacts contain raw identifiers.

Input JSON shape (replace placeholder hashes with verified values):

```json
{
  "projectId": 2919895,
  "rows": [
    {
      "kind": "user",
      "source": "app-connect",
      "hashKeyEnv": "CORE_LEGACY_HASH_KEY",
      "profileId": "existing-canonical-profile-id",
      "legacyId": "sha256-of-101-colon-old-key",
      "legacyAccountId": "sha256-of-900-colon-old-key",
      "rcExtensionIdRaw": "101",
      "rcAccountIdRaw": "900"
    }
  ]
}
```

Supported sources are `app-connect`, `server-side-logging`, and `developer-console`. Each `hashKeyEnv` names an environment variable containing the corresponding old key. The script validates `SHA256(raw + ':' + key)`. User mappings must validate both IDs. Group mappings use `kind: "group"`, `groupKey: "rcAccountId"`, `dataGroupId`, `profileId` equal to `legacyId` (the existing account hash), and `rcAccountIdRaw`.

Snapshot JSON shape:

```json
{
  "projectId": 2919895,
  "rows": [
    {
      "kind": "user",
      "profileId": "existing-canonical-profile-id",
      "properties": {}
    }
  ]
}
```

Include `dataGroupId` on group snapshot rows. Snapshots must include current values of the raw properties if present; preserve exported existing properties, rather than replacing them with an empty object.

## Dry-run, apply and resume

Begin in RingCentral Labs Dev & QA (`2919895`). RingCentral Labs production is `2857221`. Keep project IDs, service-account credentials, project token and input files aligned. The Query API project ID and ingestion token are separate parameters; the tool cannot establish which project a tracking token belongs to. Operators must verify this before any write.

Offline dry-run needs the historical hash keys but no Mixpanel credentials or network:

```powershell
node scripts/mixpanel-raw-ids.cjs --project-id 2919895 --input mappings.json --profiles profiles.json --report dry-run.json --limit 100
```

For live reads set `MIXPANEL_SERVICE_ACCOUNT_USER` and `MIXPANEL_SERVICE_ACCOUNT_SECRET`. Writes additionally require `MIXPANEL_PROJECT_TOKEN`. Set `--region us`, `eu`, or `in` to match the project's data residency; the default is `us`. Project credentials are intentionally not loaded from the application's `.env` automatically.

```powershell
# Live dry-run: reads existing profiles, makes no profile changes.
node scripts/mixpanel-raw-ids.cjs --project-id 2919895 --input mappings.json --report live-dry-run.json --region us --limit 100

# Apply the first batch; --apply cannot use an offline snapshot.
node scripts/mixpanel-raw-ids.cjs --project-id 2919895 --input mappings.json --report applied.json --journal migration.jsonl --apply --region us --limit 100
```

Inspect the report and verify that sampled users can query pre-migration events by raw **user** properties. Re-run the same apply command with the same journal to process the next batch; increase `--limit` for larger batches. Acknowledged updates are skipped using the journal. Prepared operations without an acknowledgment are re-read to recover uncertain writes. Limits count new profile reads, excluding acknowledged operations.

The report distinguishes invalid mappings, missing keys, hash mismatches, conflicts, duplicates, missing profiles, conflicting existing values, deferred rows and planned/applied updates. Its `total` is the supplied mapping-row count, not the project's historical-user count. Establish full historical coverage separately against the exported App Connect identity inventory. Deleted/unrecoverable users remain exceptions.

Every mutation is preceded by a durable `prepared` journal record with the original target attributes. A lost response can be recovered without overwriting that backup. The script re-reads existing canonical profiles before writes, refuses conflicting existing raw values and never intentionally creates a missing profile. Preserve the journal; do not edit or reuse it for a different project. Concurrent deletion/updates cannot be prevented atomically by the profile API: pause overlapping migration jobs, and review any conflicts before retrying.

## Rollback

Stop the migration and disable affected runtime emitters first. Review rollback without `--apply`:

```powershell
node scripts/mixpanel-raw-ids.cjs --project-id 2919895 --journal migration.jsonl --rollback --report rollback-dry-run.json --region us --limit 100
node scripts/mixpanel-raw-ids.cjs --project-id 2919895 --journal migration.jsonl --rollback --apply --report rollback.json --region us --limit 100
```

Rollback restores only attributes in the journal. It unsets newly introduced attributes, preserves unrelated profile properties and skips a profile if the current target values differ from the migration's values. The check and write are not atomic; avoid concurrent writers during rollback. An already-rolled-back operation is not reapplied by that journal; use a new reviewed run for another migration.

Rollback does not rewrite event payloads already ingested. Mark any affected event window and avoid using incorrect raw event dimensions until a separate correction has been determined.

## Release and manual verification

1. Verify all four emitters and a small profile batch in Dev & QA.
2. Deploy Server first, followed by Server Side Logging and Developer Console.
3. Release extension Beta and observe at least 48 hours before Stable.
4. Update Lexicon descriptions for the new fields. Keep raw event properties and raw profile properties clearly distinguished.
5. Prepare/verify the historical mappings and credentials, apply a small production batch, then expand after checking reports.
6. Compare existing user and account retention reports across the migration date. Check raw completeness per emitter/version for identified events; anonymous events and older clients are separate populations.

These deployment, production-data and Lexicon steps are not performed by code tests or by committing this implementation. The project's ID Merge mode and existing UID lookup coverage still need operator verification before any future identity merge project.

## References

- [User Profile query-time joins](https://docs.mixpanel.com/docs/data-structure/user-profiles)
- [Query Profiles API](https://docs.mixpanel.com/reference/engage-query)
- [Set User Profile Property API](https://docs.mixpanel.com/reference/profile-set)
- [Group Analytics](https://docs.mixpanel.com/docs/data-structure/group-analytics)
