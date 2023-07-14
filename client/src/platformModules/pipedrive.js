function getContactAdditionalInfo(contactRes){
    if(contactRes.data.contact && contactRes.data.contact.relatedDeals)
    {
        return {
            label: 'Sync to deal',
            value: contactRes.data.contact.relatedDeals
        }
    }

    return null;
}

function getIncomingCallContactInfo(contactInfo) {
    return {
        id: contactInfo.id,
        company: contactInfo.organization
    }
}

function openContactPage(hostname, incomingCallContactInfo){
    window.open(`https://${hostname}/person/${incomingCallContactInfo.id}`);
}

exports.getContactAdditionalInfo = getContactAdditionalInfo;
exports.getIncomingCallContactInfo = getIncomingCallContactInfo;
exports.openContactPage = openContactPage;