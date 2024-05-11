const { isObjectEmpty } = require('./lib/util');
const baseConfig = require('./config.json');
const packageJson = require('../package.json');

let config;
let pipedriveInstallationTabId;
let pipedriveCallbackUri;
let cachedClickToXRequest;

async function openPopupWindow() {
  console.log('open popup');
  const { popupWindowId } = await chrome.storage.local.get('popupWindowId');
  if (popupWindowId) {
    try {
      await chrome.windows.update(popupWindowId, { focused: true });
      return true;
    } catch (e) {
      // ignore
    }
  }
  // const redirectUri = chrome.identity.getRedirectURL('redirect.html'); //  set this when oauth with chrome.identity.launchWebAuthFlow
  const popupUri = `popup.html?multipleTabsSupport=1&disableLoginPopup=1&appServer=https://platform.ringcentral.com&redirectUri=https://ringcentral.github.io/ringcentral-embeddable/redirect.html&enableAnalytics=1&showSignUpButton=1&clientId=3rJq9BxcTCm-I7CFcY19ew&appVersion=${packageJson.version}&userAgent=RingCentral CRM Extension&disableNoiseReduction=false`;
  const popup = await chrome.windows.create({
    url: popupUri,
    type: 'popup',
    width: 315,
    height: 566,
  });
  await chrome.storage.local.set({
    popupWindowId: popup.id,
  });
  try {
    const { customCrmConfigUrl } = await chrome.storage.local.get({ customCrmConfigUrl: baseConfig.defaultCrmConfigUrl });
    const customCrmConfigJson = await (await fetch(customCrmConfigUrl)).json();
    if (customCrmConfigJson) {
      await chrome.storage.local.set({ customCrmConfig: customCrmConfigJson });
    }
  }
  catch (e) {
    // ignore
  }
  return false;
}

async function registerPlatform(tabUrl) {
  const url = new URL(tabUrl);
  let hostname = url.hostname;
  const { customCrmConfig } = await chrome.storage.local.get({ customCrmConfig: null });
  if (!!customCrmConfig) {
    config = customCrmConfig;
  }
  let platformName = '';
  const platforms = Object.keys(config.platforms);
  for (const p of platforms) {
    // identify crm website
    const urlRegex = new RegExp(config.platforms[p].urlIdentifier.replace('*', '.*'));
    if (urlRegex.test(url.href)) {
      platformName = p;
      break;
    }
  }
  if (platformName === '') {
    // Unique: Pipedrive
    if ((hostname.includes('ngrok') || hostname.includes('labs.ringcentral')) && url.pathname === '/pipedrive-redirect') {
      platformName = 'pipedrive';
      hostname = 'temp';
      chrome.tabs.sendMessage(tab.id, { action: 'needCallbackUri' })
    }
    else {
      return false;
    }
  }
  await chrome.storage.local.set({
    ['platform-info']: { platformName, hostname }
  });
  return true;
}

chrome.action.onClicked.addListener(async function (tab) {
  const platformInfo = await chrome.storage.local.get('platform-info');
  if (isObjectEmpty(platformInfo)) {
    const registered = await registerPlatform(tab.url);
    if (registered) {
      openPopupWindow();
    }
    else {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: '/images/logo32.png',
        title: `Please open the extension from a CRM page`,
        message: "For first time setup, please open it from a CRM page. RingCentral CRM Extension requires initial setup and match to your CRM platform.",
        priority: 1
      });
    }
  }
  else {
    openPopupWindow();
  }
});

chrome.windows.onRemoved.addListener(async (windowId) => {
  const { popupWindowId } = await chrome.storage.local.get('popupWindowId');
  if (popupWindowId === windowId) {
    console.log('close popup');
    await chrome.storage.local.remove('popupWindowId');
  }
});

