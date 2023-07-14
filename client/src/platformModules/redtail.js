function getContactAdditionalInfo(contactRes) {
    return [];
}

function getIncomingCallContactInfo(contactInfo) {
    return {
        id: contactInfo.id,
        title: contactInfo.title
    }
}

function openContactPage(hostname, incomingCallContactInfo) {
    window.open(`https://${hostname}/contacts/${incomingCallContactInfo.id}`);
}

exports.getContactAdditionalInfo = getContactAdditionalInfo;
exports.getIncomingCallContactInfo = getIncomingCallContactInfo;
exports.openContactPage = openContactPage;