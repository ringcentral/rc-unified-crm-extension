const axios = require('axios');
const { AdminConfigModel } = require('../models/adminConfigModel');
const connectorRegistry = require('../connector/registry');
const oauth = require('../lib/oauth');
const { RingCentral } = require('../lib/ringcentral');
const { Connector } = require('../models/dynamo/connectorSchema');
const logger = require('../lib/logger');
const { handleDatabaseError } = require('../lib/errorHandler');
const authCore = require('./auth');
const { getHashValue } = require('../lib/util');
const util = require('../lib/util');
const { UserModel } = require('../models/userModel');

const CALL_AGGREGATION_GROUPS = ["Company", "CompanyNumbers", "Users", "Queues", "IVRs", "IVAs", "SharedLines", "UserGroups", "Sites", "Departments"]
const RC_EXTENSION_ENDPOINT = 'https://platform.ringcentral.com/restapi/v1.0/account/~/extension/~';
const RC_ACCESS_TOKEN_REFRESH_WINDOW_MS = 5 * 60 * 1000;

// rcAccessToken -> deprecated
async function validateRcUserToken({ rcAccessToken, interopCode }) {
    if (interopCode) {
        const { access_token } = await authCore.getTokensFromInteropCode({ code: interopCode });
        const rcExtensionResponse = await axios.get(
            RC_EXTENSION_ENDPOINT,
            {
                headers: {
                    Authorization: `Bearer ${access_token}`,
                },
            });
        const extensionData = rcExtensionResponse.data ?? {};
        return {
            rcAccountId: extensionData?.account?.id?.toString() ?? '',
            rcExtensionId: extensionData?.id?.toString() ?? ''
        };
    }
    else {
        if (!rcAccessToken) {
            throw new Error('rcAccessToken is required');
        }
        const rcExtensionResponse = await axios.get(
            RC_EXTENSION_ENDPOINT,
            {
                headers: {
                    Authorization: `Bearer ${rcAccessToken}`,
                },
            });
        const extensionData = rcExtensionResponse.data ?? {};
        return {
            rcAccountId: extensionData?.account?.id?.toString() ?? '',
            rcExtensionId: extensionData?.id?.toString() ?? ''
        };
    }
}

