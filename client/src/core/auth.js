import axios from 'axios';
import config from '../config.json';
import { showNotification } from '../lib/util';
import { trackCrmLogin, trackCrmLogout } from '../lib/analytics'

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
        const { rcUserInfo } = await chrome.storage.local.get('rcUserInfo');
        const rcUserNumber = rcUserInfo.rcUserNumber;
        const res = await axios.post(`${config.serverUrl}/apiKeyLogin?state=platform=${platformName}`, {
            apiKey,
            platform: platformName,
            hostname,
            rcUserNumber,
            additionalInfo: {
                apiUrl,
                username,
                password
            }
        });
        setAuth(true);
        showNotification({ level: 'success', message: 'Successfully authorized.', ttl: 3000 });
        await chrome.storage.local.set({
            ['rcUnifiedCrmExtJwt']: res.data
        });
        trackCrmLogin({ rcAccountId: rcUserInfo.rcAccountId });
        showCRMLoginStatusDot();
        removeWarningDots();
    }
    catch (e) {
        console.log(e);
        showNotification({ level: 'warning', message: 'Failed to register api key.', ttl: 3000 });
    }
}

async function onAuthCallback(callbackUri) {
    const { rcUserInfo } = await chrome.storage.local.get('rcUserInfo');
    const rcUserNumber = rcUserInfo.rcUserNumber;
    const platformInfo = await chrome.storage.local.get('platform-info');
    const hostname = platformInfo['platform-info'].hostname;
    let oauthCallbackUrl = '';
    if (platformInfo['platform-info'].platformName === 'bullhorn') {
        const { crm_extension_bullhorn_user_urls } = await chrome.storage.local.get({ crm_extension_bullhorn_user_urls: null });
        const { crm_extension_bullhornUsername } = await chrome.storage.local.get({ crm_extension_bullhornUsername: null });
        oauthCallbackUrl = `${config.serverUrl}/oauth-callback?callbackUri=${callbackUri}&rcUserNumber=${rcUserNumber}&hostname=${hostname}&tokenUrl=${crm_extension_bullhorn_user_urls.oauthUrl}/token&apiUrl=${crm_extension_bullhorn_user_urls.restUrl}&username=${crm_extension_bullhornUsername}`;
    }
    else {
        oauthCallbackUrl = `${config.serverUrl}/oauth-callback?callbackUri=${callbackUri}&rcUserNumber=${rcUserNumber}&hostname=${hostname}`;
    }
    const res = await axios.get(oauthCallbackUrl);
    setAuth(true);
    showNotification({ level: 'success', message: 'Successfully authorized.', ttl: 3000 });
    await chrome.storage.local.set({
        ['rcUnifiedCrmExtJwt']: res.data
    });
    trackCrmLogin({ rcAccountId: rcUserInfo.rcAccountId });
    showCRMLoginStatusDot();
    removeWarningDots();
}

async function unAuthorize(rcUnifiedCrmExtJwt) {
    try {
        await axios.post(`${config.serverUrl}/unAuthorize?jwtToken=${rcUnifiedCrmExtJwt}`);
        const { rcUserInfo } = await chrome.storage.local.get('rcUserInfo');
        trackCrmLogout({ rcAccountId: rcUserInfo.rcAccountId })
        removeOnlineDot();
    }
    catch (e) {
        console.log(e);
    }
    await chrome.storage.local.remove('rcUnifiedCrmExtJwt');
    setAuth(false);
}

async function checkAuth() {
    const { rcUnifiedCrmExtJwt } = await chrome.storage.local.get('rcUnifiedCrmExtJwt');
    setAuth(!!rcUnifiedCrmExtJwt);

    if (!rcUnifiedCrmExtJwt) {
        showCRMLoginWarning();
    }
    return !!rcUnifiedCrmExtJwt;
}

