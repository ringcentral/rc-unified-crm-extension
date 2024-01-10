function openContactPage(hostname, incomingCallContactInfo) {
    if (incomingCallContactInfo?.type === 'Contact') {
        window.open(`https://${hostname}/list/Contact/?blade=/details/contact/${incomingCallContactInfo.id}`);
    }
    if (incomingCallContactInfo?.type === 'Lead') {
        window.open(`https://${hostname}/list/Lead/?blade=/details/lead/${incomingCallContactInfo.id}`);
    }
}

function openLogPage({ hostname, logId, contactType }) {
    window.open(`https://${hostname}/list/${contactType}/?blade=/details/Event/${logId}`);
}

exports.openContactPage = openContactPage;
exports.openLogPage = openLogPage;