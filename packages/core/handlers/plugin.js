const { CacheModel } = require('../models/cacheModel');
const { Op } = require('sequelize');
const axios = require('axios');
const { AdminConfigModel } = require('../models/adminConfigModel');
const { getHashValue } = require('../lib/util');
const logger = require('../lib/logger');

const PUBLIC_MANIFEST_BASE = 'https://appconnect.labs.ringcentral.com/public-api/connectors';

async function getPluginAsyncTasks({ asyncTaskIds }) {
    const caches = await CacheModel.findAll({
        where: {
            id: {
                [Op.in]: asyncTaskIds
            }
        }
    });
    const result = caches.map(cache => ({
        cacheKey: cache.cacheKey,
        status: cache.status
    }));
    const toRemoveCaches = caches.filter(cache => cache.status === 'completed' || cache.status === 'failed');
    await CacheModel.destroy({
        where: {
            id: {
                [Op.in]: toRemoveCaches.map(cache => cache.id)
            }
        }
    });
    return result;
}

function getRefreshedJwtTokenFromHeaders({ headers }) {
    if (!headers) {
        return null;
    }
    return headers['x-refreshed-jwt-token'] || headers['X-Refreshed-Jwt-Token'] || null;
}

function derivePluginRegisterUrl({ endpointUrl, pluginId }) {
    const parsedUrl = new URL(endpointUrl);
    const pluginPathSegment = `/plugin/${pluginId}`;
    const existingIndex = parsedUrl.pathname.indexOf(pluginPathSegment);
    let registerPathname = '';
    if (existingIndex >= 0) {
        registerPathname = `${parsedUrl.pathname.slice(0, existingIndex + pluginPathSegment.length)}/auth/register`;
    } else {
        registerPathname = `${parsedUrl.pathname.replace(/\/$/, '')}/auth/register`;
    }
    parsedUrl.search = '';
    parsedUrl.hash = '';
    parsedUrl.pathname = registerPathname;
    return parsedUrl.toString();
}

async function resolvePluginManifest({ pluginId, pluginAccess, rcAccountId, pluginName }) {
    const manifestFetchers = [];
    if (pluginAccess === 'public') {
        manifestFetchers.push(`${PUBLIC_MANIFEST_BASE}/${pluginId}/manifest?type=plugin`);
    } else if (pluginAccess === 'private' || pluginAccess === 'shared') {
        manifestFetchers.push(`${PUBLIC_MANIFEST_BASE}/${pluginId}/manifest?access=internal&type=plugin&accountId=${rcAccountId}`);
    } else {
        manifestFetchers.push(`${PUBLIC_MANIFEST_BASE}/${pluginId}/manifest?type=plugin`);
        manifestFetchers.push(`${PUBLIC_MANIFEST_BASE}/${pluginId}/manifest?access=internal&type=plugin&accountId=${rcAccountId}`);
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

async function persistPluginJwtToken({ rcAccountId, pluginId, jwtToken }) {
    const hashedRcAccountId = getHashValue(rcAccountId, process.env.HASH_KEY);
    const adminConfig = await AdminConfigModel.findByPk(hashedRcAccountId);
    if (!adminConfig) {
        throw new Error('Admin settings not found');
    }

    const userSettings = JSON.parse(JSON.stringify(adminConfig.userSettings || {}));
    const pluginKey = `plugin_${pluginId}`;
    const existingPluginSetting = userSettings[pluginKey];
    if (!existingPluginSetting?.value) {
        throw new Error(`Plugin ${pluginId} is not installed in admin settings`);
    }

    userSettings[pluginKey] = {
        ...existingPluginSetting,
        value: {
            ...existingPluginSetting.value,
            jwtToken,
        },
    };
    await adminConfig.update({ userSettings });
}

async function registerPluginAccount({ pluginId, rcAccessToken, rcAccountId, pluginAccess, pluginName }) {
    const { pluginManifest } = await resolvePluginManifest({ pluginId, pluginAccess, rcAccountId, pluginName });
    if (!pluginManifest?.endpointUrl) {
        throw new Error(`Plugin endpoint URL not found for ${pluginId}`);
    }

    const registerUrl = derivePluginRegisterUrl({ endpointUrl: pluginManifest.endpointUrl, pluginId });
    const registerResponse = await axios.post(registerUrl, {
        rcAccessToken,
        rcAccountId: rcAccountId?.toString(),
    });
    const pluginJwtToken = registerResponse.data?.jwtToken;
    if (!pluginJwtToken) {
        throw new Error('Plugin register API did not return jwtToken');
    }

    await persistPluginJwtToken({
        rcAccountId: rcAccountId?.toString(),
        pluginId,
        jwtToken: pluginJwtToken,
    });

    return {
        successful: true,
        registerUrl,
        jwtToken: pluginJwtToken,
    };
}

async function persistPluginJwtTokenBestEffort({ rcAccountId, pluginId, jwtToken }) {
    try {
        await persistPluginJwtToken({ rcAccountId, pluginId, jwtToken });
        return true;
    } catch (error) {
        logger.warn('Failed to persist refreshed plugin JWT token', {
            pluginId,
            rcAccountId,
            message: error.message,
        });
        return false;
    }
}

exports.getPluginAsyncTasks = getPluginAsyncTasks;
exports.getRefreshedJwtTokenFromHeaders = getRefreshedJwtTokenFromHeaders;
exports.derivePluginRegisterUrl = derivePluginRegisterUrl;
exports.resolvePluginManifest = resolvePluginManifest;
exports.persistPluginJwtToken = persistPluginJwtToken;
exports.persistPluginJwtTokenBestEffort = persistPluginJwtTokenBestEffort;
exports.registerPluginAccount = registerPluginAccount;
