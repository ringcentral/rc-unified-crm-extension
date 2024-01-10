function openContactPage(hostname, incomingCallContactInfo) {
    window.open(`https://${hostname}/nc/#/contacts/${incomingCallContactInfo.id}`);
}

exports.openContactPage = openContactPage;