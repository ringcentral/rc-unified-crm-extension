function getContactAdditionalInfo(contactRes){
    if(contactRes.data.contact && contactRes.data.contact.matters)
    {
        return {
            label: 'Sync to matter',
            value: contactRes.data.contact.matters
        }
    }

    return null;
}

function getIncomingCallContactInfo(contactInfo) {
    return {
        id: contactInfo.id,
        company: contactInfo.company,
        title: contactInfo.title
    }
}

function openContactPage(hostname, incomingCallContactInfo){
    window.open(`https://${hostname}/nc/#/contacts/${incomingCallContactInfo.id}`);
}

exports.getContactAdditionalInfo = getContactAdditionalInfo;
exports.getIncomingCallContactInfo = getIncomingCallContactInfo;
exports.openContactPage = openContactPage;