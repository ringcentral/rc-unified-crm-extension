const config = require('../config.json')

function getLogPageRender({ triggerType, platformName, callDirection, contactInfo, callLog }) {
    const contactList = contactInfo.map(c => { return { id: c.id, name: c.name, type: c.contactType, description: c.contactType ?? '', additionalInfo: c.additionalInfo } });
    contactList.push({
        id: 'createNewContact',
        name: 'Create new contact...'
    });
    const activityTitle = callDirection === 'Inbound' ?
        `Inbound call from ${contactList[0].name}` :
        `Outbound call to ${contactList[0].name}`;

    let pageTitle = '';
    let contactField = {};
    let additionalFields = [];
    let saveButtonLabel = '';
    switch (triggerType) {
        case 'createLog':
            pageTitle = `Save to ${platformName}`;
            saveButtonLabel = 'Save';
            contactField = {
                id: 'contact',
                label: 'Contact',
                type: 'input.choice',
                choices: contactList,
                value: contactList[0].id,
            };
            const additionalChoiceFields = config.platforms[platformName].additionalFields.filter(f => f.type === 'choice');
            additionalFields = additionalChoiceFields.map(f => {
                return {
                    id: `contact.${f.name}`,
                    label: f.label,
                    type: 'input.choice',
                    choices: contactList[0]?.additionalInfo?.hasOwnProperty(f.name) ? [...contactList[0].additionalInfo[f.name], { id: 'none', name: 'None' }] : [{ id: 'none', name: 'None' }],
                    value: contactList[0]?.additionalInfo?.hasOwnProperty(f.name) ? contactList[0].additionalInfo[f.name][0].id : 'none',
                    visible: !!contactList[0]?.additionalInfo?.hasOwnProperty(f.name)
                }
            });
            break;
        case 'editLog':
            saveButtonLabel = 'Update';
            contactField = {
                id: 'contact',
                label: 'Contact',
                type: 'input.string',
                value: callLog.contactName,
            };
            pageTitle = 'Edit log';
            break;
    }
    const page = {
        pageTitle, // optional
        saveButtonLabel, // optional
        fields: [
            contactField,
            {
                id: 'contactName',
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
                id: 'triggerType',
                label: '',
                type: 'input.string',
                value: triggerType,
                visible: false
            },
            {
                id: 'contact.activityTitle',
                label: 'Activity title',
                type: 'input.string',
                value: callLog?.subject ?? activityTitle,
            },
            {
                id: 'note',
                label: 'Note',
                type: 'input.text',
                value: callLog?.note ?? '',
            },
            ...additionalFields
        ],
        activityTitleManuallyEdited: false
    }
    return page;
}

function getUpdatedLogPageRender({ updateData }) {
    const updatedFieldKey = updateData.key;
    let page = updateData.page;
    page.fields.find(field => field.id === updatedFieldKey).value = updateData.input[updatedFieldKey];
    let contactNameField = page.fields.find(f => f.id === 'contactName');
    if (updatedFieldKey === 'contact') {
        const contact = page.fields.find(f => f.id === 'contact').choices.find(c => c.id === updateData.input[updateData.key]);
        if(contact.id === 'createNewContact')
        {
            contactNameField.required = true;    
            contactNameField.visible = true;    
        }
        page.fields.find(f => f.id === 'contactType').value = contact.type;
        const contactDependentComponents = page.fields.filter(c => c.id.startsWith('contact.'));
        for (let c of contactDependentComponents) {
            if (c.id.endsWith('activityTitle')) {
                if (!page.activityTitleManuallyEdited) {
                    c.value = page.fields.find(f => f.id === 'contact.activityTitle').value.startsWith('Inbound') ?
                        `Inbound call from ${contactNameField.value ?? contact.name}` :
                        `Outbound call to ${contactNameField.value ?? contact.name}`;
                }
            }
            else {
                const choices = !!contact.additionalInfo ? contact.additionalInfo[c.id.split('contact.')[1]] : null;
                c.choices = choices ? [...choices, { id: 'none', name: 'None' }] : [{ id: 'none', name: 'None' }]
                c.value = c.choices[0].id;
                c.visible = c.choices.length > 1;
            }
        }
    }
    if(updatedFieldKey === 'contactName')
    {
        const activityField = page.fields.find(f => f.id === 'contact.activityTitle');
        if (!page.activityTitleManuallyEdited) {
            activityField.value = activityField.value.startsWith('Inbound') ?
                `Inbound call from ${contactNameField.value}` :
                `Outbound call to ${contactNameField.value}`;
        }
    }
    if (updatedFieldKey === 'contact.activityTitle') {
        page.activityTitleManuallyEdited = true;
    }
    return page;
}

exports.getLogPageRender = getLogPageRender;
exports.getUpdatedLogPageRender = getUpdatedLogPageRender;