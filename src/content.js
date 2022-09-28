console.log('import content js to web page');

window.clickToDialInject = new window.RingCentralC2D();
window.clickToDialInject.on(
  window.RingCentralC2D.events.call,
  function(phoneNumber) {
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
  function(phoneNumber) {
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
  function(request, sender, sendResponse) {
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
