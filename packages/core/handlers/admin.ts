// @ts-check

/** @typedef {import('../types').AdminConfigRecord} AdminConfigRecord */
/** @typedef {import('../types').AdminConnectorImplementation} AdminConnectorImplementation */
/** @typedef {import('../types').AdminHandlerUser} AdminHandlerUser */
/** @typedef {import('../types').AdminReportParams} AdminReportParams */
/** @typedef {import('../types').AdminSettingsParams} AdminSettingsParams */
/** @typedef {import('../types').CrmUserInfo} CrmUserInfo */
/** @typedef {import('../types').OAuthInfo} OAuthInfo */
/** @typedef {import('../types').ProxyConfig} ProxyConfig */
/** @typedef {import('../types').RcExtensionInfo} RcExtensionInfo */
/** @typedef {import('../types').RingCentralSdkLike} RingCentralSdkLike */
/** @typedef {import('../types').ServerLoggingSettingsParams} ServerLoggingSettingsParams */
/** @typedef {import('../types').UpdateAdminRcTokensParams} UpdateAdminRcTokensParams */
/** @typedef {import('../types').UpdateServerLoggingSettingsParams} UpdateServerLoggingSettingsParams */
/** @typedef {import('../types').UpsertAdminSettingsParams} UpsertAdminSettingsParams */
/** @typedef {import('../types').UserMappingParams} UserMappingParams */
/** @typedef {import('../types').UserMappingResultItem} UserMappingResultItem */
/** @typedef {import('../types').UserReportParams} UserReportParams */
/** @typedef {import('../types').ValidateAdminRoleParams} ValidateAdminRoleParams */
/** @typedef {import('../types').ValidateAdminRoleResult} ValidateAdminRoleResult */
/** @typedef {import('../types').ValidateRcUserTokenParams} ValidateRcUserTokenParams */
/** @typedef {import('../types').ValidateRcUserTokenResult} ValidateRcUserTokenResult */

const axios = /** @type {{ get(url: string, config?: Record<string, unknown>): Promise<{ data?: any }> }} */ (/** @type {unknown} */ (require('axios')));
const { AdminConfigModel: RawAdminConfigModel } = require('../models/adminConfigModel');
const AdminConfigModel = /** @type {{ findByPk(id: string): Promise<AdminConfigRecord | null>, create(values: Record<string, unknown>): Promise<AdminConfigRecord>, update(values: Record<string, unknown>, options?: Record<string, unknown>): Promise<any> }} */ (RawAdminConfigModel);
const connectorRegistry = /** @type {{ getConnector(platform: string): AdminConnectorImplementation }} */ (/** @type {unknown} */ (require('../connector/registry')));
const oauth = /** @type {{ getOAuthApp(info: OAuthInfo): any, checkAndRefreshAccessToken(oauthApp: any, user: AdminHandlerUser): Promise<AdminHandlerUser | null> }} */ (require('../lib/oauth'));
const { RingCentral: RawRingCentral } = require('../lib/ringcentral');
const RingCentral = /** @type {new (options: Record<string, unknown>) => RingCentralSdkLike} */ (/** @type {unknown} */ (RawRingCentral));
const { Connector: RawConnector } = require('../models/dynamo/connectorSchema');
const Connector = /** @type {{ getProxyConfig(proxyId: string): Promise<ProxyConfig | null> }} */ (/** @type {unknown} */ (RawConnector));
const logger = /** @type {{ error(message: string, context?: Record<string, unknown>): void }} */ (require('../lib/logger'));
const { handleDatabaseError: rawHandleDatabaseError } = require('../lib/errorHandler');
const handleDatabaseError = /** @type {(error: unknown, message: string) => any} */ (rawHandleDatabaseError);
const { getHashValue: rawGetHashValue } = require('../lib/util');
const getHashValue = /** @type {(value: string | number, key?: string) => string} */ (rawGetHashValue);

const CALL_AGGREGATION_GROUPS = ["Company", "CompanyNumbers", "Users", "Queues", "IVRs", "IVAs", "SharedLines", "UserGroups", "Sites", "Departments"]
const RC_EXTENSION_ENDPOINT = 'https://platform.ringcentral.com/restapi/v1.0/account/~/extension/~';

