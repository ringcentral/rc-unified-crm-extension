// This mock is to run high traffic tests on the server

// @ts-check

const { UserModel: UserModelImport } = require("../models/userModel");
const { CallLogModel: CallLogModelImport } = require("../models/callLogModel");
const shortid = /** @type {any} */ (require("shortid"));
const {
    buildCallLogSessionWhere,
    findMatchingCallLog,
} = require('../lib/callLogLookup');

const UserModel = /** @type {any} */ (UserModelImport);
const CallLogModel = /** @type {any} */ (CallLogModelImport);

/** @typedef {import('../types').MockCallLogMatchResult} MockCallLogMatchResult */
/** @typedef {import('../types').MockCreateCallLogParams} MockCreateCallLogParams */
/** @typedef {import('../types').MockGetCallLogParams} MockGetCallLogParams */
/** @typedef {import('../types').PersistedCallLogIdentity} PersistedCallLogIdentity */

/**
 * @returns {Promise<unknown>}
 */
async function createUser() {
    let mockUser = await UserModel.findByPk('mockUser');
    if (!mockUser) {
        mockUser = await UserModel.create({
            id: 'mockUser'
        });
    }
    return mockUser;
}

/**
 * @returns {Promise<boolean>}
 */
async function deleteUser() {
    let mockUser = await UserModel.findByPk('mockUser');
    if (mockUser) {
        await mockUser.destroy();
        return true;
    }
    return false;
}

/**
 * @param {MockGetCallLogParams} params
 * @returns {Promise<MockCallLogMatchResult[]>}
 */
async function getCallLog({ sessionIds, extensionNumber, hashedExtensionId }) {
    const sessionIdsArray = sessionIds.split(',');
    const extensionNumberValue = extensionNumber?.toString() ?? '';
    const hashedExtensionIdValue = hashedExtensionId?.toString() ?? '';
    const callLogs = /** @type {PersistedCallLogIdentity[]} */ (await CallLogModel.findAll({
        where: buildCallLogSessionWhere({
            sessionIds: sessionIdsArray,
            extensionNumber: extensionNumberValue,
            hashedExtensionId: hashedExtensionIdValue,
        }),
        order: [['hashedExtensionId', 'ASC'], ['extensionNumber', 'ASC']]
    }));
    /** @type {MockCallLogMatchResult[]} */
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

/**
 * @param {MockCreateCallLogParams} params
 * @returns {Promise<void>}
 */
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

/**
 * @returns {Promise<void>}
 */
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

export {};
