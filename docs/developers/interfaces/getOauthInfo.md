# getOauthInfo

This method returns a simple object containing all necessary OAuth values. This method provides developers with a safe and secure way to present to the framework values that are typically considered private, for example a client secret. These values are often stored in environment variables or in a vault. 

## Input parameters

None.

## Return value(s)

This method should return an associative array with the following keys and values:

| Key              | Value                                                                                          |
|------------------|------------------------------------------------------------------------------------------------|
| `clientId`       | The client ID of the application registered with the CRM provider, used to call the CRM's API. |
| `clientSecret`   | The client secret of the application registered with the CRM provider.                         |
| `accessTokenUri` | The API endpoint used to retrieve the access token from the CRM provider.                      |
| `redirectUri`    | The redirect URI registered with the CRM provider.                                             |

**Example**

```js
{
  'clientId': 'xxx-xxxx-xxxxxxxxxx-xxxx',
  'clientSecret': 'xxxxxxxx-xxxxxxxxxxxxxxxxxx',
  'accessTokenUri': 'https://auth.crm.com/token',
  'redirectUri': 'https://apps.ringcentral.com/integration/ringcentral-embeddable/latest/redirect.html'
}
```

## Reference

=== "Example CRM"

    ```js
    --8<-- "packages/template/src/connectors/interfaces/getOauthInfo.js"
	```
	
=== "Pipedrive"

	```js
    --8<-- "src/connectors/pipedrive/index.js:19:26"
	```