/**
 * @param {ValidateRcUserTokenParams} params
 * @returns {Promise<ValidateRcUserTokenResult>}
 */
async function validateRcUserToken({ rcAccessToken }) {
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

/**
 * @param {ValidateAdminRoleParams} params
 * @returns {Promise<ValidateAdminRoleResult>}
 */
async function validateAdminRole({ rcAccessToken }) {
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

/**
 * @param {UpsertAdminSettingsParams} params
 * @returns {Promise<void>}
 */
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

/**
 * @param {AdminSettingsParams} params
 * @returns {Promise<AdminConfigRecord | null>}
 */
async function getAdminSettings({ hashedRcAccountId }) {
    const existingAdminConfig = await AdminConfigModel.findByPk(hashedRcAccountId);
    return existingAdminConfig;
}

/**
 * @param {UpdateAdminRcTokensParams} params
 * @returns {Promise<void>}
 */
async function updateAdminRcTokens({ hashedRcAccountId, adminAccessToken, adminRefreshToken, adminTokenExpiry }) {
    const existingAdminConfig = await AdminConfigModel.findByPk(hashedRcAccountId);
    if (existingAdminConfig) {
        await existingAdminConfig.update({ adminAccessToken, adminRefreshToken, adminTokenExpiry });
    }
    else {
        await AdminConfigModel.create({
            id: hashedRcAccountId,
            adminAccessToken,
            adminRefreshToken,
            adminTokenExpiry
        });
    }
}

/**
 * @param {ServerLoggingSettingsParams} params
 * @returns {Promise<unknown>}
 */
async function getServerLoggingSettings({ user }) {
    const platformModule = connectorRegistry.getConnector(user.platform);
    if (platformModule.getServerLoggingSettings) {
        const serverLoggingSettings = await platformModule.getServerLoggingSettings({ user });
        return serverLoggingSettings;
    }
    return {};
}

/**
 * @param {UpdateServerLoggingSettingsParams} params
 * @returns {Promise<unknown>}
 */
async function updateServerLoggingSettings({ user, additionalFieldValues }) {
    const platformModule = connectorRegistry.getConnector(user.platform);
    const oauthApp = oauth.getOAuthApp((await platformModule.getOauthInfo({ tokenUrl: user?.platformAdditionalInfo?.tokenUrl, hostname: user?.hostname })));
    if (platformModule.updateServerLoggingSettings) {
        const { successful, returnMessage } = await platformModule.updateServerLoggingSettings({ user, additionalFieldValues, oauthApp });
        return { successful, returnMessage };
    }
    return {};
}

/**
 * @param {AdminReportParams} params
 * @returns {Promise<Record<string, unknown>>}
 */
async function getAdminReport({ rcAccountId, timezone, timeFrom, timeTo, groupBy }) {
    try {
        if (!process.env.RINGCENTRAL_SERVER || !process.env.RINGCENTRAL_CLIENT_ID || !process.env.RINGCENTRAL_CLIENT_SECRET) {
            return {
                callLogStats: {}
            };
        }
        const rcSDK = new RingCentral({
            server: process.env.RINGCENTRAL_SERVER,
            clientId: process.env.RINGCENTRAL_CLIENT_ID,
            clientSecret: process.env.RINGCENTRAL_CLIENT_SECRET,
            redirectUri: `${process.env.APP_SERVER}/ringcentral/oauth/callback`
        });
        const hashedRcAccountId = getHashValue(rcAccountId, process.env.HASH_KEY);
        let adminConfig = /** @type {any} */ (await AdminConfigModel.findByPk(hashedRcAccountId));
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
        /** @type {Record<string, unknown>[]} */
        var callLogStats = [];
        /** @type {string[]} */
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
        return {
            callLogStats: {}
        };
    }
}

/**
 * @param {UserReportParams} params
 * @returns {Promise<Record<string, unknown> | null>}
 */
async function getUserReport({ rcAccountId, rcExtensionId, timezone, timeFrom, timeTo }) {
    try {
        if (!process.env.RINGCENTRAL_SERVER || !process.env.RINGCENTRAL_CLIENT_ID || !process.env.RINGCENTRAL_CLIENT_SECRET) {
            return {
                callLogStats: {}
            };
        }
        const rcSDK = new RingCentral({
            server: process.env.RINGCENTRAL_SERVER,
            clientId: process.env.RINGCENTRAL_CLIENT_ID,
            clientSecret: process.env.RINGCENTRAL_CLIENT_SECRET,
            redirectUri: `${process.env.APP_SERVER}/ringcentral/oauth/callback`
        });
        const hashedRcAccountId = getHashValue(rcAccountId, process.env.HASH_KEY);
        let adminConfig = /** @type {any} */ (await AdminConfigModel.findByPk(hashedRcAccountId));
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

/**
 * @param {UserMappingParams} params
 * @returns {Promise<UserMappingResultItem[] | any>}
 */
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
                const refreshedUser = await oauth.checkAndRefreshAccessToken(oauthApp, user);
                if (!refreshedUser) {
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
                user = refreshedUser;
                authHeader = `Bearer ${user.accessToken}`;
                break;
            case 'apiKey':
                const basicAuth = platformModule.getBasicAuth({ apiKey: user.accessToken });
                authHeader = `Basic ${basicAuth}`;
                break;
        }
        const crmUserList = await platformModule.getUserList({ user, authHeader, proxyConfig });
        /** @type {UserMappingResultItem[]} */
        const userMappingResult = [];
        /** @type {Array<{ crmUserId: string, rcExtensionId: string[] }>} */
        const newUserMappings = [];
        for (const crmUser of crmUserList) {
            const existingMapping = adminConfig?.userMappings?.find(u => u.crmUserId == crmUser.id);
            /** @type {Array<string | number>} */
            let existingMappingRcExtensionIds = [];
            // TEMP: backward compatibility for string value
            if (existingMapping?.rcExtensionId) {
                if (typeof (existingMapping.rcExtensionId) === 'string') {
                    existingMappingRcExtensionIds = [existingMapping.rcExtensionId];
                }
                else {
                    existingMappingRcExtensionIds = /** @type {Array<string | number>} */ (existingMapping.rcExtensionId);
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
            /** @type {Array<{ crmUserId: string, rcExtensionId: string[] }>} */
            const initialUserMappings = [];
            for (const userMapping of userMappingResult) {
                const rcUser = /** @type {any} */ (userMapping.rcUser);
                if (rcUser?.extensionId) {
                    initialUserMappings.push({
                        crmUserId: userMapping.crmUser.id.toString(),
                        rcExtensionId: [rcUser.extensionId.toString()]
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
                adminConfig.userMappings = /** @type {any} */ (adminConfig.userMappings.map(u => ({
                    ...u,
                    rcExtensionId: Array.isArray(u.rcExtensionId) ? u.rcExtensionId : [u.rcExtensionId]
                })));
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

/**
 * @param {UserMappingParams} params
 * @returns {Promise<UserMappingResultItem[] | any>}
 */
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
            const refreshedUser = await oauth.checkAndRefreshAccessToken(oauthApp, user);
            if (!refreshedUser) {
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
            user = refreshedUser;
            authHeader = `Bearer ${user.accessToken}`;
            break;
        case 'apiKey':
            const basicAuth = platformModule.getBasicAuth({ apiKey: user.accessToken });
            authHeader = `Basic ${basicAuth}`;
            break;
    }

    const crmUserList = await platformModule.getUserList({ user, authHeader, proxyConfig });
    /** @type {UserMappingResultItem[]} */
    const userMappingResult = [];
    /** @type {Array<{ crmUserId: string, rcExtensionId: string[] }>} */
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
exports.updateAdminRcTokens = updateAdminRcTokens;
exports.getServerLoggingSettings = getServerLoggingSettings;
exports.updateServerLoggingSettings = updateServerLoggingSettings;
exports.getAdminReport = getAdminReport;
exports.getUserReport = getUserReport;
exports.getUserMapping = getUserMapping;
exports.reinitializeUserMapping = reinitializeUserMapping;

export {};
