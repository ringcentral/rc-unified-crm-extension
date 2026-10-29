// @ts-check

const { CacheModel } = require('../models/cacheModel');
const { Op } = require('sequelize');
const axios = /** @type {any} */ (require('axios'));
const { AccountDataModel: AccountDataModelImport } = require('../models/accountDataModel');
const AccountDataModel = /** @type {any} */ (AccountDataModelImport);
const logger = require('../lib/logger');
const userCore = /** @type {any} */ (require('./user'));

/** @typedef {import('../types').InstalledPlugin} InstalledPlugin */
/** @typedef {import('../types').JsonObject} JsonObject */
/** @typedef {import('../types').PluginAccess} PluginAccess */
/** @typedef {import('../types').PluginLicenseStatus} PluginLicenseStatus */
/** @typedef {import('../types').ResolvePluginManifestResult} ResolvePluginManifestResult */
/** @typedef {import('../types').RegisterPluginAccountResult} RegisterPluginAccountResult */
/** @typedef {import('../types').UserSettings} UserSettings */

const PUBLIC_MANIFEST_BASE = 'https://appconnect.labs.ringcentral.com/public-api/connectors';

const MANIFEST_REFRESH_TTL_MS = 10 * 60 * 1000;
const MANIFEST_REFRESH_FAILURE_TTL_MS = 60 * 1000;

/** @type {Map<string, { expiresAt: number, promise: Promise<ResolvePluginManifestResult | null> }>} */
const manifestRefreshCache = new Map();

function clearPluginManifestRefreshCache() {
    manifestRefreshCache.clear();
}

/**
 * Resolve the published manifest at most once per TTL per plugin. Failures resolve to null
 * so a manifest outage never breaks activity logging.
 *
 * @param {{ pluginId: string, pluginAccess?: PluginAccess, ownerRcAccountId?: string | number, pluginName?: string }} params
 * @returns {Promise<ResolvePluginManifestResult | null>}
 */
function resolvePluginManifestCached({ pluginId, pluginAccess, ownerRcAccountId, pluginName }) {
    const key = [pluginId, pluginAccess, ownerRcAccountId, pluginName].join('|');
    const cached = manifestRefreshCache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
        return cached.promise;
    }
    const entry = {
        expiresAt: Date.now() + MANIFEST_REFRESH_TTL_MS,
        promise: resolvePluginManifest({ pluginId, pluginAccess, ownerRcAccountId, pluginName }).catch(error => {
            logger.warn('Failed to resolve plugin manifest for refresh', { pluginId, message: error?.message });
            entry.expiresAt = Date.now() + MANIFEST_REFRESH_FAILURE_TTL_MS;
            return null;
        }),
    };
    manifestRefreshCache.set(key, entry);
    return entry.promise;
}

/**
 * @param {string | undefined} url
 * @returns {string | null}
 */
function getUrlOrigin(url) {
    try {
        return url ? new URL(url).origin : null;
    } catch (error) {
        return null;
    }
}

/**
 * Bring an account's stored plugin snapshot up to the published manifest version.
 * Keeps the existing plugin JWT. Any failure leaves the stored snapshot untouched.
 *
 * @param {{ rcAccountId: string | number, pluginId: string, data: any }} params
 * @returns {Promise<any>} the snapshot to use for this invocation
 */
async function refreshPluginSnapshotIfStale({ rcAccountId, pluginId, data }) {
    try {
        const registration = data?.registration || {};
        const resolved = await resolvePluginManifestCached({
            pluginId,
            pluginAccess: registration.pluginAccess,
            ownerRcAccountId: registration.ownerRcAccountId,
            pluginName: registration.pluginName,
        });
        const latestVersion = resolved?.pluginData?.version;
        if (!resolved || typeof latestVersion !== 'string' || latestVersion === data?.version) {
            return data;
        }
        const latestManifest = resolved.pluginManifest;
        if (!latestManifest?.endpointUrl) {
            return data;
        }
        const previousRegisterOrigin = getUrlOrigin(data?.userRegisterEndpointUrl);
        const latestRegisterOrigin = getUrlOrigin(latestManifest.userRegisterEndpointUrl);
        if (previousRegisterOrigin && latestRegisterOrigin && previousRegisterOrigin !== latestRegisterOrigin) {
            // The stored JWT was issued by a different plugin server; the admin must reinstall.
            logger.warn('Plugin registration host changed; reinstall required to upgrade', {
                pluginId,
                installedVersion: data?.version,
                latestVersion,
            });
            return data;
        }
        const jwtToken = data?.jwtToken;
        const refreshedData = {
            ...latestManifest,
            version: latestVersion,
            registration: {
                ...registration,
                pluginName: resolved.platformKey,
            },
        };
        await persistPluginData({
            rcAccountId: rcAccountId.toString(),
            pluginId,
            jwtToken,
            pluginData: refreshedData,
        });
        return { jwtToken, ...refreshedData };
    } catch (error) {
        logger.warn('Failed to refresh plugin snapshot', { pluginId, message: error?.message });
        return data;
    }
}

