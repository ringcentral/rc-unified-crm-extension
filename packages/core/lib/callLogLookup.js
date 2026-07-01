const Op = require('sequelize').Op;
const { getHashValue } = require('./util');

function stringOrEmpty(value) {
    return value == null ? '' : value.toString();
}

function getCallLogExtensionNumber(incomingData) {
    return stringOrEmpty(incomingData?.extensionNumber ?? incomingData?.logInfo?.extensionNumber);
}

function getCallLogHashedExtensionId(incomingData, hashKey = process.env.HASH_KEY) {
    const hashedExtensionId = incomingData?.hashedExtensionId ?? incomingData?.logInfo?.hashedExtensionId;
    if (hashedExtensionId) {
        return hashedExtensionId.toString();
    }

    const rcExtensionId = incomingData?.rcExtensionId ?? incomingData?.logInfo?.rcExtensionId;
    if (rcExtensionId && hashKey) {
        return getHashValue(rcExtensionId.toString(), hashKey);
    }

    return '';
}

function buildLegacyIdentityWhere(extensionNumberValue) {
    return {
        extensionNumber: extensionNumberValue,
        [Op.or]: [
            { hashedExtensionId: '' },
            { hashedExtensionId: null },
        ],
    };
}

function buildCallLogSessionWhere({ sessionId, sessionIds, extensionNumber, hashedExtensionId }) {
    const where = {};
    if (sessionIds) {
        where.sessionId = {
            [Op.in]: sessionIds,
        };
    }
    else {
        where.sessionId = sessionId;
    }

    const extensionNumberValue = stringOrEmpty(extensionNumber);
    const hashedExtensionIdValue = stringOrEmpty(hashedExtensionId);

    if (hashedExtensionIdValue) {
        const identityWhere = [
            { hashedExtensionId: hashedExtensionIdValue },
        ];
        if (extensionNumberValue) {
            identityWhere.push(buildLegacyIdentityWhere(extensionNumberValue));
        }
        identityWhere.push(buildLegacyIdentityWhere(''));
        where[Op.or] = identityWhere;
    }
    else if (extensionNumberValue) {
        where.extensionNumber = extensionNumberValue;
    }
    return where;
}

function hasEmptyHashedExtensionId(callLog) {
    return !stringOrEmpty(callLog.hashedExtensionId);
}

function findMatchingCallLog(callLogs, sessionId, extensionNumber, hashedExtensionId) {
    const extensionNumberValue = stringOrEmpty(extensionNumber);
    const hashedExtensionIdValue = stringOrEmpty(hashedExtensionId);
    const sessionLogs = callLogs.filter(callLog => callLog.sessionId === sessionId);

    if (hashedExtensionIdValue) {
        const exactHashedLog = sessionLogs.find(callLog => (
            stringOrEmpty(callLog.hashedExtensionId) === hashedExtensionIdValue
        ));
        if (exactHashedLog) {
            return exactHashedLog;
        }

        if (extensionNumberValue) {
            const legacyExtensionLog = sessionLogs.find(callLog => (
                hasEmptyHashedExtensionId(callLog) &&
                stringOrEmpty(callLog.extensionNumber) === extensionNumberValue
            ));
            if (legacyExtensionLog) {
                return legacyExtensionLog;
            }
        }

        return sessionLogs.find(callLog => (
            hasEmptyHashedExtensionId(callLog) &&
            !stringOrEmpty(callLog.extensionNumber)
        ));
    }

    return sessionLogs.find(callLog => (
        !extensionNumberValue || stringOrEmpty(callLog.extensionNumber) === extensionNumberValue
    ));
}

exports.getCallLogExtensionNumber = getCallLogExtensionNumber;
exports.getCallLogHashedExtensionId = getCallLogHashedExtensionId;
exports.buildCallLogSessionWhere = buildCallLogSessionWhere;
exports.findMatchingCallLog = findMatchingCallLog;
