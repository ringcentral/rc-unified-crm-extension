import axios from 'axios';
import config from '../config.json';
import { showNotification } from '../lib/util';
import { trackCrmLogin, trackCrmLogout } from '../lib/analytics';

async function submitPlatformSelection(platform) {
    await chrome.storage.local.set({
        ['platform-info']: platform
    })
}

// apiUrl: Insightly
// username, password: Redtail
async function apiKeyLogin({ apiKey, apiUrl, username, password }) {
    try {
        const platformInfo = await chrome.storage.local.get('platform-info');
        const platformName = platformInfo['platform-info'].platformName;
        const hostname = platformInfo['platform-info'].hostname;
        const res = await axios.post(`${config.serverUrl}/apiKeyLogin?state=platform=${platformName}`, {
            apiKey: apiKey ?? 'apiKey',
            platform: platformName,
            hostname,
            additionalInfo: {
                apiUrl,
                username,
                password
            }
        });
        setAuth(true);
        showNotification({ level: 'success', message: 'Successfully authorized.', ttl: 3000 });
        await chrome.storage.local.set({
            ['rcUnifiedCrmExtJwt']: res.data.jwtToken
        });
        const crmUserInfo = { name: res.data.name };
        await chrome.storage.local.set({ crmUserInfo });
        setAuth(true, crmUserInfo.name);
        trackCrmLogin();
        document.querySelector("#rc-widget-adapter-frame").contentWindow.postMessage({
            type: 'rc-adapter-navigate-to',
            path: 'goBack',
        }, '*');
        return res.data.jwtToken;
    }
    catch (e) {
        console.log(e);
        showNotification({ level: 'warning', message: 'Failed to register api key.', ttl: 3000 });
    }
}

async function onAuthCallback(callbackUri) {
    const platformInfo = await chrome.storage.local.get('platform-info');
    const hostname = platformInfo['platform-info'].hostname;
    let oauthCallbackUrl = '';
    // Unique: Bullhorn
    if (platformInfo['platform-info'].platformName === 'bullhorn') {
        const { crm_extension_bullhorn_user_urls } = await chrome.storage.local.get({ crm_extension_bullhorn_user_urls: null });
        const { crm_extension_bullhornUsername } = await chrome.storage.local.get({ crm_extension_bullhornUsername: null });
        oauthCallbackUrl = `${config.serverUrl}/oauth-callback?callbackUri=${callbackUri}&hostname=${hostname}&tokenUrl=${crm_extension_bullhorn_user_urls.oauthUrl}/token&apiUrl=${crm_extension_bullhorn_user_urls.restUrl}&username=${crm_extension_bullhornUsername}`;
    }
    else {
        oauthCallbackUrl = `${config.serverUrl}/oauth-callback?callbackUri=${callbackUri}&hostname=${hostname}`;
    }
    const res = await axios.get(oauthCallbackUrl);
    const crmUserInfo = { name: res.data.name };
    await chrome.storage.local.set({ crmUserInfo });
    setAuth(true, crmUserInfo.name);
    showNotification({ level: 'success', message: 'Successfully authorized.', ttl: 3000 });
    await chrome.storage.local.set({
        ['rcUnifiedCrmExtJwt']: res.data.jwtToken
    });
    trackCrmLogin();
    return res.data.jwtToken;
}

async function unAuthorize({ platformName, rcUnifiedCrmExtJwt }) {
    try {
        await axios.post(`${config.serverUrl}/unAuthorize?jwtToken=${rcUnifiedCrmExtJwt}`);
        // Unique: Bullhorn
        if (platformName === 'bullhorn') {
            await chrome.storage.local.remove('crm_extension_bullhornUsername');
            await chrome.storage.local.remove('crm_extension_bullhorn_user_urls');
        }
        trackCrmLogout()
    }
    catch (e) {
        console.log(e);
    }
    await chrome.storage.local.remove('rcUnifiedCrmExtJwt');
    setAuth(false);
}

async function checkAuth() {
    const { rcUnifiedCrmExtJwt } = await chrome.storage.local.get('rcUnifiedCrmExtJwt');
    // get crm user info
    const { crmUserInfo } = (await chrome.storage.local.get({ crmUserInfo: null }));
    setAuth(!!rcUnifiedCrmExtJwt, crmUserInfo?.name);
    return !!rcUnifiedCrmExtJwt;
}

function setAuth(auth, accountName) {
    document.querySelector("#rc-widget-adapter-frame").contentWindow.postMessage({
        type: 'rc-adapter-update-authorization-status',
        authorized: auth,
        authorizedAccount: accountName ?? ''
    });
}

exports.submitPlatformSelection = submitPlatformSelection;
exports.apiKeyLogin = apiKeyLogin;
exports.onAuthCallback = onAuthCallback;
exports.unAuthorize = unAuthorize;
exports.checkAuth = checkAuth;
exports.setAuth = setAuth;