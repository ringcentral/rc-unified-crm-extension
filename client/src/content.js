console.log('import content js to web page');

window.clickToDialInject = new window.RingCentralC2D();
window.clickToDialInject.on(
  window.RingCentralC2D.events.call,
  function (phoneNumber) {
    console.log('Click To Dial:', phoneNumber);
    // alert('Click To Dial:' + phoneNumber);
    chrome.runtime.sendMessage({
      type: 'c2d',
      phoneNumber,
    });
  },
);
window.clickToDialInject.on(
  window.RingCentralC2D.events.text,
  function (phoneNumber) {
    console.log('Click To SMS:', phoneNumber);
    // alert('Click To SMS:' + phoneNumber);
    chrome.runtime.sendMessage({
      type: 'c2sms',
      phoneNumber,
    });
  },
);

// Listen message from background.js to open app window when user click icon.
chrome.runtime.onMessage.addListener(
  function (request, sender, sendResponse) {
    console.log(request);
    if (request.action === 'openAppWindow') {
      console.log('opening window');
      // set app window minimized to false
      window.postMessage({
        type: 'rc-adapter-syncMinimized',
        minimized: false,
      }, '*');
      //sync to widget
      document.querySelector("#rc-widget-adapter-frame").contentWindow.postMessage({
        type: 'rc-adapter-syncMinimized',
        minimized: false,
      }, '*');
    }
    sendResponse('ok');
  }
);

// Inject quick access button on crm pages to call out extension window
const quickAccessButtonDiv = window.document.createElement('div');
quickAccessButtonDiv.id = 'rc-unified-extension-quick-access';
quickAccessButtonDiv.style = 'position: fixed;right: 0px;bottom: 50px;z-index: 99999;box-shadow: 0px 0px 5px 1px rgb(0 0 0 / 18%);';
const quickAccessButton = window.document.createElement('button');
quickAccessButton.onclick = () => {
  chrome.runtime.sendMessage({ type: "openPopupWindow" });
};
quickAccessButton.style = 'cursor: pointer; border-width: 0; padding: 3px;';
const quickAccessImage = window.document.createElement('img');
quickAccessImage.src = 'https://lh3.googleusercontent.com/pErf1dGSKiF5v8bjGdnymK7mcUtAkK7KFqyBVhnz_3Y5SAo3-I0BC6pf_u4TsnrDsl4WWW2yyU5r1u8i5Ux5uEZodg=w128-h128-e365-rj-sc0x00ffffff';
quickAccessImage.style = 'width: 20px;';
window.document.body.appendChild(quickAccessButtonDiv);
quickAccessButtonDiv.appendChild(quickAccessButton);
quickAccessButton.appendChild(quickAccessImage);
