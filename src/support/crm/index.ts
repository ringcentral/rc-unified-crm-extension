// @ts-check

const {
    SupportAllowlistEntryModel,
    SupportIntegrationEventModel,
    SupportIntegrationRecordModel,
} = /** @type {any} */ (require('../models'));
const vinsolutions = /** @type {any} */ (require('./vinsolutions'));

/**
 * A provider manages one CRM's integrations: the units a CRM enables for RingCentral
 * (a VinSolutions dealer, for example) across one or more of its services.
 */
const providers = {
    [vinsolutions.platform]: vinsolutions,
};

class SupportCrmError extends Error {
    status: number;

    /**
     * @param {number} status
     * @param {string} message
     */
    constructor(status, message) {
        super(message);
        this.name = 'SupportCrmError';
        this.status = status;
    }
}

/**
 * @param {string} platform
 */
function getProvider(platform) {
    const provider = Object.prototype.hasOwnProperty.call(providers, platform) ? providers[platform] : null;
    if (!provider) {
        throw new SupportCrmError(404, `Unsupported CRM platform: ${platform}`);
    }
    return provider;
}

/**
 * @param {any} provider
 * @param {string} integrationId
 */
function assertIntegrationId(provider, integrationId) {
    if (!provider.isValidIntegrationId(integrationId)) {
        throw new SupportCrmError(400, 'Invalid integration ID');
    }
}

/**
 * @param {string} platform
 * @param {string} integrationId
 */
function getRecordId(platform, integrationId) {
    return `${platform}-${integrationId}`;
}

/**
 * @param {any} entry
 */
function serializeAllowlistEntry(entry) {
    return {
        integrationId: entry.integrationId,
        note: entry.note || '',
        addedByExtensionId: entry.addedByExtensionId || '',
        addedByName: entry.addedByName || '',
        createdAt: entry.createdAt,
        updatedAt: entry.updatedAt,
    };
}

/**
 * @param {string} platform
 */
async function getAllowlistedIds(platform) {
    const entries = await SupportAllowlistEntryModel.findAll({ where: { platform }, attributes: ['integrationId'] });
    return new Set(entries.map((entry) => entry.integrationId));
}

/**
 * Keeps a running record of every integration seen as active, per service.
 *
 * @param {string} platform
 * @param {any[]} integrations
 */
async function recordSeenIntegrations(platform, integrations) {
    if (integrations.length === 0) return;
    const now = new Date().toISOString();
    const existing = await SupportIntegrationRecordModel.findAll({
        where: { platform, integrationId: integrations.map((integration) => integration.id) },
    });
    const existingById = new Map<string, any>(existing.map((record) => [record.integrationId, record]));

    await Promise.all(integrations.map(async (integration) => {
        const record = existingById.get(integration.id);
        const services = { ...(record?.services || {}) };
        for (const [service, status] of Object.entries(integration.services)) {
            if (status !== 'active') continue;
            services[service] = {
                firstSeenAt: services[service]?.firstSeenAt || now,
                lastSeenAt: now,
            };
        }
        if (record) {
            await record.update({ name: integration.name, details: integration.details, services });
        }
        else {
            await SupportIntegrationRecordModel.create({
                id: getRecordId(platform, integration.id),
                platform,
                integrationId: integration.id,
                name: integration.name,
                details: integration.details,
                services,
            });
        }
    }));
}

/**
 * @param {string} platform
 */
async function listIntegrations(platform) {
    const provider = getProvider(platform);
    const [result, allowlistedIds] = await Promise.all([
        provider.listIntegrations(),
        getAllowlistedIds(platform),
    ]);
    await recordSeenIntegrations(platform, result.integrations);
    return {
        platform,
        services: result.services,
        serviceErrors: result.serviceErrors,
        integrations: result.integrations.map((integration) => ({
            ...integration,
            allowlisted: allowlistedIds.has(integration.id),
        })),
    };
}

/**
 * @param {{ platform: string, integrationId: string, supportUser: any, confirmAllowlisted?: boolean }} params
 */
