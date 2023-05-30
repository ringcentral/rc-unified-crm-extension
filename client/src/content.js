import LibPhoneNumberMatcher from './lib/LibPhoneNumberMatcher'
import RangeObserver from './lib/RangeObserver'

console.log('import content js to web page');

async function initializeC2D() {
  const countryCode = await chrome.storage.local.get(
    { selectedRegion: 'US' }
  );

  window.clickToDialInject = new window.RingCentralC2D({
    observer: new RangeObserver({
      matcher: new LibPhoneNumberMatcher({
        countryCode: countryCode.selectedRegion
      })
    })
  });

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
}
initializeC2D();

// Listen message from background.js to open app window when user click icon.
chrome.runtime.onMessage.addListener(
  function (request, sender, sendResponse) {
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
    if (request.action === 'needCallbackUri') {
      chrome.runtime.sendMessage({
        type: 'pipedriveCallbackUri',
        callbackUri: window.location.href
      });
    }
    if (request.action === 'pipedriveAltAuthDone') {

      console.log('pipedriveAltAuthDone')
      const rcStepper = window.document.querySelector('#rc-stepper');
      rcStepper.innerHTML = '(3/3) Setup finished. You can close this page now.';
    }
    sendResponse('ok');
  }
);

if (!window.location.hostname.includes('ringcentral')) {
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
  quickAccessImage.style = 'width: 30px;';
  window.document.body.appendChild(quickAccessButtonDiv);
  quickAccessButtonDiv.appendChild(quickAccessButton);
  quickAccessButton.appendChild(quickAccessImage);
}

if (window.location.pathname === '/pipedrive-redirect') {
  chrome.runtime.sendMessage({ type: "openPopupWindowOnPipedriveDirectPage", platform: 'pipedrive', hostname: 'temp' });
  const rcStepper = window.document.querySelector('#rc-stepper');
  rcStepper.innerHTML = '(2/3) Please sign in on the extension with your RingCentral account.';
}