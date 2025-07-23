/* eslint-disable no-param-reassign */
const ClientOAuth2 = require('client-oauth2');
const { UserModel } = require('../models/userModel');
const adapterRegistry = require('../adapter/registry');

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
    const tokenExpiry = new Date(user.tokenExpiry);
    const expiryBuffer = 1000 * 60 * 2; // 2 minutes => 120000ms
    // Special case: Bullhorn
    if (user.platform) {
        const platformModule = adapterRegistry.getAdapter(user.platform);
        if (platformModule.checkAndRefreshAccessToken) {
            return platformModule.checkAndRefreshAccessToken(oauthApp, user, tokenLockTimeout);
        }
    }
    // Other CRMs
    if (user && user.accessToken && user.refreshToken && tokenExpiry.getTime() < (dateNow.getTime() + expiryBuffer)) {
        // case: use dynamoDB to manage token refresh lock
        if (user.platform?.useTokenRefreshLock) {
            const { Lock } = require('../models/dynamo/lockSchema');
            let lock = await Lock.get({ userId: user.id });
            let newLock;
            if (!!lock?.ttl && lock.ttl < dateNow.getTime()) {
                await lock.delete();
                lock = null;
            }
            if (lock) {
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
            const token = oauthApp.createToken(user.accessToken, user.refreshToken);
            const { accessToken, refreshToken, expires } = await token.refresh();
            user.accessToken = accessToken;
            user.refreshToken = refreshToken;
            user.tokenExpiry = expires;
            await user.save();
            if (newLock) {
                await newLock.delete();
            }
        }
        // case: run withou token refresh lock
        else {
            const token = oauthApp.createToken(user.accessToken, user.refreshToken);
            const { accessToken, refreshToken, expires } = await token.refresh();
            user.accessToken = accessToken;
            user.refreshToken = refreshToken;
            user.tokenExpiry = expires;
            await user.save();
        }

    }
    return user;
}

exports.checkAndRefreshAccessToken = checkAndRefreshAccessToken;
exports.getOAuthApp = getOAuthApp;