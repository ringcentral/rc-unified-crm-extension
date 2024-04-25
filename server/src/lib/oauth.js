const ClientOAuth2 = require('client-oauth2');
const axios = require('axios');

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


async function checkAndRefreshAccessToken(oauthApp, user) {
    const dateNow = new Date();
    if (user && user.accessToken && user.refreshToken && user.tokenExpiry < dateNow) {
        if (user.platform === 'bullhorn') {
            await bullhornTokenRefresh(oauthApp, user);
        }
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

async function bullhornTokenRefresh(oauthApp, user) {
    const refreshUrl = `${oauthApp.options.accessTokenUri}?grant_type=refresh_token&refresh_token=${user.refreshToken}&client_id=${oauthApp.options.clientId}&client_secret=${oauthApp.options.clientSecret}`;
    const refreshResponse = await axios.post(refreshUrl);
    user.accessToken = refreshResponse.data.access_token;
    user.refreshToken = refreshResponse.data.refresh_token;
    const date = new Date();
    user.tokenExpiry = date.setSeconds(date.getSeconds() + refreshResponse.data.expires_in);
    await user.save();
    return user;
}

exports.checkAndRefreshAccessToken = checkAndRefreshAccessToken;
exports.bullhornTokenRefresh = bullhornTokenRefresh;
exports.getOAuthApp = getOAuthApp;