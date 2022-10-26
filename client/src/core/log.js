import axios from 'axios';
import config from '../config.json';

// Input {id} = sessionId from RC
async function syncLog({ logType, logInfo, note }) {
    let dataToLog = {};
    const { rcUnifiedCrmExtJwt } = await chrome.storage.local.get('rcUnifiedCrmExtJwt');
    switch (logType) {
        case 'Call':
            const callLogRes = await axios.post(`${config.serverUrl}/callLog?jwtToken=${rcUnifiedCrmExtJwt}`, { logInfo, note });
            // force call log matcher check
            document.querySelector("#rc-widget-adapter-frame").contentWindow.postMessage({
                type: 'rc-adapter-trigger-call-logger-match',
                sessionIds: [logInfo.sessionId]
            }, '*');
            break;
        case 'Message':
            const messageLogRes = await axios.post(`${config.serverUrl}/messageLog?jwtToken=${rcUnifiedCrmExtJwt}`, { logInfo });
            if (messageLogRes.data.successful) {
                dataToLog[logInfo.conversationLogId] = { id: messageLogRes.data.logIds }
                await chrome.storage.local.set(dataToLog);
            }
            break;
    }
}

async function checkLog({ logType, logId }) {
    const { rcUnifiedCrmExtJwt } = await chrome.storage.local.get('rcUnifiedCrmExtJwt');
    switch (logType) {
        case 'Call':
            const callLogRes = await axios.get(`${config.serverUrl}/callLog?jwtToken=${rcUnifiedCrmExtJwt}&sessionId=${logId}`);
            return { matched: callLogRes.data.successful, logId: callLogRes.data.logId };
        // case 'Message':
        //     return true;
    }
}

exports.syncLog = syncLog;
exports.checkLog = checkLog;