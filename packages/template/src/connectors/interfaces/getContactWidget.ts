async function getContactWidget({ user, authHeader, phoneNumber, contacts }) {
    // `contacts` are the matched contacts the client cached from findContact (including additionalInfo).
    const widgets = [];
    for (const contact of contacts.filter(c => !c.isNewContact)) {
        //---------------------------------------------------------------------
        //--- TODO: Optionally call the CRM API here for more details ---------
        //---------------------------------------------------------------------
        // A typography field shows its schema `description`; a button shows its schema `title`.
        // Embeddable does not keep the order of `properties`, so set `ui:order`.
        widgets.push({
            contactId: contact.id,
            widget: {
                schema: {
                    type: 'object',
                    properties: {
                        name: { type: 'string', description: contact.name },
                        openInCrm: { type: 'string', title: 'Open in CRM' }
                    }
                },
                uiSchema: {
                    name: { 'ui:field': 'typography', 'ui:variant': 'subheading1' },
                    openInCrm: { 'ui:field': 'button', 'ui:variant': 'outlined', 'ui:fullWidth': true },
                    'ui:order': ['name', 'openInCrm']
                },
                formData: {},
                // Opened by the client when the button (by property name) or a list item (by its const) is clicked.
                links: {
                    openInCrm: `https://${user.hostname}/contacts/${contact.id}`
                }
            }
        });
    }
    return {
        successful: true,
        widgets
    };
}

module.exports = getContactWidget;
