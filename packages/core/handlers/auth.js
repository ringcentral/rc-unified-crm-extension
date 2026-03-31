const oauth = require('../lib/oauth');
const { UserModel } = require('../models/userModel');
const connectorRegistry = require('../connector/registry');
const Op = require('sequelize').Op;
const { RingCentral } = require('../lib/ringcentral');
const adminCore = require('./admin');
const { Connector } = require('../models/dynamo/connectorSchema');
const { handleDatabaseError } = require('../lib/errorHandler');
const sharedAuthCore = require('./sharedAuth');

async function onOAuthCallback({ platform, hostname, tokenUrl, query, hashedRcExtensionId, isFromMCP = false }) {
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
    const oauthInfo = await platformModule.getOauthInfo({ tokenUrl, hostname, rcAccountId: query.rcAccountId, proxyId, proxyConfig, userEmail, isFromMCP });
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
    const { accessToken, refreshToken, expires, data } = await oauthApp.code.getToken(callbackUri, overridingOAuthOption);
    const authHeader = `Bearer ${accessToken}`;
    const { successful, platformUserInfo, returnMessage } = await platformModule.getUserInfo({ authHeader, tokenUrl, apiUrl, hostname, platform, username, callbackUri, query, proxyId, proxyConfig, userEmail, data });

    if (successful) {
        let userInfo = null;
        try {
            userInfo = await saveUserInfo({
                platformUserInfo,
                platform,
                tokenUrl,
                apiUrl,
                username,
                hostname: platformUserInfo?.overridingHostname ? platformUserInfo.overridingHostname : hostname,
                accessToken,
                refreshToken,
                tokenExpiry: isNaN(expires) ? null : expires,
                rcAccountId: query?.rcAccountId,
                hashedRcExtensionId,
                proxyId
            });
        }
        catch (error) {
            return handleDatabaseError(error, 'Error saving user info');
        }
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

async function onApiKeyLogin({ platform, hostname, apiKey, proxyId, rcAccountId, rcExtensionId, connectorId, isPrivate, hashedRcExtensionId, additionalInfo }) {
    const platformModule = connectorRegistry.getConnector(platform);
    const {
        resolvedAdditionalInfo,
        resolvedApiKey,
        missingRequiredFieldConsts,
        submittedSharedValues
    } = await sharedAuthCore.resolveApiKeyLoginFields({
        platform,
        rcAccountId,
        rcExtensionId,
        connectorId,
        isPrivate,
        apiKey,
        additionalInfo
    });
    if (missingRequiredFieldConsts.length > 0) {
        return {
            userInfo: null,
            returnMessage: {
                messageType: 'warning',
                message: 'Missing required authentication fields.',
                ttl: 3000,
                missingRequiredFieldConsts
            }
        };
    }
    const basicAuth = platformModule.getBasicAuth({ apiKey: resolvedApiKey });
    const { successful, platformUserInfo, returnMessage } = await platformModule.getUserInfo({
        authHeader: `Basic ${basicAuth}`,
        hostname,
        platform,
        additionalInfo: resolvedAdditionalInfo,
        apiKey: resolvedApiKey,
        proxyId
    });
    if (successful) {
        let userInfo = null;
        try {
            userInfo = await saveUserInfo({
                platformUserInfo,
                platform,
                hostname,
                proxyId,
                hashedRcExtensionId,
                rcAccountId,
                accessToken: platformUserInfo.overridingApiKey ?? resolvedApiKey
            });
        }
        catch (error) {
            return handleDatabaseError(error, 'Error saving user info');
        }
        await sharedAuthCore.persistSubmittedSharedValues({
            platform,
            rcAccountId,
            rcExtensionId,
            rcUserName: platformUserInfo?.name,
            submittedSharedValues
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

async function saveUserInfo({ platformUserInfo, platform, hostname, accessToken, refreshToken, tokenExpiry, rcAccountId, hashedRcExtensionId, proxyId }) {
    const id = platformUserInfo.id;
    const name = platformUserInfo.name;
    const existingUser = await UserModel.findByPk(id);
    const timezoneName = platformUserInfo.timezoneName;
    const timezoneOffset = platformUserInfo.timezoneOffset;
    const platformAdditionalInfo = platformUserInfo.platformAdditionalInfo || {};
    platformAdditionalInfo.proxyId = proxyId;
    if (existingUser) {
        try {
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
                    hashedRcExtensionId,
                    platformAdditionalInfo: {
                        ...existingUser.platformAdditionalInfo, // keep existing platformAdditionalInfo
                        ...platformAdditionalInfo,
                    }
                }
            );
        }
        catch (error) {
            return handleDatabaseError(error, 'Error saving user info');
        }
    }
    else {
        try {
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
                hashedRcExtensionId,
                platformAdditionalInfo,
                userSettings: {}
            });
        }
        catch (error) {
            return handleDatabaseError(error, 'Error saving user info');
        }
    }
    return {
        id,
        name
    };
}

async function getLicenseStatus({ userId, platform }) {
    const user = await UserModel.findByPk(userId);
    if (!user) {
        return {
            isLicenseValid: false,
            licenseStatus: 'Invalid (User not found)',
            licenseStatusDescription: ''
        }
    }
    const platformModule = connectorRegistry.getConnector(platform);
    const licenseStatus = await platformModule.getLicenseStatus({ userId, platform, user });
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
