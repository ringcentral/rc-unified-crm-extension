const Op = require('sequelize').Op;
const { CallLogModel } = require('../models/callLogModel');
const { MessageLogModel } = require('../models/messageLogModel');
const { UserModel } = require('../models/userModel');
const oauth = require('../lib/oauth');

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
        let user = await UserModel.findOne({
            where: {
                id: userId,
                platform
            }
        });
        if (!user || !user.accessToken) {
            return {
                successful: false,
                returnMessage: {
                    message: `Cannot find user with id: ${userId}`,
                    messageType: 'warning',
                    ttl: 3000
                }
            };
        }
        const platformModule = require(`../adapters/${platform}`);
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
        if (!!!contactId || contactId === 0) {
            return {
                successful: false,
                returnMessage: {
                    message: `Contact not found for number ${contactNumber}`,
                    messageType: 'warning',
                    ttl: 3000
                }
            };
        }
        const contactInfo = {
            id: contactId,
            phoneNumber: contactNumber,
            type: incomingData.contactType ?? "",
            name: incomingData.contactName ?? ""
        };
        const { logId, returnMessage, extraDataTracking } = await platformModule.createCallLog({ user, contactInfo, authHeader, callLog, note, additionalSubmission, aiNote, transcript });
        if (!!logId) {
            await CallLogModel.create({
                id: incomingData.logInfo.telephonySessionId || incomingData.logInfo.id,
                sessionId: incomingData.logInfo.sessionId,
                platform,
                thirdPartyLogId: logId,
                userId
            });
        }
        return { successful: true, logId, returnMessage, extraDataTracking };
    } catch (e) {
        console.log(`platform: ${platform} \n${e.stack}`);
        if (e.response?.status === 429) {
            return { successful: false, returnMessage: { message: `${platform} rate limit reached. Please try again the next minute.`, messageType: 'warning', ttl: 5000 } };
        }
        return { successful: false, returnMessage: { message: `Failed to create call log.`, messageType: 'warning', ttl: 5000 } };
    }
}

