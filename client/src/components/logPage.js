const config = require('../config.json')

function getLogPageRender({ logType, triggerType, platformName, direction, contactInfo, subject, note }) {
    const additionalChoiceFields = logType === 'Call' ?
        config.platforms[platformName].page?.callLog?.additionalFields?.filter(f => f.type === 'selection') ?? [] :
        config.platforms[platformName].page?.messageLog?.additionalFields?.filter(f => f.type === 'selection') ?? [];
    const additionalCheckBoxFields = logType === 'Call' ?
        config.platforms[platformName].page?.callLog?.additionalFields?.filter(f => f.type === 'checkbox') ?? [] :
        config.platforms[platformName].page?.messageLog?.additionalFields?.filter(f => f.type === 'checkbox') ?? [];
    // format contact list
    const contactList = contactInfo.map(c => { return { const: c.id, title: c.name, type: c.contactType, description: c.contactType ? `${c.contactType} - ${c.id}` : '', additionalInfo: c.additionalInfo } });
    const defaultActivityTitle = direction === 'Inbound' ?
        `Inbound ${logType} from ${contactList[0]?.title ?? ''}` :
        `Outbound ${logType} to ${contactList[0]?.title ?? ''}`;
    // add option to create new contact
    contactList.push({
        const: 'createNewContact',
        title: 'Create new contact...'
    });
    let callSchemas = {};
    let callUISchemas = {};
    let callFormData = {};
    if (logType === 'Call') {
        callSchemas = {
            activityTitle: {
                title: 'Activity title',
                type: 'string',
                manuallyEdited: false
            },
            note: {
                title: 'Note',
                type: 'string'
            }
        }
        callUISchemas = {
            activityTitle: {
                "ui:placeholder": 'Enter title...',
            },
            note: {
                "ui:placeholder": 'Enter note...',
                "ui:widget": "textarea",
            }
        }
        callFormData = {
            activityTitle: subject ?? defaultActivityTitle,
            note: note ?? '',
        }
    }
    let page = {};
    switch (triggerType) {
        case 'createLog':
        case 'manual':
            let additionalFields = {};
            let additionalFieldsValue = {};
            for (const f of additionalChoiceFields) {
                if (f.contactDependent && !contactList[0]?.additionalInfo?.hasOwnProperty(f.const)) {
                    continue;
                }
                additionalFields[f.const] = {
                    title: f.title,
                    type: 'string',
                    oneOf: [...contactList[0].additionalInfo[f.const], { const: 'none', title: 'None' }],
                    associationField: true
                }
                additionalFieldsValue[f.const] = contactList[0].additionalInfo[f.const][0].const;
            }
            for (const f of additionalCheckBoxFields) {
                if (f.contactDependent && !contactList[0]?.additionalInfo?.hasOwnProperty(f.const)) {
                    continue;
                }
                additionalFields[f.const] = {
                    title: f.title,
                    type: 'boolean',
                    associationField: false
                }
                additionalFieldsValue[f.const] = f.defaultValue;
            }
            let warningField = {};
            if (contactList.length > 2) {
                warningField = {
                    warning: {
                        type: 'string',
                        description: "Multiple contacts found. Please select the contact to associate this activity with.",
                    }
                };
            }
            else if (contactList.length === 1) {
                warningMessage = {
                    warning: {
                        type: 'string',
                        description: "No contact found. Enter a name to have a placeholder contact made for you.",
                    }
                };
            }
            let requiredFieldNames = [];
            if (contactList.length === 1) { requiredFieldNames = ['newContactName'] };
            let newContactWidget = {
                newContactName: {
                    "ui:widget": "hidden",
                },
                newContactType: {
                    "ui:widget": "hidden",
                }
            }
            if (contactList[0].const === 'createNewContact') {
                if (!!config.platformsWithDifferentContactType[platformName]) {
                    newContactWidget.newContactType = {};
                }
                newContactWidget.newContactName = {
                    "ui:placeholder": 'Enter name...',
                };
            }
            page = {
                title: `Save to ${platformName}`, // optional
                schema: {
                    type: 'object',
                    required: requiredFieldNames,
                    properties: {
                        ...warningField,
                        contact: {
                            title: 'Contact',
                            type: 'string',
                            oneOf: contactList
                        },
                        newContactName: {
                            title: 'New contact name',
                            type: 'string',
                        },
                        contactType: {
                            title: '',
                            type: 'string'
                        },
                        triggerType: {
                            title: '',
                            type: 'string'
                        },
                        newContactType: {
                            title: 'Contact type',
                            type: 'string',
                            oneOf: config.platformsWithDifferentContactType[platformName]?.map(t => { return { const: t, title: t } }) ?? [],
                        },
                        ...callSchemas,
                        ...additionalFields
                    }
                },
                uiSchema: {
                    warning: {
                        "ui:field": "admonition", // or typography to show raw text
                        "ui:severity": "warning", // "warning", "info", "error", "success"
                    },
                    contactType: {
                        "ui:widget": "hidden",
                    },
                    triggerType: {
                        "ui:widget": "hidden",
                    },
                    submitButtonOptions: {
                        submitText: 'Save',
                    },
                    ...callUISchemas,
                    ...newContactWidget
                },
                formData: {
                    contact: contactList[0].const,
                    newContactType: config.platformsWithDifferentContactType[platformName]?.[0] ?? '',
                    newContactName: '',
                    contactType: contactList[0]?.type ?? '',
                    triggerType,
                    ...callFormData,
                    ...additionalFieldsValue
                }
            }
            break;
        case 'editLog':
            page = {
                title: `Edit log`, // optional
                schema: {
                    type: 'object',
                    required: ['activityTitle'],
                    properties: {
                        contact: {
                            title: 'Contact',
                            type: 'string',
                            oneOf: contactList,
                            readOnly: true
                        },
                        activityTitle: {
                            title: 'Activity title',
                            type: 'string'
                        },
                        note: {
                            title: 'Note',
                            type: 'string'
                        }
                    }
                },
                uiSchema: {
                    note: {
                        "ui:placeholder": 'Enter note...',
                        "ui:widget": "textarea",
                    },
                    submitButtonOptions: {
                        submitText: 'Update',
                    }
                },
                formData: {
                    contact: contactList[0].const,
                    activityTitle: subject ?? '',
                    triggerType,
                    note: note ?? ''
                }
            }
            break;
    }
    return page;
}

