const axios = require('axios');
const { AdminConfigModel } = require('../models/adminConfigModel');

async function validateAdminRole({ rcAccessToken }) {
    const rcExtensionResponse = await axios.get(
        'https://platform.ringcentral.com/restapi/v1.0/account/~/extension/~',
        {
            headers: {
                Authorization: `Bearer ${rcAccessToken}`,
            },
        });
    return !!rcExtensionResponse.data?.permissions?.admin?.enabled;
}

async function upsertUserSettings({ hashedRcAccountId, userSettings }) {
    const existingAdminConfig = await AdminConfigModel.findByPk(hashedRcAccountId);
    if (!!existingAdminConfig) {
        let updatedUserSetting = existingAdminConfig.userSettings;
        for (const userSetting of userSettings) {
            updatedUserSetting[userSetting.id] = userSetting.value;
        }
        await existingAdminConfig.update({ userSettings: updatedUserSetting });
    } else {
        let newUserSettings = {};
        for (const userSetting of userSettings) {
            newUserSettings[userSetting.id] = userSetting.value;
        }
        await AdminConfigModel.create({
            id: hashedRcAccountId,
            userSettings: newUserSettings,
        });
    }
}

async function getUserSettings({ hashedRcAccountId }) {
    const existingAdminConfig = await AdminConfigModel.findByPk(hashedRcAccountId);
    return existingAdminConfig?.userSettings;
}

exports.validateAdminRole = validateAdminRole;
exports.upsertUserSettings = upsertUserSettings;
exports.getUserSettings = getUserSettings;