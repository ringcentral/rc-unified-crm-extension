const oauth = require('../lib/oauth');
const { UserModel } = require('../models/userModel');
const adapterRegistry = require('../adapter/registry');
const Op = require('sequelize').Op;

async function onOAuthCallback({ platform, hostname, tokenUrl, callbackUri, apiUrl, username, query }) {
    const platformModule = adapterRegistry.getAdapter(platform);
    const oauthInfo = await platformModule.getOauthInfo({ tokenUrl, hostname, rcAccountId: query.rcAccountId });

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
        overridingOAuthOption = platformModule.getOverridingOAuthOption({ code: callbackUri.split('code=')[1] });
    }
    const oauthApp = oauth.getOAuthApp(oauthInfo);
    const { accessToken, refreshToken, expires } = await oauthApp.code.getToken(callbackUri, overridingOAuthOption);
    const authHeader = `Bearer ${accessToken}`;
    const { successful, platformUserInfo, returnMessage } = await platformModule.getUserInfo({ authHeader, tokenUrl, apiUrl, hostname, username, callbackUri, query });
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
            rcAccountId: query.rcAccountId
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

async function onApiKeyLogin({ platform, hostname, apiKey, additionalInfo }) {
    const platformModule = adapterRegistry.getAdapter(platform);
    const basicAuth = platformModule.getBasicAuth({ apiKey });
    const { successful, platformUserInfo, returnMessage } = await platformModule.getUserInfo({ authHeader: `Basic ${basicAuth}`, hostname, additionalInfo, apiKey });
    if (successful) {
        let userInfo = await saveUserInfo({
            platformUserInfo,
            platform,
            hostname,
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

async function saveUserInfo({ platformUserInfo, platform, hostname, accessToken, refreshToken, tokenExpiry, rcAccountId }) {
    const id = platformUserInfo.id;
    const name = platformUserInfo.name;
    const existingUser = await UserModel.findByPk(id);
    const timezoneName = platformUserInfo.timezoneName;
    const timezoneOffset = platformUserInfo.timezoneOffset;
    const platformAdditionalInfo = platformUserInfo.platformAdditionalInfo;
    if (existingUser) {
        await existingUser.update(
            {
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
    const platformModule = adapterRegistry.getAdapter(platform);
    const licenseStatus = await platformModule.getLicenseStatus({ userId });
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
        const platformModule = adapterRegistry.getAdapter(platform);
        const oauthApp = oauth.getOAuthApp((await platformModule.getOauthInfo({ tokenUrl: existingUser?.platformAdditionalInfo?.tokenUrl, hostname: existingUser?.hostname })));
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

exports.onOAuthCallback = onOAuthCallback;
exports.onApiKeyLogin = onApiKeyLogin;
exports.authValidation = authValidation;
exports.getLicenseStatus = getLicenseStatus;