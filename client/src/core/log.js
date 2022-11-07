import axios from 'axios';
import config from '../config.json';
import { showNotification } from '../lib/util';

// Input {id} = sessionId from RC
async function addLog({ logType, logInfo, note, isManual, additionalDropdownSelection }) {
    let dataToLog = {};
    const { rcUnifiedCrmExtJwt } = await chrome.storage.local.get('rcUnifiedCrmExtJwt');
    switch (logType) {
        case 'Call':
            await axios.post(`${config.serverUrl}/callLog?jwtToken=${rcUnifiedCrmExtJwt}`, { logInfo, note, additionalDropdownSelection });
            // force call log matcher check
            document.querySelector("#rc-widget-adapter-frame").contentWindow.postMessage({
                type: 'rc-adapter-trigger-call-logger-match',
                sessionIds: [logInfo.sessionId]
            }, '*');
            showNotification({ level: 'success', message: 'call log added', ttl: 3000 });
            break;
        case 'Message':
            const messageLogRes = await axios.post(`${config.serverUrl}/messageLog?jwtToken=${rcUnifiedCrmExtJwt}`, { logInfo, additionalDropdownSelection });
            if (!isManual && messageLogRes.data.successful) {
                dataToLog[logInfo.conversationLogId] = { id: messageLogRes.data.logIds }
                await chrome.storage.local.set(dataToLog);
                showNotification({ level: 'success', message: 'message log added', ttl: 3000 });
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
    }
}

exports.addLog = addLog;
exports.checkLog = checkLog;