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

function openContactPage(hostname, id){
    window.open(`https://${hostname}/person/${id}`);
}

exports.getContactAdditionalInfo = getContactAdditionalInfo;
exports.getIncomingCallContactInfo = getIncomingCallContactInfo;
exports.openContactPage = openContactPage;