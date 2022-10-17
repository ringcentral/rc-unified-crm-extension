import axios from 'axios';
import config from '../config.json';

async function onAuthCallback(callbackUri) {
    const { rcUserNumber } = await chrome.storage.local.get('rcUserNumber');
    const res = await axios.get(`${config.serverUrl}/oauth-callback?callbackUri=${callbackUri}&rcUserNumber=${rcUserNumber}`);
    setAuth(true);
    await chrome.storage.local.set({
        ['rcUnifiedCrmExtJwt']: res.data
    });
}

async function unAuthorize(rcUnifiedCrmExtJwt) {
    try {
        await axios.post(`${config.serverUrl}/unAuthorize?jwtToken=${rcUnifiedCrmExtJwt}`);
        await chrome.storage.local.remove('rcUnifiedCrmExtJwt');
        setAuth(false);
    }
    catch (e) {
        console.log(e);
    }
}

async function checkAuth() {
    const { rcUnifiedCrmExtJwt } = await chrome.storage.local.get('rcUnifiedCrmExtJwt');
    setAuth(!!rcUnifiedCrmExtJwt);
}

function setAuth(auth) {
    document.querySelector("#rc-widget-adapter-frame").contentWindow.postMessage({
        type: 'rc-adapter-update-authorization-status',
        authorized: auth
    });
}

exports.onAuthCallback = onAuthCallback;
exports.unAuthorize = unAuthorize;
exports.checkAuth = checkAuth;