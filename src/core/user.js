const axios = require('axios');
const { AdminConfigModel } = require('../models/adminConfigModel');
const { getHashValue } = require('../lib/util');

async function userSettingsByAdmin({ rcAccessToken }) {
    const rcExtensionResponse = await axios.get(
        'https://platform.ringcentral.com/restapi/v1.0/account/~/extension/~',
        {
            headers: {
                Authorization: `Bearer ${rcAccessToken}`,
            },
        });
    const rcAccountId = rcExtensionResponse.data.account.id;
    const hashedRcAccountId = getHashValue(rcAccountId, process.env.HASH_KEY);
    const adminConfig = await AdminConfigModel.findByPk(hashedRcAccountId);
    return {
        customManifestUrl: adminConfig?.customAdapter,
        userSettings: adminConfig?.userSettings
    };
}

async function updateUserSettings({ user, userSettings, platformName }) {
    const keys = Object.keys(userSettings || {});
    let updatedSettings = {
        ...(user.userSettings || {})
    };
    for (const k of keys) {
        updatedSettings[k] = userSettings[k];
    }
    const platformModule = require(`../adapters/${platformName}`);
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
}

exports.userSettingsByAdmin = userSettingsByAdmin;
exports.updateUserSettings = updateUserSettings;