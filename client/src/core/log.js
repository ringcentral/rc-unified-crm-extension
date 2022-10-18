import axios from 'axios';
import config from '../config.json';

// TODO: add 3rd party module as like const pipedrive = require('../platformModules/pipedrive.js');

function init(thirdPartyModule) {
    // TODO: load 3rd party module
}

// Input {id} = sessionId from RC
async function syncLog({ logType, logInfo, note }) {
    let dataToLog = {};
    // TODO: sync to 3rd party platform
    const { rcUnifiedCrmExtJwt } = await chrome.storage.local.get('rcUnifiedCrmExtJwt');
    switch (logType) {
        case 'Call':
            const callLogRes = await axios.post(`${config.serverUrl}/callLog?jwtToken=${rcUnifiedCrmExtJwt}`, logInfo);
            // force call log matcher check
            document.querySelector("#rc-widget-adapter-frame").contentWindow.postMessage({
                type: 'rc-adapter-trigger-call-logger-match',
                sessionIds: [logInfo.sessionId]
            }, '*');
            break;
        case 'Message':
            const messageLogRes = await axios.post(`${config.serverUrl}/messageLog?jwtToken=${rcUnifiedCrmExtJwt}`, logInfo);
            // TODO: change id to 3rd party id
            dataToLog[logInfo.conversationLogId] = { logType, note, id: messageLogRes.data.logId }
            await chrome.storage.local.set(dataToLog);
            break;
    }
}

async function checkLog({ logType, logId }) {
    // TODO: sync to 3rd party platform
    const { rcUnifiedCrmExtJwt } = await chrome.storage.local.get('rcUnifiedCrmExtJwt');
    switch (logType) {
        case 'Call':
            const callLogRes = await axios.get(`${config.serverUrl}/callLog?jwtToken=${rcUnifiedCrmExtJwt}&sessionId=${logId}`);
            return { matched: callLogRes.data.successful, logId: callLogRes.data.logId };
        case 'Message':
            return true;
    }
}

exports.syncLog = syncLog;
exports.checkLog = checkLog;