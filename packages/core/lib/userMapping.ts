import type { AdminUserMapping } from '../types/admin';

type IdInput = string | number | null | undefined;

function toIdString(value: IdInput): string {
    return value === undefined || value === null ? '' : String(value).trim();
}

// TEMP: older mappings store rcExtensionId as a single string instead of an array.
function getMappingRcExtensionIds(mapping: AdminUserMapping): string[] {
    const { rcExtensionId } = mapping;
    const values = Array.isArray(rcExtensionId) ? rcExtensionId : [rcExtensionId];
    return values.map(toIdString).filter(Boolean);
}

// RingCX agent IDs are stored per RC extension: { [rcExtensionId]: agentId[] }.
function getMappingRcxAgentIds(mapping: AdminUserMapping): string[] {
    const agentIdsByExtension = mapping.rcxAgentIds;
    if (!agentIdsByExtension || typeof agentIdsByExtension !== 'object' || Array.isArray(agentIdsByExtension)) {
        return [];
    }
    return Object.values(agentIdsByExtension)
        .flatMap(agentIds => (Array.isArray(agentIds) ? agentIds : []))
        .map(toIdString)
        .filter(Boolean);
}

function normalizeAgentIds(agentIds: unknown): string[] {
    if (!Array.isArray(agentIds)) {
        return [];
    }
    return Array.from(new Set(agentIds.map(toIdString).filter(Boolean)));
}

/**
 * Finds the CRM user mapped to an RC extension, falling back to the RingCX agent ID when the
 * extension is unknown (for example, a RingCX call event names only the agent).
 */
function findMappedCrmUserId({
    userMappings,
    rcExtensionId,
    rcxAgentId,
}: {
    userMappings?: AdminUserMapping[] | null;
    rcExtensionId?: IdInput;
    rcxAgentId?: IdInput;
}): string | number | undefined {
    if (!Array.isArray(userMappings)) {
        return undefined;
    }
    const extensionId = toIdString(rcExtensionId);
    if (extensionId) {
        const mapping = userMappings.find(m => m && getMappingRcExtensionIds(m).includes(extensionId));
        if (mapping) {
            return mapping.crmUserId;
        }
    }
    const agentId = toIdString(rcxAgentId);
    if (agentId) {
        const mapping = userMappings.find(m => m && getMappingRcxAgentIds(m).includes(agentId));
        if (mapping) {
            return mapping.crmUserId;
        }
    }
    return undefined;
}

/**
 * Finds the CRM user for an admin-assigned log from `additionalSubmission`
 * (`adminAssignedUserRcId`, then `adminAssignedUserRcxAgentId`).
 */
function findMappedCrmUserIdBySubmission(
    userMappings: AdminUserMapping[] | null | undefined,
    additionalSubmission: { adminAssignedUserRcId?: IdInput; adminAssignedUserRcxAgentId?: IdInput } | null | undefined,
): string | number | undefined {
    return findMappedCrmUserId({
        userMappings,
        rcExtensionId: additionalSubmission?.adminAssignedUserRcId,
        rcxAgentId: additionalSubmission?.adminAssignedUserRcxAgentId,
    });
}

export {
    findMappedCrmUserId,
    findMappedCrmUserIdBySubmission,
    getMappingRcExtensionIds,
    getMappingRcxAgentIds,
    normalizeAgentIds,
};
