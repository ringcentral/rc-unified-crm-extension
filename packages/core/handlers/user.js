const axios = require('axios');
const { AdminConfigModel } = require('../models/adminConfigModel');
const { getHashValue } = require('../lib/util');
const adapterRegistry = require('../adapter/registry');

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
        customManifestUrl: adminConfig?.customAdapter,
        userSettings: adminConfig?.userSettings
    };
}

async function getUserSettings({ user, rcAccessToken, rcAccountId }) {
    let userSettingsByAdmin = [];
    if (rcAccessToken || rcAccountId) {
        try {
            userSettingsByAdmin = await getUserSettingsByAdmin({ rcAccessToken, rcAccountId });
        }
        catch (e) {
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
                // from user's own settings
                if ((userSettingsByAdmin.userSettings[key] === undefined || userSettingsByAdmin.userSettings[key].customizable) && userSettings[key] !== undefined) {
                    result[key] = {
                        customizable: true,
                        value: userSettings[key].value,
                        defaultValue: userSettings[key].defaultValue,
                        options: userSettings[key].options
                    };
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

async function updateUserSettings({ user, userSettings, platformName }) {
    const keys = Object.keys(userSettings || {});
    let updatedSettings = {
        ...(user.userSettings || {})
    };
    for (const k of keys) {
        updatedSettings[k] = userSettings[k];
    }
    const platformModule = adapterRegistry.getAdapter(platformName);
    if (platformModule.onUpdateUserSettings) {
        const { successful, returnMessage } = await platformModule.onUpdateUserSettings({ user, userSettings, updatedSettings });
        if (successful) {
            await user.update({
                userSettings: updatedSettings
            });
        }
        return {
            successful,
            returnMessage
        };
    }
    else {
        await user.update({
            userSettings: updatedSettings
        });
    }
    return {
        userSettings: user.userSettings
    };
}

exports.getUserSettingsByAdmin = getUserSettingsByAdmin;
exports.getUserSettings = getUserSettings;
exports.updateUserSettings = updateUserSettings;