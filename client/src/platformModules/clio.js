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

function openContactPage(hostname, id){
    window.open(`https://${hostname}/nc/#/contacts/${id}`);
}

exports.getContactAdditionalInfo = getContactAdditionalInfo;
exports.getIncomingCallContactInfo = getIncomingCallContactInfo;
exports.openContactPage = openContactPage;