function getContactAdditionalInfo(contactRes) {
    return [];
}

function getIncomingCallContactInfo(contactInfo) {
    return {
        id: contactInfo.id,
        title: contactInfo.title
    }
}

function openContactPage(hostname, id) {
    window.open(`https://${hostname}/contacts/${id}`);
}

exports.getContactAdditionalInfo = getContactAdditionalInfo;
exports.getIncomingCallContactInfo = getIncomingCallContactInfo;
exports.openContactPage = openContactPage;