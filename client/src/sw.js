const { isObjectEmpty } = require('./lib/util');
const config = require('./config.json');
const packageJson = require('../package.json');

let pipedriveInstallationTabId;
let pipedriveCallbackUri;
async function openPopupWindow() {
  console.log('open popup');
  const { popupWindowId } = await chrome.storage.local.get('popupWindowId');
  if (popupWindowId) {
    try {
      await chrome.windows.update(popupWindowId, { focused: true });
      return;
    } catch (e) {
      // ignore
    }
  }
  // const redirectUri = chrome.identity.getRedirectURL('redirect.html'); //  set this when oauth with chrome.identity.launchWebAuthFlow
  const popupUri = `popup.html?multipleTabsSupport=1&disableLoginPopup=1&appServer=${config.rcServer}&redirectUri=${config.redirectUri}&enableAnalytics=1&showSignUpButton=1&clientId=${config.clientId}&appVersion=${packageJson.version}`;
  const popup = await chrome.windows.create({
    url: popupUri,
    type: 'popup',
    width: 315,
    height: 566,
  });
  await chrome.storage.local.set({
    popupWindowId: popup.id,
  });
}

async function registerPlatform(tabUrl) {
  const url = new URL(tabUrl);
  let platformName = '';
  let hostname = url.hostname;
  if (hostname.includes('pipedrive')) {
    platformName = 'pipedrive';
  }
  else if (hostname.includes('insightly')) {
    platformName = 'insightly';
  }
  else if (hostname.includes('clio')) {
    platformName = 'clio';
  }
  else if (hostname.includes('redtailtechnology')) {
    platformName = 'redtail';
  }
  else if ((hostname.includes('ngrok') || hostname.includes('labs.ringcentral')) && url.pathname === '/pipedrive-redirect') {
    platformName = 'pipedrive';
    hostname = 'temp';
    chrome.tabs.sendMessage(tab.id, { action: 'needCallbackUri' })
  }
  else {
    return false;
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
    else{
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
    sendResponse({ result: 'ok' });
    return;
  }
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
  if (request.type === "popupWindowRequestPipedriveCallbackUri") {
    chrome.runtime.sendMessage({
      type: 'pipedriveCallbackUri',
      pipedriveCallbackUri
    });
  }
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
    await openPopupWindow();
  }
  if (request.type === 'pipedriveCallbackUri') {
    pipedriveCallbackUri = request.callbackUri;
    console.log('pipedrive callback uri: ', request.callbackUri)
  }
});