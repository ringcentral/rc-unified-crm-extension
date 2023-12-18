function openContactPage(hostname, incomingCallContactInfo) {
    window.open(`https://${hostname}/contacts/${incomingCallContactInfo.id}`);
}

exports.openContactPage = openContactPage;