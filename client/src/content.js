import LibPhoneNumberMatcher from './lib/LibPhoneNumberMatcher'
import RangeObserver from './lib/RangeObserver'
import App from './components/embedded';
import React from 'react';
import ReactDOM from 'react-dom';
import { RcThemeProvider } from '@ringcentral/juno';
import axios from 'axios';

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
    let { c2dDelay } = await chrome.storage.local.get(
      { c2dDelay: '3' }
    );
    if(!!!c2dDelay)
    {
      c2dDelay = 3;
    }
    const delayInMilliSec = Number(c2dDelay) * 1000;
    await delay(delayInMilliSec);
  }
  const { crm_extension_bullhornUsername } = await chrome.storage.local.get({ crm_extension_bullhornUsername: null });
  if (window.location.hostname.includes('bullhornstaffing.com') && !crm_extension_bullhornUsername) {
    const decodedCookie = decodeURIComponent(window.document.cookie);
    const bullhornUsername = decodedCookie.split('"username":"')[1].split('","masterUserId')[0];
    await chrome.storage.local.set({ crm_extension_bullhornUsername: bullhornUsername });
    const { data: crm_extension_bullhorn_user_urls } = await axios.get(`https://rest.bullhornstaffing.com/rest-services/loginInfo?username=${bullhornUsername}`);
    await chrome.storage.local.set({ crm_extension_bullhorn_user_urls });
  }
  await RenderQuickAccessButton();
  await initializeC2D();
}

Initialize();

if (window.location.pathname === '/pipedrive-redirect') {
  chrome.runtime.sendMessage({ type: "openPopupWindowOnPipedriveDirectPage", platform: 'pipedrive', hostname: 'temp' });
  const rcStepper = window.document.querySelector('#rc-stepper');
  rcStepper.innerHTML = '(2/3) Please sign in on the extension with your RingCentral account. If nothing happens, please try refreshing this page and wait for a few seconds.';
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