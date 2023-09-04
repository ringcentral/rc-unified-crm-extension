import LibPhoneNumberMatcher from './lib/LibPhoneNumberMatcher'
import RangeObserver from './lib/RangeObserver'
import App from './components/embedded';
import React from 'react';
import ReactDOM from 'react-dom';
import { RcThemeProvider } from '@ringcentral/juno';

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

function Root() {
  return (
    <RcThemeProvider>
      <App />
    </RcThemeProvider>
  );
}

async function RenderQuickAccessButton() {
  if (!window.location.hostname.includes('ringcentral.')) {
    const rootElement = window.document.createElement('root');
    rootElement.id = 'rc-crm-extension-quick-access-button';
    window.document.body.appendChild(rootElement);
    ReactDOM.render(<Root />, rootElement);
  }
}

const delay = ms => new Promise(res => setTimeout(res, ms));

async function Initialize() {
  if (window.location.hostname.includes('pipedrive.com')) {
    const { c2dDelay } = await chrome.storage.local.get(
      { c2dDelay: '3' }
    );
    const delayInMilliSec = Number(c2dDelay) * 1000;
    await delay(delayInMilliSec);
  }
  await RenderQuickAccessButton();
  await initializeC2D();
}

Initialize();

if (window.location.pathname === '/pipedrive-redirect') {
  chrome.runtime.sendMessage({ type: "openPopupWindowOnPipedriveDirectPage", platform: 'pipedrive', hostname: 'temp' });
  const rcStepper = window.document.querySelector('#rc-stepper');
  rcStepper.innerHTML = '(2/3) Please sign in on the extension with your RingCentral account.';
}

if (document.readyState !== 'loading') {
  registerInsightlyApiKey();
} else {
  document.addEventListener('DOMContentLoaded', function () {
    registerInsightlyApiKey();
  });
}

function registerInsightlyApiKey() {
  if (window.location.pathname === '/Users/UserSettings' && window.location.hostname.includes('insightly.com')) {
    const insightlyApiKey = document.querySelector('#apikey').innerHTML;
    const insightlyApiUrl = document.querySelector('#apiUrl').firstChild.innerHTML;
    chrome.runtime.sendMessage({
      type: 'insightlyAuth',
      apiKey: insightlyApiKey,
      apiUrl: insightlyApiUrl
    });
  }
}