async function getCallLog({ userId, sessionIds, platform, requireDetails }) {
    let user = await UserModel.findOne({
        where: {
            id: userId,
            platform
        }
    });
    if (!user || !user.accessToken) {
        return { successful: false, message: `Cannot find user with id: ${userId}` };
    }
    let logs = [];
    let returnMessage = null;
    let extraDataTracking;
    const sessionIdsArray = sessionIds.split(',');
    if (!!requireDetails) {
        const platformModule = require(`../adapters/${platform}`);
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
        for (const callLog of callLogs) {
            if (!!!callLog) {
                logs.push({ sessionId: callLog.sessionId, matched: false });
                continue;
            }
            const getCallLogResult = await platformModule.getCallLog({ user, callLogId: callLog.thirdPartyLogId, authHeader });
            returnMessage = getCallLogResult.returnMessage;
            extraDataTracking = getCallLogResult.extraDataTracking;
            logs.push({ sessionId: callLog.sessionId, matched: true, logId: callLog.thirdPartyLogId, logData: getCallLogResult.callLogInfo });
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
        for (const callLog of callLogs) {
            if (!!!callLog) {
                logs.push({ sessionId: callLog.sessionId, matched: false });
                continue;
            }
            logs.push({ sessionId: callLog.sessionId, matched: true, logId: callLog.thirdPartyLogId });
        }
    }
    return { successful: true, logs, returnMessage, extraDataTracking };
}

async function updateCallLog({ platform, userId, incomingData }) {
    try {
        const existingCallLog = await CallLogModel.findOne({
            where: {
                sessionId: incomingData.sessionId
            }
        });
        if (existingCallLog) {
            const platformModule = require(`../adapters/${platform}`);
            let user = await UserModel.findOne({
                where: {
                    id: userId,
                    platform
                }
            });
            if (!user || !user.accessToken) {
                return { successful: false, message: `Cannot find user with id: ${userId}` };
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
            const { updatedNote, returnMessage, extraDataTracking } = await platformModule.updateCallLog({
                user,
                existingCallLog,
                authHeader,
                recordingLink: incomingData.recordingLink,
                subject: incomingData.subject,
                note: incomingData.note,
                startTime: incomingData.startTime,
                duration: incomingData.duration,
                result: incomingData.result,
                aiNote: incomingData.aiNote,
                transcript: incomingData.transcript
            });
            return { successful: true, logId: existingCallLog.thirdPartyLogId, updatedNote, returnMessage, extraDataTracking };
        }
        return { successful: false };
    } catch (e) {
        console.log(`platform: ${platform} \n${e.stack}`);
        if (e.response?.status === 429) {
            return { successful: false, returnMessage: { message: `${platform} rate limit reached. Please try again the next minute.`, messageType: 'warning', ttl: 5000 } };
        }
        if (!!incomingData.recordingLink) {
            return { successful: false, returnMessage: { message: `Failed to upload call recording link.`, messageType: 'warning', ttl: 5000 } };
        }
        else {
            return { successful: false, returnMessage: { message: `Failed to update call log. Please check if the log entity still exist on ${platform}`, messageType: 'warning', ttl: 5000 } };
        }
    }
}

async function createMessageLog({ platform, userId, incomingData }) {
    try {
        let returnMessage = null;
        let extraDataTracking;
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
        const platformModule = require(`../adapters/${platform}`);
        const contactNumber = incomingData.logInfo.correspondents[0].phoneNumber;
        const additionalSubmission = incomingData.additionalSubmission;
        let user = await UserModel.findOne({
            where: {
                id: userId,
                platform
            }
        });
        if (!user || !user.accessToken) {
            return {
                successful: false,
                returnMessage:
                {
                    message: `Cannot find user with id: ${userId}`,
                    messageType: 'warning',
                    ttl: 3000
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
        if (!!!contactId) {
            return {
                successful: false,
                returnMessage:
                {
                    message: `Contact not found for number ${contactNumber}`,
                    messageType: 'warning',
                    ttl: 3000
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
        incomingData.logInfo.messages = incomingData.logInfo.messages.reverse();
        for (const message of incomingData.logInfo.messages) {
            if (existingIds.includes(message.id.toString())) {
                continue;
            }
            let recordingLink = null;
            if (message.attachments && message.attachments.some(a => a.type === 'AudioRecording')) {
                recordingLink = message.attachments.find(a => a.type === 'AudioRecording').link;
            }
            let faxDocLink = null;
            if (message.attachments && message.attachments.some(a => a.type === 'RenderedDocument')) {
                faxDocLink = message.attachments.find(a => a.type === 'RenderedDocument').link;
            }
            const existingSameDateMessageLog = await MessageLogModel.findOne({
                where: {
                    conversationLogId: incomingData.logInfo.conversationLogId
                }
            });
            let crmLogId = ''
            if (!!existingSameDateMessageLog) {
                const updateMessageResult = await platformModule.updateMessageLog({ user, contactInfo, existingMessageLog: existingSameDateMessageLog, message, authHeader });
                crmLogId = existingSameDateMessageLog.thirdPartyLogId;
                returnMessage = updateMessageResult.returnMessage;
            }
            else {
                const createMessageLogResult = await platformModule.createMessageLog({ user, contactInfo, authHeader, message, additionalSubmission, recordingLink, faxDocLink });
                crmLogId = createMessageLogResult.logId;
                returnMessage = createMessageLogResult.returnMessage;
                extraDataTracking = createMessageLogResult.extraDataTracking;
            }
            if (!!crmLogId) {
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
            return { successful: false, returnMessage: { message: `${platform} rate limit reached. Please try again the next minute.`, messageType: 'warning', ttl: 5000 } };
        }
        return { successful: false, returnMessage: { message: `Failed to create message log.`, messageType: 'warning', ttl: 5000 } };
    }
}

exports.createCallLog = createCallLog;
exports.updateCallLog = updateCallLog;
exports.createMessageLog = createMessageLog;
exports.getCallLog = getCallLog;