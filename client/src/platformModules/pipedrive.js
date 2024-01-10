function openContactPage(hostname, incomingCallContactInfo){
    window.open(`https://${hostname}/person/${incomingCallContactInfo.id}`);
}

function openLogPage({ hostname, logId }) {
    window.open(`https://${hostname}/activities/${logId}`);
}

exports.openContactPage = openContactPage;
exports.openLogPage = openLogPage;