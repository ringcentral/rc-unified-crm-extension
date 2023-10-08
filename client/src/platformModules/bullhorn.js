function getContactAdditionalInfo(contactRes){
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