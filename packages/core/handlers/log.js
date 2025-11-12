const Op = require('sequelize').Op;
const { CallLogModel } = require('../models/callLogModel');
const { MessageLogModel } = require('../models/messageLogModel');
const { UserModel } = require('../models/userModel');
const oauth = require('../lib/oauth');
const { composeCallLog } = require('../lib/callLogComposer');
const connectorRegistry = require('../connector/registry');
const { LOG_DETAILS_FORMAT_TYPE } = require('../lib/constants');
const { NoteCache } = require('../models/dynamo/noteCacheSchema');
const { Connector } = require('../models/dynamo/connectorSchema');
const moment = require('moment');
const { getMediaReaderLinkByPlatformMediaLink } = require('../lib/util');
const logger = require('../lib/logger');
const { handleApiError } = require('../lib/errorHandler');

async function createCallLog({ platform, userId, incomingData, hashedAccountId, isFromSSCL }) {
    try {
        const existingCallLog = await CallLogModel.findOne({
            where: {
                sessionId: incomingData.logInfo.sessionId
            }
        });
        if (existingCallLog) {
            return {
                successful: false,
                returnMessage: {
                    message: `Existing log for session ${incomingData.logInfo.sessionId}`,
                    messageType: 'warning',
                    ttl: 3000
                }
            }
        }
        let user = await UserModel.findByPk(userId);
        if (!user || !user.accessToken) {
            return {
                successful: false,
                returnMessage: {
                    message: `User not found`,
                    messageType: 'warning',
                    ttl: 5000
                }
            };
        }
        const platformModule = connectorRegistry.getConnector(platform);
        const callLog = incomingData.logInfo;
        const additionalSubmission = incomingData.additionalSubmission;
        let note = incomingData.note;
        if (process.env.USE_CACHE && isFromSSCL) {
            const noteCache = await NoteCache.get({ sessionId: incomingData.logInfo.sessionId });
            if (noteCache) {
                note = noteCache.note;
            }
        }
        const aiNote = incomingData.aiNote;
        const transcript = incomingData.transcript;
        let proxyConfig;
        const proxyId = user.platformAdditionalInfo?.proxyId;
        if (proxyId) {
            proxyConfig = await Connector.getProxyConfig(proxyId);
        }
        const authType = await platformModule.getAuthType({ proxyId, proxyConfig });
        let authHeader = '';
        switch (authType) {
            case 'oauth':
                const oauthApp = oauth.getOAuthApp((await platformModule.getOauthInfo({ tokenUrl: user?.platformAdditionalInfo?.tokenUrl, hostname: user?.hostname, proxyId, proxyConfig })));
                user = await oauth.checkAndRefreshAccessToken(oauthApp, user);
                authHeader = `Bearer ${user.accessToken}`;
                break;
            case 'apiKey':
                const basicAuth = platformModule.getBasicAuth({ apiKey: user.accessToken });
                authHeader = `Basic ${basicAuth}`;
                break;
        }
        const contactNumber = callLog.direction === 'Inbound' ? callLog.from.phoneNumber : callLog.to.phoneNumber;
        const contactId = incomingData.contactId;
        if (!contactId || contactId === 0) {
            return {
                successful: false,
                returnMessage: {
                    message: `Contact not found for number ${contactNumber}`,
                    messageType: 'warning',
                    ttl: 5000
                }
            };
        }
        const contactInfo = {
            id: contactId,
            phoneNumber: contactNumber,
            type: incomingData.contactType ?? "",
            name: incomingData.contactName ?? ""
        };

        // Compose call log details centrally
        const logFormat = platformModule.getLogFormatType ? platformModule.getLogFormatType(platform, proxyConfig) : LOG_DETAILS_FORMAT_TYPE.PLAIN_TEXT;
        let composedLogDetails = '';
        if (logFormat === LOG_DETAILS_FORMAT_TYPE.PLAIN_TEXT || logFormat === LOG_DETAILS_FORMAT_TYPE.HTML || logFormat === LOG_DETAILS_FORMAT_TYPE.MARKDOWN) {
            composedLogDetails = await composeCallLog({
                logFormat,
                callLog,
                contactInfo,
                user,
                note,
                aiNote,
                transcript,
                recordingLink: callLog.recording?.link,
                subject: callLog.customSubject,
                startTime: callLog.startTime,
                duration: callLog.duration,
                result: callLog.result,
                platform,
            });
        }

        const { logId, returnMessage, extraDataTracking } = await platformModule.createCallLog({
            user,
            contactInfo,
            authHeader,
            callLog,
            note,
            additionalSubmission,
            aiNote,
            transcript,
            composedLogDetails,
            hashedAccountId,
            isFromSSCL,
            proxyConfig,
        });
        if (logId) {
            await CallLogModel.create({
                id: incomingData.logInfo.telephonySessionId || incomingData.logInfo.id,
                sessionId: incomingData.logInfo.sessionId,
                platform,
                thirdPartyLogId: logId,
                userId,
                contactId
            });
        }
        return { successful: !!logId, logId, returnMessage, extraDataTracking };
    } catch (e) {
        return handleApiError(e, platform, 'createCallLog', { userId });
    }
}

