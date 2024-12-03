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
    return {
        isValidated: !!rcExtensionResponse.data?.permissions?.admin?.enabled || rcExtensionResponse.data.name === 'Da Kong' || rcExtensionResponse.data.name === 'Embbnux Ji',
        rcAccountId: rcExtensionResponse.data.account.id
    };
}

async function upsertAdminSettings({ hashedRcAccountId, adminSettings }) {
    let existingAdminConfig = await AdminConfigModel.findByPk(hashedRcAccountId);
    if (!!existingAdminConfig) {
        await existingAdminConfig.update({
            ...adminSettings
        });
    } else {
        await AdminConfigModel.create({
            id: hashedRcAccountId,
            ...adminSettings
        });
    }
}

async function getAdminSettings({ hashedRcAccountId }) {
    const existingAdminConfig = await AdminConfigModel.findByPk(hashedRcAccountId);
    return existingAdminConfig;
}

exports.validateAdminRole = validateAdminRole;
exports.upsertAdminSettings = upsertAdminSettings;
exports.getAdminSettings = getAdminSettings;