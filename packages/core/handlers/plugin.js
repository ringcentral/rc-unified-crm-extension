const { CacheModel } = require('../models/cacheModel');
const { Op } = require('sequelize');
const axios = require('axios');
const { AccountDataModel } = require('../models/accountDataModel');
const logger = require('../lib/logger');
const adminCore = require('./admin');
const { AdminConfigModel } = require('../models/adminConfigModel');

const PUBLIC_MANIFEST_BASE = 'https://appconnect.labs.ringcentral.com/public-api/connectors';

async function getPluginsFromRcAccountId({ rcAccountId }) {
    const accountData = await AccountDataModel.findAll({
        where: {
            rcAccountId,
            dataKey: 'pluginData',
        },
    });
    const workingPlugins = accountData.map(data => ({
        id: data.platformName,
        data: data.data,
    }));
    return workingPlugins;
}

function getPluginConfigFromUserSettings({ userSettings, pluginId }) {
    if (!userSettings) {
        return null;
    }
    const targetPluginSettings = userSettings[`plugin_${pluginId}`];
    if (!targetPluginSettings?.value?.config) {
        return null;
    }
    return targetPluginSettings.value.config;
}

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
    return licenseStatusResponse.data;
}

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

async function registerPluginAccount({ pluginId, rcAccountId, pluginAccess, pluginName, hashedRcAccountId }) {
    const { pluginManifest } = await resolvePluginManifest({ pluginId, pluginAccess, rcAccountId, pluginName });
    if (!pluginManifest?.endpointUrl) {
        throw new Error(`Plugin endpoint URL not found for ${pluginId}`);
    }

    const adminConfig = await AdminConfigModel.findByPk(hashedRcAccountId);
    const rcAccessToken = adminConfig?.adminAccessToken;
    if (!rcAccessToken) {
        throw new Error('Admin access token not found');
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
        pluginData: pluginManifest,
    });

    return {
        successful: true,
        registerUrl,
        jwtToken: pluginJwtToken,
    };
}

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
exports.getPluginConfigFromUserSettings = getPluginConfigFromUserSettings;
exports.getPluginLicenseStatus = getPluginLicenseStatus;
exports.getPluginAsyncTasks = getPluginAsyncTasks;
exports.getRefreshedJwtTokenFromHeaders = getRefreshedJwtTokenFromHeaders;
exports.resolvePluginManifest = resolvePluginManifest;
exports.persistPluginData = persistPluginData;
exports.registerPluginAccount = registerPluginAccount;
exports.unregisterPluginAccount = unregisterPluginAccount;