async function getCallLog({ userId, sessionIds, platform, requireDetails }) {
    try {
        let user = await UserModel.findByPk(userId);
        if (!user || !user.accessToken) {
            return { successful: false, message: `Contact not found` };
        }
        let logs = [];
        let returnMessage = null;
        let extraDataTracking = {};;

        // Handle undefined or null sessionIds
        if (!sessionIds) {
            return { successful: false, message: `No session IDs provided` };
        }

        let sessionIdsArray = sessionIds.split(',');
        if (sessionIdsArray.length > 5) {
            sessionIdsArray = sessionIdsArray.slice(0, 5);
        }
        if (requireDetails) {
            const proxyId = user.platformAdditionalInfo?.proxyId;
            let proxyConfig = null;
            if (proxyId) {
                proxyConfig = await Connector.getProxyConfig(proxyId);
            }
            const platformModule = connectorRegistry.getConnector(platform);
            const authType = await platformModule.getAuthType({ proxyId, proxyConfig });
            let authHeader = '';
            switch (authType) {
                case 'oauth':
                    const oauthApp = oauth.getOAuthApp((await platformModule.getOauthInfo({ tokenUrl: user?.platformAdditionalInfo?.tokenUrl, hostname: user?.hostname, proxyId, proxyConfig })));
                    user = await oauth.checkAndRefreshAccessToken(oauthApp, user);
                    authHeader = `Bearer ${user.accessToken}`;
                    break;
                case 'apiKey':
                    const basicAuth = platformModule.getBasicAuth({ apiKey: user.accessToken });
                    authHeader = `Basic ${basicAuth}`;
                    break;
            }
            const callLogs = await CallLogModel.findAll({
                where: {
                    sessionId: {
                        [Op.in]: sessionIdsArray
                    }
                }
            });
            for (const sId of sessionIdsArray) {
                if (sId == 0) {
                    logs.push({ sessionId: sId, matched: false });
                    continue;
                }
                const callLog = callLogs.find(c => c.sessionId === sId);
                if (!callLog) {
                    logs.push({ sessionId: sId, matched: false });
                }
                else {
                    const getCallLogResult = await platformModule.getCallLog({ user, callLogId: callLog.thirdPartyLogId, contactId: callLog.contactId, authHeader, proxyConfig });
                    returnMessage = getCallLogResult.returnMessage;
                    extraDataTracking = getCallLogResult.extraDataTracking;
                    logs.push({ sessionId: callLog.sessionId, matched: true, logId: callLog.thirdPartyLogId, logData: getCallLogResult.callLogInfo });
                }
            }
        }
        else {
            const callLogs = await CallLogModel.findAll({
                where: {
                    sessionId: {
                        [Op.in]: sessionIdsArray
                    }
                }
            });
            for (const sId of sessionIdsArray) {
                const callLog = callLogs.find(c => c.sessionId === sId);
                if (!callLog) {
                    logs.push({ sessionId: sId, matched: false });
                }
                else {
                    logs.push({ sessionId: callLog.sessionId, matched: true, logId: callLog.thirdPartyLogId });
                }
            }
        }
        return { successful: true, logs, returnMessage, extraDataTracking };
    }
    catch (e) {
        return handleApiError(e, platform, 'getCallLog', { userId, sessionIds, requireDetails });
    }
}

