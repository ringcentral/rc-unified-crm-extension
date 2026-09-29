// @ts-check

const { Op } = /** @type {any} */ (require('sequelize'));
const { AccountDataModel } = /** @type {any} */ (require('@app-connect/core/models/accountDataModel'));
const vinsolutions = /** @type {any} */ (require('./vinsolutions'));

/**
 * A provider manages one CRM's integrations: the units a CRM enables for RingCentral
 * (a VinSolutions dealer, for example) across one or more of its services.
 */
const providers = {
    [vinsolutions.platform]: vinsolutions,
};

// Support console records share AccountDataModel with customer account data. This
// rcAccountId is not a real RingCentral account, so the rows never mix with a customer's.
// The dataKeys must not start with "contact-": cacheCleanup purges those.
const SUPPORT_ACCOUNT_ID = 'support';
const ALLOWLIST_KEY_PREFIX = 'support-allowlist:';
const HISTORY_KEY_PREFIX = 'support-history:';
const MAX_EVENTS_PER_INTEGRATION = 100;

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
 * @param {string} dataKey
 */
function findRow(platform, dataKey) {
    return AccountDataModel.findOne({ where: { rcAccountId: SUPPORT_ACCOUNT_ID, platformName: platform, dataKey } });
}

/**
 * @param {string} platform
 * @param {string} prefix
 */
function findRows(platform, prefix) {
    return AccountDataModel.findAll({
        where: { rcAccountId: SUPPORT_ACCOUNT_ID, platformName: platform, dataKey: { [Op.like]: `${prefix}%` } },
    });
}

/**
 * @param {string} platform
 * @param {string} dataKey
 * @param {any} row
 * @param {any} data
 */
function saveRow(platform, dataKey, row, data) {
    return row
        ? row.update({ data })
        : AccountDataModel.create({ rcAccountId: SUPPORT_ACCOUNT_ID, platformName: platform, dataKey, data });
}

/**
 * @param {any} row
 * @param {string} prefix
 */
function integrationIdOf(row, prefix) {
    return row.dataKey.slice(prefix.length);
}

/**
 * @param {any} row
 */
function serializeAllowlistEntry(row) {
    return {
        integrationId: integrationIdOf(row, ALLOWLIST_KEY_PREFIX),
        note: row.data?.note || '',
        addedByExtensionId: row.data?.addedByExtensionId || '',
        addedByName: row.data?.addedByName || '',
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
    };
}

/**
 * @param {string} platform
 */
async function getAllowlistedIds(platform) {
    const rows = await findRows(platform, ALLOWLIST_KEY_PREFIX);
    return new Set(rows.map((row) => integrationIdOf(row, ALLOWLIST_KEY_PREFIX)));
}

/**
 * Keeps a running record of every integration seen as active, per service.
 * One row per integration, so staff working on different dealers never overwrite each other.
 *
 * @param {string} platform
 * @param {any[]} integrations
 */
