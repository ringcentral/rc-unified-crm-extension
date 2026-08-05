// @ts-check

const axios = /** @type {any} */ (require('axios'));
const { AdminConfigModel: AdminConfigModelImport } = require('../models/adminConfigModel');
const { getHashValue } = require('../lib/util');
const connectorRegistry = /** @type {any} */ (require('../connector/registry'));
const logger = require('../lib/logger');
const { handleDatabaseError } = require('../lib/errorHandler');
const { UserModel: UserModelImport } = require('../models/userModel');
const { handleApiError } = require('../lib/errorHandler');
const oauth = /** @type {any} */ (require('../lib/oauth'));
const { Connector: ConnectorImport } = require('../models/dynamo/connectorSchema');

const AdminConfigModel = /** @type {any} */ (AdminConfigModelImport);
const UserModel = /** @type {any} */ (UserModelImport);
const Connector = /** @type {any} */ (ConnectorImport);

/** @typedef {import('../types').GetUserSettingsParams} GetUserSettingsParams */
/** @typedef {import('../types').HandlerResult} HandlerResult */
/** @typedef {import('../types').RefreshUserInfoParams} RefreshUserInfoParams */
/** @typedef {import('../types').UpdateUserSettingsParams} UpdateUserSettingsParams */
/** @typedef {import('../types').UserSettings} UserSettings */
/** @typedef {import('../types').UserSettingsByAdminParams} UserSettingsByAdminParams */
/** @typedef {import('../types').UserSettingsByAdminResult} UserSettingsByAdminResult */

/**
 * @param {RefreshUserInfoParams} params
 * @returns {Promise<HandlerResult>}
 */
async function refreshUserInfo({ platform, userId, tracer }) {
    tracer?.trace('refreshUserInfo:start', { platform, userId });
    try {
        let user = await UserModel.findOne({
            where: {
                id: userId,
                platform
            }
        });
        tracer?.trace('refreshUserInfo:userFound', { user });

        if (!user || !user.accessToken) {
            tracer?.trace('refreshUserInfo:noUser', { userId });
            return {
                successful: false,
                returnMessage: {
                    message: `User not found`,
                    messageType: 'warning',
                    ttl: 5000
                }
            };
        }

        const proxyId = user.platformAdditionalInfo?.proxyId;
        let proxyConfig = null;
        if (proxyId) {
            proxyConfig = await Connector.getProxyConfig(proxyId);
            tracer?.trace('refreshUserInfo:proxyConfig', { proxyConfig });
        }

        const platformModule = connectorRegistry.getConnector(platform);
        const authType = await platformModule.getAuthType({ proxyId, proxyConfig });
        tracer?.trace('refreshUserInfo:authType', { authType });

        let authHeader = '';
        switch (authType) {
            case 'oauth':
                const oauthApp = oauth.getOAuthApp((await platformModule.getOauthInfo({ tokenUrl: user?.platformAdditionalInfo?.tokenUrl, hostname: user?.hostname, proxyId, proxyConfig })));
                user = await oauth.checkAndRefreshAccessToken(oauthApp, user);
                if (!user) {
                    return {
                        successful: false,
                        returnMessage: {
                            message: `User session expired. Please connect again.`,
                            messageType: 'warning',
                            ttl: 5000
                        },
                        isRevokeUserSession: true
                    }
                }
                authHeader = `Bearer ${user.accessToken}`;
                tracer?.trace('refreshUserInfo:oauthAuth', { authHeader });
                break;
            case 'apiKey':
                const basicAuth = platformModule.getBasicAuth({ apiKey: user.accessToken });
                authHeader = `Basic ${basicAuth}`;
                tracer?.trace('refreshUserInfo:apiKeyAuth', {});
                break;
        }

        const { successful, returnMessage } = await platformModule.refreshUserInfo({ user, authHeader, proxyConfig });
        tracer?.trace('refreshUserInfo:platformRefreshResult', { successful, returnMessage });
        return {
            successful,
            returnMessage
        };
    }
    catch (e) {
        tracer?.traceError('refreshUserInfo:error', e, { platform, userId });
        return handleApiError(e, platform, 'refreshUserInfo', { userId });
    }
}

/**
 * @param {UserSettingsByAdminParams} params
 * @returns {Promise<UserSettingsByAdminResult>}
 */
