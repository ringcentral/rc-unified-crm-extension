function openContactPage(hostname, incomingCallContactInfo){
    window.open(`https://${hostname}/person/${incomingCallContactInfo.id}`);
}

exports.openContactPage = openContactPage;