/**
 * @param {{ rcAccountId: string | number }} params
 * @returns {Promise<InstalledPlugin[]>}
 */
async function getPluginsFromRcAccountId({ rcAccountId }) {
    const accountData = await AccountDataModel.findAll({
        where: {
            rcAccountId,
            dataKey: 'pluginData',
        },
    });
    const workingPlugins = await Promise.all(accountData.map(async data => ({
        id: data.platformName,
        data: await refreshPluginSnapshotIfStale({
            rcAccountId,
            pluginId: data.platformName,
            data: data.data,
        }),
    })));
    return workingPlugins;
}

/**
 * @param {{ userSettings?: UserSettings | null, pluginId: string }} params
 * @returns {JsonObject | null}
 */
function getPluginConfigFromUserSettings({ userSettings, pluginId }) {
    if (!userSettings) {
        return null;
    }
    const targetPluginSettings = userSettings[`plugin_${pluginId}`];
    const targetPluginSettingsValue = /** @type {{ config?: JsonObject } | undefined} */ (targetPluginSettings?.value);
    if (!targetPluginSettingsValue?.config) {
        return null;
    }
    return targetPluginSettingsValue.config;
}

/**
 * Resolve the effective plugin config for a user, including current admin overrides.
 *
 * @param {{ user: { rcAccountId?: string | number, userSettings?: UserSettings } | null, pluginId: string }} params
 * @returns {Promise<JsonObject | null>}
 */
async function getPluginConfigForUser({ user, pluginId }) {
    if (!user) {
        return null;
    }
    const userSettings = await userCore.getUserSettings({
        user,
        rcAccountId: user.rcAccountId,
    });
    return getPluginConfigFromUserSettings({ userSettings, pluginId });
}

/**
 * @param {{ rcAccountId: string | number, pluginId: string }} params
 * @returns {Promise<PluginLicenseStatus | null>}
 */
async function getPluginLicenseStatus({ rcAccountId, pluginId }) {
    const accountData = await AccountDataModel.findOne({
        where: {
            rcAccountId,
            platformName: pluginId,
            dataKey: 'pluginData',
        },
    });
    if (!accountData) {
        return null;
    }
    const licenseStatusUrl = accountData.data.licenseStatusUrl;
    const licenseStatusResponse = await axios.get(licenseStatusUrl, {
        headers: {
            'Authorization': `Bearer ${accountData.data.jwtToken}`
        }
    });
    const licenseStatus = licenseStatusResponse.data;
    if (!licenseStatus || !Object.prototype.hasOwnProperty.call(licenseStatus, 'licenseStatus')) {
        return {
            licenseStatus: false,
            licenseStatusDescription: 'Plugin license status unavailable'
        };
    }
    return licenseStatus;
}

/**
 * @param {{ headers?: Record<string, string> | null }} params
 * @returns {string | null}
 */
function getRefreshedJwtTokenFromHeaders({ headers }) {
    if (!headers) {
        return null;
    }
    return headers['x-refreshed-jwt-token'] || headers['X-Refreshed-Jwt-Token'] || null;
}

/**
 * @param {{ pluginId: string, pluginAccess?: PluginAccess, ownerRcAccountId?: string | number, pluginName?: string }} params
 * @returns {Promise<ResolvePluginManifestResult>}
 */
async function resolvePluginManifest({ pluginId, pluginAccess, ownerRcAccountId, pluginName }) {
    const manifestFetchers = [];
    if (pluginAccess === 'public') {
        manifestFetchers.push(`${PUBLIC_MANIFEST_BASE}/${pluginId}/manifest?type=plugin`);
    } else if (pluginAccess === 'private' || pluginAccess === 'shared') {
        manifestFetchers.push(`${PUBLIC_MANIFEST_BASE}/${pluginId}/manifest?access=internal&type=plugin&accountId=${ownerRcAccountId}`);
    } else {
        manifestFetchers.push(`${PUBLIC_MANIFEST_BASE}/${pluginId}/manifest?type=plugin`);
        manifestFetchers.push(`${PUBLIC_MANIFEST_BASE}/${pluginId}/manifest?access=internal&type=plugin&accountId=${ownerRcAccountId}`);
    }

    let pluginData = null;
    let lastError = null;
    for (const url of manifestFetchers) {
        try {
            const pluginDataResponse = await axios.get(url);
            pluginData = pluginDataResponse.data;
            break;
        } catch (error) {
            lastError = error;
        }
    }

    if (!pluginData) {
        throw lastError || new Error(`Unable to resolve manifest for plugin ${pluginId}`);
    }

    const platformKey = pluginName || Object.keys(pluginData.platforms || {})[0];
    if (!platformKey || !pluginData.platforms?.[platformKey]) {
        throw new Error(`Unable to resolve platform manifest for plugin ${pluginId}`);
    }

    return {
        pluginData,
        pluginManifest: pluginData.platforms[platformKey],
        platformKey,
    };
}