async function getUserSettingsByAdmin({ rcAccessToken, rcAccountId }) {
    let hashedRcAccountId = null;
    if (rcAccountId) {
        hashedRcAccountId = rcAccountId;
    }
    else {
        const rcExtensionResponse = await axios.get(
            'https://platform.ringcentral.com/restapi/v1.0/account/~/extension/~',
            {
                headers: {
                    Authorization: `Bearer ${rcAccessToken}`,
                },
            });
        hashedRcAccountId = getHashValue(rcExtensionResponse.data.account.id, process.env.HASH_KEY);
    }
    const adminConfig = await AdminConfigModel.findByPk(hashedRcAccountId);
    return {
        userSettings: adminConfig?.userSettings
    };
}

/**
 * @param {GetUserSettingsParams} params
 * @returns {Promise<UserSettings>}
 */
async function getUserSettings({ user, rcAccessToken, rcAccountId }) {
    /** @type {any} */
    let userSettingsByAdmin: any = [];
    if (rcAccessToken || rcAccountId) {
        try {
            userSettingsByAdmin = await getUserSettingsByAdmin({ rcAccessToken, rcAccountId });
        }
        catch (e) {
            logger.error('Error getting user settings by admin', { stack: /** @type {any} */ (e).stack });
            userSettingsByAdmin = [];
        }
    }

    // For non-readonly admin settings, user use its own setting
    let userSettings = await user?.userSettings;
    /** @type {any} */
    let result = {};
    if (!userSettingsByAdmin?.userSettings) {
        result = userSettings;
    }
    else {
        if (!!userSettingsByAdmin?.userSettings && !!userSettings) {
            const keys = Object.keys(userSettingsByAdmin.userSettings).concat(Object.keys(userSettings));
            // distinct keys
            for (const key of new Set(keys)) {
                // marked as removed
                if (userSettingsByAdmin.userSettings[key]?.isRemoved) {
                    continue;
                }
                if ((userSettingsByAdmin.userSettings[key] === undefined || userSettingsByAdmin.userSettings[key].customizable) && userSettings[key] !== undefined) {
                    result[key] = {
                        customizable: true,
                        value: userSettings[key].value,
                        defaultValue: userSettings[key].defaultValue,
                        options: userSettings[key].options
                    };
                    // Special case: plugins
                    if (key.startsWith('plugin_')) {
                        const config = Object.keys(result[key].value.config)?.length === 0 ? null : result[key].value.config;
                        const configFromAdminSettings = userSettingsByAdmin.userSettings[key]?.value?.config ?? null;
                        if (config) {
                            if (configFromAdminSettings) {
                                for (const k in config) {
                                    // use admin setting to replace, if not customizable
                                    if (configFromAdminSettings[k] && !configFromAdminSettings[k].customizable || !config[k].value && configFromAdminSettings[k].value) {
                                        config[k] = configFromAdminSettings[k];
                                    }
                                    else {
                                        config[k].customizable = configFromAdminSettings[k]?.customizable ?? true;
                                    }
                                }
                            }
                            result[key].value.config = config;
                        }
                        //Case: no config at all, use admin setting directly
                        else {
                            if (configFromAdminSettings) {
                                result[key].value.config = {
                                    ...configFromAdminSettings
                                };
                            }
                            else {
                                delete result[key];
                            }
                        }
                    }
                }
                // from admin settings
                else {
                    result[key] = userSettingsByAdmin.userSettings[key];
                }
            }
        }
    }
    return result;
}

/**
 * @param {UpdateUserSettingsParams} params
 * @returns {Promise<HandlerResult | { userSettings?: UserSettings }>}
 */
async function updateUserSettings({ user, userSettings, settingKeysToRemove, platformName }) {
    const keys = Object.keys(userSettings || {});
    let updatedSettings = {
        ...(user.userSettings || {})
    };
    for (const k of keys) {
        updatedSettings[k] = userSettings[k];
    }
    for (const k of settingKeysToRemove) {
        if (updatedSettings[k]) {
            delete updatedSettings[k];
        }
    }
    const platformModule = connectorRegistry.getConnector(platformName);
    if (platformModule.onUpdateUserSettings) {
        const { successful, returnMessage } = await platformModule.onUpdateUserSettings({ user, userSettings, updatedSettings });
        if (successful) {
            try {
                await user.update({
                    userSettings: updatedSettings
                });
            }
            catch (error) {
                return handleDatabaseError(error, 'Error updating user settings');
            }
        }
        return {
            successful,
            returnMessage
        };
    }
    else {
        try {
            await user.update({
                userSettings: updatedSettings
            });
        }
        catch (error) {
            return handleDatabaseError(error, 'Error updating user settings');
        }
    }
    return {
        userSettings: user.userSettings
    };
}

exports.refreshUserInfo = refreshUserInfo;
exports.getUserSettingsByAdmin = getUserSettingsByAdmin;
exports.getUserSettings = getUserSettings;
exports.updateUserSettings = updateUserSettings;

export {};
