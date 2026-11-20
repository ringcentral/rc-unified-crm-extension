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

function isAgentIdsRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

/**
 * RingCX agent IDs stored on any mapping, keyed by RC extension ID. Agent IDs belong to the RC
 * extension, so they follow it when the extension moves to another CRM user.
 */
function getStoredRcxAgentIdsByExtensionId(userMappings: AdminUserMapping[] | null | undefined): Record<string, string[]> {
    const agentIdsByExtensionId: Record<string, string[]> = {};
    if (!Array.isArray(userMappings)) {
        return agentIdsByExtensionId;
    }
    for (const mapping of userMappings) {
        if (!mapping || !isAgentIdsRecord(mapping.rcxAgentIds)) {
            continue;
        }
        for (const [extensionId, agentIds] of Object.entries(mapping.rcxAgentIds)) {
            const key = toIdString(extensionId);
            const merged = normalizeAgentIds([...(agentIdsByExtensionId[key] ?? []), ...normalizeAgentIds(agentIds)]);
            if (key && merged.length > 0) {
                agentIdsByExtensionId[key] = merged;
            }
        }
    }
    return agentIdsByExtensionId;
}

/**
 * Resolves the RingCX agent IDs of user mappings about to be saved against the stored ones.
 * Writers that do not know about RingCX (older extension and admin console builds) send mappings
 * without `rcxAgentIds`, so for each extension still mapped:
 * - an `rcxAgentIds` entry for the extension is authoritative; an empty array clears its agent IDs;
 * - `rcxAgentIds: null` clears the agent IDs of every extension on the mapping;
 * - otherwise the agent IDs already stored for the extension are kept.
 * Agent IDs of extensions that are no longer mapped are dropped, and `rcxAgentIds` is omitted
 * when no mapped extension has an agent.
 */
function mergeRcxAgentIds(
    nextUserMappings: AdminUserMapping[],
    storedUserMappings: AdminUserMapping[] | null | undefined,
): AdminUserMapping[] {
    const storedAgentIds = getStoredRcxAgentIdsByExtensionId(storedUserMappings);
    return nextUserMappings.map((mapping) => {
        if (!mapping || typeof mapping !== 'object' || Array.isArray(mapping)) {
            return mapping;
        }
        const { rcxAgentIds: incoming, ...rest } = mapping;
        const clearAll = incoming === null;
        const explicit = isAgentIdsRecord(incoming) ? incoming : {};
        const rcxAgentIds: Record<string, string[]> = {};
        for (const extensionId of getMappingRcExtensionIds(mapping)) {
            let agentIds: string[] = [];
            if (Object.prototype.hasOwnProperty.call(explicit, extensionId)) {
                agentIds = normalizeAgentIds(explicit[extensionId]);
            }
            else if (!clearAll) {
                agentIds = storedAgentIds[extensionId] ?? [];
            }
            if (agentIds.length > 0) {
                rcxAgentIds[extensionId] = agentIds;
            }
        }
        return Object.keys(rcxAgentIds).length > 0 ? { ...rest, rcxAgentIds } : rest;
    });
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
    getStoredRcxAgentIdsByExtensionId,
    mergeRcxAgentIds,
    normalizeAgentIds,
};
