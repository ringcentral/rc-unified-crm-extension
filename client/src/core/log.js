import axios from 'axios';
import config from '../config.json';
import { isObjectEmpty, showNotification } from '../lib/util';

// Input {id} = sessionId from RC
async function addLog({ logType, logInfo, isToday, note, additionalSubmission }) {
    let dataToLog = {};
    const { rcUnifiedCrmExtJwt } = await chrome.storage.local.get('rcUnifiedCrmExtJwt');
    if (!!rcUnifiedCrmExtJwt) {
        switch (logType) {
            case 'Call':
                const addCallLogRes = await axios.post(`${config.serverUrl}/callLog?jwtToken=${rcUnifiedCrmExtJwt}`, { logInfo, note, additionalSubmission });
                // force call log matcher check
                document.querySelector("#rc-widget-adapter-frame").contentWindow.postMessage({
                    type: 'rc-adapter-trigger-call-logger-match',
                    sessionIds: [logInfo.sessionId]
                }, '*');
                if (addCallLogRes.data.successful) {
                    showNotification({ level: 'success', message: 'call log added', ttl: 3000 });
                }
                else {
                    showNotification({ level: 'warning', message: addCallLogRes.data.message, ttl: 3000 });
                }
                break;
            case 'Message':
                const messageLogRes = await axios.post(`${config.serverUrl}/messageLog?jwtToken=${rcUnifiedCrmExtJwt}`, { logInfo, additionalSubmission });
                if (messageLogRes.data.successful) {
                    if (!isToday) {
                        dataToLog[logInfo.conversationLogId] = { id: messageLogRes.data.logIds }
                        await chrome.storage.local.set(dataToLog);
                    }
                    showNotification({ level: 'success', message: 'message log added', ttl: 3000 });
                }
                break;
        }
    }
    else {
        showNotification({ level: 'warning', message: 'Please go to Settings and authorize CRM platform', ttl: 3000 });
    }
}

async function checkLog({ logType, logId }) {
    const { rcUnifiedCrmExtJwt } = await chrome.storage.local.get('rcUnifiedCrmExtJwt');
    if (!!rcUnifiedCrmExtJwt) {
        switch (logType) {
            case 'Call':
                const callLogRes = await axios.get(`${config.serverUrl}/callLog?jwtToken=${rcUnifiedCrmExtJwt}&sessionId=${logId}`);
                return { matched: callLogRes.data.successful, logId: callLogRes.data.logId };
        }
    }
    else {
        return { matched: false, message: 'Please go to Settings and authorize CRM platform' };
    }
}

async function cacheCallNote({ sessionId, note }) {
    let noteToCache = {};
    noteToCache[sessionId] = note;
    await chrome.storage.local.set(noteToCache);
}

async function getCachedNote({ sessionId }) {
    const cachedNote = await chrome.storage.local.get(sessionId);
    if (isObjectEmpty(cachedNote)){
        return '';
    }
    else
    {
        return cachedNote[sessionId];
    }
}

exports.addLog = addLog;
exports.checkLog = checkLog;
exports.cacheCallNote = cacheCallNote;
exports.getCachedNote = getCachedNote;