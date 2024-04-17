import axios from 'axios';
import moment from 'moment';
import config from '../config.json';
import { isObjectEmpty, showNotification } from '../lib/util';
import { trackSyncCallLog, trackSyncMessageLog } from '../lib/analytics';

// Input {id} = sessionId from RC
async function addLog({ logType, logInfo, isMain, subject, note, additionalSubmission, contactId, contactType, contactName }) {
    const { rcUnifiedCrmExtJwt } = await chrome.storage.local.get('rcUnifiedCrmExtJwt');
    const { overridingPhoneNumberFormat } = await chrome.storage.local.get({ overridingPhoneNumberFormat: '' });
    if (!!subject) {
        logInfo['customSubject'] = subject;
    }
    if (!!rcUnifiedCrmExtJwt) {
        switch (logType) {
            case 'Call':
                const addCallLogRes = await axios.post(`${config.serverUrl}/callLog?jwtToken=${rcUnifiedCrmExtJwt}`, { logInfo, note, additionalSubmission, overridingFormat: overridingPhoneNumberFormat, contactId, contactType, contactName });
                // force call log matcher check
                document.querySelector("#rc-widget-adapter-frame").contentWindow.postMessage({
                    type: 'rc-adapter-trigger-call-logger-match',
                    sessionIds: [logInfo.sessionId]
                }, '*');
                if (addCallLogRes.data.successful) {
                    showNotification({ level: 'success', message: 'call log added', ttl: 3000 });
                    trackSyncCallLog({ hasNote: note !== '' });
                    // check for remaining recording link
                    const recordingSessionId = `rec-link-${logInfo.sessionId}`;
                    const existingCallRecording = await chrome.storage.local.get(recordingSessionId);
                    if (!!existingCallRecording[recordingSessionId]) {
                        await updateLog({ logType: 'Call', sessionId: logInfo.sessionId, recordingLink: existingCallRecording[recordingSessionId].recordingLink })
                    }
                }
                else {
                    showNotification({ level: 'warning', message: addCallLogRes.data.message, ttl: 3000 });
                }
                break;
            case 'Message':
                if (moment(logInfo.date).diff(new Date(), 'days') < -1) {
                    const isLogged = await chrome.storage.local.get(`rc-crm-conversation-log-${logInfo.conversationLogId}`);
                    if (isLogged[`rc-crm-conversation-log-${logInfo.conversationLogId}`]?.logged) {
                        console.log(`skipping logged conversation on date ${logInfo.date}`)
                        break;
                    }
                }
                const messageLogRes = await axios.post(`${config.serverUrl}/messageLog?jwtToken=${rcUnifiedCrmExtJwt}`, { logInfo, additionalSubmission, overridingFormat: overridingPhoneNumberFormat, contactId, contactType, contactName });
                if (messageLogRes.data.successful) {
                    if (isMain) {
                        showNotification({ level: 'success', message: 'message log added', ttl: 3000 });
                        trackSyncMessageLog();
                    }
                    await chrome.storage.local.set({ [`rc-crm-conversation-log-${logInfo.conversationLogId}`]: { logged: true } });
                }
                break;
        }
    }
    else {
        showNotification({ level: 'warning', message: 'Please go to Settings and authorize CRM platform', ttl: 3000 });
    }
}

async function checkLog({ logType, sessionIds }) {
    const { rcUnifiedCrmExtJwt } = await chrome.storage.local.get('rcUnifiedCrmExtJwt');
    if (!!rcUnifiedCrmExtJwt) {
        switch (logType) {
            case 'Call':
                const callLogRes = await axios.get(`${config.serverUrl}/callLog?jwtToken=${rcUnifiedCrmExtJwt}&sessionIds=${sessionIds}`);
                return { successful: callLogRes.data.successful, callLogs: callLogRes.data.logs };
        }
    }
    else {
        return { successful: false, message: 'Please go to Settings and authorize CRM platform' };
    }
}

async function getLog({ logType, sessionId }) {
    const { rcUnifiedCrmExtJwt } = await chrome.storage.local.get('rcUnifiedCrmExtJwt');
    if (!!rcUnifiedCrmExtJwt) {
        switch (logType) {
            case 'Call':
                const callLogRes = await axios.get(`${config.serverUrl}/callLog?jwtToken=${rcUnifiedCrmExtJwt}&sessionIds=${[sessionId]}`);
                return { successful: callLogRes.data.successful, callLogs: callLogRes.data.logs };
        }
    }
    else {
        return { successful: false, message: 'Please go to Settings and authorize CRM platform' };
    }
}

async function openLog({ platformName, hostname, logId, contactType }) {
    const platformModule = await import(`../platformModules/${platformName}.js`);
    platformModule.openLogPage({ hostname, logId, contactType });
}

async function updateLog({ logType, sessionId, recordingLink, subject, note }) {
    const { rcUnifiedCrmExtJwt } = await chrome.storage.local.get('rcUnifiedCrmExtJwt');
    if (!!rcUnifiedCrmExtJwt) {
        switch (logType) {
            case 'Call':
                const patchBody = {
                    sessionId,
                    recordingLink,
                    subject,
                    note
                }
                const callLogRes = await axios.patch(`${config.serverUrl}/callLog?jwtToken=${rcUnifiedCrmExtJwt}`, patchBody);
                if (callLogRes.data.successful) {
                    if (!!recordingLink) {
                        const recordingSessionId = `rec-link-${sessionId}`;
                        const existingCallRecording = await chrome.storage.local.get(recordingSessionId);
                        if (!!existingCallRecording[recordingSessionId]) {
                            await chrome.storage.local.remove(recordingSessionId);
                        }
                        console.log('call recording update done');
                    }
                    else {
                        showNotification({ level: 'success', message: 'call log updated', ttl: 3000 });
                    }
                }
        }
    }
}

async function cacheCallNote({ sessionId, note }) {
    let noteToCache = {};
    noteToCache[sessionId] = note;
    await chrome.storage.local.set(noteToCache);
}

async function getCachedNote({ sessionId }) {
    const cachedNote = await chrome.storage.local.get(sessionId);
    if (isObjectEmpty(cachedNote)) {
        return '';
    }
    else {
        return cachedNote[sessionId];
    }
}

exports.addLog = addLog;
exports.checkLog = checkLog;
exports.getLog = getLog;
exports.openLog = openLog;
exports.updateLog = updateLog;
exports.cacheCallNote = cacheCallNote;
exports.getCachedNote = getCachedNote;