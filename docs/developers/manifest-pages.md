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
{! src/adapters/testCRM/manifest.json [ln:35-48] !}
```

#### Custom SMS log fields

Set up associated deals the same as call log

```js
{! src/adapters/testCRM/manifest.json [ln:51-64] !}
```

