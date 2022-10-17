const apiConfig = {
  clientId: '',
  server: 'https://platform.ringcentral.com',
  redirectUri: 'https://ringcentral.github.io/ringcentral-embeddable/redirect.html',
}
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
  const redirectUri = apiConfig.redirectUri;
  let popupUri = `popup.html?multipleTabsSupport=1&disableLoginPopup=1&appServer=${apiConfig.server}&redirectUri=${redirectUri}`;
  if (apiConfig.clientId.length > 0) {
    popupUri = `${popupUri}&clientId=${apiConfig.clientId}`;
  }
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

chrome.action.onClicked.addListener(function (tab) {
  openPopupWindow();
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
  if (loginWindowUrl.indexOf(apiConfig.redirectUri) !== 0) {
    chrome.alarms.create('oauthCheck', { when: Date.now() + 3000 });
    return;
  }
  console.log('login success', loginWindowUrl);
  chrome.runtime.sendMessage({
    type: 'oauthCallBack',
    platform: loginWindowInfo.platform,
    callbackUri: loginWindowUrl,
  });
  await chrome.windows.remove(loginWindowInfo.id);
  await chrome.storage.local.remove('loginWindowInfo');
});

chrome.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
  console.log(sender.tab ?
    "from a content script:" + sender.tab.url :
    "from the extension");
  if (request.type === "openPopupWindow") {
    openPopupWindow();
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
    openPopupWindow();
  }
});
