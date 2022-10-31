import axios from 'axios';
import config from '../config.json';

// Input {id} = sessionId from RC
async function syncLog({ logType, logInfo, note, isManual }) {
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
            if (!isManual && messageLogRes.data.successful) {
                dataToLog[logInfo.conversationLogId] = { id: messageLogRes.data.logIds }
                await chrome.storage.local.set(dataToLog);
            }
            break;
    }
}

async function checkLog({ logType, logId, phoneNumber }) {
    const { rcUnifiedCrmExtJwt } = await chrome.storage.local.get('rcUnifiedCrmExtJwt');
    switch (logType) {
        case 'Call':
            const callLogRes = await axios.get(`${config.serverUrl}/callLog?jwtToken=${rcUnifiedCrmExtJwt}&sessionId=${logId}&phoneNumber=${phoneNumber}`);
            return { matched: callLogRes.data.successful, logId: callLogRes.data.logId, contactName: callLogRes.data.contactName };
        case 'Message':
            const messageLogRes = await axios.get(`${config.serverUrl}/messageLog?jwtToken=${rcUnifiedCrmExtJwt}&conversationLog=${logId}`);
            return { matched: messageLogRes.data.successful, logId: messageLogRes.data.logId };
    }
}

exports.syncLog = syncLog;
exports.checkLog = checkLog;