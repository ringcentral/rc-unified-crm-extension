const Op = require('sequelize').Op;
const { CallLogModel } = require('../models/callLogModel');
const { MessageLogModel } = require('../models/messageLogModel');

async function addCallLog(platform, userId, incomingData) {
    const existingCallLog = await CallLogModel.findByPk(incomingData.logInfo.id);
    if (existingCallLog) {
        return { successful: false, message: `existing log for session ${incomingData.logInfo.sessionId}` }
    }
    const platformModule = require(`../platformModules/${platform}`);
    const logId = await platformModule.addCallLog(userId, incomingData.logInfo, incomingData.note);
    await CallLogModel.create({
        id: incomingData.logInfo.id,
        sessionId: incomingData.logInfo.sessionId,
        platform,
        thirdPartyLogId: logId,
        userId
    });
    console.log(`added call log: ${incomingData.logInfo.sessionId}`);
    return { successful: true, logId };
}

async function addMessageLog(platform, userId, incomingData) {
    const messageIds = incomingData.logInfo.messages.map(m => { return { id: m.id }; });
    const existingMessages = await MessageLogModel.findAll({
        where: {
            [Op.or]: messageIds
        }
    });
    const existingIds = existingMessages.map(m => m.id);
    const platformModule = require(`../platformModules/${platform}`);
    const logIds = [];
    for (const message of incomingData.logInfo.messages) {
        if (existingIds.includes(message.id)) {
            console.log(`existing message log: ${message.id}`);
            continue;
        }
        const logId = await platformModule.addMessageLog(userId, message, incomingData.logInfo.correspondents[0].phoneNumber, incomingData.note);
        await MessageLogModel.create({
            id: message.id,
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

async function getCallLog(platform, sessionId) {
    const callLog = await CallLogModel.findOne({
        where: {
            platform,
            sessionId
        }
    });
    if (callLog) {
        return { successful: true, logId: callLog.thirdPartyLogId };
    }
    else {
        return { successful: false, message: `cannot find call log for sessionId: ${sessionId}` };
    }
}

async function getMessageLogs(platform, messageId) {
    const messageLog = await MessageLogModel.findOne({
        where: {
            platform,
            id: messageId
        }
    });
    if (callLog) {
        return { successful: true, logId: callLog.thirdPartyLogId };
    }
    else {
        return { successful: false, message: `cannot find message log for messageId: ${messageId}` };
    }
}

exports.addCallLog = addCallLog;
exports.addMessageLog = addMessageLog;
exports.getCallLog = getCallLog;
exports.getMessageLogs = getMessageLogs;