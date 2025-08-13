const axios = require('axios');
const { AdminConfigModel } = require('../models/adminConfigModel');
const adapterRegistry = require('../adapter/registry');
const oauth = require('../lib/oauth');

async function validateAdminRole({ rcAccessToken }) {
    const rcExtensionResponse = await axios.get(
        'https://platform.ringcentral.com/restapi/v1.0/account/~/extension/~',
        {
            headers: {
                Authorization: `Bearer ${rcAccessToken}`,
            },
        });
    return {
        isValidated: !!rcExtensionResponse.data?.permissions?.admin?.enabled || (!!process.env.ADMIN_EXTENSION_ID_DEV_PASS_LIST && process.env.ADMIN_EXTENSION_ID_DEV_PASS_LIST.split(',').includes(rcExtensionResponse.data.id.toString())),
        rcAccountId: rcExtensionResponse.data.account.id
    };
}

async function upsertAdminSettings({ hashedRcAccountId, adminSettings }) {
    let existingAdminConfig = await AdminConfigModel.findByPk(hashedRcAccountId);
    if (existingAdminConfig) {
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

async function getServerLoggingSettings({ user }) {
    const platformModule = adapterRegistry.getAdapter(user.platform);
    if (platformModule.getServerLoggingSettings) {
        const serverLoggingSettings = await platformModule.getServerLoggingSettings({ user });
        return serverLoggingSettings;
    }
    return {};
}

async function updateServerLoggingSettings({ user, additionalFieldValues }) {
    const platformModule = adapterRegistry.getAdapter(user.platform);
    if (platformModule.updateServerLoggingSettings) {
        const serverLoggingSettings = await platformModule.updateServerLoggingSettings({ user, additionalFieldValues });
        return serverLoggingSettings;
    }
    return {};
}

async function getUserMapping({ user, hashedRcAccountId }) {
    const adminConfig = await getAdminSettings({ hashedRcAccountId });
    const platformModule = adapterRegistry.getAdapter(user.platform);
    if (platformModule.getUserMapping) {
        const authType = platformModule.getAuthType();
        let authHeader = '';
        switch (authType) {
            case 'oauth':
                const oauthApp = oauth.getOAuthApp((await platformModule.getOauthInfo({ tokenUrl: user?.platformAdditionalInfo?.tokenUrl, hostname: user?.hostname })));
                // eslint-disable-next-line no-param-reassign
                user = await oauth.checkAndRefreshAccessToken(oauthApp, user);
                authHeader = `Bearer ${user.accessToken}`;
                break;
            case 'apiKey':
                const basicAuth = platformModule.getBasicAuth({ apiKey: user.accessToken });
                authHeader = `Basic ${basicAuth}`;
                break;
        }
        const rcUserMapping = await platformModule.getUserMapping({ user, authHeader, userMappingOverride: adminConfig?.userMappingOverride ?? [] });
        return rcUserMapping;
    }
    return [];
}

exports.validateAdminRole = validateAdminRole;
exports.upsertAdminSettings = upsertAdminSettings;
exports.getAdminSettings = getAdminSettings;
exports.getServerLoggingSettings = getServerLoggingSettings;
exports.updateServerLoggingSettings = updateServerLoggingSettings;
exports.getUserMapping = getUserMapping;