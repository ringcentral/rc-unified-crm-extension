# Performance Report

Audit date: July 13, 2026

## Summary

The most important performance risks are unbounded upstream API fan-out, globally large request bodies, missing request timeouts, and report routes without strong range limits. There was no evidence of classic database N+1 query loops in ORM-heavy code, but connector API loops can behave similarly against third-party CRMs.

## Findings

### PERF-01: NetSuite contact lookup can fan out to many SuiteQL calls

- Severity: High
- File: [src/connectors/netsuite/index.ts](/Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension/src/connectors/netsuite/index.ts:388)
- Explanation: `overridingFormat` is split into formats, then the code loops over `numberToQueryArray`. For each number it may send contact, customer, and vendor SuiteQL requests in parallel. A long format string can produce many upstream calls.
- Estimated impact: O(format count * selected entity types) NetSuite requests per lookup. This can increase latency, API quota usage, and Lambda duration.
- Recommendation: Cap format count and input length. Deduplicate `numberToQueryArray`. Use one query per entity with an `IN` style predicate if SuiteQL supports it.

### PERF-02: Global XML body limit is 50 MB

- Severity: Medium
- File: [packages/core/index.ts](/Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension/packages/core/index.ts:3263)
- Explanation: `bodyParser.xml({ limit: '50mb' })` is installed globally in core middleware. Large XML bodies can consume memory on endpoints that do not need XML.
- Estimated impact: Memory pressure and slower request parsing under abuse or accidental large submissions.
- Recommendation: Apply large XML parsing only to routes that require it. Use lower defaults and route-specific limits.

### PERF-03: Axios calls generally lack explicit timeouts

- Severity: Medium
- Files: [src/connectors/insightly/index.ts](/Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension/src/connectors/insightly/index.ts:31), [src/connectors/bullhorn/index.ts](/Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension/src/connectors/bullhorn/index.ts:308), [packages/core/handlers/plugin.ts](/Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension/packages/core/handlers/plugin.ts:70)
- Explanation: CRM, plugin, and OAuth requests commonly call `axios.get/post` without timeout. Hung upstream calls can tie up workers and Lambda invocations.
- Estimated impact: Latency spikes and increased cost during provider incidents.
- Recommendation: Create a shared HTTP client with timeout, retry budget, max redirects, and circuit-breaking rules.

### PERF-04: Admin report routes lack visible time-range caps

- Severity: Medium
- File: [packages/core/index.ts](/Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension/packages/core/index.ts:2728)
- Explanation: `timeFrom`, `timeTo`, and `groupBy` flow directly into report helpers. No maximum range or granularity cap is visible at the route layer.
- Estimated impact: Large RingCentral report windows can increase upstream cost and response time.
- Recommendation: Cap date ranges, validate `groupBy`, and paginate/report asynchronously for large ranges.

### PERF-05: Synchronous plugin chain is sequential

- Severity: Medium
- File: [packages/core/handlers/log.ts](/Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension/packages/core/handlers/log.ts:112)
- Explanation: `runSyncCallPlugins` posts to each synchronous plugin one after another, and each plugin can transform the payload before the next runs. This preserves semantics, but latency is additive.
- Estimated impact: Call-log creation latency grows linearly with plugin count and provider latency.
- Recommendation: Keep order only for plugins that declare dependencies. For independent enrichments, run in parallel with timeouts and partial-failure handling.

### PERF-06: Async plugin dispatch is also sequential

- Severity: Low
- File: [packages/core/handlers/log.ts](/Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension/packages/core/handlers/log.ts:239)
- Explanation: Async plugin dispatch loops with `await` per plugin.
- Estimated impact: Adds latency before request completion when many async plugins are installed.
- Recommendation: Use bounded concurrency and collect failures per plugin.

### PERF-07: Contact cache has no explicit TTL or normalization strategy

- Severity: Low
- File: [packages/core/handlers/contact.ts](/Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension/packages/core/handlers/contact.ts:51)
- Explanation: Contact lookup cache uses `dataKey: contact-${phoneNumber}`. There is no expiry and cache keys depend on input formatting.
- Estimated impact: Stale or duplicated cache entries can increase misses and return outdated CRM contacts.
- Recommendation: Normalize phone numbers before caching and add TTL/refresh metadata.

### PERF-08: Large generated/checked-in artifacts inflate repo and scans

- Severity: Low
- Files: [packages/core/mcp/ui/package-lock.json](/Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension/packages/core/mcp/ui/package-lock.json:1), [packages/template/package-lock.json](/Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension/packages/template/package-lock.json:1)
- Explanation: Lockfiles and docs image assets are legitimate, but they dominate line counts and scan volume. The root lockfile is intentionally absent, which also limits root dependency audit.
- Recommendation: Keep lockfiles where reproducibility is needed, but document which package trees are intentionally lockfile-managed.

### PERF-09: Plugin and connector media downloads buffer unbounded files

- Severity: Medium
- Files: [src/plugins/googleDrivePlugin.ts](/Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension/src/plugins/googleDrivePlugin.ts:146), [src/connectors/clio/index.ts](/Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension/src/connectors/clio/index.ts:1403)
- Explanation: Google Drive plugin downloads recording content as `arraybuffer` with `maxContentLength: Infinity` and `maxBodyLength: Infinity`, then concatenates a multipart upload buffer. Clio downloads image/fax attachments into memory as `arraybuffer`.
- Estimated impact: Large media responses can exhaust Lambda/container memory and increase latency/cost. The Google Drive path can also duplicate memory when constructing the multipart body.
- Recommendation: Stream downloads to uploads where possible, enforce maximum media size, and reject responses without an expected content type and content length.

## Reviewed With No Confirmed Issue

- No ORM-level N+1 query pattern was confirmed in the reviewed Sequelize routes.
- No expensive regular expression with confirmed user-controlled catastrophic backtracking was found.
- No unbounded in-memory file upload handler was found, but 50 MB XML parsing remains a denial-of-service concern.
