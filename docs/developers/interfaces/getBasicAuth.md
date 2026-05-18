# getBasicAuth

This method, in most cases, should return a Base64-encoded Basic Authentication stringto satisfy CRMs authentication requirements for `apikey` and `username:password`.

## Input parameters

This method accepts an object with the following property:

| Parameter | Type     | Description                                                    |
|-----------|----------|----------------------------------------------------------------|
| `apiKey`  | `string` | The API key provided by the CRM for authenticating API calls. |

## Return value(s)

This method returns a Base64-encoded string in the format required for HTTP Basic Authentication.

**Example**

```js
'eHh4LXh4eHgteHh4eHh4eHh4eHh4OnhdY2VyZGlhbQ=='
```

This encoded string can be used in the `Authorization` header as:

```
Authorization: Basic eHh4LXh4eHgteHh4eHh4eHh4eHh4OnhdY2VyZGlhbQ==
```

## Reference

=== "Insightly"

	```js
    --8<-- "src/connectors/insightly/index.js:19:22"
	```

=== "Redtail"

	```js
    --8<-- "src/connectors/redtail/index.js:17:19"
	```
    