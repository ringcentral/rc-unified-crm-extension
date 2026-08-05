# getLogFormatType

Tells core whether it should compose log body text before calling logging interfaces.

## Signature

```js
const { LOG_DETAILS_FORMAT_TYPE } = require('@app-connect/core/lib/constants');

function getLogFormatType(platform, proxyConfig) {
  return LOG_DETAILS_FORMAT_TYPE.PLAIN_TEXT;
}
```

## Return

Return one of the constants from `@app-connect/core/lib/constants`:

| Constant | Value | Behavior |
| --- | --- | --- |
| `LOG_DETAILS_FORMAT_TYPE.PLAIN_TEXT` | `text/plain` | Core builds plain-text `composedLogDetails`. |
| `LOG_DETAILS_FORMAT_TYPE.HTML` | `text/html` | Core builds HTML `composedLogDetails`. |
| `LOG_DETAILS_FORMAT_TYPE.MARKDOWN` | `text/markdown` | Core builds Markdown `composedLogDetails`. |

If you return another value, such as `custom`, core does not compose the body and the connector is responsible for building CRM-specific content from the raw inputs.

Proxy mode reads the format from `proxyConfig.meta.logFormat`; without that value it behaves as custom.

## Reference

=== "Template"

    ```js
    --8<-- "packages/template/src/connectors/interfaces/getLogFormatType.ts"
    ```

