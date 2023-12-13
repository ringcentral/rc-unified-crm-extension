function openContactPage(hostname, incomingCallContactInfo) {
    if (incomingCallContactInfo?.type === 'Contact') {
        window.open(`https://${hostname}/list/Contact/?blade=/details/contact/${incomingCallContactInfo.id}`);
    }
    if (incomingCallContactInfo?.type === 'Lead') {
        window.open(`https://${hostname}/list/Lead/?blade=/details/lead/${incomingCallContactInfo.id}`);
    }
}

exports.openContactPage = openContactPage;