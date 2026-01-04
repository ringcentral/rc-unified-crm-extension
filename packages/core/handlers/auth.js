const oauth = require('../lib/oauth');
const { UserModel } = require('../models/userModel');
const connectorRegistry = require('../connector/registry');
const Op = require('sequelize').Op;
const { RingCentral } = require('../lib/ringcentral');
const adminCore = require('./admin');
const { Connector } = require('../models/dynamo/connectorSchema');

async function onOAuthCallback({ platform, hostname, tokenUrl, query }) {
    const callbackUri = query.callbackUri;
    const apiUrl = query.apiUrl;
    const username = query.username;
    const proxyId = query.proxyId;
    const userEmail = query.userEmail;
    const platformModule = connectorRegistry.getConnector(platform);
    let proxyConfig = null;
    if (proxyId) {
        proxyConfig = await Connector.getProxyConfig(proxyId);
    }
    const oauthInfo = await platformModule.getOauthInfo({ tokenUrl, hostname, rcAccountId: query.rcAccountId, proxyId, proxyConfig, userEmail });

    if (oauthInfo.failMessage) {
        return {
            userInfo: null,
            returnMessage: {
                messageType: 'danger',
                message: oauthInfo.failMessage
            }
        }
    }

    // Some platforms require different oauth queries, this won't affect normal OAuth process unless CRM module implements getOverridingOAuthOption() method
    let overridingOAuthOption = null;
    if (platformModule.getOverridingOAuthOption != null) {
        const code = new URL(callbackUri).searchParams.get('code');
        overridingOAuthOption = platformModule.getOverridingOAuthOption({ code });
    }
    const oauthApp = oauth.getOAuthApp(oauthInfo);
    const { accessToken, refreshToken, expires } = await oauthApp.code.getToken(callbackUri, overridingOAuthOption);
    const authHeader = `Bearer ${accessToken}`;
    const { successful, platformUserInfo, returnMessage } = await platformModule.getUserInfo({ authHeader, tokenUrl, apiUrl, hostname, platform, username, callbackUri, query, proxyId, proxyConfig, userEmail });

    if (successful) {
        let userInfo = await saveUserInfo({
            platformUserInfo,
            platform,
            tokenUrl,
            apiUrl,
            username,
            hostname: platformUserInfo?.overridingHostname ? platformUserInfo.overridingHostname : hostname,
            accessToken,
            refreshToken,
            tokenExpiry: expires,
            rcAccountId: query.rcAccountId,
            proxyId
        });
        if (platformModule.postSaveUserInfo) {
            userInfo = await platformModule.postSaveUserInfo({ userInfo, oauthApp });
        }
        return {
            userInfo,
            returnMessage
        };
    }
    else {
        return {
            userInfo: null,
            returnMessage
        }
    }
}

async function onApiKeyLogin({ platform, hostname, apiKey, proxyId, additionalInfo }) {
    const platformModule = connectorRegistry.getConnector(platform);
    const basicAuth = platformModule.getBasicAuth({ apiKey });
    const { successful, platformUserInfo, returnMessage } = await platformModule.getUserInfo({ authHeader: `Basic ${basicAuth}`, hostname, platform, additionalInfo, apiKey, proxyId });
    if (successful) {
        let userInfo = await saveUserInfo({
            platformUserInfo,
            platform,
            hostname,
            proxyId,
            accessToken: platformUserInfo.overridingApiKey ?? apiKey
        });
        if (platformModule.postSaveUserInfo) {
            userInfo = await platformModule.postSaveUserInfo({ userInfo });
        }
        return {
            userInfo,
            returnMessage
        };
    }
    else {
        return {
            userInfo: null,
            returnMessage
        }
    }
}

