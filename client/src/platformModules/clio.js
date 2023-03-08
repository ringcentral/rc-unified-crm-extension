function getContactAdditionalInfo(contactRes){
    return null;
}

function getIncomingCallContactInfo(contactInfo) {
    return {
        company: contactInfo.company,
        title: contactInfo.title
    }
}

exports.getContactAdditionalInfo = getContactAdditionalInfo;
exports.getIncomingCallContactInfo = getIncomingCallContactInfo;