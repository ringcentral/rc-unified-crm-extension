import type {
    BuildCallLogSessionWhereParams,
    CallLogLookupInput,
    PersistedCallLogIdentity
} from '../types';

const Op = require('sequelize').Op;
const { getHashValue } = require('./util') as {
    getHashValue(value: string, key: string): string;
};

function stringOrEmpty(value: unknown): string {
    return value == null ? '' : value.toString();
}

function getCallLogExtensionNumber(incomingData: CallLogLookupInput): string {
    return stringOrEmpty(incomingData?.extensionNumber ?? incomingData?.logInfo?.extensionNumber);
}

function getCallLogHashedExtensionId(incomingData: CallLogLookupInput, hashKey = process.env.HASH_KEY): string {
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

function buildLegacyIdentityWhere(extensionNumberValue: string): Record<string | symbol, unknown> {
    return {
        extensionNumber: extensionNumberValue,
        [Op.or]: [
            { hashedExtensionId: '' },
            { hashedExtensionId: null },
        ],
    };
}

function buildCallLogSessionWhere({
    sessionId,
    sessionIds,
    extensionNumber,
    hashedExtensionId
}: BuildCallLogSessionWhereParams): Record<string | symbol, unknown> {
    const where: Record<string | symbol, unknown> = {};
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
        const identityWhere: Record<string | symbol, unknown>[] = [
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

function hasEmptyHashedExtensionId(callLog: PersistedCallLogIdentity): boolean {
    return !stringOrEmpty(callLog.hashedExtensionId);
}

function findMatchingCallLog(
    callLogs: PersistedCallLogIdentity[],
    sessionId: string,
    extensionNumber: string | number | null | undefined,
    hashedExtensionId: string | number | null | undefined
): PersistedCallLogIdentity | undefined {
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

export {
    buildCallLogSessionWhere,
    findMatchingCallLog,
    getCallLogExtensionNumber,
    getCallLogHashedExtensionId
};