async function updateCallLog({ platform, userId, incomingData, hashedAccountId, isFromSSCL }) {
    try {
        const existingCallLog = await CallLogModel.findOne({
            where: {
                sessionId: incomingData.sessionId
            }
        });
        if (existingCallLog) {
            const platformModule = connectorRegistry.getConnector(platform);
            let user = await UserModel.findByPk(userId);
            if (!user || !user.accessToken) {
                return { successful: false, message: `Contact not found` };
            }
            const proxyId = user.platformAdditionalInfo?.proxyId;
            let proxyConfig = null;
            if (proxyId) {
                proxyConfig = await Connector.getProxyConfig(proxyId);
            }
            const authType = await platformModule.getAuthType({ proxyId, proxyConfig });
            let authHeader = '';
            switch (authType) {
                case 'oauth':
                    const oauthApp = oauth.getOAuthApp((await platformModule.getOauthInfo({ tokenUrl: user?.platformAdditionalInfo?.tokenUrl, hostname: user?.hostname, proxyId, proxyConfig })));
                    user = await oauth.checkAndRefreshAccessToken(oauthApp, user);
                    authHeader = `Bearer ${user.accessToken}`;
                    break;
                case 'apiKey':
                    const basicAuth = platformModule.getBasicAuth({ apiKey: user.accessToken });
                    authHeader = `Basic ${basicAuth}`;
                    break;
            }

            // Fetch existing call log details once to avoid duplicate API calls
            let existingCallLogDetails = null;    // Compose updated call log details centrally
            const logFormat = platformModule.getLogFormatType ? platformModule.getLogFormatType(platform, proxyConfig) : LOG_DETAILS_FORMAT_TYPE.PLAIN_TEXT;
            let composedLogDetails = '';
            if (logFormat === LOG_DETAILS_FORMAT_TYPE.PLAIN_TEXT || logFormat === LOG_DETAILS_FORMAT_TYPE.HTML || logFormat === LOG_DETAILS_FORMAT_TYPE.MARKDOWN) {
                let existingBody = '';
                try {
                    const getLogResult = await platformModule.getCallLog({
                        user,
                        callLogId: existingCallLog.thirdPartyLogId,
                        authHeader,
                        proxyConfig,
                    });
                    existingCallLogDetails = getLogResult?.callLogInfo?.fullLogResponse;
                    // Extract existing body from the platform-specific response
                    if (getLogResult.callLogInfo?.fullBody) {
                        existingBody = getLogResult.callLogInfo.fullBody;
                    } else if (getLogResult.callLogInfo?.note) {
                        existingBody = getLogResult.callLogInfo.note;
                    }
                } catch (error) {
                    logger.error('Error getting existing log details, proceeding with empty body', { stack: error.stack });
                }
                composedLogDetails = await composeCallLog({
                    logFormat,
                    existingBody,
                    callLog: {
                        sessionId: existingCallLog.sessionId,
                        startTime: incomingData.startTime,
                        duration: incomingData.duration,
                        result: incomingData.result,
                        direction: incomingData.direction,
                        from: incomingData.from,
                        to: incomingData.to,
                        legs: incomingData.legs || [],
                    },
                    contactInfo: null, // Not needed for updates
                    user,
                    note: incomingData.note,
                    aiNote: incomingData.aiNote,
                    transcript: incomingData.transcript,
                    recordingLink: incomingData.recordingLink,
                    subject: incomingData.subject,
                    startTime: incomingData.startTime,
                    duration: incomingData.duration,
                    result: incomingData.result,
                });
            }

            const { updatedNote, returnMessage, extraDataTracking } = await platformModule.updateCallLog({
                user,
                existingCallLog,
                authHeader,
                recordingLink: incomingData.recordingLink,
                recordingDownloadLink: incomingData.recordingDownloadLink,
                subject: incomingData.subject,
                note: incomingData.note,
                startTime: incomingData.startTime,
                duration: incomingData.duration,
                result: incomingData.result,
                aiNote: incomingData.aiNote,
                transcript: incomingData.transcript,
                legs: incomingData.legs || [],
                additionalSubmission: incomingData.additionalSubmission,
                composedLogDetails,
                existingCallLogDetails,  // Pass the fetched details to avoid duplicate API calls
                hashedAccountId,
                isFromSSCL,
                proxyConfig,
            });
            return { successful: true, logId: existingCallLog.thirdPartyLogId, updatedNote, returnMessage, extraDataTracking };
        }
        return { successful: false };
    } catch (e) {
        return handleApiError(e, platform, 'updateCallLog', { userId });
    }
}

