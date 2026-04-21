const { AdminConfigModel } = require('../models/adminConfigModel');
const connectorRegistry = require('../connector/registry');
const logger = require('../lib/logger');
const { handleDatabaseError } = require('../lib/errorHandler');

async function getUserSettingsByAdmin({ hashedRcAccountId }) {
    if (!hashedRcAccountId) {
        return null;
    }
    const adminConfig = await AdminConfigModel.findByPk(hashedRcAccountId);
    return {
        userSettings: adminConfig?.userSettings
    };
}

async function getUserSettings({ user, hashedRcAccountId }) {
    let userSettingsByAdmin = [];
    if (hashedRcAccountId) {
        try {
            userSettingsByAdmin = await getUserSettingsByAdmin({ hashedRcAccountId });
        }
        catch (e) {
            logger.error('Error getting user settings by admin', { stack: e.stack });
            userSettingsByAdmin = [];
        }
    }

    // For non-readonly admin settings, user use its own setting
    let userSettings = await user?.userSettings;
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
                        if (config) {
                            const configFromadminSettings = userSettingsByAdmin.userSettings[key].value.config ?? {};
                            for (const k in config) {
                                // use admin setting to replace, if not customizable
                                if (configFromadminSettings[k] && !configFromadminSettings[k].customizable || !config[k].value && configFromadminSettings[k].value) {
                                    config[k] = configFromadminSettings[k];
                                }
                                else {
                                    config[k].customizable = configFromadminSettings[k]?.customizable ?? true;
                                }
                            }
                            result[key].value.config = config;
                        }
                        //Case: no config at all, use admin setting directly
                        else {
                            result[key].value.config = userSettingsByAdmin.userSettings[key].value.config;
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

exports.getUserSettingsByAdmin = getUserSettingsByAdmin;
exports.getUserSettings = getUserSettings;
exports.updateUserSettings = updateUserSettings;