function setAuth(auth) {
    document.querySelector("#rc-widget-adapter-frame").contentWindow.postMessage({
        type: 'rc-adapter-update-authorization-status',
        authorized: auth
    });
}

// Red dot at the corner of settings button
function showCRMLoginWarning() {
    const targetDoc = document.querySelector("#rc-widget-adapter-frame").contentWindow.document
    const moreMenuButton = targetDoc.querySelector('.NavigationBar_root').children[4];
    if (!moreMenuButton.querySelector('#crmLoginWarning')) {
        const warningDot = targetDoc.createElement('div');
        warningDot.style = "position: absolute;  background: #ff3f3f;  width: 16px;  height: 16px;  right: 7px;top: 3px;font-size: 14px;border-radius: 50%;z-index: 1;"
        warningDot.innerHTML = "1";
        warningDot.id = "crmLoginWarning";
        moreMenuButton.appendChild(warningDot);
        moreMenuButton.addEventListener("click", addSettingsWarningDot)
    }
}

async function addSettingsWarningDot() {
    const targetDoc = document.querySelector("#rc-widget-adapter-frame").contentWindow.document
    await delay(100);
    const settingButton = targetDoc.querySelector('[title="Settings"]');
    if (settingButton && !(await checkAuth())) {
        const settingsWarningDot = targetDoc.createElement('div');
        settingsWarningDot.style = "position: absolute;background: rgb(255, 63, 63);width: 14px;height: 14px;left: 35px;top: 3px;font-size: 12px;border-radius: 50%;z-index: 1;"
        settingsWarningDot.id = "crmLoginSettingsWarning";
        settingButton.appendChild(settingsWarningDot);
    }
}

function removeWarningDots() {
    const targetDoc = document.querySelector("#rc-widget-adapter-frame").contentWindow.document
    targetDoc.querySelector('#crmLoginWarning')?.remove();
    targetDoc.querySelector('#crmLoginSettingsWarning')?.remove();
    targetDoc.querySelector('#crmAuthButtonWarningDot')?.remove();
    const moreMenuButton = targetDoc.querySelector('.NavigationBar_root').children[4];
    moreMenuButton.removeEventListener("click", addSettingsWarningDot)
}

function removeOnlineDot() {
    const targetDoc = document.querySelector("#rc-widget-adapter-frame").contentWindow.document
    targetDoc.querySelector('#crmLoginOnlineDot')?.remove();
}

async function showCRMLoginStatusDot() {
    const isLoggedIn = await checkAuth();
    const targetDoc = document.querySelector("#rc-widget-adapter-frame").contentWindow.document;
    if (isLoggedIn) {
        const crmOnlineDot = targetDoc.createElement('div');
        crmOnlineDot.style = "position: absolute;background: #52b940;width: 16px;height: 16px;left: 78px;top: 21px;border-radius: 50%;"
        crmOnlineDot.id = "crmLoginOnlineDot";
        const crmRow = targetDoc.querySelector('.AuthorizeSettingsSection_accountWrapper');
        crmRow.appendChild(crmOnlineDot);
    }
    else {
        const authorizeButton = targetDoc.querySelector('.Button_root.AuthorizeSettingsSection_authorizaButton');
        const warningDot = targetDoc.createElement('div');
        warningDot.style = "position: absolute;  background: #ff3f3f;  width: 16px;  height: 16px;  right: 16px;top: 8px;font-size: 14px;border-radius: 50%;z-index: 1;"
        warningDot.id = "crmAuthButtonWarningDot";
        authorizeButton.appendChild(warningDot);
    }
}

const delay = ms => new Promise(res => setTimeout(res, ms));

exports.submitPlatformSelection = submitPlatformSelection;
exports.apiKeyLogin = apiKeyLogin;
exports.onAuthCallback = onAuthCallback;
exports.unAuthorize = unAuthorize;
exports.checkAuth = checkAuth;
exports.setAuth = setAuth;
exports.showCRMLoginStatusDot = showCRMLoginStatusDot;