async function recordSeenIntegrations(platform, integrations) {
    if (integrations.length === 0) return;
    const now = new Date().toISOString();
    const rows = await AccountDataModel.findAll({
        where: {
            rcAccountId: SUPPORT_ACCOUNT_ID,
            platformName: platform,
            dataKey: integrations.map((integration) => `${HISTORY_KEY_PREFIX}${integration.id}`),
        },
    });
    const rowsByKey = new Map<string, any>(rows.map((row) => [row.dataKey, row]));

    await Promise.all(integrations.map(async (integration) => {
        const dataKey = `${HISTORY_KEY_PREFIX}${integration.id}`;
        const row = rowsByKey.get(dataKey);
        const previous = row?.data || {};
        const services = { ...(previous.services || {}) };
        for (const [service, status] of Object.entries(integration.services)) {
            if (status !== 'active') continue;
            services[service] = {
                firstSeenAt: services[service]?.firstSeenAt || now,
                lastSeenAt: now,
            };
        }
        await saveRow(platform, dataKey, row, {
            ...previous,
            name: integration.name,
            details: integration.details,
            firstSeenAt: previous.firstSeenAt || now,
            services,
            events: previous.events || [],
        });
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
    const allowlistRow = await findRow(platform, `${ALLOWLIST_KEY_PREFIX}${integrationId}`);
    // Allowlisted integrations can still be removed, but only with an explicit second confirmation.
    if (allowlistRow && !confirmAllowlisted) {
        throw new SupportCrmError(409, 'Integration is on the allowlist; confirm to remove it');
    }

    const results = await provider.removeIntegration(integrationId);
    const createdAt = new Date().toISOString();
    const events = Object.entries(results).map(([service, result]: [string, any]) => ({
        service,
        action: 'remove',
        result: result.status,
        errorMessage: result.message?.slice(0, 1000) || '',
        actorExtensionId: supportUser?.extensionId || '',
        actorName: supportUser?.name || '',
        actorEmail: supportUser?.email || '',
        createdAt,
    }));

    const dataKey = `${HISTORY_KEY_PREFIX}${integrationId}`;
    const row = await findRow(platform, dataKey);
    const previous = row?.data || {};
    await saveRow(platform, dataKey, row, {
        ...previous,
        // Newest first, capped so one row's JSON cannot grow without bound.
        events: [...events, ...(previous.events || [])].slice(0, MAX_EVENTS_PER_INTEGRATION),
    });
    return { platform, integrationId, results };
}

/**
 * @param {string} platform
 */
async function getHistory(platform) {
    getProvider(platform);
    const [rows, allowlistedIds] = await Promise.all([
        findRows(platform, HISTORY_KEY_PREFIX),
        getAllowlistedIds(platform),
    ]);
    const history = rows.map((row) => {
        const id = integrationIdOf(row, HISTORY_KEY_PREFIX);
        const data = row.data || {};
        return {
            id,
            name: data.name || '',
            details: data.details || {},
            services: data.services || {},
            // Null for integrations only ever removed, never seen in a listing.
            firstSeenAt: data.firstSeenAt || null,
            allowlisted: allowlistedIds.has(id),
            events: (data.events || []).map(({ actorExtensionId, ...event }) => event),
        };
    });
    // Most recently first seen first; integrations never listed go last.
    history.sort((a, b) => (b.firstSeenAt || '').localeCompare(a.firstSeenAt || ''));
    return { platform, history };
}

/**
 * @param {string} platform
 */
async function listAllowlist(platform) {
    getProvider(platform);
    const rows = await findRows(platform, ALLOWLIST_KEY_PREFIX);
    const entries = rows
        .map(serializeAllowlistEntry)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return { platform, entries };
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
    const dataKey = `${ALLOWLIST_KEY_PREFIX}${integrationId}`;
    const row = await findRow(platform, dataKey);
    const previous = row?.data;
    const saved = await saveRow(platform, dataKey, row, {
        note: (note ?? previous?.note ?? '').slice(0, 1000),
        addedByExtensionId: previous ? previous.addedByExtensionId || '' : supportUser?.extensionId || '',
        addedByName: previous ? previous.addedByName || '' : supportUser?.name || '',
    });
    return serializeAllowlistEntry(saved);
}

/**
 * @param {{ platform: string, integrationId: string }} params
 */
async function deleteAllowlistEntry({ platform, integrationId }) {
    const provider = getProvider(platform);
    assertIntegrationId(provider, integrationId);
    const deleted = await AccountDataModel.destroy({
        where: { rcAccountId: SUPPORT_ACCOUNT_ID, platformName: platform, dataKey: `${ALLOWLIST_KEY_PREFIX}${integrationId}` },
    });
    if (!deleted) {
        throw new SupportCrmError(404, 'Integration is not on the allowlist');
    }
}

exports.SUPPORT_ACCOUNT_ID = SUPPORT_ACCOUNT_ID;
exports.SupportCrmError = SupportCrmError;
exports.listIntegrations = listIntegrations;
exports.removeIntegration = removeIntegration;
exports.getHistory = getHistory;
exports.listAllowlist = listAllowlist;
exports.upsertAllowlistEntry = upsertAllowlistEntry;
exports.deleteAllowlistEntry = deleteAllowlistEntry;

export {};
