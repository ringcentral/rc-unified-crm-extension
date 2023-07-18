const Op = require('sequelize').Op;
const { CallLogModel } = require('../models/callLogModel');
const { MessageLogModel } = require('../models/messageLogModel');
const { UserModel } = require('../models/userModel');
const oauth = require('../lib/oauth');

async function addCallLog({ platform, userId, incomingData }) {
    try {
        const existingCallLog = await CallLogModel.findByPk(incomingData.logInfo.id);
        if (existingCallLog) {
            return { successful: false, message: `existing log for session ${incomingData.logInfo.sessionId}` }
        }
        const platformModule = require(`../platformModules/${platform}`);
        const callLog = incomingData.logInfo;
        const additionalSubmission = incomingData.additionalSubmission;
        const note = incomingData.note;
        const user = await UserModel.findByPk(userId);
        if (!user || !user.accessToken) {
            return { successful: false, message: `Cannot find user with id: ${userId}` };
        }
        const authType = platformModule.getAuthType();
        let authHeader = '';
        switch (authType) {
            case 'oauth':
                const oauthApp = oauth.getOAuthApp(platformModule.getOauthInfo());
                await oauth.checkAndRefreshAccessToken(oauthApp, user);
                authHeader = `Bearer ${user.accessToken}`;
                break;
            case 'apiKey':
                const basicAuth = platformModule.getBasicAuth({ apiKey: user.accessToken });
                authHeader = `Basic ${basicAuth}`;
                break;
        }
        const contactNumber = callLog.direction === 'Inbound' ? callLog.from.phoneNumber : callLog.to.phoneNumber;
        const contactInfo = await platformModule.getContact({ user, authHeader, phoneNumber: contactNumber });
        if (contactInfo == null) {
            return { successful: false, message: `Contact not found for number ${contactNumber}` };
        }
        const logId = await platformModule.addCallLog({ user, contactInfo, authHeader, callLog, note, additionalSubmission, timezoneOffset: user.timezoneOffset, contactNumber });
        await CallLogModel.create({
            id: incomingData.logInfo.id,
            sessionId: incomingData.logInfo.sessionId,
            platform,
            thirdPartyLogId: logId,
            userId
        });
        console.log(`added call log: ${incomingData.logInfo.sessionId}`);
        return { successful: true, logId };
    } catch (e) {
        console.log(e);
        return { successful: false };
    }
}

async function addMessageLog({ platform, userId, incomingData }) {
    try {
        if (incomingData.logInfo.messages.length === 0) {
            return { successful: false, message: 'no message to log.' }
        }
        const platformModule = require(`../platformModules/${platform}`);
        const contactNumber = incomingData.logInfo.correspondents[0].phoneNumber;
        const additionalSubmission = incomingData.additionalSubmission;
        const user = await UserModel.findByPk(userId);
        if (!user || !user.accessToken) {
            return { successful: false, message: `Cannot find user with id: ${userId}` };
        }
        const authType = platformModule.getAuthType();
        let authHeader = '';
        switch (authType) {
            case 'oauth':
                const oauthApp = oauth.getOAuthApp(platformModule.getOauthInfo());
                await oauth.checkAndRefreshAccessToken(oauthApp, user);
                authHeader = `Bearer ${user.accessToken}`;
                break;
            case 'apiKey':
                const basicAuth = platformModule.getBasicAuth({ apiKey: user.accessToken });
                authHeader = `Basic ${basicAuth}`;
                break;
        }
        const contactInfo = await platformModule.getContact({ user, authHeader, phoneNumber: contactNumber });
        if (contactInfo == null) {
            return { successful: false, message: `Contact not found for number ${contactNumber}` };
        }
        const messageIds = incomingData.logInfo.messages.map(m => { return { id: m.id.toString() }; });
        const existingMessages = await MessageLogModel.findAll({
            where: {
                [Op.or]: messageIds
            }
        });
        const existingIds = existingMessages.map(m => m.id);
        const logIds = [];
        for (const message of incomingData.logInfo.messages) {
            if (existingIds.includes(message.id.toString())) {
                console.log(`existing message log: ${message.id}`);
                continue;
            }
            let recordingLink = null;
            if (message.attachments && message.attachments.some(a => a.type === 'AudioRecording')) {
                recordingLink = message.attachments.find(a => a.type === 'AudioRecording').link;
            }
            const logId = await platformModule.addMessageLog({ user, contactInfo, authHeader, message, additionalSubmission, recordingLink, timezoneOffset: user.timezoneOffset });
            await MessageLogModel.create({
                id: message.id.toString(),
                platform,
                conversationId: incomingData.logInfo.conversationId,
                thirdPartyLogId: logId,
                userId
            });
            console.log(`added message log: ${message.id}`);
            logIds.push(logId);
        }
        console.log(`logged ${logIds.length} messages.`);
        return { successful: true, logIds };
    }
    catch (e) {
        console.log(e);
        return { successful: false };
    }
}

async function getCallLog({ sessionIds }) {
    const sessionIdsArray = sessionIds.split(',');
    let logs = {};
    for (const sessionId of sessionIdsArray) {
        const callLog = await CallLogModel.findOne({
            where: {
                sessionId
            }
        });
        logs[sessionId] = { matched: callLog != null };
    }
    return { successful: true, logs };
}

// async function getMessageLogs(platform, messageId) {
//     const messageLog = await MessageLogModel.findOne({
//         where: {
//             platform,
//             id: messageId
//         }
//     });
//     if (callLog) {
//         return { successful: true, logId: callLog.thirdPartyLogId };
//     }
//     else {
//         return { successful: false, message: `cannot find message log for messageId: ${messageId}` };
//     }
// }

exports.addCallLog = addCallLog;
exports.addMessageLog = addMessageLog;
exports.getCallLog = getCallLog;
// exports.getMessageLogs = getMessageLogs;