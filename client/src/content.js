import LibPhoneNumberMatcher from './lib/LibPhoneNumberMatcher'
import RangeObserver from './lib/RangeObserver'
import RingCentralC2DWidget from './lib/RingCentralC2DWidget'
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
    widget: new RingCentralC2DWidget({
      logoIcon: 'data:image/png;base64,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OJaQQBIiZNRQRgUWorRrpJhI0XnMwz/k+JPkkslVBiPHAqpQITl+8D/4PVuzMDXpJgVjQODFtj9Gge5doFm37e9j226eAP5n4Epr+6sNYPaT9HpbixwBoW3g4rqtyXvA5Q4w8KRLhuRIflpCoQC8n9E35YD+W6B3zZ1b6xynD0CGZrV8AxwcAmNFyl73eHdP59z+7WnN7wdSEHKarN+qWAAADRhpVFh0WE1MOmNvbS5hZG9iZS54bXAAAAAAADw/eHBhY2tldCBiZWdpbj0i77u/IiBpZD0iVzVNME1wQ2VoaUh6cmVTek5UY3prYzlkIj8+Cjx4OnhtcG1ldGEgeG1sbnM6eD0iYWRvYmU6bnM6bWV0YS8iIHg6eG1wdGs9IlhNUCBDb3JlIDQuNC4wLUV4aXYyIj4KIDxyZGY6UkRGIHhtbG5zOnJkZj0iaHR0cDovL3d3dy53My5vcmcvMTk5OS8wMi8yMi1yZGYtc3ludGF4LW5zIyI+CiAgPHJkZjpEZXNjcmlwdGlvbiByZGY6YWJvdXQ9IiIKICAgIHhtbG5zOnhtcE1NPSJodHRwOi8vbnMuYWRvYmUuY29tL3hhcC8xLjAvbW0vIgogICAgeG1sbnM6c3RFdnQ9Imh0dHA6Ly9ucy5hZG9iZS5jb20veGFwLzEuMC9zVHlwZS9SZXNvdXJjZUV2ZW50IyIKICAgIHhtbG5zOmRjPSJodHRwOi8vcHVybC5vcmcvZGMvZWxlbWVudHMvMS4xLyIKICAgIHhtbG5zOkdJTVA9Imh0dHA6Ly93d3cuZ2ltcC5vcmcveG1wLyIKICAgIHhtbG5zOnRpZmY9Imh0dHA6Ly9ucy5hZG9iZS5jb20vdGlmZi8xLjAvIgogICAgeG1sbnM6eG1wPSJodHRwOi8vbnMuYWRvYmUuY29tL3hhcC8xLjAvIgogICB4bXBNTTpEb2N1bWVudElEPSJnaW1wOmRvY2lkOmdpbXA6ZDM5M2JiNWYtZGMxZS00NzhhLWIwNDgtNjdlNDgzMzhmOWQ4IgogICB4bXBNTTpJbnN0YW5jZUlEPSJ4bXAuaWlkOjIzNDMyZWFiLWRmNTUtNDk5MC1iYTJjLTJhZGE3NjA5YjVhOCIKICAgeG1wTU06T3JpZ2luYWxEb2N1bWVudElEPSJ4bXAuZGlkOmY1NTBiN2UyLWM0ZWYtNDMxOC04NGIwLWQxZmQzYmI2ZTI5ZSIKICAgZGM6Rm9ybWF0PSJpbWFnZS9wbmciCiAgIEdJTVA6QVBJPSIyLjAiCiAgIEdJTVA6UGxhdGZvcm09IldpbmRvd3MiCiAgIEdJTVA6VGltZVN0YW1wPSIxNzA1Mjk2Mzg4OTQ1MjI0IgogICBHSU1QOlZlcnNpb249IjIuMTAuMjQiCiAgIHRpZmY6T3JpZW50YXRpb249IjEiCiAgIHhtcDpDcmVhdG9yVG9vbD0iR0lNUCAyLjEwIj4KICAgPHhtcE1NOkhpc3Rvcnk+CiAgICA8cmRmOlNlcT4KICAgICA8cmRmOmxpCiAgICAgIHN0RXZ0OmFjdGlvbj0ic2F2ZWQiCiAgICAgIHN0RXZ0OmNoYW5nZWQ9Ii8iCiAgICAgIHN0RXZ0Omluc3RhbmNlSUQ9InhtcC5paWQ6MDFjYzE0YzMtNmNmMC00MjEwLWEyM2QtOWE2MThiYjdjOTQ0IgogICAgICBzdEV2dDpzb2Z0d2FyZUFnZW50PSJHaW1wIDIuMTAgKFdpbmRvd3MpIgogICAgICBzdEV2dDp3aGVuPSIyMDI0LTAxLTE1VDEzOjI2OjI4Ii8+CiAgICA8L3JkZjpTZXE+CiAgIDwveG1wTU06SGlzdG9yeT4KICA8L3JkZjpEZXNjcmlwdGlvbj4KIDwvcmRmOlJERj4KPC94OnhtcG1ldGE+CiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAKPD94cGFja2V0IGVuZD0idyI/PiqGG40AAAAGYktHRADHAMcAxzOWWGIAAAAJcEhZcwAALiMAAC4jAXilP3YAAAAHdElNRQfoAQ8FGhzxJ27WAAAAGXRFWHRDb21tZW50AENyZWF0ZWQgd2l0aCBHSU1QV4EOFwAAAsRJREFUWMPt109oXFUUBvDfnTeZmkmrKCq1tJIKtaAWTMRCF2LbRcGdGze60pUrwY2WWRWEgYqC0IULqQqiICgIImqhVEQX0lpDhFgRSTehrVGcpDV/JjPzXLxJOpn3ZjIzjSvzweNxz7vv3u9859xz3mML/3eEfibHJffiebyAvbiM93E6lF37TwnEJUW8hpeQb3lUw9sohbIbt0wgLgliQxhGbm1e8DA+wu6Mda7gWbFJxE1bQ7CAWiiv2XoicAQn8UgLgdW5hS7OVFs2TwgwgVfwfScS+QzbSTw+QDizyB3C63gSK70SGE+bojYxOqGBervxURQx1yuBaN1o+2HuO8i2kQ1yNqa6yNWLzJ9tJZLrxj7f1aGRJ3jqBPsfI8pvLEC9zvTPfI75Mz3FrcuqOe4ZY98Yw9t7z4S9B9g53q5CGIBAoDBy0/NGnet/s1LNWGWI2+8iFxFFFFZPcH1184fikguhbKm/ELRieZEz7zL9LaHFoThm90GefpnijiyHC/gQ78Ulb4WyymAE4piFCpUv1q8f484HiBvd3r4fr+IvnGoL9KDIE+4gVyREvVT12/Di4CFox4ETPHgoCUdxB4VtLap0VGPf5hCIMTrG+JG050v/MH+12aNSuLR5CtRrSV6sJuRKlbk/ufAVV75sawtgsdk1N4nAzBRLR2/WiEvnOXuK2Y+zZk/jdLObuvUkDPjlAy5PJSrAzlGqlU5d8jm8EcrpfjD4KahO8fWbVGaT8d27OHacaE9WxvwaypY71Ntuca4mBWhpIbnXltfn3OxnfPcJN+aS53v2M/pMp7TttxTXmfmGTxEVks1nzqXV/ekdrv3G0HBSrv+Y7LeapLCCoeRI/cjvE+tJpUr0BNOTLcexkfWR0OjS8lI4l1Ji7droQ6SepfZFLPSjwPGmO4fXlBiwUuCHZg+obf0BbaET/gUF7c6e6npB6QAAAABJRU5ErkJggg=='
    }),
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
    if (request.action === 'fetchBullhornUsername') {
      const decodedCookie = decodeURIComponent(window.document.cookie);
      const bullhornUsername = decodedCookie.split('"username":"')[1].split('","masterUserId')[0];
      sendResponse({ bullhornUsername });
      return;
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

async function fetchBullhornUserinfo() {
  const { crm_extension_bullhornUsername } = await chrome.storage.local.get({ crm_extension_bullhornUsername: null });
  let { crm_extension_bullhorn_user_urls } = await chrome.storage.local.get({ crm_extension_bullhorn_user_urls: null });
  if (!crm_extension_bullhornUsername || !crm_extension_bullhorn_user_urls) {
    const decodedCookie = decodeURIComponent(window.document.cookie);
    const bullhornUsername = decodedCookie.split('"username":"')[1].split('","masterUserId')[0];
    await chrome.storage.local.set({ crm_extension_bullhornUsername: bullhornUsername });
    const { data: crm_extension_bullhorn_user_urls } = await axios.get(`https://rest.bullhornstaffing.com/rest-services/loginInfo?username=${bullhornUsername}`);
    await chrome.storage.local.set({ crm_extension_bullhorn_user_urls });
  }
  return { crm_extension_bullhornUsername, crm_extension_bullhorn_user_urls };
}

async function Initialize() {
  // Unique: Pipedrive
  if (window.location.hostname.includes('pipedrive.com')) {
    let { c2dDelay } = await chrome.storage.local.get(
      { c2dDelay: '3' }
    );
    if (!!!c2dDelay) {
      c2dDelay = 3;
    }
    const delayInMilliSec = Number(c2dDelay) * 1000;
    await delay(delayInMilliSec);
  }
  if (window.location.hostname.includes('bullhornstaffing.com')) {
    await fetchBullhornUserinfo();
  }
  const { renderQuickAccessButton } = await chrome.storage.local.get({ renderQuickAccessButton: true });
  if (window.self === window.top && renderQuickAccessButton) {
    await RenderQuickAccessButton();
  }
  await initializeC2D();
}

Initialize();
// Unique: Pipedrive
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