async function createMessageLog({ platform, userId, incomingData }) {
    try {
        let returnMessage = null;
        let extraDataTracking = {};;
        if (incomingData.logInfo.messages.length === 0) {
            return {
                successful: false,
                returnMessage:
                {
                    message: 'No message to log.',
                    messageType: 'warning',
                    ttl: 3000
                }
            }
        }
        const platformModule = connectorRegistry.getConnector(platform);
        const contactNumber = incomingData.logInfo.correspondents[0].phoneNumber;
        const additionalSubmission = incomingData.additionalSubmission;
        let user = await UserModel.findByPk(userId);
        if (!user || !user.accessToken) {
            return {
                successful: false,
                returnMessage:
                {
                    message: `Contact not found`,
                    messageType: 'warning',
                    ttl: 5000
                }
            };
        }
        const proxyId = user.platformAdditionalInfo?.proxyId;
        let proxyConfig = null;
        if (proxyId) {
            proxyConfig = await Connector.getProxyConfig(proxyId);
        }
        const authType = await platformModule.getAuthType({ proxyId, proxyConfig });
        let authHeader = '';
        switch (authType) {
            case 'oauth':
                const oauthApp = oauth.getOAuthApp((await platformModule.getOauthInfo({ tokenUrl: user?.platformAdditionalInfo?.tokenUrl, hostname: user?.hostname, proxyId, proxyConfig })));
                user = await oauth.checkAndRefreshAccessToken(oauthApp, user);
                authHeader = `Bearer ${user.accessToken}`;
                break;
            case 'apiKey':
                const basicAuth = platformModule.getBasicAuth({ apiKey: user.accessToken });
                authHeader = `Basic ${basicAuth}`;
                break;
        }
        const contactId = incomingData.contactId;
        if (!contactId) {
            return {
                successful: false,
                returnMessage:
                {
                    message: `Contact not found for number ${contactNumber}`,
                    messageType: 'warning',
                    ttl: 5000
                }
            };
        }
        const contactInfo = {
            id: contactId,
            phoneNumber: contactNumber,
            type: incomingData.contactType ?? "",
            name: incomingData.contactName ?? ""
        };
        const messageIds = incomingData.logInfo.messages.map(m => { return { id: m.id.toString() }; });
        const existingMessages = await MessageLogModel.findAll({
            where: {
                [Op.or]: messageIds
            }
        });
        const existingIds = existingMessages.map(m => m.id);
        const logIds = [];
        // reverse the order of messages to log the oldest message first
        const reversedMessages = incomingData.logInfo.messages.reverse();
        for (const message of reversedMessages) {
            if (existingIds.includes(message.id.toString())) {
                continue;
            }
            let recordingLink = null;
            if (message.attachments && message.attachments.some(a => a.type === 'AudioRecording')) {
                recordingLink = message.attachments.find(a => a.type === 'AudioRecording').link;
            }
            let faxDocLink = null;
            let faxDownloadLink = null;
            if (message.attachments && message.attachments.some(a => a.type === 'RenderedDocument')) {
                faxDocLink = message.attachments.find(a => a.type === 'RenderedDocument').link;
                faxDownloadLink = message.attachments.find(a => a.type === 'RenderedDocument').uri + `?access_token=${incomingData.logInfo.rcAccessToken}`
            }
            let imageLink = null;
            let videoLink = null;
            if (message.attachments && message.attachments.some(a => a.type === 'MmsAttachment')) {
                const imageAttachment = message.attachments.find(a => a.type === 'MmsAttachment' && a.contentType.startsWith('image/'));
                if (imageAttachment) {
                    imageLink = getMediaReaderLinkByPlatformMediaLink(imageAttachment?.uri);
                }
                const videoAttachment = message.attachments.find(a => a.type === 'MmsAttachment' && a.contentType.startsWith('video/'));
                if (videoAttachment) {
                    videoLink = getMediaReaderLinkByPlatformMediaLink(videoAttachment?.uri);
                }
            }
            const existingSameDateMessageLog = await MessageLogModel.findOne({
                where: {
                    conversationLogId: incomingData.logInfo.conversationLogId
                }
            });
            let crmLogId = ''
            if (existingSameDateMessageLog) {
                const updateMessageResult = await platformModule.updateMessageLog({ user, contactInfo, existingMessageLog: existingSameDateMessageLog, message, authHeader, additionalSubmission, imageLink, videoLink, proxyConfig });
                crmLogId = existingSameDateMessageLog.thirdPartyLogId;
                returnMessage = updateMessageResult?.returnMessage;
            }
            else {
                const createMessageLogResult = await platformModule.createMessageLog({ user, contactInfo, authHeader, message, additionalSubmission, recordingLink, faxDocLink, faxDownloadLink, imageLink, videoLink, proxyConfig });
                crmLogId = createMessageLogResult.logId;
                returnMessage = createMessageLogResult?.returnMessage;
                extraDataTracking = createMessageLogResult.extraDataTracking;
            }
            if (crmLogId) {
                const createdMessageLog =
                    await MessageLogModel.create({
                        id: message.id.toString(),
                        platform,
                        conversationId: incomingData.logInfo.conversationId,
                        thirdPartyLogId: crmLogId,
                        userId,
                        conversationLogId: incomingData.logInfo.conversationLogId
                    });
                logIds.push(createdMessageLog.id);
            }
        }
        return { successful: true, logIds, returnMessage, extraDataTracking };
    }
    catch (e) {
        return handleApiError(e, platform, 'createMessageLog', { userId });
    }
}

async function saveNoteCache({ platform, userId, sessionId, note }) {
    try {
        const now = moment();
        await NoteCache.create({ sessionId, note, ttl: now.unix() + 3600 });
        return { successful: true, returnMessage: 'Note cache saved' };
    } catch (e) {
        return handleApiError(e, platform, 'saveNoteCache', { userId, sessionId, note });
    }
}

exports.createCallLog = createCallLog;
exports.updateCallLog = updateCallLog;
exports.createMessageLog = createMessageLog;
exports.getCallLog = getCallLog;
exports.saveNoteCache = saveNoteCache;