const axios = require('axios');
const { AdminConfigModel } = require('../models/adminConfigModel');
const { getHashValue } = require('../lib/util');

async function preloadUserSettings({ rcAccessToken }) {
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

async function getUserSettings({ user }) {
    return {
        isFromAdmin: false,
        userSettings: user.userSettings
    };
}

async function updateUserSettings({ user, userSettings }) {
    user.userSettings = userSettings;
    await user.save();
}

exports.preloadUserSettings = preloadUserSettings;
exports.getUserSettings = getUserSettings;
exports.updateUserSettings = updateUserSettings;