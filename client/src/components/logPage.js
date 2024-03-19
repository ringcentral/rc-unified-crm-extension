const config = require('../config.json')

function getLogPageRender({ triggerType, platformName, callDirection, contactInfo, callLog }) {
    // format contact list
    const contactList = contactInfo.map(c => { return { id: c.id, name: c.name, type: c.contactType, description: c.contactType ?? '', additionalInfo: c.additionalInfo } });
    const defaultActivityTitle = callDirection === 'Inbound' ?
        `Inbound call from ${contactList[0]?.name ?? ''}` :
        `Outbound call to ${contactList[0]?.name ?? ''}`;
    // add option to create new contact
    contactList.push({
        id: 'createNewContact',
        name: 'Create new contact...'
    });
    switch (triggerType) {
        case 'createLog':
            const additionalChoiceFields = config.platforms[platformName].additionalFields.filter(f => f.type === 'choice');
            const additionalFields = additionalChoiceFields.map(f => {
                return {
                    id: `contact.${f.name}`,
                    label: f.label,
                    type: 'input.choice',
                    choices: contactList[0]?.additionalInfo?.hasOwnProperty(f.name) ? [...contactList[0].additionalInfo[f.name], { id: 'none', name: 'None' }] : [{ id: 'none', name: 'None' }],
                    value: contactList[0]?.additionalInfo?.hasOwnProperty(f.name) ? contactList[0].additionalInfo[f.name][0].id : 'none',
                    visible: !!contactList[0]?.additionalInfo?.hasOwnProperty(f.name)
                }
            });
            page = {
                pageTitle: `Save to ${platformName}`, // optional
                saveButtonLabel: 'Save', // optional
                fields: [
                    {
                        id: 'contact',
                        label: 'Contact',
                        type: 'input.choice',
                        choices: contactList,
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
                        choices: config.platformsWithDifferentContactType[platformName]?.map(t => { return { id: t, name: t } }) ?? [],
                        value: config.platformsWithDifferentContactType[platformName]?.[0] ?? '',
                        visible: !!config.platformsWithDifferentContactType[platformName] && contactList[0].id === 'createNewContact'
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
                        value: callLog?.subject ?? defaultActivityTitle,
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
            break;
        case 'editLog':
            page = {
                pageTitle: 'Edit log', // optional
                saveButtonLabel: 'Update', // optional
                fields: [
                    {
                        id: 'contact',
                        label: 'Contact',
                        type: 'input.string',
                        value: callLog.contactName,
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
                        value: callLog?.subject ?? defaultActivityTitle,
                    },
                    {
                        id: 'note',
                        label: 'Note',
                        type: 'input.text',
                        value: callLog?.note ?? '',
                    }
                ],
                activityTitleManuallyEdited: false
            }
            break;
    }
    return page;
}

function getUpdatedLogPageRender({ updateData }) {
    const updatedFieldKey = updateData.key;
    let page = updateData.page;
    // update target field value
    page.fields.find(field => field.id === updatedFieldKey).value = updateData.input[updatedFieldKey];
    let newContactNameField = page.fields.find(f => f.id === 'newContactName');
    switch (updatedFieldKey) {
        case 'contact':
            const contact = page.fields.find(f => f.id === 'contact').choices.find(c => c.id === updateData.input[updateData.key]);
            if (contact.id === 'createNewContact') {
                newContactNameField.required = true;
                newContactNameField.visible = true;
            }
            page.fields.find(f => f.id === 'contactType').value = contact.type;
            const contactDependentComponents = page.fields.filter(c => c.id.startsWith('contact.'));
            for (let c of contactDependentComponents) {
                if (c.id.endsWith('activityTitle')) {
                    if (!page.activityTitleManuallyEdited) {
                        c.value = page.fields.find(f => f.id === 'contact.activityTitle').value.startsWith('Inbound') ?
                            `Inbound call from ${newContactNameField.value ?? contact.name}` :
                            `Outbound call to ${newContactNameField.value ?? contact.name}`;
                    }
                }
                else {
                    const choices = !!contact.additionalInfo ? contact.additionalInfo[c.id.split('contact.')[1]] : null;
                    c.choices = choices ? [...choices, { id: 'none', name: 'None' }] : [{ id: 'none', name: 'None' }]
                    c.value = c.choices[0].id;
                    c.visible = c.choices.length > 1;
                }
            }
            break;
        case 'newContactName':
            const activityField = page.fields.find(f => f.id === 'contact.activityTitle');
            if (!page.activityTitleManuallyEdited) {
                activityField.value = activityField.value.startsWith('Inbound') ?
                    `Inbound call from ${newContactNameField.value}` :
                    `Outbound call to ${newContactNameField.value}`;
            }
            break;
        case 'contact.activityTitle':
            page.activityTitleManuallyEdited = true;
            break;
    }
    return page;
}

exports.getLogPageRender = getLogPageRender;
exports.getUpdatedLogPageRender = getUpdatedLogPageRender;