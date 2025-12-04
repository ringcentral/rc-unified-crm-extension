const axios = require('axios');
const { AdminConfigModel } = require('../models/adminConfigModel');
const connectorRegistry = require('../connector/registry');
const oauth = require('../lib/oauth');
const { RingCentral } = require('../lib/ringcentral');
const { Connector } = require('../models/dynamo/connectorSchema');

const CALL_AGGREGATION_GROUPS = ["Company", "CompanyNumbers", "Users", "Queues", "IVRs", "IVAs", "SharedLines", "UserGroups", "Sites", "Departments"]

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
        let adminConfig = await AdminConfigModel.findByPk(rcAccountId);
        const isTokenExpired = adminConfig.adminTokenExpiry < new Date();
        if (isTokenExpired) {
            const { access_token, refresh_token, expire_time } = await rcSDK.refreshToken({
                refresh_token: adminConfig.adminRefreshToken,
                expires_in: adminConfig.adminTokenExpiry,
                refresh_token_expires_in: adminConfig.adminTokenExpiry
            });
            adminConfig = await AdminConfigModel.update({ adminAccessToken: access_token, adminRefreshToken: refresh_token, adminTokenExpiry: expire_time }, { where: { id: rcAccountId } });
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
            if(!record?.info?.name){
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
        console.error(error);
        return {
            callLogStats: {}
        };
    }
}

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
        let adminConfig = await AdminConfigModel.findByPk(rcAccountId);
        const isTokenExpired = adminConfig.adminTokenExpiry < new Date();
        if (isTokenExpired) {
            const { access_token, refresh_token, expire_time } = await rcSDK.refreshToken({
                refresh_token: adminConfig.adminRefreshToken,
                expires_in: adminConfig.adminTokenExpiry,
                refresh_token_expires_in: adminConfig.adminTokenExpiry
            });
            adminConfig = await AdminConfigModel.update({ adminAccessToken: access_token, adminRefreshToken: refresh_token, adminTokenExpiry: expire_time }, { where: { id: rcAccountId } });
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
        console.error(error);
        return null;
    }
}

async function getUserMapping({ user, hashedRcAccountId, rcExtensionList }) {
    const adminConfig = await getAdminSettings({ hashedRcAccountId });
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
                await upsertAdminSettings({
                    hashedRcAccountId,
                    adminSettings: {
                        userMappings: [...adminConfig.userMappings, ...newUserMappings]
                    }
                });
            }
            else {
                await upsertAdminSettings({
                    hashedRcAccountId,
                    adminSettings: {
                        userMappings: [...newUserMappings]
                    }
                });
            }
        }
        return userMappingResult;
    }
    return [];
}

exports.validateAdminRole = validateAdminRole;
exports.upsertAdminSettings = upsertAdminSettings;
exports.getAdminSettings = getAdminSettings;
exports.updateAdminRcTokens = updateAdminRcTokens;
exports.getServerLoggingSettings = getServerLoggingSettings;
exports.updateServerLoggingSettings = updateServerLoggingSettings;
exports.getAdminReport = getAdminReport;
exports.getUserReport = getUserReport;
exports.getUserMapping = getUserMapping;