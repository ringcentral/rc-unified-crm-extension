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

exports.getIncomingCallContactInfo = getIncomingCallContactInfo;
exports.openContactPage = openContactPage;