# Security Report

Audit date: July 13, 2026

Scope reviewed:
- 722 tracked files, including source, tests, docs, CI, package manifests, and templates.
- 216 source-like files were included in the deep security scan worklist.
- Binary/image assets and `.git` internals were inventoried but not semantically reviewed as source code.
- Six independent deep-scan workers completed before final report generation. The main-agent report below uses worker convergence plus targeted source validation for each reported issue.

## Summary

| Severity | Count |
|---|---:|
| Critical | 0 |
| High | 16 |
| Medium | 16 |
| Low | 4 |

Risk level: High.

No confirmed evidence was found for runtime OS command injection in request handlers, unsafe deserialization, XXE exploitation, committed private keys, Maven/Gradle/Go/Cargo dependency exposure, or cookie-based session fixation. These categories were reviewed through source search and route inspection. Several categories still have adjacent risks, especially query-string tokens, missing rate limiting, and OAuth callback trust.

## Findings

### SEC-01: Non-admin users can read account-wide RingCentral admin reports

- Severity: High
- Files: [packages/core/index.ts](/Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension/packages/core/index.ts:2721), [packages/core/handlers/admin.ts](/Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension/packages/core/handlers/admin.ts:160)
- CWE: CWE-862, CWE-863
- OWASP: A01 Broken Access Control

Explanation: `GET /ringcentral/admin/report` accepts any valid App Connect CRM JWT, loads the user, and calls `adminCore.getAdminReport`. The route does not call `adminCore.validateAdminRole`, while neighboring admin routes do. The helper then loads account admin tokens and calls RingCentral aggregation APIs.

Proof:
- `packages/core/index.ts:2728-2739` decodes `jwtToken`, checks `UserModel.findByPk`, and calls `adminCore.getAdminReport`.
- `packages/core/handlers/admin.ts:160-190` hashes `user.rcAccountId`, loads `AdminConfigModel`, and uses `adminAccessToken`.

Recommended fix:
- Require `X-RC-Access-Token` or `rcAccessToken` for this route.
- Call `validateAdminRole`.
- Ensure the validated RingCentral account equals `user.rcAccountId`.
- Add a negative test proving an ordinary CRM JWT cannot read the route.

Example secure code:

```ts
const jwtToken = req.jwtToken || req.query.jwtToken;
const decoded = jwt.decodeJwt(jwtToken);
const user = await UserModel.findByPk(decoded?.id);
const rcAccessToken = getRcAccessTokenFromRequest(req);
const adminValidation = await adminCore.validateAdminRole({ rcAccessToken });

if (!user || !adminValidation.isValidated || String(adminValidation.rcAccountId) !== String(user.rcAccountId)) {
  return res.status(403).send({ error: 'Admin role required' });
}
```

### SEC-02: Non-admin users can query another extension's RingCentral report

- Severity: High
- Files: [packages/core/index.ts](/Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension/packages/core/index.ts:2767), [packages/core/handlers/admin.ts](/Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension/packages/core/handlers/admin.ts:236)
- CWE: CWE-639, CWE-862, CWE-863
- OWASP: A01 Broken Access Control

Explanation: `GET /ringcentral/admin/userReport` accepts caller-controlled `rcExtensionId`, authenticates only the CRM JWT, and fetches call/SMS data with stored account admin tokens.

Proof:
- `packages/core/index.ts:2774-2785` passes `req.query.rcExtensionId` into `getUserReport`.
- `packages/core/handlers/admin.ts:236-281` uses stored account admin tokens to call RingCentral APIs for the supplied extension.

Recommended fix:
- Require admin validation for arbitrary `rcExtensionId`.
- If non-admin self-service is intended, derive extension id from the validated RingCentral token and ignore caller-supplied values.

Example secure code:

```ts
const { isValidated, rcAccountId } = await adminCore.validateAdminRole({ rcAccessToken });
if (!isValidated || String(rcAccountId) !== String(user.rcAccountId)) {
  return res.status(403).send({ error: 'Admin role required' });
}
```

### SEC-03: Non-admin users can overwrite stored RingCentral admin OAuth tokens

- Severity: High
- Files: [packages/core/index.ts](/Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension/packages/core/index.ts:2812), [packages/core/handlers/auth.ts](/Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension/packages/core/handlers/auth.ts:336), [packages/core/handlers/admin.ts](/Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension/packages/core/handlers/admin.ts:114)
- CWE: CWE-862, CWE-284
- OWASP: A01 Broken Access Control

Explanation: `/ringcentral/oauth/callback` accepts a normal app JWT, exchanges the supplied RingCentral OAuth `code`, and stores the resulting tokens as account admin tokens for `user.rcAccountId`. There is no admin-role check or state binding to an admin-initiated flow.

Proof:
- `packages/core/index.ts:2815-2825` checks only CRM JWT/user existence.
- `packages/core/handlers/auth.ts:346-353` exchanges `code` and calls `updateAdminRcTokens`.
- `packages/core/handlers/admin.ts:114-125` upserts `adminAccessToken` and `adminRefreshToken`.

Recommended fix:
- Create a server-side OAuth state record when an admin starts the flow.
- Bind state to validated RingCentral admin account and extension.
- On callback, verify state, account id, nonce, expiration, and admin role before storing tokens.

Example secure code:

```ts
const state = await adminOAuthStateStore.consume(req.query.state);
if (!state || state.expiresAt < new Date()) {
  return res.status(400).send({ error: 'Invalid OAuth state' });
}
const admin = await adminCore.validateAdminRole({ rcAccessToken: state.rcAccessToken });
if (!admin.isValidated || String(admin.rcAccountId) !== String(user.rcAccountId)) {
  return res.status(403).send({ error: 'Admin role required' });
}
```

