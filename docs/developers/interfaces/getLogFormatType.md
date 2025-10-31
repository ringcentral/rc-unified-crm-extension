# getLogFormatType

This method returns either plain text, html or markdown.

## Request parameters

None.

## Return value(s)

For specific return values, please use values in `@app-connect/core/lib/constants`.

## Reference

=== "Example CRM"

    ```js
    const { LOG_DETAILS_FORMAT_TYPE } = require('@app-connect/core/lib/constants');
    
    function getLogFormatType() {
        return LOG_DETAILS_FORMAT_TYPE.PLAIN_TEXT;
    }

    exports.getLogFormatType = getLogFormatType;
	```
	
=== "Pipedrive"

	```js
    const { LOG_DETAILS_FORMAT_TYPE } = require('@app-connect/core/lib/constants');
    
    function getLogFormatType() {
        return LOG_DETAILS_FORMAT_TYPE.HTML;
    }
    
    exports.getLogFormatType = getLogFormatType;
	```

