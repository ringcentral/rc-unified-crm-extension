# getBasicAuth

This interface is called immediately after a user submits their API key credentials. It converts the raw credentials into an HTTP Authorization header value that the framework then passes to [`getUserInfo`](getUserInfo.md) to verify the credentials and fetch the user's profile from the CRM.

Implement this interface only when [`getAuthType`](getAuthType.md) returns `"apiKey"`.

## When is this interface called?

Once, synchronously, during the API key login flow. The sequence is:

1. User submits credentials via the API key form
2. Framework calls `getBasicAuth` with the submitted API key
3. Framework calls `getUserInfo` with `authHeader` set to `"Basic " + <return value>`

## Input parameters

| Parameter | Type   | Description                                                                                    |
|-----------|--------|------------------------------------------------------------------------------------------------|
| `apiKey`  | string | The primary credential submitted by the user — typically an API key or encoded username/password string. |

!!! note "Multi-field credentials"
    If your credential form collects multiple fields (e.g. a separate username and password), the additional fields arrive in `getUserInfo` as `additionalInfo`, not here. `getBasicAuth` only receives the primary `apiKey` field. Use `additionalInfo` in `getUserInfo` for secondary fields.

## Return value(s)

A string used as the value of the `Authorization` HTTP header, **without** the `Basic ` prefix — the framework prepends that automatically. In most cases this is the Base64 encoding of the credential.

**Example — API key passed directly**
```js
function getBasicAuth({ apiKey }) {
  // Some CRMs accept the key as-is in Basic Auth: base64("apikey:{key}")
  return Buffer.from(`apikey:${apiKey}`).toString('base64');
}
```

**Example — pre-encoded key**
```js
function getBasicAuth({ apiKey }) {
  // CRM expects the raw key as the Basic Auth value (already base64)
  return apiKey;
}
```

The resulting header sent to `getUserInfo` and all subsequent CRM API calls will be:

```
Authorization: Basic <return value>
```

Do not return the `Basic ` prefix as part of the string — the framework adds it automatically:

```text
// Wrong — do not return this
Basic YWJjMTIzOg==
```

## Return

Return a string.

## Reference

=== "Template"

    ```js
    --8<-- "packages/template/src/connectors/interfaces/getBasicAuth.ts"
    ```

=== "Insightly"

    ```js
    --8<-- "src/connectors/insightly/index.ts:19:22"
    ```

=== "Redtail"

    ```js
    --8<-- "src/connectors/redtail/index.ts:17:19"
    ```