### SEC-04: Insightly API-key login can SSRF to caller-controlled URLs

- Severity: High
- Files: [packages/core/index.ts](/Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension/packages/core/index.ts:1331), [packages/core/handlers/auth.ts](/Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension/packages/core/handlers/auth.ts:124), [src/connectors/insightly/index.ts](/Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension/src/connectors/insightly/index.ts:28)
- CWE: CWE-918, CWE-200
- OWASP: A10 Server-Side Request Forgery, A01 Broken Access Control

Explanation: Anonymous callers can post to `/apiKeyLogin` with `platform=insightly` and `additionalInfo.apiUrl`. The connector uses that value as the base URL for `axios.get` and sends a Basic Authorization header derived from the submitted API key.

Proof:
- `packages/core/index.ts:1346-1378` accepts `platform`, `apiKey`, and `additionalInfo`; `rcAccessToken` is optional.
- `packages/core/handlers/auth.ts:164-172` sends `additionalInfo` to the connector.
- `src/connectors/insightly/index.ts:30-35` calls `axios.get(`${additionalInfo.apiUrl}/.../users/me`, { Authorization })`.

Recommended fix:
- Enforce an allowlist for Insightly API hostnames.
- Reject private, loopback, link-local, and metadata IP ranges after DNS resolution.
- Add request timeout and maximum redirect count.

Example secure code:

```ts
function requireInsightlyBaseUrl(input: string): string {
  const url = new URL(input);
  if (url.protocol !== 'https:' || !url.hostname.endsWith('.insightly.com')) {
    throw new Error('Invalid Insightly API URL');
  }
  return `${url.origin}`;
}
```

### SEC-05: Bullhorn OAuth callback trusts caller-supplied tokenUrl and apiUrl

- Severity: High
- Files: [packages/core/index.ts](/Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension/packages/core/index.ts:1219), [packages/core/handlers/auth.ts](/Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension/packages/core/handlers/auth.ts:30), [src/connectors/bullhorn/index.ts](/Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension/src/connectors/bullhorn/index.ts:96)
- CWE: CWE-918, CWE-346, CWE-200
- OWASP: A10 Server-Side Request Forgery, A07 Identification and Authentication Failures

Explanation: `/oauth-callback` reads `tokenUrl` and `apiUrl` from the request. The Bullhorn connector maps `tokenUrl` directly to OAuth `accessTokenUri`, which sends client credentials and authorization code parameters to that endpoint. It also posts the resulting token to `apiUrl`.

Proof:
- `packages/core/index.ts:1240-1266` derives platform from state/callbackUri and reads `req.query.tokenUrl`.
- `packages/core/handlers/auth.ts:52-73` builds OAuth info and performs `code.getToken`.
- `src/connectors/bullhorn/index.ts:96-101` returns `accessTokenUri: tokenUrl`.
- `src/connectors/bullhorn/index.ts:306-310` posts to `apiUrl` and then queries `restUrl`.

Recommended fix:
- Bind OAuth state to server-side connector configuration.
- Never accept token endpoints from callback query parameters.
- Allowlist Bullhorn token and login hosts.

### SEC-06: Proxy OAuth connector permits callback tokenUrl override

- Severity: High
- Files: [packages/core/connector/proxy/index.ts](/Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension/packages/core/connector/proxy/index.ts:57), [packages/core/lib/oauth.ts](/Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension/packages/core/lib/oauth.ts:19)
- CWE: CWE-918, CWE-346
- OWASP: A10 Server-Side Request Forgery

Explanation: Proxy connector OAuth configuration allows `tokenUrl || cfg.auth.tokenUrl`. A callback-supplied `tokenUrl` can override a configured connector endpoint and receive connector client credentials during token exchange.

Proof:
- `packages/core/connector/proxy/index.ts:57-66` returns `accessTokenUri: tokenUrl || cfg.auth.tokenUrl`.
- `packages/core/lib/oauth.ts:19-34` configures `client-oauth2` with that URI.

Recommended fix:
- Remove callback-level `tokenUrl` override for proxy connectors.
- Store allowed auth/token endpoints in connector config and validate against them.

### SEC-07: MCP cached session id can bypass live RingCentral bearer validation

- Severity: High
- Files: [packages/core/index.ts](/Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension/packages/core/index.ts:3179), [packages/core/mcp/mcpHandler.ts](/Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension/packages/core/mcp/mcpHandler.ts:211)
- CWE: CWE-287, CWE-863
- OWASP: A07 Identification and Authentication Failures

Explanation: The `/mcp` middleware checks that a bearer token string exists but does not verify it. `resolveSessionContext` returns cached `rcExtensionId` for an `openaiSessionId` before validating the current RingCentral bearer token. A leaked/reused OpenAI session id within the 24-hour cache TTL can recover a CRM JWT for that extension.

Proof:
- `packages/core/index.ts:3186-3224` only checks token presence for protected MCP methods.
- `packages/core/mcp/mcpHandler.ts:214-219` returns cached extension id before `resolveRcExtensionId`.
- `packages/core/mcp/mcpHandler.ts:357-408` loads or generates an App Connect JWT for that extension.

Recommended fix:
- Verify the current RingCentral bearer token on every protected tool call, or bind the cache entry to a hash of the bearer token and invalidate on mismatch.
- Keep the cache TTL short and store a server-issued nonce.

Example secure code:

```ts
const liveExtensionId = await resolveRcExtensionId(rcAccessToken);
if (!liveExtensionId) throw new Error('Invalid RingCentral token');
const cacheKey = `${openaiSessionId}-${hashToken(rcAccessToken)}-${RC_EXTENSION_CACHE_KEY}`;
```

