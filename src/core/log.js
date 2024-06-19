const Op = require('sequelize').Op;
const { CallLogModel } = require('../models/callLogModel');
const { MessageLogModel } = require('../models/messageLogModel');
const { UserModel } = require('../models/userModel');
const oauth = require('../lib/oauth');

async function createCallLog({ platform, userId, incomingData }) {
    try {
        const existingCallLog = await CallLogModel.findByPk(incomingData.logInfo.id);
        if (existingCallLog) {
            return { successful: false, message: `Existing log for session ${incomingData.logInfo.sessionId}` }
        }
        let user = await UserModel.findOne({
            where: {
                id: userId,
                platform
            }
        });
        if (!user || !user.accessToken) {
            return { successful: false, message: `Cannot find user with id: ${userId}` };
        }
        const platformModule = require(`../adapters/${platform}`);
        const callLog = incomingData.logInfo;
        const additionalSubmission = incomingData.additionalSubmission;
        const note = incomingData.note;
        const authType = platformModule.getAuthType();
        let authHeader = '';
        switch (authType) {
            case 'oauth':
                const oauthApp = oauth.getOAuthApp(platformModule.getOauthInfo({ tokenUrl: user?.platformAdditionalInfo?.tokenUrl }));
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
        if (!!!contactId) {
            return { successful: false, message: `Contact not found for number ${contactNumber}` };
        }
        const contactInfo = {
            id: contactId,
            phoneNumber: contactNumber,
            type: incomingData.contactType ?? "",
            name: incomingData.contactName ?? ""
        };
        const { logId, returnMessage } = await platformModule.createCallLog({ user, contactInfo, authHeader, callLog, note, additionalSubmission });
        await CallLogModel.create({
            id: incomingData.logInfo.id,
            sessionId: incomingData.logInfo.sessionId,
            platform,
            thirdPartyLogId: logId,
            userId
        });
        console.log(`added call log: ${logId}`);
        return { successful: true, logId, returnMessage };
    } catch (e) {
        console.log(e);
        return { successful: false };
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
    const sessionIdsArray = sessionIds.split(',');
    if (!!requireDetails) {
        const platformModule = require(`../adapters/${platform}`);
        const authType = platformModule.getAuthType();
        let authHeader = '';
        switch (authType) {
            case 'oauth':
                const oauthApp = oauth.getOAuthApp(platformModule.getOauthInfo({ tokenUrl: user?.platformAdditionalInfo?.tokenUrl }));
                user = await oauth.checkAndRefreshAccessToken(oauthApp, user);
                authHeader = `Bearer ${user.accessToken}`;
                break;
            case 'apiKey':
                const basicAuth = platformModule.getBasicAuth({ apiKey: user.accessToken });
                authHeader = `Basic ${basicAuth}`;
                break;
        }
        for (const sessionId of sessionIdsArray) {
            const callLog = await CallLogModel.findOne({
                where: {
                    sessionId
                }
            });
            if (!!!callLog) {
                logs.push({ sessionId, matched: false });
                continue;
            }
            const getCallLogResult = await platformModule.getCallLog({ user, callLogId: callLog.thirdPartyLogId, authHeader });
            returnMessage = getCallLogResult.returnMessage;
            logs.push({ sessionId, matched: true, logId: callLog.thirdPartyLogId, logData: getCallLogResult.callLogInfo });
        }
    }
    else {
        for (const sessionId of sessionIdsArray) {
            const callLog = await CallLogModel.findOne({
                where: {
                    sessionId
                }
            });
            if (!!!callLog) {
                logs.push({ sessionId, matched: false });
                continue;
            }
            logs.push({ sessionId, matched: true, logId: callLog.thirdPartyLogId });
        }
    }
    return { successful: true, logs, returnMessage };
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
                    const oauthApp = oauth.getOAuthApp(platformModule.getOauthInfo({ tokenUrl: user?.platformAdditionalInfo?.tokenUrl }));
                    user = await oauth.checkAndRefreshAccessToken(oauthApp, user);
                    authHeader = `Bearer ${user.accessToken}`;
                    break;
                case 'apiKey':
                    const basicAuth = platformModule.getBasicAuth({ apiKey: user.accessToken });
                    authHeader = `Basic ${basicAuth}`;
                    break;
            }
            const { updatedNote, returnMessage } = await platformModule.updateCallLog({ user, existingCallLog, authHeader, recordingLink: incomingData.recordingLink, subject: incomingData.subject, note: incomingData.note });
            console.log(`updated call log: ${existingCallLog.id}`);
            return { successful: true, logId: existingCallLog.thirdPartyLogId, updatedNote, returnMessage };
        }
        return { successful: false };
    } catch (e) {
        console.log(e);
        return { successful: false };
    }
}

async function createMessageLog({ platform, userId, incomingData }) {
    try {
        let returnMessage = null;
        if (incomingData.logInfo.messages.length === 0) {
            return { successful: false, message: 'No message to log.' }
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
            return { successful: false, message: `Cannot find user with id: ${userId}` };
        }
        const authType = platformModule.getAuthType();
        let authHeader = '';
        switch (authType) {
            case 'oauth':
                const oauthApp = oauth.getOAuthApp(platformModule.getOauthInfo({ tokenUrl: user?.platformAdditionalInfo?.tokenUrl }));
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
            return { successful: false, message: `Contact not found for number ${contactNumber}` };
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
                console.log(`existing message log: ${message.id}`);
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
                await platformModule.updateMessageLog({ user, contactInfo, existingMessageLog: existingSameDateMessageLog, message, authHeader });
                crmLogId = existingSameDateMessageLog.thirdPartyLogId;
            }
            else {
                const createMessageLogResult = await platformModule.createMessageLog({ user, contactInfo, authHeader, message, additionalSubmission, recordingLink, faxDocLink });
                crmLogId = createMessageLogResult.logId;
                returnMessage = createMessageLogResult.returnMessage;
            }
            const createdMessageLog =
                await MessageLogModel.create({
                    id: message.id.toString(),
                    platform,
                    conversationId: incomingData.logInfo.conversationId,
                    thirdPartyLogId: crmLogId,
                    userId,
                    conversationLogId: incomingData.logInfo.conversationLogId
                });
            console.log(`added message log: ${createdMessageLog.id}`);
            logIds.push(createdMessageLog.id);
        }
        console.log(`logged ${logIds.length} messages.`);
        return { successful: true, logIds, returnMessage };
    }
    catch (e) {
        console.log(e);
        return { successful: false };
    }
}

exports.createCallLog = createCallLog;
exports.updateCallLog = updateCallLog;
exports.createMessageLog = createMessageLog;
exports.getCallLog = getCallLog;