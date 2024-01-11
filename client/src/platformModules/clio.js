function openContactPage(hostname, incomingCallContactInfo) {
    window.open(`https://${hostname}/nc/#/contacts/${incomingCallContactInfo.id}`);
}
async function onUnauthorize(){

}

exports.openContactPage = openContactPage;
exports.onUnauthorize = onUnauthorize;