### SEC-08: Plugin license lookup is not bound to authenticated user's account

- Severity: High
- Files: [packages/core/index.ts](/Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension/packages/core/index.ts:2998), [packages/core/handlers/plugin.ts](/Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension/packages/core/handlers/plugin.ts:58)
- CWE: CWE-639, CWE-863
- OWASP: A01 Broken Access Control

Explanation: `/plugin/licenseStatus` requires a CRM JWT but then trusts caller-supplied `rcAccountId` and `pluginId`. It reads that account's plugin data and forwards the stored plugin JWT to `licenseStatusUrl`.

Proof:
- `packages/core/index.ts:3008-3020` validates only that some user exists.
- `packages/core/handlers/plugin.ts:58-74` looks up `AccountDataModel` by supplied `rcAccountId` and forwards `accountData.data.jwtToken`.

Recommended fix:
- Use `user.rcAccountId` from the authenticated user, not `req.query.rcAccountId`.
- For admin-only cross-account reads, require `validateAdminRole`.

### SEC-09: Weak deterministic encryption and plaintext token storage

- Severity: High
- Files: [packages/core/lib/encode.ts](/Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension/packages/core/lib/encode.ts:3), [packages/core/models/userModel.ts](/Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension/packages/core/models/userModel.ts:27), [packages/core/models/adminConfigModel.ts](/Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension/packages/core/models/adminConfigModel.ts:19)
- CWE: CWE-327, CWE-312
- OWASP: A02 Cryptographic Failures

Explanation: `encode.ts` uses AES-256-CBC with a static zero IV and no authentication tag. The key is padded or truncated from `APP_SERVER_SECRET_KEY`. User OAuth/API tokens and RingCentral admin tokens are stored as plain string columns.

Proof:
- `packages/core/lib/encode.ts:7-24` pads/truncates the key and uses `Buffer.alloc(16, 0)`.
- `packages/core/models/userModel.ts:27-33` stores access/refresh tokens directly.
- `packages/core/models/adminConfigModel.ts:19-24` stores admin tokens directly.

Recommended fix:
- Use KMS/Secrets Manager or envelope encryption.
- For application-level encryption, use AES-256-GCM with random 96-bit IV and auth tag, with keys derived by HKDF or managed by KMS.
- Migrate existing records.

Example secure code:

```ts
const iv = crypto.randomBytes(12);
const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
const tag = cipher.getAuthTag();
return Buffer.concat([iv, tag, ciphertext]).toString('base64');
```

### SEC-10: Root and template dbAccessor execute arbitrary SQL when deployed/invoked

- Severity: High, deployment-dependent
- Files: [src/dbAccessor.ts](/Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension/src/dbAccessor.ts:11), [scripts/serverless-build.ts](/Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension/scripts/serverless-build.ts:38), [packages/template/src/dbAccessor.ts](/Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension/packages/template/src/dbAccessor.ts:4), [packages/template/serverless-deploy/sample.serverless.yml](/Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension/packages/template/serverless-deploy/sample.serverless.yml:31)
- CWE: CWE-89, CWE-862
- OWASP: A03 Injection, A01 Broken Access Control

Explanation: `dbAccessor.app` accepts `input.dbQuery` and sends it directly to `sequelize.query`. The root build copies `dbAccessor.js` into the deploy package, and the template declares a `dbAccessor` Lambda function. No HTTP event was found for the root handler, so exposure depends on IAM or external deployment wiring. If invoked by an untrusted principal this becomes critical, but the reviewed repository does not prove public exposure.

Proof:
- `src/dbAccessor.ts:11-14` logs and executes `input.dbQuery`.
- `scripts/serverless-build.ts:38-41` copies it into deployment.
- `packages/template/serverless-deploy/sample.serverless.yml:31-41` declares `dbAccessor`.

Recommended fix:
- Remove `dbAccessor` from deployment packages.
- If operational SQL is required, gate it behind explicit IAM admin roles, signed requests, read-only allowlists, and parameterized templates.

### SEC-11: Unauthenticated preload settings lookup by account hash

- Severity: Medium
- Files: [packages/core/index.ts](/Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension/packages/core/index.ts:1018), [packages/core/handlers/user.ts](/Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension/packages/core/handlers/user.ts:107)
- CWE: CWE-862, CWE-200, CWE-639
- OWASP: A01 Broken Access Control

Explanation: `/user/preloadSettings` allows a caller to supply `rcAccountId` instead of a RingCentral token. In that branch, `getUserSettingsByAdmin` treats the value as the `AdminConfigModel` primary key and returns `userSettings` without authentication. The authenticated `/user/settings` route also forwards caller-supplied `rcAccountId` into the same admin-setting merge path, so an authenticated user can select another account's admin defaults if they know the hashed account key.

Proof:
- `packages/core/index.ts:1022-1026` accepts `rcAccessToken || rcAccountId`.
- `packages/core/index.ts:1107-1110` passes `req.query.rcAccountId` to `userCore.getUserSettings`.
- `packages/core/handlers/user.ts:107-124` uses supplied `rcAccountId` as `hashedRcAccountId`.
- `packages/core/handlers/user.ts:168-191` merges plugin admin config values into user settings.

Recommended fix:
- Remove unauthenticated `rcAccountId` lookup.
- Always derive account identity from a validated RingCentral access token.

### SEC-12: NetSuite contact search interpolates raw phone number into SuiteQL

- Severity: Medium
- Files: [packages/core/index.ts](/Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension/packages/core/index.ts:1477), [src/connectors/netsuite/index.ts](/Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension/src/connectors/netsuite/index.ts:353)
- CWE: CWE-89
- OWASP: A03 Injection