/**
 * @param {{ rcAccountId: string | number, pluginId: string, jwtToken: string, pluginData?: JsonObject }} params
 * @returns {Promise<void>}
 */
async function persistPluginData({ rcAccountId, pluginId, jwtToken, pluginData = {} }) {
    try {
        const accountData = await AccountDataModel.findOne({
            where: {
                rcAccountId,
                platformName: pluginId
            },
        });
        if (!accountData) {
            await AccountDataModel.create({
                rcAccountId,
                platformName: pluginId,
                dataKey: 'pluginData',
                data: {
                    jwtToken,
                    ...pluginData,
                },
            });
        } else {
            await accountData.update({
                data: {
                    jwtToken,
                    ...pluginData,
                },
            });
        }
    } catch (error) {
        logger.error('Failed to persist plugin data', {
            pluginId,
            rcAccountId,
            message: error.message,
        });
    }
}

/**
 * @param {{ pluginId: string, rcAccessToken: string, rcAccountId: string | number, pluginAccess?: PluginAccess, pluginName?: string, ownerRcAccountId?: string | number }} params
 * @returns {Promise<RegisterPluginAccountResult>}
 */
async function registerPluginAccount({ pluginId, rcAccessToken, rcAccountId, pluginAccess, pluginName, ownerRcAccountId }) {
    const { pluginData: publishedManifest, pluginManifest, platformKey } = await resolvePluginManifest({ pluginId, pluginAccess, ownerRcAccountId, pluginName });
    if (!pluginManifest?.endpointUrl) {
        throw new Error(`Plugin endpoint URL not found for ${pluginId}`);
    }

    const registerUrl = pluginManifest.userRegisterEndpointUrl;
    const registerResponse = await axios.post(registerUrl, {
        rcAccessToken,
        rcAccountId: rcAccountId?.toString(),
    });
    const pluginJwtToken = registerResponse.data?.jwtToken;
    if (!pluginJwtToken) {
        throw new Error('Plugin register API did not return jwtToken');
    }

    await persistPluginData({
        rcAccountId: rcAccountId?.toString(),
        pluginId,
        jwtToken: pluginJwtToken,
        pluginData: {
            ...pluginManifest,
            ...(typeof publishedManifest?.version === 'string' ? { version: publishedManifest.version } : {}),
            // Remembered so the snapshot can be refreshed when a newer version is published.
            registration: {
                pluginAccess,
                ownerRcAccountId: ownerRcAccountId?.toString(),
                pluginName: platformKey,
            },
        },
    });

    return {
        successful: true,
        registerUrl,
        jwtToken: pluginJwtToken,
    };
}

/**
 * @param {{ pluginId: string, rcAccountId: string | number }} params
 * @returns {Promise<void>}
 */
async function unregisterPluginAccount({ pluginId, rcAccountId }) {
    const accountData = await AccountDataModel.findOne({
        where: {
            rcAccountId,
            platformName: pluginId,
            dataKey: 'pluginData'
        },
    });
    if (accountData) {
        await accountData.destroy();
    }
}

exports.getPluginsFromRcAccountId = getPluginsFromRcAccountId;
exports.refreshPluginSnapshotIfStale = refreshPluginSnapshotIfStale;
exports.clearPluginManifestRefreshCache = clearPluginManifestRefreshCache;
exports.getPluginConfigFromUserSettings = getPluginConfigFromUserSettings;
exports.getPluginConfigForUser = getPluginConfigForUser;
exports.getPluginLicenseStatus = getPluginLicenseStatus;
exports.getRefreshedJwtTokenFromHeaders = getRefreshedJwtTokenFromHeaders;
exports.resolvePluginManifest = resolvePluginManifest;
exports.persistPluginData = persistPluginData;
exports.registerPluginAccount = registerPluginAccount;
exports.unregisterPluginAccount = unregisterPluginAccount;

export {};
