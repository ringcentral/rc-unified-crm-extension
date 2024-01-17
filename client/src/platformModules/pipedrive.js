function openContactPage(hostname, incomingCallContactInfo){
    window.open(`https://${hostname}/person/${incomingCallContactInfo.id}`);
}

function openLogPage({ hostname, logId }) {
    window.open(`https://${hostname}/activities/${logId}`);
}

async function onUnauthorize(){

}

exports.openContactPage = openContactPage;
exports.openLogPage = openLogPage;
exports.onUnauthorize = onUnauthorize;