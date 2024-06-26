## Customizing the welcome message

When a user installs the CRM extension for the first time and accesses it from their CRM, a welcome page or splash screen appears to the user. This screen can be very effective in educating the end user about how to setup and connect to the associated CRM. 

Currently welcome pages are relatively simple, providing developers with the ability to direct users to two key resources under `embeddedOnCrmPage.welcomePage`:

* `docLink`: A URL to read documentation
* `videoLink`: A URL to watch a video

## Customizing pages within the client application

There are a number of pages within the Unified CRM client application that often need to be customized in some way for the corresponding CRM. Those pages are:

* CRM authentication page (ONLY for `apiKey` auth)
* Call logging form
* Message logging form

### Adding custom fields to logging forms

CRMs almost always have a set of fields associated with logging an activity that are relatively unique. Consider for example Clio, a CRM used by legal professionals, in which users link calls to "matters" (e.g. a "legal matter"). Where CRMs like Insightly link calls to opportunities. To account for this, the framework makes it easy to add new custom form fields to two key forms users interact with frequently:

* Call logging page
* Create contact page

For each page, you will define an array of `additionalFields`. Each additional field element consists of the properties below.

| Name               | Type    | Description |
|--------------------|---------|-------------|
| `const`            | string  | A unique key identifying the field. |
| `title`            | string  | The display name of the field. |
| `type`             | string  | The data type associated with the field. |
| `contactDependent` | boolean | Set to `true` if this field would change when the selected contact is changed, or `false` if the value is static.  |

#### Custom call log fields

Set up associated deals as dropdown options:

1. Christmas special A351
2. Easter A22
3. Anniversary C92

and address as free input field.

```js
{! src/adapters/testCRM/manifest.json [ln:52-67] !}
```

#### Custom SMS log fields

Set up associated deals the same as call log

```js
{! src/adapters/testCRM/manifest.json [ln:68-81] !}
```

### Feedback page

To use feedback page, please create `feedback` object under `page`. `feedback` has below properties:

| Name               | Type    | Description |
|--------------------|---------|-------------|
| `url`            | string  | An url that pointing to your feedback page. Query parameters can be setup. Please refer to [below](#page-elements-and-query-parameters) |
| `elements`            | array | Page elements. Please refer to [below](#page-elements-and-query-parameters)  |

#### Page elements and query parameters

Page elements are defined as similar to log page fields above:

| Name               | Type    | Description |
|--------------------|---------|-------------|
| `const`            | string  | A unique key identifying the field. |
| `title`            | string  | The display name of the field. |
| `type`             | string  | The data type associated with the field. `string`, `inputField` and `selection` |
| `bold` | boolean | (Only applicable for `string`)  |
| `selections`| array | Each element has only `const` and `title`|
| `required`| boolean | Required field flag.|
| `placeholder`|string| (Only application for `inputField`)|

`url` can be best explained in an example. If I want to eventually open a Google Form, I'd have my `url` as "https://docs.google.com/forms/d/e/1FAIpQLSd3vF5MVJ5RAo1Uldy0EwsibGR8ZVucPW4E3JUnyAkHz2_Zpw/viewform?usp=pp_url&entry.912199227={score}&entry.912199228={crmName}". In page elements, if I have an element with `const` as "score", it'll then replace {score} in the url to construct a new url with user input data. And some parameters are native, like {crmName} which will be your crm name. Here are details:

|Name|Is native|Description|
|----|-----|----|
|{any element}|false|Any custom field that you define in your feedback page|
|`crmName`|true|Your crm platform name|
|`userName`|true|RingCentral user name|
|`userEmail`|true|RingCentral user email|