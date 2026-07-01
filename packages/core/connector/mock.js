// This mock is to run high traffic tests on the server

const { UserModel } = require("../models/userModel");
const { CallLogModel } = require("../models/callLogModel");
const shortid = require("shortid");
const {
    buildCallLogSessionWhere,
    findMatchingCallLog,
} = require('../lib/callLogLookup');

async function createUser() {
    let mockUser = await UserModel.findByPk('mockUser');
    if (!mockUser) {
        mockUser = await UserModel.create({
            id: 'mockUser'
        });
    }
    return mockUser;
}

async function deleteUser() {
    let mockUser = await UserModel.findByPk('mockUser');
    if (mockUser) {
        await mockUser.destroy();
        return true;
    }
    return false;
}

async function getCallLog({ sessionIds, extensionNumber, hashedExtensionId }) {
    const sessionIdsArray = sessionIds.split(',');
    const extensionNumberValue = extensionNumber?.toString() ?? '';
    const hashedExtensionIdValue = hashedExtensionId?.toString() ?? '';
    const callLogs = await CallLogModel.findAll({
        where: buildCallLogSessionWhere({
            sessionIds: sessionIdsArray,
            extensionNumber: extensionNumberValue,
            hashedExtensionId: hashedExtensionIdValue,
        }),
        order: [['hashedExtensionId', 'ASC'], ['extensionNumber', 'ASC']]
    });
    const logs = [];
    for (const sId of sessionIdsArray) {
        const callLog = findMatchingCallLog(callLogs, sId, extensionNumberValue, hashedExtensionIdValue);
        if (!callLog) {
            logs.push({ sessionId: sId, matched: false });
        }
        else {
            logs.push({ sessionId: callLog.sessionId, matched: true, logId: 'mockThirdPartyLogId' });
        }
    }

    return logs;
}

async function createCallLog({ sessionId, extensionNumber, hashedExtensionId }) {
    const extensionNumberValue = extensionNumber?.toString() ?? '';
    const hashedExtensionIdValue = hashedExtensionId?.toString() ?? '';
    let callLog = await CallLogModel.findOne({
        where: buildCallLogSessionWhere({
            sessionId,
            extensionNumber: extensionNumberValue,
            hashedExtensionId: hashedExtensionIdValue,
        })
    });
    if (!callLog) {
        callLog = await CallLogModel.create({
            id: shortid.generate(),
            sessionId,
            extensionNumber: extensionNumberValue,
            hashedExtensionId: hashedExtensionIdValue,
            userId: 'mockUser'
        });
    }
}

async function cleanUpMockLogs() {
    await CallLogModel.destroy({
        where: {
            userId: 'mockUser'
        }
    });
}

exports.createUser = createUser;
exports.deleteUser = deleteUser;
exports.getCallLog = getCallLog;
exports.createCallLog = createCallLog;
exports.cleanUpMockLogs = cleanUpMockLogs;
