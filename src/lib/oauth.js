const ClientOAuth2 = require('client-oauth2');
const axios = require('axios');
const { Lock } = require('../models/dynamo/lockSchema');
const { UserModel } = require('../models/userModel');

// oauthApp strategy is default to 'code' which use credentials to get accessCode, then exchange for accessToken and refreshToken.
// To change to other strategies, please refer to: https://github.com/mulesoft-labs/js-client-oauth2
function getOAuthApp({ clientId, clientSecret, accessTokenUri, authorizationUri, redirectUri, scopes }) {
    return new ClientOAuth2({
        clientId: clientId,
        clientSecret: clientSecret,
        accessTokenUri: accessTokenUri,
        authorizationUri: authorizationUri,
        redirectUri: redirectUri,
        scopes: scopes
    });
}


async function checkAndRefreshAccessToken(oauthApp, user, tokenLockTimeout = 10) {
    const dateNow = new Date();
    if (user && user.accessToken && user.refreshToken && user.tokenExpiry < dateNow) {
        // case: use dynamoDB to manage token refresh lock
        if (process.env.USE_TOKEN_REFRESH_LOCK === 'true') {
            let lock = await Lock.get({ userId: user.id });
            let newLock;
            if (!!lock?.ttl && lock.ttl < dateNow.getTime()) {
                await lock.delete();
                lock = null;
            }
            if (!!lock) {
                let processTime = 0;
                while (!!lock && processTime < tokenLockTimeout) {
                    await new Promise(resolve => setTimeout(resolve, 2000));    // wait for 2 seconds
                    processTime += 2;
                    lock = await Lock.get({ userId: user.id });
                }
                // Timeout -> let users try another time
                if (processTime >= tokenLockTimeout) {
                    throw new Error('Token lock timeout');
                }
                user = await UserModel.findByPk(user.id);
            }
            else {
                newLock = await Lock.create({
                    userId: user.id
                });
            }
            // Unique: Bullhorn
            if (user.platform === 'bullhorn') {
                await bullhornTokenRefresh(user);
            }
            else {
                const token = oauthApp.createToken(user.accessToken, user.refreshToken);
                const { accessToken, refreshToken, expires } = await token.refresh();
                user.accessToken = accessToken;
                user.refreshToken = refreshToken;
                user.tokenExpiry = expires;
            }
            await user.save();
            if (!!newLock) {
                await newLock.delete();
            }
        }
        // case: run withou token refresh lock
        else {
            // Unique: Bullhorn
            if (user.platform === 'bullhorn') {
                user = await bullhornTokenRefresh(user);
            }
            else {
                const token = oauthApp.createToken(user.accessToken, user.refreshToken);
                const { accessToken, refreshToken, expires } = await token.refresh();
                user.accessToken = accessToken;
                user.refreshToken = refreshToken;
                user.tokenExpiry = expires;
            }
            await user.save();
        }

    }
    return user;
}

async function bullhornTokenRefresh(user) {
    const refreshTokenResponse = await axios.post(`${user.platformAdditionalInfo.tokenUrl}?grant_type=refresh_token&refresh_token=${user.refreshToken}&client_id=${process.env.BULLHORN_CLIENT_ID}&client_secret=${process.env.BULLHORN_CLIENT_SECRET}`);
    const { access_token: accessToken, refresh_token: refreshToken } = refreshTokenResponse.data;
    user.accessToken = accessToken;
    user.refreshToken = refreshToken;
    const userLoginResponse = await axios.post(`${user.platformAdditionalInfo.loginUrl}/login?version=2.0&access_token=${user.accessToken}`);
    const { BhRestToken, restUrl } = userLoginResponse.data;
    let updatedPlatformAdditionalInfo = user.platformAdditionalInfo;
    updatedPlatformAdditionalInfo.bhRestToken = BhRestToken;
    updatedPlatformAdditionalInfo.restUrl = restUrl;
    // Not sure why, assigning platformAdditionalInfo first then give it another value so that it can be saved to db
    user.platformAdditionalInfo = {};
    user.platformAdditionalInfo = updatedPlatformAdditionalInfo;
    const date = new Date();
    user.tokenExpiry = date.setSeconds(date.getSeconds() + refreshTokenResponse.data.expires_in);
    return user;
}

exports.checkAndRefreshAccessToken = checkAndRefreshAccessToken;
exports.getOAuthApp = getOAuthApp;