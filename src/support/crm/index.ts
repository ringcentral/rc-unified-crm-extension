// @ts-check

const crypto = require('crypto');
const { Op } = /** @type {any} */ (require('sequelize'));
const logger = /** @type {any} */ (require('@app-connect/core/lib/logger'));
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
// One row per audit event, so concurrent requests never overwrite each other's records.
const EVENT_KEY_PREFIX = 'support-event:';

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
 * Audit events live in their own rows and are never touched here.
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
        const previous = rowsByKey.get(dataKey)?.data || {};
        const services = { ...(previous.services || {}) };
        for (const [service, status] of Object.entries(integration.services)) {
            if (status !== 'active') continue;
            services[service] = {
                firstSeenAt: services[service]?.firstSeenAt || now,
                lastSeenAt: now,
            };
        }
        // upsert, not create: two listings may both see a new integration at once.
        await AccountDataModel.upsert({
            rcAccountId: SUPPORT_ACCOUNT_ID,
            platformName: platform,
            dataKey,
            data: {
                name: integration.name,
                details: integration.details,
                firstSeenAt: previous.firstSeenAt || now,
                services,
            },
        });
    }));
}

/**
 * @param {string} platform
 * @param {string} integrationId
 * @param {any} event
 * @param {number} [order] position within one action, so events from one request keep their order
 */
function createEventRow(platform, integrationId, event, order = 0) {
    const dataKey = `${EVENT_KEY_PREFIX}${integrationId}:${event.createdAt}-${order}-${crypto.randomBytes(4).toString('hex')}`;
    return AccountDataModel.create({
        rcAccountId: SUPPORT_ACCOUNT_ID,
        platformName: platform,
        dataKey,
        data: { ...event, order },
    });
}

/**
 * @param {any} supportUser
 */
