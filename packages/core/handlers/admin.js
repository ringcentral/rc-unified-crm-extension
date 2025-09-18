const axios = require('axios');
const { AdminConfigModel } = require('../models/adminConfigModel');
const adapterRegistry = require('../adapter/registry');
const oauth = require('../lib/oauth');
const { RingCentral } = require('../lib/ringcentral');

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

async function getAdminReport({ rcAccountId, timezone, timeFrom, timeTo }) {
    try{
    const rcSDK = new RingCentral({
        server: process.env.RINGCENTRAL_SERVER,
        clientId: process.env.RINGCENTRAL_CLIENT_ID,
        clientSecret: process.env.RINGCENTRAL_CLIENT_SECRET,
        redirectUri: `${process.env.APP_SERVER}/ringcentral/oauth/callback`
    });
    const adminConfig = await AdminConfigModel.findByPk(rcAccountId);
    const isTokenExpired = adminConfig.adminTokenExpiry < new Date();
    if (isTokenExpired) {
        const { access_token, refresh_token, expire_time } = await rcSDK.refreshToken({
            refresh_token: adminConfig.adminRefreshToken,
            expires_in: adminConfig.adminTokenExpiry,
            refresh_token_expires_in: adminConfig.adminTokenExpiry
        });
        await AdminConfigModel.update({ adminAccessToken: access_token, adminRefreshToken: refresh_token, adminTokenExpiry: expire_time }, { where: { id: rcAccountId } });
    }
    const callsAggregationData = await rcSDK.getCallsAggregationData({
        token: { access_token: adminConfig.adminAccessToken, token_type: 'Bearer' },
        timezone,
        timeFrom,
        timeTo
    });
    var dataCounter = callsAggregationData.data.records[0].counters;
    var inboundCallCount = dataCounter.callsByDirection.values.inbound;
    var outboundCallCount = dataCounter.callsByDirection.values.outbound;
    var answeredCallCount = dataCounter.callsByResponse.values.answered;
    // keep 2 decimal places
    var answeredCallPercentage = `${((answeredCallCount / inboundCallCount) * 100).toFixed(2)}%`;

    var dataTimer = callsAggregationData.data.records[0].timers;
    // keep 2 decimal places
    var totalTalkTime = (dataTimer.allCalls.values / 60).toFixed(2);
    // keep 2 decimal places
    var averageTalkTime = (totalTalkTime / (inboundCallCount + outboundCallCount)).toFixed(2);
    return {
        callLogStats: {
            inboundCallCount,
            outboundCallCount,
            answeredCallCount,
            answeredCallPercentage,
            totalTalkTime,
            averageTalkTime
        }
    };
    } catch (error) {
        console.error(error);
        return {
            callLogStats: {}
        };
    }
}

exports.validateAdminRole = validateAdminRole;
exports.upsertAdminSettings = upsertAdminSettings;
exports.getAdminSettings = getAdminSettings;
exports.updateAdminRcTokens = updateAdminRcTokens;
exports.getServerLoggingSettings = getServerLoggingSettings;
exports.updateServerLoggingSettings = updateServerLoggingSettings;
exports.getAdminReport = getAdminReport;