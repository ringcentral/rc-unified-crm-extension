const Op = require('sequelize').Op;

function getCallLogExtensionNumber(incomingData) {
    return (incomingData?.extensionNumber ?? incomingData?.logInfo?.extensionNumber)?.toString() ?? '';
}

function buildCallLogSessionWhere({ sessionId, sessionIds, extensionNumber }) {
    const where = {};
    if (sessionIds) {
        where.sessionId = {
            [Op.in]: sessionIds,
        };
    }
    else {
        where.sessionId = sessionId;
    }
    const extensionNumberValue = extensionNumber?.toString() ?? '';
    if (extensionNumberValue) {
        where.extensionNumber = extensionNumberValue;
    }
    return where;
}

function findMatchingCallLog(callLogs, sessionId, extensionNumber) {
    const extensionNumberValue = extensionNumber?.toString() ?? '';
    return callLogs.find(callLog => (
        callLog.sessionId === sessionId &&
        (!extensionNumberValue || (callLog.extensionNumber?.toString() ?? '') === extensionNumberValue)
    ));
}

exports.getCallLogExtensionNumber = getCallLogExtensionNumber;
exports.buildCallLogSessionWhere = buildCallLogSessionWhere;
exports.findMatchingCallLog = findMatchingCallLog;