async function saveUserInfo({ platformUserInfo, platform, hostname, accessToken, refreshToken, tokenExpiry, rcAccountId, proxyId }) {
    const id = platformUserInfo.id;
    const name = platformUserInfo.name;
    const existingUser = await UserModel.findByPk(id);
    const timezoneName = platformUserInfo.timezoneName;
    const timezoneOffset = platformUserInfo.timezoneOffset;
    const platformAdditionalInfo = platformUserInfo.platformAdditionalInfo || {};
    platformAdditionalInfo.proxyId = proxyId;
    if (existingUser) {
        await existingUser.update(
            {
                platform,
                hostname,
                timezoneName,
                timezoneOffset,
                accessToken,
                refreshToken,
                tokenExpiry,
                rcAccountId,
                platformAdditionalInfo: {
                    ...existingUser.platformAdditionalInfo, // keep existing platformAdditionalInfo
                    ...platformAdditionalInfo,
                }
            }
        );
    }
    else {
        // TEMP: replace user with old ID
        if (id.endsWith(`-${platform}`)) {
            const oldID = id.split('-');
            const userWithOldID = await UserModel.findByPk(oldID[0]);
            if (userWithOldID) {
                await UserModel.create({
                    id,
                    hostname,
                    timezoneName,
                    timezoneOffset,
                    platform,
                    accessToken,
                    refreshToken,
                    tokenExpiry,
                    rcAccountId,
                    platformAdditionalInfo,
                    userSettings: userWithOldID.userSettings
                });
                await userWithOldID.destroy();
            }
            else {
                await UserModel.create({
                    id,
                    hostname,
                    timezoneName,
                    timezoneOffset,
                    platform,
                    accessToken,
                    refreshToken,
                    tokenExpiry,
                    rcAccountId,
                    platformAdditionalInfo,
                    userSettings: {}
                });
            }
        }
        else {
            await UserModel.create({
                id,
                hostname,
                timezoneName,
                timezoneOffset,
                platform,
                accessToken,
                refreshToken,
                tokenExpiry,
                rcAccountId,
                platformAdditionalInfo,
                userSettings: {}
            });
        }
    }
    return {
        id,
        name
    };
}

async function getLicenseStatus({ userId, platform }) {
    const platformModule = connectorRegistry.getConnector(platform);
    const licenseStatus = await platformModule.getLicenseStatus({ userId, platform });
    return licenseStatus;
}

// Just for oauth ATM
async function authValidation({ platform, userId }) {
    let existingUser = await UserModel.findOne({
        where: {
            [Op.and]: [
                {
                    id: userId,
                    platform
                }
            ]
        }
    });
    if (existingUser) {
        const platformModule = connectorRegistry.getConnector(platform);
        const proxyId = existingUser?.platformAdditionalInfo?.proxyId;
        const oauthApp = oauth.getOAuthApp((await platformModule.getOauthInfo({ tokenUrl: existingUser?.platformAdditionalInfo?.tokenUrl, hostname: existingUser?.hostname, proxyId })));
        existingUser = await oauth.checkAndRefreshAccessToken(oauthApp, existingUser);
        const { successful, returnMessage, status } = await platformModule.authValidation({ user: existingUser });
        return {
            successful,
            returnMessage,
            status,
            failReason: successful ? '' : 'CRM. API failed'
        }
    }
    else {
        return {
            successful: false,
            status: 404,
            failReason: 'App Connect. User not found in database'
        }
    }
}

// Ringcentral
async function onRingcentralOAuthCallback({ code, rcAccountId }) {
    if (!process.env.RINGCENTRAL_SERVER || !process.env.RINGCENTRAL_CLIENT_ID || !process.env.RINGCENTRAL_CLIENT_SECRET) {
        return;
    }
    const rcSDK = new RingCentral({
        server: process.env.RINGCENTRAL_SERVER,
        clientId: process.env.RINGCENTRAL_CLIENT_ID,
        clientSecret: process.env.RINGCENTRAL_CLIENT_SECRET,
        redirectUri: `${process.env.APP_SERVER}/ringcentral/oauth/callback`
    });
    const { access_token, refresh_token, expire_time } = await rcSDK.generateToken({ code });
    await adminCore.updateAdminRcTokens({
        hashedRcAccountId: rcAccountId,
        adminAccessToken: access_token,
        adminRefreshToken: refresh_token,
        adminTokenExpiry: expire_time
    });
}

exports.onOAuthCallback = onOAuthCallback;
exports.onApiKeyLogin = onApiKeyLogin;
exports.authValidation = authValidation;
exports.getLicenseStatus = getLicenseStatus;
exports.onRingcentralOAuthCallback = onRingcentralOAuthCallback;