import axios from 'axios';
import config from '../config.json';

// TODO: add 3rd party module as like const pipedrive = require('../platformModules/pipedrive.js');

function init(thirdPartyModule) {
    // TODO: load 3rd party module
}

// Input {id} = sessionId from RC
async function syncLog({ logType, callInfo, note }) {
    let dataToLog = {};
    switch (logType) {
        case 'Call':
            // TODO: sync to 3rd party platform
            const { rcUnifiedCrmExtJwt } = await chrome.storage.local.get('rcUnifiedCrmExtJwt');
            await axios.post(`${config.serverUrl}/callLog?jwtToken=${rcUnifiedCrmExtJwt}`, callInfo);
            // TODO: change id to 3rd party id
            dataToLog[callInfo.sessionId] = { logType, note, id: '3rd_party_id' }
            await chrome.storage.local.set(dataToLog);

            // force call log matcher check
            document.querySelector("#rc-widget-adapter-frame").contentWindow.postMessage({
                type: 'rc-adapter-trigger-call-logger-match',
                sessionIds: [callInfo.sessionId]
            }, '*');
            break;
        case 'Message':
            dataToLog[callInfo.sessionId] = { logType, id: '3rd_party_id' }
            await chrome.storage.local.set(dataToLog);
            break;
    }
}

async function renderExtraFields(){

}

exports.syncLog = syncLog;
exports.renderExtraFields = renderExtraFields;