async function removeIntegration({ platform, integrationId, supportUser, confirmAllowlisted = false }) {
    const provider = getProvider(platform);
    assertIntegrationId(provider, integrationId);
    const allowlistEntry = await SupportAllowlistEntryModel.findByPk(getRecordId(platform, integrationId));
    // Allowlisted integrations can still be removed, but only with an explicit second confirmation.
    if (allowlistEntry && !confirmAllowlisted) {
        throw new SupportCrmError(409, 'Integration is on the allowlist; confirm to remove it');
    }

    const results = await provider.removeIntegration(integrationId);
    await SupportIntegrationEventModel.bulkCreate(Object.entries(results).map(([service, result]: [string, any]) => ({
        platform,
        integrationId,
        service,
        action: 'remove',
        result: result.status,
        errorMessage: result.message?.slice(0, 1000) || null,
        actorExtensionId: supportUser?.extensionId || '',
        actorName: supportUser?.name || '',
        actorEmail: supportUser?.email || '',
    })));
    return { platform, integrationId, results };
}

/**
 * @param {string} platform
 */
async function getHistory(platform) {
    getProvider(platform);
    const [records, events, allowlistedIds] = await Promise.all([
        SupportIntegrationRecordModel.findAll({ where: { platform }, order: [['createdAt', 'DESC']] }),
        SupportIntegrationEventModel.findAll({ where: { platform }, order: [['createdAt', 'DESC']] }),
        getAllowlistedIds(platform),
    ]);
    const eventsByIntegration = new Map();
    for (const event of events) {
        const list = eventsByIntegration.get(event.integrationId) || [];
        list.push({
            service: event.service,
            action: event.action,
            result: event.result,
            errorMessage: event.errorMessage || '',
            actorName: event.actorName || '',
            actorEmail: event.actorEmail || '',
            createdAt: event.createdAt,
        });
        eventsByIntegration.set(event.integrationId, list);
    }
    const recordIds = new Set(records.map((record) => record.integrationId));
    const history = records.map((record) => ({
        id: record.integrationId,
        name: record.name || '',
        details: record.details || {},
        services: record.services || {},
        firstSeenAt: record.createdAt,
        allowlisted: allowlistedIds.has(record.integrationId),
        events: eventsByIntegration.get(record.integrationId) || [],
    }));
    // Removals of integrations that were never listed (e.g. removed before they were first seen).
    for (const [integrationId, integrationEvents] of eventsByIntegration) {
        if (recordIds.has(integrationId)) continue;
        history.push({
            id: integrationId,
            name: '',
            details: {},
            services: {},
            firstSeenAt: null,
            allowlisted: allowlistedIds.has(integrationId),
            events: integrationEvents,
        });
    }
    return { platform, history };
}

/**
 * @param {string} platform
 */
async function listAllowlist(platform) {
    getProvider(platform);
    const entries = await SupportAllowlistEntryModel.findAll({ where: { platform }, order: [['createdAt', 'DESC']] });
    return { platform, entries: entries.map(serializeAllowlistEntry) };
}

/**
 * @param {{ platform: string, integrationId: string, note?: unknown, supportUser: any }} params
 */
async function upsertAllowlistEntry({ platform, integrationId, note, supportUser }) {
    const provider = getProvider(platform);
    assertIntegrationId(provider, integrationId);
    if (note !== undefined && typeof note !== 'string') {
        throw new SupportCrmError(400, 'Note must be a string');
    }
    const id = getRecordId(platform, integrationId);
    const existing = await SupportAllowlistEntryModel.findByPk(id);
    const noteValue = (note ?? existing?.note ?? '').slice(0, 1000);
    const entry = existing
        ? await existing.update({ note: noteValue })
        : await SupportAllowlistEntryModel.create({
            id,
            platform,
            integrationId,
            note: noteValue,
            addedByExtensionId: supportUser?.extensionId || '',
            addedByName: supportUser?.name || '',
        });
    return serializeAllowlistEntry(entry);
}

/**
 * @param {{ platform: string, integrationId: string }} params
 */
async function deleteAllowlistEntry({ platform, integrationId }) {
    const provider = getProvider(platform);
    assertIntegrationId(provider, integrationId);
    const deleted = await SupportAllowlistEntryModel.destroy({ where: { id: getRecordId(platform, integrationId) } });
    if (!deleted) {
        throw new SupportCrmError(404, 'Integration is not on the allowlist');
    }
}

async function syncSupportCrmModels() {
    await SupportIntegrationRecordModel.sync();
    await SupportIntegrationEventModel.sync();
    await SupportAllowlistEntryModel.sync();
}

exports.SupportCrmError = SupportCrmError;
exports.listIntegrations = listIntegrations;
exports.removeIntegration = removeIntegration;
exports.getHistory = getHistory;
exports.listAllowlist = listAllowlist;
exports.upsertAllowlistEntry = upsertAllowlistEntry;
exports.deleteAllowlistEntry = deleteAllowlistEntry;
exports.syncSupportCrmModels = syncSupportCrmModels;

export {};
