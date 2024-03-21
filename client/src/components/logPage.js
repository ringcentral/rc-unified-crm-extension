const config = require('../config.json')

function getCallLogPageRender({ triggerType, platformName, callDirection, contactInfo, callLog }) {
    // format contact list
    const additionalChoiceFields = config.platforms[platformName].page?.callLog?.additionalFields?.filter(f => f.type === 'selection') ?? [];
    const additionalCheckBoxFields = config.platforms[platformName].page?.callLog?.additionalFields?.filter(f => f.type === 'checkbox') ?? [];
    const contactList = contactInfo.map(c => { return { const: c.id, title: c.name, type: c.contactType, description: c.contactType ? `${c.contactType} - ${c.id}` : '', additionalInfo: c.additionalInfo } });
    const defaultActivityTitle = callDirection === 'Inbound' ?
        `Inbound call from ${contactList[0]?.title ?? ''}` :
        `Outbound call to ${contactList[0]?.title ?? ''}`;
    // add option to create new contact
    contactList.push({
        const: 'createNewContact',
        title: 'Create new contact...'
    });
    switch (triggerType) {
        case 'createLog':
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
                        activityTitle: {
                            title: 'Activity title',
                            type: 'string',
                            manuallyEdited: false
                        },
                        note: {
                            title: 'Note',
                            type: 'string'
                        },
                        ...additionalFields
                    }
                },
                uiSchema: {
                    warning: {
                        "ui:field": "admonition", // or typography to show raw text
                        "ui:severity": "warning", // "warning", "info", "error", "success"
                    },
                    activityTitle: {
                        "ui:placeholder": 'Enter title...',
                    },
                    contactType: {
                        "ui:widget": "hidden",
                    },
                    triggerType: {
                        "ui:widget": "hidden",
                    },
                    note: {
                        "ui:placeholder": 'Enter note...',
                        "ui:widget": "textarea",
                    },
                    submitButtonOptions: {
                        submitText: 'Save',
                    },
                    ...newContactWidget
                },
                formData: {
                    contact: contactList[0].const,
                    newContactType: config.platformsWithDifferentContactType[platformName]?.[0] ?? '',
                    newContactName: '',
                    contactType: contactList[0]?.type ?? '',
                    activityTitle: callLog?.subject ?? defaultActivityTitle,
                    note: callLog?.note ?? '',
                    triggerType,
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
                    activityTitle: callLog?.subject ?? '',
                    triggerType,
                    note: callLog?.note ?? ''
                }
            }
            break;
    }
    return page;
}

function getUpdatedCallLogPageRender({ platformName, updateData }) {
    const updatedFieldKey = updateData.keys[0];
    let page = updateData.page;
    // update target field value
    page.formData = updateData.formData;
    const additionalChoiceFields = config.platforms[platformName].page?.callLog?.additionalFields?.filter(f => f.type === 'selection') ?? [];
    const additionalCheckBoxFields = config.platforms[platformName].page?.callLog?.additionalFields?.filter(f => f.type === 'checkbox') ?? [];
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
                if (!page.schema.properties.activityTitle.manuallyEdited) {
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
                if (!page.schema.properties.activityTitle.manuallyEdited) {
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
            if (!page.schema.properties.activityTitle.manuallyEdited) {
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

function getMessageLogPageRender({ platformName, contactInfo, isTrailing, trailingSMSLogInfo }) {
    // format contact list
    const contactList = contactInfo.map(c => { return { id: c.id, name: c.name, type: c.contactType, description: c.contactType ?? '', additionalInfo: c.additionalInfo } });
    const additionalChoiceFields = config.platforms[platformName].page?.callLog?.additionalFields.filter(f => f.type === 'choice');
    const additionalFields = additionalChoiceFields.map(f => {
        return {
            id: `contact.${f.name}`,
            label: f.label,
            type: 'input.choice',
            oneOf: contactList[0]?.additionalInfo?.hasOwnProperty(f.name) ? [...contactList[0].additionalInfo[f.name], { id: 'none', name: 'None' }] : [{ id: 'none', name: 'None' }],
            value: contactList[0]?.additionalInfo?.hasOwnProperty(f.name) ? contactList[0].additionalInfo[f.name][0].id : 'none',
            visible: !!contactList[0]?.additionalInfo?.hasOwnProperty(f.name)
        }
    });
    const page = {
        pageTitle: `Save to ${platformName}`, // optional
        saveButtonLabel: 'Save', // optional
        fields: [
            {
                id: 'contact',
                label: 'Contact',
                type: 'input.choice',
                oneOf: contactList,
                value: contactList[0].id,
            },
            {
                id: 'newContactName',
                label: 'New contact name',
                type: 'input.string',
                value: '',
                required: contactList.length === 1,
                visible: contactList.length === 1
            },
            {
                id: 'contactType',
                label: '',
                type: 'input.string',
                value: contactList[0]?.type ?? '',
                visible: false
            },
            {
                id: 'newContactType',
                label: 'Contact type',
                type: 'input.choice',
                oneOf: config.platformsWithDifferentContactType[platformName]?.map(t => { return { id: t, name: t } }) ?? [],
                value: config.platformsWithDifferentContactType[platformName]?.[0] ?? '',
                visible: !!config.platformsWithDifferentContactType[platformName] && contactList[0].id === 'createNewContact'
            },
            ...additionalFields
        ]
    }
    return page;
}

exports.getCallLogPageRender = getCallLogPageRender;
exports.getUpdatedCallLogPageRender = getUpdatedCallLogPageRender;
exports.getMessageLogPageRender = getMessageLogPageRender;