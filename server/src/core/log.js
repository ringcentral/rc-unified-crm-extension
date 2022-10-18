const Op = require('sequelize').Op;
const { CallLogModel } = require('../models/callLogModel');
const { MessageLogModel } = require('../models/messageLogModel');

async function addCallLog(platform, userId, incomingData) {
    const existingCallLog = await CallLogModel.findByPk(incomingData.id);
    if (existingCallLog) {
        return { successful: false, message: `existing log for session ${incomingData.sessionId}` }
    }
    const platformModule = require(`../platformModules/${platform}`);
    const logId = await platformModule.addCallLog(userId, incomingData);
    await CallLogModel.create({
        id: incomingData.id,
        sessionId: incomingData.sessionId,
        platform,
        thirdPartyLogId: logId,
        userId
    });
    return { successful: true, logId };
}

async function addMessageLog(platform, userId, incomingData) {
    const messageIds = incomingData.messages.map(m => { return { id: m.id }; });
    const existingMessages = await MessageLogModel.findAll({
        where: {
            [Op.or]: messageIds
        }
    });
    const existingIds = existingMessages.map(m => m.id);
    const platformModule = require(`../platformModules/${platform}`);
    for (const message of incomingData.data.messages) {
        if (existingIds.includes(message.id)) {
            continue;
        }
        const logId = await platformModule.addMessageLog(userId, incomingData);
        return logId;
    }
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
    else{
        return { successful: false, message: `cannot find call log for sessionId: ${sessionId}` };
    }
}

async function getMessageLogs() {

}

exports.addCallLog = addCallLog;
exports.addMessageLog = addMessageLog;
exports.getCallLog = getCallLog;