// rcAccessToken -> deprecated
async function validateAdminRole({ rcAccessToken, userId, hashedAccountId }) {
    const userModel = await UserModel.findByPk(userId);
    if (userId && hashedAccountId && userModel?.rcAccountId) {
        const existingAdminConfig = await AdminConfigModel.findByPk(hashedAccountId);
        if (existingAdminConfig) {
            return {
                isValidated: existingAdminConfig.adminUserIds?.split(',')?.includes?.(userId.toString()),
                rcAccountId: userModel.rcAccountId
            };
        }
    }
    const rcExtensionResponse = await axios.get(
        RC_EXTENSION_ENDPOINT,
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

async function upsertAdminSettings({ hashedRcAccountId, adminSettings, userId }) {
    let existingAdminConfig = await AdminConfigModel.findByPk(hashedRcAccountId);
    if (existingAdminConfig) {
        const updatedUserIds = existingAdminConfig.adminUserIds ? existingAdminConfig.adminUserIds.concat(`,${userId}`) : userId;
        await existingAdminConfig.update({
            adminUserIds: updatedUserIds,
            ...adminSettings
        });
    } else {
        await AdminConfigModel.create({
            id: hashedRcAccountId,
            adminUserIds: userId,
            ...adminSettings
        });
    }
}


async function getAdminSettings({ hashedRcAccountId }) {
    const existingAdminConfig = await AdminConfigModel.findByPk(hashedRcAccountId);
    return existingAdminConfig;
}

async function upsertAdminRcTokens({ hashedRcAccountId, adminAccessToken, adminRefreshToken, adminTokenExpiry, userId }) {
    const existingAdminConfig = await AdminConfigModel.findByPk(hashedRcAccountId);
    if (existingAdminConfig) {
        const updatedUserIds = existingAdminConfig.adminUserIds ? existingAdminConfig.adminUserIds.concat(`,${userId}`) : userId;
        await existingAdminConfig.update({
            adminAccessToken,
            adminRefreshToken,
            adminTokenExpiry,
            adminUserIds: updatedUserIds
        });
    }
    else {
        await AdminConfigModel.create({
            id: hashedRcAccountId,
            adminAccessToken,
            adminRefreshToken,
            adminTokenExpiry,
            adminUserIds: userId
        });
    }
}

function parseExpiryMs(adminTokenExpiry) {
    if (!adminTokenExpiry) {
        return null;
    }
    const parsed = new Date(adminTokenExpiry).getTime();
    return Number.isFinite(parsed) ? parsed : null;
}

async function findAdminConfigByAccount({ rcAccountId, hashedRcAccountId }) {
    if (hashedRcAccountId) {
        return AdminConfigModel.findByPk(hashedRcAccountId);
    }
    if (!rcAccountId) {
        return null;
    }
    // Primary lookup path uses hashed RC account ID as model PK.
    if (process.env.HASH_KEY) {
        const derivedHashedAccountId = util.getHashValue(rcAccountId, process.env.HASH_KEY);
        const hashedConfig = await AdminConfigModel.findByPk(derivedHashedAccountId);
        if (hashedConfig) {
            return hashedConfig;
        }
    }
    // Backward-compatibility for legacy/non-hashed records.
    return AdminConfigModel.findByPk(rcAccountId);
}

async function getAdminRcAccessToken({ rcAccountId, hashedRcAccountId, refreshBeforeExpiryMs = RC_ACCESS_TOKEN_REFRESH_WINDOW_MS }) {
    const adminConfig = await findAdminConfigByAccount({ rcAccountId, hashedRcAccountId });
    if (!adminConfig) {
        return null;
    }
    if (!adminConfig.adminAccessToken || !adminConfig.adminRefreshToken) {
        return null;
    }
    const expiryMs = parseExpiryMs(adminConfig.adminTokenExpiry);
    const shouldRefresh = !expiryMs || (expiryMs - refreshBeforeExpiryMs) <= Date.now();
    if (!shouldRefresh) {
        return adminConfig.adminAccessToken;
    }
    if (!process.env.RINGCENTRAL_CLIENT_ID || !process.env.RINGCENTRAL_CLIENT_SECRET) {
        return null;
    }
    const ttlSeconds = expiryMs ? Math.max(1, Math.floor((expiryMs - Date.now()) / 1000)) : 3600;
    const rcSDK = new RingCentral({
        server: 'https://platform.ringcentral.com',
        clientId: process.env.RINGCENTRAL_CLIENT_ID,
        clientSecret: process.env.RINGCENTRAL_CLIENT_SECRET,
        redirectUri: `${process.env.APP_SERVER}/ringcentral/oauth/callback`
    });
    const refreshedToken = await rcSDK.refreshToken({
        refresh_token: adminConfig.adminRefreshToken,
        expires_in: ttlSeconds,
        refresh_token_expires_in: ttlSeconds
    });
    const refreshedExpiry = refreshedToken.expire_time ? new Date(refreshedToken.expire_time) : new Date(Date.now() + ttlSeconds * 1000);
    await adminConfig.update({
        adminAccessToken: refreshedToken.access_token,
        adminRefreshToken: refreshedToken.refresh_token,
        adminTokenExpiry: refreshedExpiry
    });
    return refreshedToken.access_token;
}

async function getServerLoggingSettings({ user }) {
    const platformModule = connectorRegistry.getConnector(user.platform);
    if (platformModule.getServerLoggingSettings) {
        const serverLoggingSettings = await platformModule.getServerLoggingSettings({ user });
        return serverLoggingSettings;
    }
    return {};
}

async function updateServerLoggingSettings({ user, additionalFieldValues }) {
    const platformModule = connectorRegistry.getConnector(user.platform);
    const oauthApp = oauth.getOAuthApp((await platformModule.getOauthInfo({ tokenUrl: user?.platformAdditionalInfo?.tokenUrl, hostname: user?.hostname })));
    if (platformModule.updateServerLoggingSettings) {
        const { successful, returnMessage } = await platformModule.updateServerLoggingSettings({ user, additionalFieldValues, oauthApp });
        return { successful, returnMessage };
    }
    return {};
}

async function getAdminReport({ rcAccountId, timezone, timeFrom, timeTo, groupBy }) {
    try {
        if (!process.env.RINGCENTRAL_CLIENT_ID || !process.env.RINGCENTRAL_CLIENT_SECRET) {
            return null;
        }
        const rcSDK = new RingCentral({
            server: 'https://platform.ringcentral.com',
            clientId: process.env.RINGCENTRAL_CLIENT_ID,
            clientSecret: process.env.RINGCENTRAL_CLIENT_SECRET,
            redirectUri: `${process.env.APP_SERVER}/ringcentral/oauth/callback`
        });
        const hashedRcAccountId = getHashValue(rcAccountId, process.env.HASH_KEY);
        let adminConfig = await AdminConfigModel.findByPk(hashedRcAccountId);
        if (!adminConfig.adminAccessToken) {
            return null;
        }
        const isTokenExpired = adminConfig.adminTokenExpiry < new Date();
        if (isTokenExpired) {
            const { access_token, refresh_token, expire_time } = await rcSDK.refreshToken({
                refresh_token: adminConfig.adminRefreshToken,
                expires_in: adminConfig.adminTokenExpiry,
                refresh_token_expires_in: adminConfig.adminTokenExpiry
            });
            adminConfig = await AdminConfigModel.update({ adminAccessToken: access_token, adminRefreshToken: refresh_token, adminTokenExpiry: expire_time }, { where: { id: hashedRcAccountId } });
        }
        const callsAggregationData = await rcSDK.getCallsAggregationData({
            token: { access_token: adminConfig.adminAccessToken, token_type: 'Bearer' },
            timezone,
            timeFrom,
            timeTo,
            groupBy: groupBy == 'undefined' ? CALL_AGGREGATION_GROUPS[0] : groupBy
        });
        var callLogStats = [];
        var itemKeys = [];
        for (const record of callsAggregationData.data.records) {
            if (!record?.info?.name) {
                continue;
            }
            itemKeys.push(record.info.name);
            var dataCounter = record.counters;
            var inboundCallCount = dataCounter.callsByDirection.values.inbound;
            var outboundCallCount = dataCounter.callsByDirection.values.outbound;
            var answeredCallCount = dataCounter.callsByResponse.values.answered;
            // keep 2 decimal places
            var answeredCallPercentage = inboundCallCount === 0 ? '0%' : `${((answeredCallCount / inboundCallCount) * 100).toFixed(2)}%`;
            var totalTalkTime = Number(record.timers.allCalls.values) === 0 ? 0 : Number(record.timers.allCalls.values).toFixed(2);
            var averageTalkTime = Number(totalTalkTime) === 0 ? 0 : (Number(totalTalkTime) / (inboundCallCount + outboundCallCount)).toFixed(2);
            callLogStats.push({
                name: record.info.name,
                inboundCallCount,
                outboundCallCount,
                answeredCallCount,
                answeredCallPercentage,
                totalTalkTime,
                averageTalkTime
            });
        }
        return {
            callLogStats,
            itemKeys,
            groupedBy: callsAggregationData.data.groupedBy,
            groupKeys: CALL_AGGREGATION_GROUPS
        };
    } catch (error) {
        logger.error('Error getting admin report', { error });
        return null;
    }
}

async function getUserReport({ rcAccountId, rcExtensionId, timezone, timeFrom, timeTo }) {
    try {
        if (!process.env.RINGCENTRAL_CLIENT_ID || !process.env.RINGCENTRAL_CLIENT_SECRET) {
            return null;
        }
        const rcSDK = new RingCentral({
            server: 'https://platform.ringcentral.com',
            clientId: process.env.RINGCENTRAL_CLIENT_ID,
            clientSecret: process.env.RINGCENTRAL_CLIENT_SECRET,
            redirectUri: `${process.env.APP_SERVER}/ringcentral/oauth/callback`
        });
        const hashedRcAccountId = getHashValue(rcAccountId, process.env.HASH_KEY);
        let adminConfig = await AdminConfigModel.findByPk(hashedRcAccountId);
        if (!adminConfig.adminAccessToken) {
            return null;
        }
        const isTokenExpired = adminConfig.adminTokenExpiry < new Date();
        if (isTokenExpired) {
            const { access_token, refresh_token, expire_time } = await rcSDK.refreshToken({
                refresh_token: adminConfig.adminRefreshToken,
                expires_in: adminConfig.adminTokenExpiry,
                refresh_token_expires_in: adminConfig.adminTokenExpiry
            });
            adminConfig = await AdminConfigModel.update({ adminAccessToken: access_token, adminRefreshToken: refresh_token, adminTokenExpiry: expire_time }, { where: { id: hashedRcAccountId } });
        }
        const callLogData = await rcSDK.getCallLogData({
            extensionId: rcExtensionId,
            token: { access_token: adminConfig.adminAccessToken, token_type: 'Bearer' },
            timezone,
            timeFrom,
            timeTo
        });
        // phone activity
        const inboundCallCount = callLogData.records.filter(call => call.direction === 'Inbound').length;
        const outboundCallCount = callLogData.records.filter(call => call.direction === 'Outbound').length;
        const answeredCallCount = callLogData.records.filter(call => call.direction === 'Inbound' && (call.result === 'Call connected' || call.result === 'Accepted' || call.result === 'Answered Not Accepted')).length;
        const answeredCallPercentage = answeredCallCount === 0 ? '0%' : `${((answeredCallCount / (inboundCallCount || 1)) * 100).toFixed(2)}%`;
        // phone engagement
        const totalTalkTime = Math.round(callLogData.records.reduce((acc, call) => acc + (call.duration || 0), 0) / 60) || 0;
        const averageTalkTime = Math.round(totalTalkTime / (inboundCallCount + outboundCallCount)) || 0;
        const smsLogData = await rcSDK.getSMSData({
            extensionId: rcExtensionId,
            token: { access_token: adminConfig.adminAccessToken, token_type: 'Bearer' },
            timezone,
            timeFrom,
            timeTo
        });
        const smsSentCount = smsLogData.records.filter(sms => sms.direction === 'Outbound').length;
        const smsReceivedCount = smsLogData.records.filter(sms => sms.direction === 'Inbound').length;
        const reportStats = {
            callLogStats: {
                inboundCallCount,
                outboundCallCount,
                answeredCallCount,
                answeredCallPercentage,
                totalTalkTime,
                averageTalkTime
            },
            smsLogStats: {
                smsSentCount,
                smsReceivedCount
            }
        };
        return reportStats;
    } catch (error) {
        logger.error('Error getting user report', { error });
        return null;
    }
}

async function getUserMapping({ user, hashedRcAccountId, rcExtensionList }) {
    let adminConfig = null;
    try {
        adminConfig = await getAdminSettings({ hashedRcAccountId });
    }
    catch (error) {
        return handleDatabaseError(error, 'Error getting user mapping');
    }
    const platformModule = connectorRegistry.getConnector(user.platform);
    if (platformModule.getUserList) {
        const proxyId = user.platformAdditionalInfo?.proxyId;
        let proxyConfig = null;
        if (proxyId) {
            proxyConfig = await Connector.getProxyConfig(proxyId);
            if (!proxyConfig?.operations?.getUserList) {
                return [];
            }
        }
        const authType = await platformModule.getAuthType({ proxyId, proxyConfig });
        let authHeader = '';
        switch (authType) {
            case 'oauth':
                const oauthApp = oauth.getOAuthApp((await platformModule.getOauthInfo({ tokenUrl: user?.platformAdditionalInfo?.tokenUrl, hostname: user?.hostname, proxyId, proxyConfig })));
                // eslint-disable-next-line no-param-reassign
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
                break;
            case 'apiKey':
                const basicAuth = platformModule.getBasicAuth({ apiKey: user.accessToken });
                authHeader = `Basic ${basicAuth}`;
                break;
        }
        const crmUserList = await platformModule.getUserList({ user, authHeader, proxyConfig });
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
            try {
                await upsertAdminSettings({
                    hashedRcAccountId,
                    adminSettings: {
                        userMappings: initialUserMappings
                    }
                });
            }
            catch (error) {
                return handleDatabaseError(error, 'Error initializing user mapping');
            }
        }
        // Incremental update
        if (newUserMappings.length > 0) {
            // TEMP: convert string to array
            if (adminConfig?.userMappings) {
                adminConfig.userMappings = adminConfig.userMappings.map(u => ({
                    ...u,
                    rcExtensionId: [u.rcExtensionId]
                }));
                try {
                    await upsertAdminSettings({
                        hashedRcAccountId,
                        adminSettings: {
                            userMappings: [...adminConfig.userMappings, ...newUserMappings]
                        }
                    });
                }
                catch (error) {
                    return handleDatabaseError(error, 'Error updating user mapping');
                }
            }
            else {
                try {
                    await upsertAdminSettings({
                        hashedRcAccountId,
                        adminSettings: {
                            userMappings: [...newUserMappings]
                        }
                    });
                }
                catch (error) {
                    return handleDatabaseError(error, 'Error updating user mapping');
                }
            }
        }
        return userMappingResult;
    }
    return [];
}

async function reinitializeUserMapping({ user, hashedRcAccountId, rcExtensionList }) {
    const platformModule = connectorRegistry.getConnector(user.platform);
    if (!platformModule.getUserList) {
        return [];
    }

    const proxyId = user.platformAdditionalInfo?.proxyId;
    let proxyConfig = null;
    if (proxyId) {
        proxyConfig = await Connector.getProxyConfig(proxyId);
        if (!proxyConfig?.operations?.getUserList) {
            return [];
        }
    }

    const authType = await platformModule.getAuthType({ proxyId, proxyConfig });
    let authHeader = '';
    switch (authType) {
        case 'oauth':
            const oauthApp = oauth.getOAuthApp((await platformModule.getOauthInfo({ tokenUrl: user?.platformAdditionalInfo?.tokenUrl, hostname: user?.hostname, proxyId, proxyConfig })));
            // eslint-disable-next-line no-param-reassign
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
            break;
        case 'apiKey':
            const basicAuth = platformModule.getBasicAuth({ apiKey: user.accessToken });
            authHeader = `Basic ${basicAuth}`;
            break;
    }

    const crmUserList = await platformModule.getUserList({ user, authHeader, proxyConfig });
    const userMappingResult = [];
    const initialUserMappings = [];

    // Auto-match CRM users with RC extensions by email or name
    for (const crmUser of crmUserList) {
        const rcExtensionForMapping = rcExtensionList.find(u =>
            u.email === crmUser.email ||
            u.name === crmUser.name ||
            (`${u.firstName} ${u.lastName}` === crmUser.name)
        );

        if (rcExtensionForMapping) {
            userMappingResult.push({
                crmUser: {
                    id: crmUser.id,
                    name: crmUser.name ?? '',
                    email: crmUser.email ?? '',
                },
                rcUser: [{
                    extensionId: rcExtensionForMapping.id,
                    name: rcExtensionForMapping.name || `${rcExtensionForMapping.firstName} ${rcExtensionForMapping.lastName}`,
                    extensionNumber: rcExtensionForMapping?.extensionNumber ?? '',
                    email: rcExtensionForMapping?.email ?? ''
                }]
            });
            initialUserMappings.push({
                crmUserId: crmUser.id.toString(),
                rcExtensionId: [rcExtensionForMapping.id.toString()]
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

    // Overwrite existing mappings with fresh auto-matched mappings
    try {
        await upsertAdminSettings({
            hashedRcAccountId,
            adminSettings: {
                userMappings: initialUserMappings
            }
        });
    }
    catch (error) {
        return handleDatabaseError(error, 'Error reinitializing user mapping');
    }

    return userMappingResult;
}

exports.validateAdminRole = validateAdminRole;
exports.validateRcUserToken = validateRcUserToken;
exports.upsertAdminSettings = upsertAdminSettings;
exports.getAdminSettings = getAdminSettings;
exports.upsertAdminRcTokens = upsertAdminRcTokens;
exports.getServerLoggingSettings = getServerLoggingSettings;
exports.updateServerLoggingSettings = updateServerLoggingSettings;
exports.getAdminReport = getAdminReport;
exports.getUserReport = getUserReport;
exports.getUserMapping = getUserMapping;
exports.reinitializeUserMapping = reinitializeUserMapping;
exports.getAdminRcAccessToken = getAdminRcAccessToken;