Explanation: When `overridingFormat` is non-empty, `numberToQueryArray` includes caller-derived query values, including the raw phone value and formatted variants. `buildContactSearchCondition` interpolates them into single-quoted SuiteQL equality conditions.

Proof:
- `packages/core/index.ts:1502-1504` passes query `phoneNumber` and `overridingFormat`.
- `src/connectors/netsuite/index.ts:388-390` adds the raw phone value.
- `src/connectors/netsuite/index.ts:1862-1868` interpolates it into SQL text.

Recommended fix:
- Validate phone input to E.164 or extension-only format.
- Escape single quotes if SuiteQL has no parameter API.
- Prefer connector API filters over string-built SuiteQL when available.

Example secure code:

```ts
function assertPhoneQueryValue(value: string): string {
  if (!/^[+0-9(). -]{1,32}$/.test(value)) {
    throw new Error('Invalid phone number');
  }
  return value.replace(/'/g, "''");
}
```

### SEC-13: Bullhorn user lookup interpolates callback username into query

- Severity: Medium
- Files: [packages/core/index.ts](/Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension/packages/core/index.ts:1219), [packages/core/handlers/auth.ts](/Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension/packages/core/handlers/auth.ts:30), [src/connectors/bullhorn/index.ts](/Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension/src/connectors/bullhorn/index.ts:306)
- CWE: CWE-89
- OWASP: A03 Injection

Explanation: `/oauth-callback` passes `req.query.username` through `authCore.onOAuthCallback`; Bullhorn then builds a query URL containing `where=username='${username}'`. A valid OAuth flow is still required, but the username portion is not encoded as a Bullhorn query literal.

Proof:
- `packages/core/handlers/auth.ts:32-75` passes `username` to `platformModule.getUserInfo`.
- `src/connectors/bullhorn/index.ts:310` embeds `username` into the Bullhorn query.

Recommended fix:
- Encode/escape Bullhorn query string literals.
- Prefer a user identity endpoint that derives the user from the token rather than a user-supplied `username`.

### SEC-14: Long-lived JWTs and query-string token compatibility increase exposure

- Severity: Medium
- Files: [packages/core/index.ts](/Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension/packages/core/index.ts:177), [packages/core/lib/jwt.ts](/Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension/packages/core/lib/jwt.ts:6), [packages/core/mcp/tools/getGoogleFilePicker.ts](/Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension/packages/core/mcp/tools/getGoogleFilePicker.ts:74), [src/plugins/googleDrivePlugin.ts](/Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension/src/plugins/googleDrivePlugin.ts:21)
- CWE: CWE-598, CWE-319
- OWASP: A02 Cryptographic Failures, A07 Identification and Authentication Failures

Explanation: The app promotes `jwtToken` query parameters to bearer auth and also accepts `rcAccessToken` in query/body. JWTs last two weeks. Several flows build URLs containing JWTs, which can leak via browser history, proxies, referrers, debug traces, and logs.

Proof:
- `packages/core/index.ts:181-189` promotes `req.query.jwtToken`.
- `packages/core/index.ts:151-157` accepts `rcAccessToken` from query/body.
- `packages/core/lib/jwt.ts:6-12` signs/verifies two-week tokens.
- `packages/core/mcp/tools/getGoogleFilePicker.ts:74-80` creates URLs with `jwtToken`.

Recommended fix:
- Deprecate query-string tokens.
- Use Authorization headers or short-lived one-time opaque state.
- Add issuer, audience, and algorithm pinning to JWT verification.

### SEC-15: Async plugin callback relies only on UUID task-id secrecy

- Severity: Medium
- Files: [packages/core/index.ts](/Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension/packages/core/index.ts:2867), [packages/core/handlers/log.ts](/Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension/packages/core/handlers/log.ts:415)
- CWE: CWE-306, CWE-345
- OWASP: A01 Broken Access Control

Explanation: `/plugin/async-callback/:taskId` has no authentication. The task id is a random UUID, but any leaked callback URL can mark a task failed or append a note for up to one week.

Proof:
- `packages/core/index.ts:2867-2875` exposes the callback route without auth.
- `packages/core/handlers/log.ts:415-461` updates task state based on `taskId` and body.

Recommended fix:
- Add an HMAC signature header over `taskId`, body hash, and timestamp.
- Verify plugin identity using the stored plugin JWT or a callback secret.
- Shorten callback TTL.

### SEC-16: Missing centralized rate limiting

- Severity: Medium
- Files: [packages/core/index.ts](/Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension/packages/core/index.ts:1331), [packages/core/index.ts](/Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension/packages/core/index.ts:1219)
- CWE: CWE-307, CWE-770
- OWASP: A07 Identification and Authentication Failures

Explanation: No `express-rate-limit`, reverse-proxy limiter, or per-route throttling was found. Login, OAuth callback, report, and plugin callback endpoints can be abused for brute force, SSRF amplification, and expensive upstream calls.

Recommended fix:
- Add per-IP and per-account rate limits.
- Use stricter limits for unauthenticated flows like `/apiKeyLogin` and OAuth callbacks.
- Emit audit events for blocked requests.

### SEC-17: Wildcard CORS on API and MCP routes

- Severity: Medium
- Files: [packages/core/index.ts](/Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension/packages/core/index.ts:3226), [packages/core/index.ts](/Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension/packages/core/index.ts:3273)
- CWE: CWE-942
- OWASP: A05 Security Misconfiguration

Explanation: Core `cors()` defaults to `Access-Control-Allow-Origin: *`, and MCP endpoints explicitly set `*`. Since the app uses bearer tokens rather than cookies, this is not a standalone CSRF issue, but it compounds token-in-URL and browser-exposed endpoints.

