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

exports.getContactAdditionalInfo = getContactAdditionalInfo;