// This mock is to run high traffic tests on the server

const { UserModel } = require("../models/userModel");
const { CallLogModel } = require("../models/callLogModel");
const shortid = require("shortid");
const Op = require('sequelize').Op;

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

async function getCallLog({ sessionIds }) {
    const sessionIdsArray = sessionIds.split(',');
    const callLogs = await CallLogModel.findAll({
        where: {
            sessionId: {
                [Op.in]: sessionIdsArray
            }
        }
    });
    const logs = [];
    for (const sId of sessionIdsArray) {
        const callLog = callLogs.find(c => c.sessionId === sId);
        if (!callLog) {
            logs.push({ sessionId: sId, matched: false });
        }
        else {
            logs.push({ sessionId: callLog.sessionId, matched: true, logId: 'mockThirdPartyLogId' });
        }
    }

    return logs;
}

async function createCallLog({ sessionId }) {
    let callLog = await CallLogModel.findOne({
        where: {
            sessionId
        }
    });
    if (!callLog) {
        callLog = await CallLogModel.create({
            id: shortid.generate(),
            sessionId,
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