Recommended fix:
- Configure environment-specific origin allowlists.
- Use separate, strict CORS policy for MCP/widget routes.

### SEC-18: JWT verification lacks issuer, audience, and algorithm pinning

- Severity: Medium
- File: [packages/core/lib/jwt.ts](/Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension/packages/core/lib/jwt.ts:6)
- CWE: CWE-347
- OWASP: A07 Identification and Authentication Failures

Explanation: JWTs are signed and verified with a shared secret and two-week expiry, but verification does not set `issuer`, `audience`, or `algorithms`. This increases the blast radius of any shared secret reuse and makes tokens harder to scope.

Recommended fix:

```ts
return sign(data, secret, {
  expiresIn: '30m',
  issuer: 'app-connect-server',
  audience: 'app-connect-api',
  algorithm: 'HS256'
});
```

### SEC-19: Sensitive values can be printed by CLI environment helper

- Severity: Low
- File: [packages/cli/src/lib/env.ts](/Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension/packages/cli/src/lib/env.ts:134)
- CWE: CWE-532
- OWASP: A09 Security Logging and Monitoring Failures

Explanation: `displayOverview` prints truncated current values and `viewAllValues` prints full environment variable values. This can expose secrets in terminal recordings or support logs.

Proof:
- `packages/cli/src/lib/env.ts:143-152` prints partial current values.
- `packages/cli/src/lib/env.ts:296-302` prints full values.

Recommended fix:
- Mask all variables with names containing `SECRET`, `TOKEN`, `KEY`, `PASSWORD`, or `CLIENT_SECRET`.

### SEC-20: Local fallback object-store credentials are hardcoded

- Severity: Low
- File: [packages/core/lib/s3ErrorLogReport.ts](/Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension/packages/core/lib/s3ErrorLogReport.ts:17)
- CWE: CWE-798
- OWASP: A05 Security Misconfiguration

Explanation: When `ERROR_REPORT_S3_BUCKET` is absent, the S3 client uses local MinIO-style `minioadmin/minioadmin`. This appears local-only because it is gated by `IS_LOCAL`, but it is still a hardcoded credential pattern.

Recommended fix:
- Read local credentials from `.env.test` or documented local config.
- Fail fast if local mode is accidentally used in production.

### SEC-21: getHashValue is a plain SHA-256 of value plus secret

- Severity: Low
- File: [packages/core/lib/util.ts](/Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension/packages/core/lib/util.ts:17)
- CWE: CWE-327
- OWASP: A02 Cryptographic Failures

Explanation: Account and extension identifiers are hashed with `sha256("${string}:${secretKey}")` instead of HMAC. If `HASH_KEY` is missing, the literal string `undefined` becomes part of the hash input.

Recommended fix:
- Use `crypto.createHmac('sha256', requiredHashKey)`.
- Throw when `HASH_KEY` is missing.

### SEC-22: Debug and error logging can disclose sensitive URLs and response bodies

- Severity: Medium
- Files: [packages/core/lib/logger.ts](/Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension/packages/core/lib/logger.ts:82), [packages/core/index.ts](/Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension/packages/core/index.ts:1222), [src/connectors/netsuite/index.ts](/Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension/src/connectors/netsuite/index.ts:693)
- CWE: CWE-532
- OWASP: A09 Security Logging and Monitoring Failures

Explanation: `DebugTracer` performs key-based redaction, but the general logger does not centrally redact URLs, query strings, provider response bodies, or nested tokens. Several route traces include `req.query`, and NetSuite logs failed SuiteQL query text.

Recommended fix:
- Add central structured redaction for token-like values in `logger`.
- Strip query strings from logged URLs.
- Avoid returning debug traces in production.

### SEC-23: No CSRF issue found for cookie sessions, but state-changing GET/DELETE routes remain risky

- Severity: Low
- Files: [packages/core/index.ts](/Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension/packages/core/index.ts:2812), [src/index.ts](/Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension/src/index.ts:285)
- CWE: CWE-352
- OWASP: A01 Broken Access Control

Explanation: The app does not appear to rely on browser cookies for authentication, so classic cookie CSRF was not found. However, state-changing flows are exposed through GET callbacks and DELETE bodies with basic auth. Combined with query tokens and wildcard CORS, this deserves hardening.

Recommended fix:
- Keep state changes on POST with explicit CSRF/state tokens where browser-facing.
- Ensure OAuth callbacks consume server-side one-time state.

### SEC-24: Pipedrive OAuth callback can persist arbitrary hostname for later bearer-token calls

- Severity: High
- Files: [packages/core/index.ts](/Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension/packages/core/index.ts:1240), [packages/core/handlers/auth.ts](/Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension/packages/core/handlers/auth.ts:54), [src/connectors/pipedrive/index.ts](/Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension/src/connectors/pipedrive/index.ts:32)
- CWE: CWE-918, CWE-346, CWE-200
- OWASP: A10 Server-Side Request Forgery, A07 Identification and Authentication Failures

Explanation: `/oauth-callback` accepts `hostname` from query/state and `authCore` persists `resolvedHostname` unless the connector overrides it. Pipedrive only overrides when `hostname == 'temp'`. For any other caller-supplied hostname, the app stores it and later sends bearer-token API requests to `https://${user.hostname}`.

Proof:
- `packages/core/index.ts:1240-1266` reads `hostname` from request data and passes it to `onOAuthCallback`.
- `packages/core/handlers/auth.ts:54-87` persists `resolvedHostname` when `platformUserInfo.overridingHostname` is null.
- `src/connectors/pipedrive/index.ts:55` only overrides the hostname for the literal `temp` case.
- `src/connectors/pipedrive/index.ts:153-156` uses persisted `user.hostname` in an Authorization-bearing request.

