# Custom Setting Fields

Custom fields allow developers to add configurable settings specific to their CRM adapter. These settings are grouped under one or more sections in the App Connect extension user settings page.

> **Note:** Custom settings defined in the manifest will automatically appear in the admin settings page, allowing administrators to control these values across the entire organization.

## Location

Custom fields are defined in the manifest file under the `platforms.{crmName}.settings` section. Each setting group is defined as an object with the following structure:

```json
{
    "settings": [
        {
            "id": "uniqueGroupId",
            "type": "section",
            "name": "Group Name",
            "items": [
                // Field items go here
            ]
        }
    ]
}
```

## Field Types

The framework supports several types of custom fields:

### Input Field
```json
{
    "id": "uniqueFieldId",
    "type": "inputField",
    "name": "Field Name",
    "description": "Field description",
    "placeholder": "Placeholder text",
    "defaultValue": "Default value"
}
```

### Boolean
```json
{
    "id": "uniqueFieldId",
    "type": "boolean",
    "name": "Field Name",
    "description": "Field description",
    "defaultValue": false
}
```

### Warning
```json
{
    "id": "uniqueFieldId",
    "name": "Warning Title",
    "type": "warning",
    "value": "Warning message content"
}
```

### Option
```json
{
    "id": "uniqueFieldId",
    "type": "option",
    "name": "Field Name",
    "description": "Field description",
    "options": ["Option 1", "Option 2"],
    "multiple": false,
    "checkbox": false,
    "required": false,
    "defaultValue": "Option 1"
}
```

#### Option - multiple
```json
{
    "id": "uniqueFieldId",
    "type": "option",
    "name": "Field Name",
    "description": "Field description",
    "options": ["Option 1", "Option 2", "Option 3"],
    "multiple": true,
    "checkbox": true,
    "required": false,
    "defaultValue": "Option 1,Option 2"
}
```

## Accessing Custom Settings

To access custom settings in your adapter implementation, you can find them under `user.userSettings.{customSettingId}`.

## Example - manifest

Here's a complete example of a custom fields configuration:

```json
{
    "settings": [
        {
            "id": "insightlyOptions",
            "type": "section",
            "name": "Insightly options",
            "items": [
                {
                    "id": "extraPhoneFieldWarning",
                    "name": "Extra phone field warning",
                    "type": "warning",
                    "value": "Warning: extra phone fields will slightly slow the contact match process"
                },
                {
                    "id": "insightlyExtraPhoneFieldNameForContact",
                    "type": "inputField",
                    "name": "Extra phone field name for contact",
                    "description": "The name of the extra phone field to search for contacts in Insightly. Separatmultiple fields with comma.",
                    "defaultValue": ""
                },
                {
                    "id": "insightlyExtraPhoneFieldNameForLead",
                    "type": "inputField",
                    "name": "Extra phone field name for lead",
                    "description": "The name of the extra phone field to search for leads in Insightly. Separatmultiple fields with comma.",
                    "defaultValue": ""
                }
            ]
        }
    ]
}
```

This configuration creates a section called "Insightly options" with a warning message and two input fields for configuring extra phone field name for contact matching cases.

## Example - adapter

In Insightly adapter, the code goes like this:

```javascript

        const extraPhoneFieldNamesForContact = user.userSettings?.insightlyExtraPhoneFieldNameForContact?.value ? user.userSettings?.insightlyExtraPhoneFieldNameForContact?.value?.split(',') : [];
        // try Contact by extra phone fields
        for (const extraPhoneFieldName of extraPhoneFieldNamesForContact) {
            const contactExtraPhonePersonInfo = await axios.get(
                `${user.platformAdditionalInfo.apiUrl}/${process.env.INSIGHTLY_API_VERSION}/contacts/search?field_name={extraPhoneFieldName}&field_value=${numberToQuery}&brief=false`,
                {
                    headers: { 'Authorization': authHeader }
                });
            for (let rawContactInfo of contactExtraPhonePersonInfo.data) {
                rawContactInfo.contactType = 'contactExtraPhone';
                rawContactInfo.extraPhoneFieldName = extraPhoneFieldName;
                rawContactInfo.extraPhoneFieldNameValue = rawContactInfo.CUSTOMFIELDS.find(f => f.FIELD_NAME===extraPhoneFieldName)?.FIELD_VALUE;
                rawContacts.push(rawContactInfo);
            }
        }
```

It takes `insightlyExtraPhoneFieldNameForContact` under user settings, and use it to make extra API calls to Insightly server to get contact by phoneNumber.