function actorFields(supportUser) {
    return {
        actorExtensionId: supportUser?.extensionId || '',
        actorName: supportUser?.name || '',
        actorEmail: supportUser?.email || '',
    };
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
 * Staff choose which of the CRM's services to remove the integration from.
 *
 * @param {any} provider
 * @param {unknown} services
 * @returns {string[]}
 */
function resolveServices(provider, services) {
    if (
        !Array.isArray(services)
        || services.length === 0
        || services.some((service) => !provider.services.includes(service))
    ) {
        throw new SupportCrmError(400, `services must be a non-empty list of: ${provider.services.join(', ')}`);
    }
    return [...new Set(services)];
}

/**
 * @param {{ platform: string, integrationId: string, services: unknown, supportUser: any, confirmAllowlisted?: boolean }} params
 */
async function removeIntegration({ platform, integrationId, services, supportUser, confirmAllowlisted = false }) {
    const provider = getProvider(platform);
    assertIntegrationId(provider, integrationId);
    const selectedServices = resolveServices(provider, services);
    const allowlistRow = await findRow(platform, `${ALLOWLIST_KEY_PREFIX}${integrationId}`);
    // Allowlisted integrations can still be removed, but only with an explicit second confirmation.
    if (allowlistRow && !confirmAllowlisted) {
        throw new SupportCrmError(409, 'Integration is on the allowlist; confirm to remove it');
    }

    // Record the attempt before calling the CRM: if this write fails nothing has been removed,
    // and if the CRM call succeeds there is already a row saying who asked for it.
    const createdAt = new Date().toISOString();
    const attemptResults = await Promise.allSettled(selectedServices.map((service, order) => createEventRow(platform, integrationId, {
        service,
        action: 'remove',
        result: 'attempted',
        errorMessage: '',
        ...actorFields(supportUser),
        createdAt,
    }, order)));
    const rejected: any = attemptResults.find((result) => result.status === 'rejected');
    if (rejected) {
        // Nothing is removed, so close out the attempts that did get written.
        await Promise.allSettled(attemptResults.map((result: any) => result.status === 'fulfilled'
            && result.value.update({
                data: { ...result.value.data, result: 'failed', errorMessage: 'Removal was not attempted' },
            })));
        throw rejected.reason;
    }
    const attempts = attemptResults.map((result: any) => result.value);

    const results = await provider.removeIntegration(integrationId, selectedServices);

    await Promise.all(attempts.map(async (attempt, index) => {
        const result: any = results[selectedServices[index]];
        try {
            await attempt.update({
                data: { ...attempt.data, result: result.status, errorMessage: result.message?.slice(0, 1000) || '' },
            });
        }
        catch (e) {
            // The removal already happened; report it instead of failing the request.
            logger.error('Error recording Support console removal result', {
                platform,
                integrationId,
                service: selectedServices[index],
                message: /** @type {any} */ (e)?.message,
            });
        }
    }));
    return { platform, integrationId, results };
}

/**
 * @param {any} row
 */
function serializeEvent(row) {
    const { actorExtensionId, order, ...event } = row.data || {};
    // A row still "attempted" means the CRM call's outcome was never recorded.
    return event.result === 'attempted'
        ? { ...event, result: 'failed', errorMessage: 'Outcome was not recorded' }
        : event;
}

/**
 * Newest first; events from the same request keep the order they were made in.
 *
 * @param {any[]} rows
 */
function sortEventRows(rows) {
    return [...rows].sort((a, b) => (
        (b.data?.createdAt || '').localeCompare(a.data?.createdAt || '')
        || (a.data?.order || 0) - (b.data?.order || 0)
    ));
}

/**
 * @param {string} platform
 */
async function getHistory(platform) {
    getProvider(platform);
    const [historyRows, eventRows, allowlistedIds] = await Promise.all([
        findRows(platform, HISTORY_KEY_PREFIX),
        findRows(platform, EVENT_KEY_PREFIX),
        getAllowlistedIds(platform),
    ]);

    const entries = new Map<string, any>();
    const entryFor = (id) => {
        if (!entries.has(id)) {
            // Null firstSeenAt: integrations only ever acted on, never seen in a listing.
            entries.set(id, {
                id, name: '', details: {}, services: {}, firstSeenAt: null,
                allowlisted: allowlistedIds.has(id), events: [], allowlistEvents: [],
            });
        }
        return entries.get(id);
    };
    for (const row of historyRows) {
        const data = row.data || {};
        Object.assign(entryFor(integrationIdOf(row, HISTORY_KEY_PREFIX)), {
            name: data.name || '',
            details: data.details || {},
            services: data.services || {},
            firstSeenAt: data.firstSeenAt || null,
        });
    }
    for (const row of sortEventRows(eventRows)) {
        const integrationId = integrationIdOf(row, EVENT_KEY_PREFIX).split(':')[0];
        const entry = entryFor(integrationId);
        (row.data?.action === 'remove' ? entry.events : entry.allowlistEvents).push(serializeEvent(row));
    }

    // Most recently first seen first; integrations never listed go last.
    const history = [...entries.values()].sort((a, b) => (b.firstSeenAt || '').localeCompare(a.firstSeenAt || ''));
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
    const nextNote = (note ?? previous?.note ?? '').slice(0, 1000);
    // Audit first: the allowlist protects integrations from removal, so changes must leave a trail.
    await createEventRow(platform, integrationId, {
        service: '',
        action: row ? 'allowlist-update' : 'allowlist-add',
        result: 'done',
        errorMessage: '',
        note: nextNote,
        ...actorFields(supportUser),
        createdAt: new Date().toISOString(),
    });
    const saved = await saveRow(platform, dataKey, row, {
        note: nextNote,
        addedByExtensionId: previous ? previous.addedByExtensionId || '' : supportUser?.extensionId || '',
        addedByName: previous ? previous.addedByName || '' : supportUser?.name || '',
    });
    return serializeAllowlistEntry(saved);
}

/**
 * @param {{ platform: string, integrationId: string, supportUser: any }} params
 */
async function deleteAllowlistEntry({ platform, integrationId, supportUser }) {
    const provider = getProvider(platform);
    assertIntegrationId(provider, integrationId);
    const dataKey = `${ALLOWLIST_KEY_PREFIX}${integrationId}`;
    const row = await findRow(platform, dataKey);
    if (!row) {
        throw new SupportCrmError(404, 'Integration is not on the allowlist');
    }
    await createEventRow(platform, integrationId, {
        service: '',
        action: 'allowlist-remove',
        result: 'done',
        errorMessage: '',
        note: row.data?.note || '',
        ...actorFields(supportUser),
        createdAt: new Date().toISOString(),
    });
    await row.destroy();
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
