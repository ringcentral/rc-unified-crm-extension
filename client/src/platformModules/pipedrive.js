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
        company: contactInfo.organization
    }
}

exports.getContactAdditionalInfo = getContactAdditionalInfo;
exports.getIncomingCallContactInfo = getIncomingCallContactInfo;