Recommended fix:
- Store the selected Pipedrive domain in server-side OAuth state before redirect.
- On callback, ignore query `hostname` unless it matches the pending state and an allowlisted Pipedrive host.
- After fetching `/users/me`, always derive the persisted hostname from the verified company domain.

Example secure code:

```ts
const expected = await oauthStateStore.consume(state);
if (!expected || expected.platform !== 'pipedrive') throw new Error('Invalid OAuth state');
const persistedHostname = `${platformUserInfo.companyDomain}.pipedrive.com`;
```

### SEC-25: Clio OAuth callback sends bearer token to caller-controlled hostname

- Severity: High
- Files: [packages/core/index.ts](/Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension/packages/core/index.ts:1250), [src/connectors/clio/index.ts](/Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension/src/connectors/clio/index.ts:72)
- CWE: CWE-918, CWE-346, CWE-200
- OWASP: A10 Server-Side Request Forgery, A07 Identification and Authentication Failures

Explanation: Clio chooses client credentials/token hosts by hostname prefix, but it does not reject unknown hostnames. After token exchange, `getUserInfo` calls `https://${hostname}/api/v4/users/who_am_i.json` with the freshly issued bearer token. A malicious callback hostname can receive or observe that request.

Proof:
- `src/connectors/clio/index.ts:72-103` falls back to default Clio OAuth credentials for non-AU/EU/CA hostnames.
- `src/connectors/clio/index.ts:106-110` sends the Authorization header to `https://${hostname}`.
- `src/connectors/clio/index.ts:223-226` later uses persisted `user.hostname` for contact API calls.

Recommended fix:
- Reject hostnames outside exact Clio regional host allowlists.
- Bind selected region/hostname to server-side OAuth state.
- Do not call arbitrary callback-provided hosts with provider tokens.

### SEC-26: Clio message logging downloads caller-supplied attachment URIs with RingCentral tokens

- Severity: High
- Files: [packages/core/handlers/log.ts](/Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension/packages/core/handlers/log.ts:1195), [src/connectors/clio/index.ts](/Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension/src/connectors/clio/index.ts:1403)
- CWE: CWE-918, CWE-200
- OWASP: A10 Server-Side Request Forgery

Explanation: Message logging builds `imageDownloadLink` and `faxDownloadLink` from attachment `uri` values in the request body and appends the RingCentral access token as a query parameter. The Clio connector then downloads that URL server-side. If an attacker controls attachment URIs, this can SSRF internal services and leak the RingCentral token in the request URL.

Proof:
- `packages/core/handlers/log.ts:1195-1207` appends `?access_token=${incomingData.logInfo.rcAccessToken}` to attachment `uri`.
- `src/connectors/clio/index.ts:1403-1405` downloads `imageDownloadLink` with `axios.get`.
- `src/connectors/clio/index.ts:1460-1462` downloads `faxDownloadLink` with `axios.get`.

Recommended fix:
- Accept only RingCentral media URLs derived from trusted RingCentral API responses.
- Pass RingCentral tokens in headers, not query strings.
- Apply SSRF URL policy, size limits, and timeouts to media downloads.

### SEC-27: Google Drive plugin fetches attacker-selected recording URLs and forwards bearer tokens

- Severity: High
- Files: [src/index.ts](/Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension/src/index.ts:364), [src/plugins/googleDrivePlugin.ts](/Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension/src/plugins/googleDrivePlugin.ts:146)
- CWE: CWE-918, CWE-200, CWE-400
- OWASP: A10 Server-Side Request Forgery, A04 Insecure Design

Explanation: `POST /plugin/googleDrive` accepts caller-supplied `data.logInfo.recordingDownloadLink` or `recording.downloadUrl`. The plugin extracts an `accessToken` substring from that URL, performs `axios.get(fileUrl)` with `Authorization: Bearer ${token}`, allows infinite content/body length, buffers the full response, and uploads it to Google Drive. The route also fails to `await` the plugin promise, so failures are not reported correctly.

Proof:
- `src/index.ts:364-386` decodes the JWT and calls `googleDrivePlugin.uploadToGoogleDrive` without `await`.
- `src/plugins/googleDrivePlugin.ts:211-234` reads `fileUrl` from request body and extracts `accessToken` from it.
- `src/plugins/googleDrivePlugin.ts:146-155` downloads the URL with an Authorization header and unbounded content limits.
- `src/plugins/googleDrivePlugin.ts:278-288` uploads the downloaded buffer to Google Drive with unbounded body settings.

Recommended fix:
- Derive recording download URLs server-side from RingCentral APIs instead of trusting plugin request bodies.
- Enforce RingCentral media host allowlists, private-network blocking, size limits, and timeouts.
- Pass tokens in headers to trusted RingCentral endpoints only.
- `await` plugin execution and return deterministic success/failure.

Example secure code:

```ts
const recordingUrl = await ringCentralMediaUrlFor({ user, recordingId });
assertAllowedMediaUrl(recordingUrl);
const response = await http.get(recordingUrl, {
  headers: { Authorization: `Bearer ${rcAccessToken}` },
  timeout: 10_000,
  maxContentLength: 25 * 1024 * 1024,
});
```

### SEC-28: Proxy connector loads private connector config by unscoped proxyId

- Severity: High
- Files: [packages/core/index.ts](/Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension/packages/core/index.ts:1331), [packages/core/models/dynamo/connectorSchema.ts](/Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension/packages/core/models/dynamo/connectorSchema.ts:129), [packages/core/connector/proxy/engine.ts](/Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension/packages/core/connector/proxy/engine.ts:122)
- CWE: CWE-639, CWE-918, CWE-200
- OWASP: A01 Broken Access Control, A10 Server-Side Request Forgery