chrome.alarms.onAlarm.addListener(async () => {
  const { loginWindowInfo } = await chrome.storage.local.get('loginWindowInfo');
  if (!loginWindowInfo) {
    return;
  }
  const tabs = await chrome.tabs.query({ windowId: loginWindowInfo.id });
  if (tabs.length === 0) {
    return;
  }
  const loginWindowUrl = tabs[0].url
  console.log('loginWindowUrl', loginWindowUrl);
  if (loginWindowUrl.indexOf(config.redirectUri) !== 0) {
    chrome.alarms.create('oauthCheck', { when: Date.now() + 3000 });
    return;
  }
  console.log('login success', loginWindowUrl);
  chrome.runtime.sendMessage({
    type: 'oauthCallBack',
    platform: loginWindowInfo.platform,
    callbackUri: loginWindowUrl
  });
  await chrome.windows.remove(loginWindowInfo.id);
  await chrome.storage.local.remove('loginWindowInfo');
});

chrome.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
  console.log(sender.tab ?
    "from a content script:" + sender.tab.url :
    "from the extension");
  if (request.type === "openPopupWindow") {
    registerPlatform(sender.tab.url);
    await openPopupWindow();
    if (request.navigationPath) {
      chrome.runtime.sendMessage({
        type: 'navigate',
        path: request.navigationPath
      })
    }
    sendResponse({ result: 'ok' });
    return;
  }
  // Unique: Pipedrive
  if (request.type === "openPopupWindowOnPipedriveDirectPage") {
    await openPopupWindow();
    chrome.tabs.sendMessage(sender.tab.id, { action: 'needCallbackUri' })
    pipedriveInstallationTabId = sender.tab.id;
    await chrome.storage.local.set({
      ['platform-info']: { platformName: request.platform, hostname: request.hostname }
    });
    sendResponse({ result: 'ok' });
    return;
  }
  // Unique: Pipedrive
  if (request.type === "popupWindowRequestPipedriveCallbackUri") {
    chrome.runtime.sendMessage({
      type: 'pipedriveCallbackUri',
      pipedriveCallbackUri
    });
  }
  // Unique: Pipedrive
  if (request.type === 'pipedriveAltAuthDone') {
    chrome.tabs.sendMessage(pipedriveInstallationTabId, { action: 'pipedriveAltAuthDone' });
    console.log('pipedriveAltAuthDone')
    sendResponse({ result: 'ok' });
    return;
  }
  if (request.type === 'openRCOAuthWindow' && request.oAuthUri) {
    const loginWindow = await chrome.windows.create({
      url: request.oAuthUri,
      type: 'popup',
      width: 600,
      height: 600,
    });
    await chrome.storage.local.set({
      loginWindowInfo: {
        platform: 'rc',
        id: loginWindow.id
      }
    });
    chrome.alarms.create('oauthCheck', { when: Date.now() + 3000 });
    sendResponse({ result: 'ok' });
    return;
  }
  if (request.type === 'openThirdPartyAuthWindow' && request.oAuthUri) {
    const loginWindow = await chrome.windows.create({
      url: request.oAuthUri,
      type: 'popup',
      width: 600,
      height: 600,
    });
    await chrome.storage.local.set({
      loginWindowInfo: {
        platform: 'thirdParty',
        id: loginWindow.id
      }
    });
    chrome.alarms.create('oauthCheck', { when: Date.now() + 3000 });
    sendResponse({ result: 'ok' });
    return;
  }
  if (request.type === 'c2d' || request.type === 'c2sms') {
    const isPopupExist = await openPopupWindow();
    if (!isPopupExist) {
      cachedClickToXRequest = {
        type: request.type,
        phoneNumber: request.phoneNumber,
      }
    }
  }
  if (request.type === 'checkForClickToXCache') {
    sendResponse(cachedClickToXRequest);
    cachedClickToXRequest = null;
  }
  // Unique: Pipedrive
  if (request.type === 'pipedriveCallbackUri') {
    pipedriveCallbackUri = request.callbackUri;
    console.log('pipedrive callback uri: ', request.callbackUri);

    chrome.runtime.sendMessage({
      type: 'pipedriveCallbackUri',
      pipedriveCallbackUri
    });
  }
  if (request.type === 'notifyToReconnectCRM') {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: '/images/logo32.png',
      title: `Please re-login with your CRM account`,
      message: "There might be a change to your CRM login, please go to setting page and Logout then Connect your CRM account again. Sorry for the inconvenience.",
      priority: 1
    });
  }
});