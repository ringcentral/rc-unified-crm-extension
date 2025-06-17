## Customizing the welcome message

When a user installs App Connect for the first time and accesses it from their CRM, a welcome page or splash screen appears to the user. This screen can be very effective in educating the end user about how to setup and connect to the associated CRM. 

Currently welcome pages are relatively simple, providing developers with the ability to direct users to two key resources under `embeddedOnCrmPage.welcomePage`:

* `docLink`: A URL to read documentation
* `videoLink`: A URL to watch a video

## Customizing pages within the client application

There are a number of pages within the App Connect client application that often need to be customized in some way for the corresponding CRM. Those pages are:

* CRM authentication page (ONLY for `apiKey` auth)
* Call logging form
* Message logging form

### Adding custom fields to logging forms

CRMs almost always have a set of fields associated with logging an activity that are relatively unique. Consider for example Clio, a CRM used by legal professionals, in which users link calls to "matters" (e.g. a "legal matter"). Where CRMs like Insightly link calls to opportunities. To account for this, the framework makes it easy to add new custom form fields to two key forms users interact with frequently:

* Call logging page
* Create contact page

For each page, you will define an array of `additionalFields`. Each additional field element consists of the properties below.

| Name               | Type    | Description                                                                                                       |
|--------------------|---------|-------------------------------------------------------------------------------------------------------------------|
| `const`            | string  | A unique key identifying the field.                                                                               |
| `title`            | string  | The display name of the field.                                                                                    |
| `type`             | string  | The data type associated with the field.                                                                          |
| `contactDependent` | boolean | Set to `true` if this field would change when the selected contact is changed, or `false` if the value is static. |

#### Custom call log fields

In the following example, a "Deals" pull-down menu with three options, and an "Address" text input is added to the call log form. 

```js
{! src/adapters/testCRM/manifest.json [ln:113-129] !}
```

#### Custom SMS log fields

Setup the same fields as above, but associated with the SMS logging page.

```js
{! src/adapters/testCRM/manifest.json [ln:130-145] !}
```

### Feedback page

A feedback page allows you to facilitate the collection of feedback from users. When defined a feedback link will appear in App Connect for users to click. When clicked, a form will be displayed to the user prompting them for feedback. The structure and input elements of the form are configurable.

To use feedback page, please create `feedback` object under `page`. The `feedback` object has the following properties:

| Name       | Type    | Description |
|------------|---------|-------------|
| `url`      | string  | A URL that the feedback form will post data to. Query parameters can be setup. Please refer to [below](#page-elements-and-query-parameters) |
| `elements` | array   | Page and input elements that will comprise the feedback form. Please refer to [below](#page-elements-and-query-parameters)  |

#### Page elements and query parameters

Page elements are defined as similar to log page fields above:

| Name    | Type   | Description                         |
|---------|--------|-------------------------------------|
| `const` | string | A unique key identifying the field. |
| `title` | string | The display name of the field.      |
| `type`  | string | The input type associated with the field. `string`, `inputField` and `selection` |
| `bold`  | boolean | (Only applicable for `string`)  |
| `selections`  | array   | Each element has only `const` and `title`|
| `required`    | boolean | If true, the form cannot be submitted until a value has been entered. |
| `placeholder` | string  | A placeholder value to be replaced by the user. Only applicable for `inputField`. |

#### Submitting feedback forms

When a user submits the feedback form, the feedback will be submitted to the designated `url`. The URL supports a number of tokens so that you can encode user submitted form data into the URL being posted to. These tokens are as follows:

| Name        | Is native | Description            |
|-------------|-----------|------------------------|
| `crmName`   | true      | Your crm platform name |
| `userName`  | true      | RingCentral user name  |
| `userEmail` | true      | RingCentral user email |
| *Element const value* | false     | Any custom field that you define in your feedback page |

!!! tip "Posting to a Google Form"
    Posting feedback to a Google Form such that the user's input is pre-filled on the resulting Google Form page requires you to encode the Google Form URL with custom values. This is achieved through the use of tokens. For example, consider the need to construct the following URL:
	
	    https://docs.google.com/forms/d/e/:FORM_ID/viewform?
	       usp=pp_url&entry.912199227={score}&entry.912199228={crmName}
		
	Prior to the form being posted to the URL, the `{score}` and `{crmName}` tokens will be replaced with their corresponding values, using user-provided data when present. 

