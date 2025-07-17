const Op = require('sequelize').Op;
const { CallLogModel } = require('../models/callLogModel');
const { MessageLogModel } = require('../models/messageLogModel');
const { UserModel } = require('../models/userModel');
const oauth = require('../lib/oauth');
const errorMessage = require('../lib/generalErrorMessage');
const { composeCallLog, getLogFormatType, FORMAT_TYPES } = require('../lib/callLogComposer');
const adapterRegistry = require('../adapter/registry');

async function createCallLog({ platform, userId, incomingData }) {
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
        const platformModule = adapterRegistry.getAdapter(platform);
        const callLog = incomingData.logInfo;
        const additionalSubmission = incomingData.additionalSubmission;
        const note = incomingData.note;
        const aiNote = incomingData.aiNote;
        const transcript = incomingData.transcript;
        const authType = platformModule.getAuthType();
        let authHeader = '';
        switch (authType) {
            case 'oauth':
                const oauthApp = oauth.getOAuthApp((await platformModule.getOauthInfo({ tokenUrl: user?.platformAdditionalInfo?.tokenUrl, hostname: user?.hostname })));
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
        const logFormat = getLogFormatType(platform);
        let composedLogDetails = '';
        if (logFormat === FORMAT_TYPES.PLAIN_TEXT || logFormat === FORMAT_TYPES.HTML) {
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
                platform
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
            composedLogDetails
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
        console.error(`platform: ${platform} \n${e.stack} \n${JSON.stringify(e.response?.data)}`);
        if (e.response?.status === 429) {
            return {
                successful: false,
                returnMessage: errorMessage.rateLimitErrorMessage({ platform })
            };
        }
        else if (e.response?.status >= 400 && e.response?.status < 410) {
            return {
                successful: false,
                returnMessage: errorMessage.authorizationErrorMessage({ platform }),
                extraDataTracking: {
                    statusCode: e.response?.status,
                }
            };
        }
        return {
            successful: false,
            returnMessage:
            {
                message: `Error creating call log`,
                messageType: 'warning',
                details: [
                    {
                        title: 'Details',
                        items: [
                            {
                                id: '1',
                                type: 'text',
                                text: `Please check if your account has permission to CREATE logs.`
                            }
                        ]
                    }
                ],
                ttl: 5000
            }
        };
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
            const platformModule = adapterRegistry.getAdapter(platform);
            const authType = platformModule.getAuthType();
            let authHeader = '';
            switch (authType) {
                case 'oauth':
                    const oauthApp = oauth.getOAuthApp((await platformModule.getOauthInfo({ tokenUrl: user?.platformAdditionalInfo?.tokenUrl, hostname: user?.hostname })));
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
                const callLog = callLogs.find(c => c.sessionId === sId);
                if (!callLog) {
                    logs.push({ sessionId: sId, matched: false });
                }
                else {
                    const getCallLogResult = await platformModule.getCallLog({ user, callLogId: callLog.thirdPartyLogId, contactId: callLog.contactId, authHeader });
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
        console.error(`platform: ${platform} \n${e.stack} \n${JSON.stringify(e.response?.data)}`);
        if (e.response?.status === 429) {
            return {
                successful: false,
                returnMessage: errorMessage.rateLimitErrorMessage({ platform }),
                extraDataTracking: {
                    statusCode: e.response?.status,
                }
            };
        }
        else if (e.response?.status >= 400 && e.response?.status < 410) {
            return {
                successful: false,
                returnMessage: errorMessage.authorizationErrorMessage({ platform }),
                extraDataTracking: {
                    statusCode: e.response?.status,
                }
            };
        }
        return {
            successful: false,
            returnMessage:
            {
                message: `Error getting call log`,
                messageType: 'warning',
                details: [
                    {
                        title: 'Details',
                        items: [
                            {
                                id: '1',
                                type: 'text',
                                text: `Please check if your account has permission to CREATE logs.`
                            }
                        ]
                    }
                ],
                ttl: 5000
            },
            extraDataTracking: {
                statusCode: e.response?.status,
            }
        };
    }
}

async function updateCallLog({ platform, userId, incomingData }) {
    try {
        const existingCallLog = await CallLogModel.findOne({
            where: {
                sessionId: incomingData.sessionId
            }
        });
        if (existingCallLog) {
            const platformModule = adapterRegistry.getAdapter(platform);
            let user = await UserModel.findByPk(userId);
            if (!user || !user.accessToken) {
                return { successful: false, message: `Contact not found` };
            }
            const authType = platformModule.getAuthType();
            let authHeader = '';
            switch (authType) {
                case 'oauth':
                    const oauthApp = oauth.getOAuthApp((await platformModule.getOauthInfo({ tokenUrl: user?.platformAdditionalInfo?.tokenUrl, hostname: user?.hostname })));
                    user = await oauth.checkAndRefreshAccessToken(oauthApp, user);
                    authHeader = `Bearer ${user.accessToken}`;
                    break;
                case 'apiKey':
                    const basicAuth = platformModule.getBasicAuth({ apiKey: user.accessToken });
                    authHeader = `Basic ${basicAuth}`;
                    break;
            }
            // Compose updated call log details centrally
            const logFormat = getLogFormatType(platform);
            let composedLogDetails = '';
            if (logFormat === FORMAT_TYPES.PLAIN_TEXT || logFormat === FORMAT_TYPES.HTML) {
                // Get existing log details first (for updates we need to compose on top of existing content)
                let existingBody = '';
                try {
                    const getLogResult = await platformModule.getCallLog({
                        user,
                        callLogId: existingCallLog.thirdPartyLogId,
                        authHeader
                    });
                    // Extract existing body from the platform-specific response
                    if (getLogResult.callLogInfo?.fullBody) {
                        existingBody = getLogResult.callLogInfo.fullBody;
                    } else if (getLogResult.callLogInfo?.note) {
                        existingBody = getLogResult.callLogInfo.note;
                    }
                } catch (error) {
                    console.log('Error getting existing log details, proceeding with empty body', error);
                }
                composedLogDetails = await composeCallLog({
                    logFormat,
                    existingBody,
                    callLog: {
                        sessionId: existingCallLog.sessionId,
                        startTime: incomingData.startTime,
                        duration: incomingData.duration,
                        result: incomingData.result
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
                additionalSubmission: incomingData.additionalSubmission,
                composedLogDetails
            });
            return { successful: true, logId: existingCallLog.thirdPartyLogId, updatedNote, returnMessage, extraDataTracking };
        }
        return { successful: false };
    } catch (e) {
        console.error(`platform: ${platform} \n${e.stack} \n${JSON.stringify(e.response?.data)}`);
        if (e.response?.status === 429) {
            return {
                successful: false,
                returnMessage: errorMessage.rateLimitErrorMessage({ platform }),
                extraDataTracking: {
                    statusCode: e.response?.status,
                }
            };
        }
        else if (e.response?.status >= 400 && e.response?.status < 410) {
            return {
                successful: false,
                returnMessage: errorMessage.authorizationErrorMessage({ platform }),
                extraDataTracking: {
                    statusCode: e.response?.status,
                }
            };
        }
        return {
            successful: false,
            returnMessage:
            {
                message: `Error updating call log`,
                messageType: 'warning',
                details: [
                    {
                        title: 'Details',
                        items: [
                            {
                                id: '1',
                                type: 'text',
                                text: `Please check if the log entity still exist on ${platform} and your account has permission to EDIT logs.`
                            }
                        ]
                    }
                ],
                ttl: 5000
            },
            extraDataTracking: {
                statusCode: e.response?.status,
            }
        };
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
        const platformModule = adapterRegistry.getAdapter(platform);
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
        const authType = platformModule.getAuthType();
        let authHeader = '';
        switch (authType) {
            case 'oauth':
                const oauthApp = oauth.getOAuthApp((await platformModule.getOauthInfo({ tokenUrl: user?.platformAdditionalInfo?.tokenUrl, hostname: user?.hostname })));
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
            const existingSameDateMessageLog = await MessageLogModel.findOne({
                where: {
                    conversationLogId: incomingData.logInfo.conversationLogId
                }
            });
            let crmLogId = ''
            if (existingSameDateMessageLog) {
                const updateMessageResult = await platformModule.updateMessageLog({ user, contactInfo, existingMessageLog: existingSameDateMessageLog, message, authHeader, additionalSubmission });
                crmLogId = existingSameDateMessageLog.thirdPartyLogId;
                returnMessage = updateMessageResult?.returnMessage;
            }
            else {
                const createMessageLogResult = await platformModule.createMessageLog({ user, contactInfo, authHeader, message, additionalSubmission, recordingLink, faxDocLink, faxDownloadLink });
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
        console.log(`platform: ${platform} \n${e.stack}`);
        if (e.response?.status === 429) {
            return {
                successful: false,
                returnMessage: errorMessage.rateLimitErrorMessage({ platform }),
                extraDataTracking: {
                    statusCode: e.response?.status,
                }
            };
        }
        else if (e.response?.status >= 400 && e.response?.status < 410) {
            return {
                successful: false,
                returnMessage: errorMessage.authorizationErrorMessage({ platform }),
                extraDataTracking: {
                    statusCode: e.response?.status,
                }
            };
        }
        return {
            successful: false,
            returnMessage:
            {
                message: `Error creating message log`,
                messageType: 'warning',
                details: [
                    {
                        title: 'Details',
                        items: [
                            {
                                id: '1',
                                type: 'text',
                                text: `Please check if your account has permission to CREATE logs.`
                            }
                        ]
                    }
                ],
                ttl: 5000
            },
            extraDataTracking: {
                statusCode: e.response?.status,
            }
        };
    }
}

exports.createCallLog = createCallLog;
exports.updateCallLog = updateCallLog;
exports.createMessageLog = createMessageLog;
exports.getCallLog = getCallLog;