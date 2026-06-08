# getBasicAuth

Builds the Basic auth credential used by API-key connectors.

## Signature

```js
function getBasicAuth({ apiKey }) {
  return Buffer.from(`${apiKey}:`).toString('base64');
}
```

## Runtime Behavior

Core calls this after loading the stored API key from the user record. The return value must be only the credential portion. Core adds the `Basic ` prefix before passing `authHeader` to connector methods.

For example, return:

```text
YWJjMTIzOg==
```

Do not return:

```text
Basic YWJjMTIzOg==
```

## Return

Return a string.

## Reference

=== "Template"

    ```js
    --8<-- "packages/template/src/connectors/interfaces/getBasicAuth.js"
    ```

