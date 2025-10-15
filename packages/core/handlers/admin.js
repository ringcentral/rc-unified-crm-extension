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
    const oauthApp = oauth.getOAuthApp((await platformModule.getOauthInfo({ tokenUrl: user?.platformAdditionalInfo?.tokenUrl, hostname: user?.hostname })));
    if (platformModule.updateServerLoggingSettings) {
        const { successful, returnMessage } = await platformModule.updateServerLoggingSettings({ user, additionalFieldValues, oauthApp });
        return { successful, returnMessage };
    }
    return {};
}

async function getUserMapping({ user, hashedRcAccountId, rcExtensionList }) {
    const adminConfig = await getAdminSettings({ hashedRcAccountId });
    const platformModule = adapterRegistry.getAdapter(user.platform);
    if (platformModule.getUserList) {
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
        const crmUserList = await platformModule.getUserList({ user, authHeader });
        const userMappingResult = [];
        const newUserMappings = [];
        for (const crmUser of crmUserList) {
            const existingMapping = adminConfig?.userMappings?.find(u => u.crmUserId == crmUser.id);
            let existingMappingRcExtensionIds = [];
            // TEMP: backward compatibility for string value
            if (existingMapping?.rcExtensionId) {
                if (typeof (existingMapping.rcExtensionId) === 'string') {
                    existingMappingRcExtensionIds = [existingMapping.rcExtensionId];
                }
                else {
                    existingMappingRcExtensionIds = existingMapping.rcExtensionId;
                }
            }
            const rcExtension = rcExtensionList.filter(e => existingMappingRcExtensionIds.includes(e.id));
            // Case: existing mapping
            if (existingMapping) {
                userMappingResult.push({
                    crmUser: {
                        id: crmUser.id,
                        name: crmUser.name ?? '',
                        email: crmUser.email ?? '',
                    },
                    rcUser: rcExtension.map(e => ({
                        extensionId: e.id,
                        name: e?.name || `${e.firstName} ${e.lastName}`,
                        extensionNumber: e?.extensionNumber ?? '',
                        email: e?.email ?? ''
                    }))
                });
            }
            // Case: new mapping
            else {
                const rcExtensionForNewMapping = rcExtensionList.find(u =>
                    u.email === crmUser.email ||
                    u.name === crmUser.name ||
                    (`${u.firstName} ${u.lastName}` === crmUser.name)
                );
                if (rcExtensionForNewMapping) {
                    userMappingResult.push({
                        crmUser: {
                            id: crmUser.id,
                            name: crmUser.name ?? '',
                            email: crmUser.email ?? '',
                        },
                        rcUser: [{
                            extensionId: rcExtensionForNewMapping.id,
                            name: rcExtensionForNewMapping.name || `${rcExtensionForNewMapping.firstName} ${rcExtensionForNewMapping.lastName}`,
                            extensionNumber: rcExtensionForNewMapping?.extensionNumber ?? '',
                            email: rcExtensionForNewMapping?.email ?? ''
                        }]
                    });
                    newUserMappings.push({
                        crmUserId: crmUser.id.toString(),
                        rcExtensionId: [rcExtensionForNewMapping.id.toString()]
                    });
                }
                else {
                    userMappingResult.push({
                        crmUser: {
                            id: crmUser.id,
                            name: crmUser.name ?? '',
                            email: crmUser.email ?? '',
                        },
                        rcUser: []
                    });
                }
            }
        }
        // One-time init
        if (!adminConfig?.userMappings) {
            const initialUserMappings = [];
            for (const userMapping of userMappingResult) {
                if (userMapping.rcUser?.extensionId) {
                    initialUserMappings.push({
                        crmUserId: userMapping.crmUser.id.toString(),
                        rcExtensionId: [userMapping.rcUser.extensionId.toString()]
                    });
                }
            }
            await upsertAdminSettings({
                hashedRcAccountId,
                adminSettings: {
                    userMappings: initialUserMappings
                }
            });
        }
        // Incremental update
        if (newUserMappings.length > 0) {
            // TEMP: convert string to array
            if (adminConfig?.userMappings) {
                adminConfig.userMappings = adminConfig.userMappings.map(u => ({
                    ...u,
                    rcExtensionId: [u.rcExtensionId]
                }));
            }
            else {
                adminConfig.userMappings = [];
            }
            await upsertAdminSettings({
                hashedRcAccountId,
                adminSettings: {
                    userMappings: [...adminConfig.userMappings, ...newUserMappings]
                }
            });
        }
        return userMappingResult;
    }
    return [];
}

exports.validateAdminRole = validateAdminRole;
exports.upsertAdminSettings = upsertAdminSettings;
exports.getAdminSettings = getAdminSettings;
exports.getServerLoggingSettings = getServerLoggingSettings;
exports.updateServerLoggingSettings = updateServerLoggingSettings;
exports.getUserMapping = getUserMapping;