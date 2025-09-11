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
            const rcExtension = rcExtensionList.find(e => e.id === existingMapping?.rcExtensionId);
            // Case: existing mapping
            if (existingMapping) {
                userMappingResult.push({
                    crmUser: {
                        id: crmUser.id,
                        name: crmUser.name ?? '',
                        email: crmUser.email ?? '',
                    },
                    rcUser: {
                        extensionId: existingMapping.rcExtensionId,
                        name: rcExtension ? (rcExtension?.name ?? '') : 'Cannot find RingCentral user',
                        extensionNumber: rcExtension?.extensionNumber ?? '',
                        email: rcExtension?.email ?? ''
                    }
                });
            }
            // Case: new mapping
            else {
                const newMapping = rcExtensionList.find(u =>
                    u.email === crmUser.email ||
                    u.name === crmUser.name ||
                    (`${u.firstName} ${u.lastName}` === crmUser.name)
                );
                if (newMapping) {
                    userMappingResult.push({
                        crmUser: {
                            id: crmUser.id,
                            name: crmUser.name ?? '',
                            email: crmUser.email ?? '',
                        },
                        rcUser: {
                            extensionId: newMapping.id,
                            name: newMapping.name || `${newMapping.firstName} ${newMapping.lastName}` || '',
                            extensionNumber: newMapping?.extensionNumber ?? '',
                            email: newMapping?.email ?? ''
                        }
                    });
                    newUserMappings.push({
                        crmUserId: crmUser.id.toString(),
                        rcExtensionId: newMapping.id.toString()
                    });
                }
                else {
                    userMappingResult.push({
                        crmUser: {
                            id: crmUser.id,
                            name: crmUser.name ?? '',
                            email: crmUser.email ?? '',
                        }
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
                        rcExtensionId: userMapping.rcUser.extensionId.toString()
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
            await upsertAdminSettings({
                hashedRcAccountId,
                adminSettings: {
                    userMappings: [...(adminConfig?.userMappings ?? []), ...newUserMappings]
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