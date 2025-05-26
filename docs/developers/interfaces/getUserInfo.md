# getUserInfo

This method results in the adapter calling the CRM to retrieve key information about the currently logged in user. This method should return an associative array containing the following keys and values.

| Key                      | Value                                                                                                       |
|--------------------------|-------------------------------------------------------------------------------------------------------------|
| `id`                     | The account ID of the user within the CRM. This not the user's personal ID, but that of the parent account. |
| `name`                   | The name of the user within the CRM. This will be shown in the Chrome extension to indicate who is currentlyly logged into the CRM.                                                                                                                            |
| `timezoneName`           | The three-letter timezone identifier of the user.                                                           |
| `timezoneOffset`         | The timezone offset of the user, expressed as a positive or negative integer.                               |
| `platformAdditionalInfo` | An associative array of additional information about the user in the CRM. See below.                        |
| `overridingHostname`     | Some CRMs provision unique URLs to each account within their service. For example, to access your account one would use a URL such as `https://mycompanydomain.crm.com`. The property tells the framework your company's unique URL if there is one.           |

**`platformAdditionalInfo`**

| Key             | Value                                                                      |
|-----------------|----------------------------------------------------------------------------|
| `companyId`     | The company or account ID of the user within the CRM.                      |
| `companyName`   | The name of the company or account the user is associated with in the CRM. |
| `companyDomain` | The domain of the account within the CRM.                                  |

=== "Example CRM"

    ```js
    {!> src/adapters/testCRM/index.js [ln:63-128] !}
	```
	
=== "Pipedrive"

	```js
    {!> src/adapters/pipedrive/index.js [ln:21-75] !}
	```
