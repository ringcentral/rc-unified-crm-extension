// TODO: add 3rd party module as like const pipedrive = require('../thirdPartyModules/pipedrive.js');

function init(thirdPartyModule) {
    // TODO: load 3rd party module
}

// Input {id} = sessionId from RC
async function syncLog({ logType, id, note }) {
    let dataToLog = {};
    switch (logType) {
        case 'Call':
            // TODO: sync to 3rd party platform
            // TODO: change id to 3rd party id
            dataToLog[id] = { logType, note, id: '3rd_party_id' }
            await chrome.storage.sync.set(dataToLog);
    
            // force call log matcher check
            document.querySelector("#rc-widget-adapter-frame").contentWindow.postMessage({
                type: 'rc-adapter-trigger-call-logger-match',
                sessionIds: [id]
            }, '*');
            break;
        case 'Message':
            dataToLog[id] = { logType, id: '3rd_party_id' }
            await chrome.storage.sync.set(dataToLog);
            break;
    }
}

exports.syncLog = syncLog;