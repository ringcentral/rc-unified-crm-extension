function openContactPage(hostname, incomingCallContactInfo) {
    //-----------------------------------
    //------TODO: Open contact page------
    //-----------------------------------
    
    // window.open(`https://${hostname}?contactId=${incomingCallContactInfo.id}`);
}
async function onUnauthorize(){

}

// Case: If CRM platform support log page, use this function to open log page window
// To use this, please also set config.json "canOpenLogPage" to true
// function openLogPage({ hostname, logId }) {
//     //-------------------------------
//     //------TODO: Open log page------
//     //-------------------------------

//     // window.open(`https://${hostname}/activities/${logId}`);
// }
// exports.openLogPage = openLogPage;

exports.openContactPage = openContactPage;
exports.onUnauthorize = onUnauthorize;