function getUpdatedLogPageRender({ logType, platformName, updateData }) {
    const updatedFieldKey = updateData.keys[0];
    let page = updateData.page;
    // update target field value
    page.formData = updateData.formData;
    const additionalChoiceFields = logType === 'Call' ?
        config.platforms[platformName].page?.callLog?.additionalFields?.filter(f => f.type === 'selection') ?? [] :
        config.platforms[platformName].page?.messageLog?.additionalFields?.filter(f => f.type === 'selection') ?? [];
    const additionalCheckBoxFields = logType === 'Call' ?
        config.platforms[platformName].page?.callLog?.additionalFields?.filter(f => f.type === 'checkbox') ?? [] :
        config.platforms[platformName].page?.messageLog?.additionalFields?.filter(f => f.type === 'checkbox') ?? [];
    switch (updatedFieldKey) {
        case 'contact':
            const contact = page.schema.properties.contact.oneOf.find(c => c.const === page.formData.contact);
            // New contact fields
            if (contact.const === 'createNewContact') {
                if (!!config.platformsWithDifferentContactType[platformName]) {
                    page.uiSchema.newContactType = {};
                }
                page.uiSchema.newContactName = {
                    "ui:placeholder": 'Enter name...',
                };
                page.schema.required = ['newContactName'];
                if (!!page.schema.properties.activityTitle && !page.schema.properties.activityTitle?.manuallyEdited) {
                    page.formData.activityTitle = page.formData.activityTitle.startsWith('Inbound') ?
                        'Inbound call from ' :
                        'Outbound call to ';
                }
            }
            else {
                page.uiSchema.newContactType = {
                    "ui:widget": "hidden",
                };
                page.uiSchema.newContactName = {
                    "ui:widget": "hidden",
                };
                page.schema.required = [];
                if (!!page.schema.properties.activityTitle && !page.schema.properties.activityTitle?.manuallyEdited) {
                    page.formData.activityTitle = page.formData.activityTitle.startsWith('Inbound') ?
                        `Inbound call from ${contact.title}` :
                        `Outbound call to ${contact.title}`;
                }
            }
            page.formData.contactType = contact.type;

            // Additional fields
            const allAssociationFields = Object.keys(page.schema.properties);
            for (const af of allAssociationFields) {
                if (!!page.schema.properties[af].associationField) {
                    delete page.schema.properties[af];
                    delete page.formData[af];
                }
            }
            let additionalFields = {};
            let additionalFieldsValue = {};
            for (const f of additionalChoiceFields) {
                if (f.contactDependent && !contact?.additionalInfo?.hasOwnProperty(f.const)) {
                    continue;
                }
                additionalFields[f.const] = {
                    title: f.title,
                    type: 'string',
                    oneOf: [...contact.additionalInfo[f.const], { const: 'none', title: 'None' }],
                    associationField: f.contactDependent
                }
                additionalFieldsValue[f.const] = contact.additionalInfo[f.const][0].const;
            }
            for (const f of additionalCheckBoxFields) {
                if (f.contactDependent && !contact?.additionalInfo?.hasOwnProperty(f.const)) {
                    continue;
                }
                additionalFields[f.const] = {
                    title: f.title,
                    type: 'boolean',
                    associationField: f.contactDependent
                }
                additionalFieldsValue[f.const] = f.defaultValue;
            }
            page.schema.properties = {
                ...page.schema.properties,
                ...additionalFields
            }
            page.formData = {
                ...page.formData,
                ...additionalFieldsValue
            }
            break;
        case 'newContactName':
            if (!!page.schema.properties.activityTitle && !page.schema.properties.activityTitle.manuallyEdited) {
                page.formData.activityTitle = page.formData.activityTitle.startsWith('Inbound') ?
                    `Inbound call from ${page.formData.newContactName}` :
                    `Outbound call to ${page.formData.newContactName}`;
            }
            break;
        case 'activityTitle':
            page.schema.properties.activityTitle.manuallyEdited = true;
            break;
    }
    return page;
}

exports.getLogPageRender = getLogPageRender;
exports.getUpdatedLogPageRender = getUpdatedLogPageRender;