Explanation: `/apiKeyLogin` accepts `proxyId` from the request body and forwards it to the proxy connector. `Connector.getProxyConfig(proxyId)` queries a global index by `proxyId` only and decrypts `secretKey` without proving the connector belongs to the authenticated RingCentral account. The proxy engine then renders configured URLs, headers, query params, and body using user/API credentials and `secretKey`.

Proof:
- `packages/core/index.ts:1346-1377` accepts `proxyId`; a RingCentral token is optional, and when present it is not used to scope `proxyId`.
- `packages/core/models/dynamo/connectorSchema.ts:129-142` queries `proxyIdIndex` and returns decrypted `secretKey`.
- `packages/core/connector/proxy/engine.ts:122-151` renders URL/headers/body and performs the outbound Axios request.

Recommended fix:
- Key proxy connector lookup by `{ ownerRcAccountId, proxyId }`.
- Require RingCentral token validation before private connector use.
- Apply connector URL policy and disallow absolute URLs outside the connector's configured allowlist.

### SEC-29: Call-log lookup and update trust caller-supplied identity filters

- Severity: High
- Files: [packages/core/index.ts](/Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension/packages/core/index.ts:2144), [packages/core/index.ts](/Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension/packages/core/index.ts:2278), [packages/core/handlers/log.ts](/Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension/packages/core/handlers/log.ts:729), [packages/core/lib/callLogLookup.ts](/Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension/packages/core/lib/callLogLookup.ts:44)
- CWE: CWE-639, CWE-862
- OWASP: A01 Broken Access Control

Explanation: `GET /callLog` and `PATCH /callLog` authenticate the App Connect JWT but use caller-supplied `sessionIds`, `sessionId`, `extensionNumber`, and `hashedExtensionId` to select persisted `CallLogModel` records. The lookup helper intentionally falls back to legacy records with empty `hashedExtensionId`. A caller who knows or guesses session identifiers and identity filters can learn third-party CRM log ids and can attempt updates through their own CRM credentials.

Proof:
- `packages/core/index.ts:2163-2170` passes `req.query.sessionIds`, `extensionNumber`, and `hashedExtensionId` to `logCore.getCallLog`.
- `packages/core/index.ts:2297` passes request-body identity values to `logCore.updateCallLog`.
- `packages/core/handlers/log.ts:729-750` queries and returns matched `thirdPartyLogId`.
- `packages/core/handlers/log.ts:786-792` selects an existing call log for update using request-derived filters.
- `packages/core/lib/callLogLookup.ts:63-76` builds query conditions from caller-supplied identity values.

Recommended fix:
- Derive `hashedExtensionId` and extension identity from the authenticated user/RingCentral token, not request input.
- Include `userId`, `rcAccountId`, or another authenticated owner key in the persisted call-log lookup.
- Remove broad legacy fallback for authenticated routes, or gate it behind a migration-only path.

### SEC-30: OAuth callback trusts query rcAccountId for managed OAuth account binding

- Severity: Medium
- Files: [packages/core/index.ts](/Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension/packages/core/index.ts:1219), [packages/core/handlers/auth.ts](/Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension/packages/core/handlers/auth.ts:43), [packages/core/handlers/auth.ts](/Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension/packages/core/handlers/auth.ts:80)
- CWE: CWE-639, CWE-863
- OWASP: A01 Broken Access Control, A07 Identification and Authentication Failures

Explanation: `onOAuthCallback` resolves managed OAuth configuration and saves the CRM user with `query.rcAccountId`. The callback path does not prove that the OAuth state was issued for that account or that the RingCentral account context is owned by the connecting user.

Proof:
- `packages/core/handlers/auth.ts:43-52` resolves managed OAuth info using `query.rcAccountId`.
- `packages/core/handlers/auth.ts:80-92` saves the user with `rcAccountId: query?.rcAccountId`.

Recommended fix:
- Store `rcAccountId`, connector id, and nonce in server-side OAuth state before redirect.
- On callback, consume state and ignore query-level account ids.
- Validate account membership when a RingCentral token is present.

### SEC-31: Plugin registration posts RingCentral access tokens to manifest-supplied URLs

- Severity: Medium
- Files: [packages/core/index.ts](/Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension/packages/core/index.ts:2884), [packages/core/handlers/plugin.ts](/Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension/packages/core/handlers/plugin.ts:100)
- CWE: CWE-200, CWE-346
- OWASP: A05 Security Misconfiguration, A07 Identification and Authentication Failures

Explanation: `/plugin/register` correctly validates RingCentral admin role and account match, but `registerPluginAccount` then fetches a plugin manifest and posts the admin RingCentral access token to `pluginManifest.userRegisterEndpointUrl`. If the manifest source or a private/shared plugin entry is compromised, an admin token is exfiltrated by design.

Proof:
- `packages/core/index.ts:2901-2918` validates admin role and forwards `rcAccessToken` to plugin registration.
- `packages/core/handlers/plugin.ts:100-116` fetches manifest data.
- `packages/core/handlers/plugin.ts:188-192` posts `{ rcAccessToken, rcAccountId }` to the manifest-provided registration URL.

Recommended fix:
- Do not send raw RingCentral access tokens to plugin-owned registration URLs.
- Use a scoped server-issued installation token or perform RingCentral calls server-side.
- Require manifest URL allowlists, signed manifests, and explicit admin consent for token delegation.

### SEC-32: Bullhorn contact-name search builds search DSL from unescaped user input

- Severity: Medium
- Files: [packages/core/index.ts](/Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension/packages/core/index.ts:2660), [packages/core/handlers/contact.ts](/Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension/packages/core/handlers/contact.ts:232), [src/connectors/bullhorn/index.ts](/Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension/src/connectors/bullhorn/index.ts:920)
- CWE: CWE-89
- OWASP: A03 Injection

