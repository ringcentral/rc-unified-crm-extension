/* eslint-disable no-param-reassign */
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
    const tokenExpiry = new Date(user.tokenExpiry);
    const expiryBuffer = 1000 * 60 * 2; // 2 minutes => 120000ms
    // Unique: Bullhorn
    if (user && user.accessToken && user.refreshToken && user.platform === 'bullhorn') {
        try {
            const pingResponse = await axios.get(`${user.platformAdditionalInfo.restUrl}/ping`, {
                headers: {
                    'BhRestToken': user.platformAdditionalInfo.bhRestToken,
                },
            });
            // Session expired
            if (new Date(pingResponse.data.sessionExpires - expiryBuffer) < new Date()) {
                user = await bullhornTokenRefresh(user, dateNow, tokenLockTimeout, oauthApp);
            }
            // Session not expired
            else {
                return user;
            }
        }
        catch (e) {
            // Session expired
            user = await bullhornTokenRefresh(user, dateNow, tokenLockTimeout, oauthApp);
        }
        await user.save();
        return user;
    }

    // Other CRMs
    if (user && user.accessToken && user.refreshToken && tokenExpiry.getTime() < (dateNow.getTime() + expiryBuffer)) {
        // case: use dynamoDB to manage token refresh lock
        if (process.env.USE_TOKEN_REFRESH_LOCK === 'true') {
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

async function bullhornPasswordAuthorize(user, oauthApp, serverLoggingSettings) {
    // use password to get code
    console.log('authorize bullhorn by password')
    const authUrl = user.platformAdditionalInfo.tokenUrl.replace('/token', '/authorize');
    const codeResponse = await axios.get(authUrl, {
        params: {
            client_id: process.env.BULLHORN_CLIENT_ID,
            username: serverLoggingSettings.apiUsername,
            password: serverLoggingSettings.apiPassword,
            response_type: 'code',
            action: 'Login',
            redirect_uri: process.env.BULLHORN_REDIRECT_URI,
        },
        maxRedirects: 0,
        validateStatus: status => status === 302,
    });
    const redirectLocation = codeResponse.headers['location'];
    if (!redirectLocation) {
        throw new Error('Authorize failure, missing location');
    }
    const codeUrl = new URL(redirectLocation);
    const code = codeUrl.searchParams.get('code');
    if (!code) {
        throw new Error('Authorize failure, missing code');
    }
    const overridingOAuthOption = {
        headers: {
            Authorization: ''
        },
        query: {
            grant_type: 'authorization_code',
            code,
            client_id: process.env.BULLHORN_CLIENT_ID,
            client_secret: process.env.BULLHORN_CLIENT_SECRET,
            redirect_uri: process.env.BULLHORN_REDIRECT_URI,
        }
    };
    const { accessToken, refreshToken, expires } = await oauthApp.code.getToken(redirectLocation, overridingOAuthOption);
    console.log('authorize bullhorn user by password successfully.')
    return {
        access_token: accessToken,
        refresh_token: refreshToken,
        expires_in: expires,
    };
}

async function bullhornTokenRefresh(user, dateNow, tokenLockTimeout, oauthApp) {
    let newLock;
    try {
        if (process.env.USE_TOKEN_REFRESH_LOCK === 'true') {
            let lock = await Lock.get({ userId: user.id });
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
        }
        console.log('Bullhorn token refreshing...')
        let authData;
        try {
            const refreshTokenResponse = await axios.post(`${user.platformAdditionalInfo.tokenUrl}?grant_type=refresh_token&refresh_token=${user.refreshToken}&client_id=${process.env.BULLHORN_CLIENT_ID}&client_secret=${process.env.BULLHORN_CLIENT_SECRET}`);
            authData = refreshTokenResponse.data;
        } catch (e) {
            const platformModule = require(`../adapters/${user.platform}`);
            const serverLoggingSettings = await platformModule.getServerLoggingSettings({ user });
            if (serverLoggingSettings.apiUsername && serverLoggingSettings.apiPassword) {
                authData = await bullhornPasswordAuthorize(user, oauthApp, serverLoggingSettings);
            } else {
                throw e;
            }
        }
        const { access_token: accessToken, refresh_token: refreshToken, expires_in: expires } = authData;
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
        user.tokenExpiry = date.setSeconds(date.getSeconds() + expires);
        console.log('Bullhorn token refreshing finished')
        if (newLock) {
            await newLock.delete();
        }
    }
    catch (e) {
        if (newLock) {
            await newLock.delete();
        }
        // do not log error message, it will expose password
        console.error('Bullhorn token refreshing failed');
    }
    return user;
}

exports.checkAndRefreshAccessToken = checkAndRefreshAccessToken;
exports.getOAuthApp = getOAuthApp;