Explanation: `/custom/contact/search` forwards `req.query.name` to Bullhorn. The connector interpolates that value into Bullhorn search DSL clauses such as `name:"${name}"`, `firstName:${nameComponents[0]}`, and `lastName:${...}`. A malicious name can alter the search expression and bypass intended filters.

Proof:
- `packages/core/index.ts:2678-2680` passes `req.query.name`.
- `packages/core/handlers/contact.ts:280` forwards `name` to the connector.
- `src/connectors/bullhorn/index.ts:921-945` builds and posts `combinedQuery` to ClientContact search.
- `src/connectors/bullhorn/index.ts:973-1009` reuses the same query for Candidate and Lead searches.

Recommended fix:
- Escape Bullhorn search syntax characters in all literals.
- Reject names with unsupported control/query characters.
- Prefer structured search parameters if available.

### SEC-33: Google Drive folder lookup interpolates unescaped phone-derived folderName

- Severity: Medium
- Files: [src/plugins/googleDrivePlugin.ts](/Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension/src/plugins/googleDrivePlugin.ts:63), [src/plugins/googleDrivePlugin.ts](/Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension/src/plugins/googleDrivePlugin.ts:239)
- CWE: CWE-89
- OWASP: A03 Injection

Explanation: The Google Drive plugin derives `folderName` from call `from.phoneNumber` or `to.phoneNumber` and embeds it in the Drive query string as `name='${folderName}'`. A quote in the phone-derived value can alter the Drive search expression.

Proof:
- `src/plugins/googleDrivePlugin.ts:239-243` sets `folderName` from request body phone fields.
- `src/plugins/googleDrivePlugin.ts:63-70` interpolates `folderName` into the Drive `q` parameter.

Recommended fix:
- Normalize folder names to a strict phone-number-safe character set.
- Escape single quotes and backslashes in Google Drive query literals.

### SEC-34: HTML call-log composer injects notes, transcripts, summaries, and links without escaping

- Severity: Medium
- Files: [packages/core/lib/callLogComposer.ts](/Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension/packages/core/lib/callLogComposer.ts:147), [packages/core/handlers/log.ts](/Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension/packages/core/handlers/log.ts:582)
- CWE: CWE-79, CWE-116
- OWASP: A03 Injection

Explanation: For HTML log format, call-log composer inserts notes, summaries, AI notes, transcripts, RingSense content, and recording links directly into HTML strings. If downstream CRM views render this HTML without sanitization, user-controlled content can become stored XSS in CRM call logs.

Proof:
- `packages/core/lib/callLogComposer.ts:156-158` inserts `note` into HTML.
- `packages/core/lib/callLogComposer.ts:288-290` inserts `subject` into HTML.
- `packages/core/lib/callLogComposer.ts:485-493` inserts `recordingLink` into an `href`.
- `packages/core/lib/callLogComposer.ts:538-580` inserts AI note and transcript content into HTML.
- `packages/core/lib/callLogComposer.ts:693-699` inserts RingSense transcript content into HTML.
- `packages/core/handlers/log.ts:582-605` composes and sends the HTML log body to connector create-log sinks.

Recommended fix:
- Escape text nodes and attributes for HTML output.
- Validate recording links against `https:` and trusted hosts before creating anchors.
- Prefer plain text or Markdown unless a connector explicitly requires sanitized HTML.

Example secure code:

```ts
const escapedNote = escapeHtml(note);
const href = assertSafeHttpsUrl(recordingLink);
return `<b>Agent notes</b><br>${escapedNote}<br><a href="${escapeAttribute(href)}">open</a>`;
```

### SEC-35: Unauthenticated userInfoHash endpoint exposes authorization-sensitive account hashes

- Severity: Medium
- File: [packages/core/index.ts](/Users/sushilmall/Downloads/secrityscan/rc-unified-crm-extension/packages/core/index.ts:1463)
- CWE: CWE-200, CWE-203
- OWASP: A01 Broken Access Control

Explanation: `/userInfoHash` returns the repository's internal hashes for arbitrary `extensionId` and `accountId` values without authentication. Those hashes are used by preload settings and call-log lookup flows, so the endpoint acts as an oracle that helps turn known RingCentral identifiers into accepted internal lookup keys.

Proof:
- `packages/core/index.ts:1463-1469` hashes request query values and returns `{ extensionId, accountId }`.
- `packages/core/handlers/user.ts:107-124` accepts a supplied hashed account id for admin settings lookup.
- `packages/core/lib/callLogLookup.ts:63-76` accepts supplied hashed extension ids in call-log lookup conditions.

Recommended fix:
- Remove the endpoint or require authenticated admin-only access.
- Never expose internal authorization lookup keys directly.
- Derive hashes server-side at the point of use from validated RingCentral identity.

## Reviewed Categories With No Confirmed Issue

- Command injection in request handlers: searched `exec`, `spawn`, `execSync`, and shell usage. Shell execution was found in build/CLI scripts, not user-facing route handlers.
- XXE: XML parsing uses `body-parser-xml` with `xml2js`-style options. No external entity resolution path was found.
- Server-rendered route XSS: no dynamic `innerHTML` in server route templates was confirmed. Static `redirect.html` uses constant strings. HTML generated for downstream CRM call logs is covered in `SEC-34`.
- Open redirect: `/oauth/authorize_shim` redirects to configured `RINGCENTRAL_SERVER`; no user-controlled redirect host was confirmed.
- Private keys/API keys: no real-looking private key or cloud token was found. Test `.env` files contain test placeholders.
