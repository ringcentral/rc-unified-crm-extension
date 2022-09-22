console.log('from standalong.js');
window.__ON_RC_POPUP_WINDOW = 1;

function responseMessage(responseId, response) {
  document.querySelector("#rc-widget-adapter-frame").contentWindow.postMessage({
    type: 'rc-post-message-response',
    responseId,
    response,
  }, '*');
  console.log(response);
}

var registered = false;
// Interact with RingCentral Embeddable Voice:
window.addEventListener('message', async (e) => {
  const data = e.data;
  if (data) {
    switch (data.type) {
      case 'rc-adapter-pushAdapterState':
        if (!registered) {
          registered = true;
          document.querySelector("#rc-widget-adapter-frame").contentWindow.postMessage({
            type: 'rc-adapter-register-third-party-service',
            service: getServiceConfig('TestService')
          }, '*');
        }
        break;
      case 'rc-login-popup-notify':
        handleOAuthWindow(data.oAuthUri);
        break;
      case 'rc-call-ring-notify':
        // get call on ring event
        console.log('RingCentral Embeddable Voice Extension:', data.call);
        chrome.runtime.sendMessage({
          type: 'openPopupWindow'
        });
        break;
      case 'rc-call-end-notify':
        // get call on call end event
        console.log('RingCentral Embeddable Voice Extension:', data.call);
        break;
      case 'rc-call-start-notify':
        // get call on start a outbound call event
        console.log('RingCentral Embeddable Voice Extension:', data.call);
        break;
      case 'rc-post-message-request':
        console.log(data);
        switch (data.path) {
          case '/contacts':
            // you can get page and syncTimestamp params from data.body
            // query contacts data from third party service with page and syncTimestamp
            // if syncTimestamp existed, please only return updated contacts after syncTimestamp
            // response to widget:
            const contacts = [{
              id: '123456', // id to identify third party contact
              name: 'TestService Name', // contact name
              type: 'TestService', // need to same as service name
              phoneNumbers: [{
                phoneNumber: '+1234567890',
                phoneType: 'direct', // support: business, extension, home, mobile, phone, unknown, company, direct, fax, other
              }],
              company: 'CompanyName',
              jobTitle: 'Engineer',
              emails: ['test@email.com'],
              deleted: false, // set deleted to true if you need to delete it in updated contacts
            }];
            // pass nextPage number when there are more than one page data, widget will repeat same request with nextPage increased
            responseMessage(
              data.requestId,
              {
                data: contacts,
                nextPage: null,
                syncTimestamp: Date.now()
              });
            break;
          case '/callLogger':
            // add your codes here to log call to your service
            console.log(data);
            let dataToLog = {};
            dataToLog[data.body.call.sessionId] = { note: data.body.note, id: '1111' }
            await chrome.storage.sync.set(dataToLog);
            // response to widget
            responseMessage(
              data.requestId,
              {
                data: 'ok'
              }
            );
            document.querySelector("#rc-widget-adapter-frame").contentWindow.postMessage({
              type: 'rc-adapter-trigger-call-logger-match',
              sessionIds: [data.body.call.sessionId],
            }, '*');
            break;
          case '/callLogger/match':
            const storedLog = await chrome.storage.sync.get(data.body.sessionIds);
            let matchData = {};
            for (const id in storedLog) {
              matchData[id] = [storedLog[id]];
            }
            responseMessage(
              data.requestId,
              {
                data: matchData
              });
            break;
          default:
            break;
        }
        break;
      default:
        break;
    }
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'oauthCallBack') {
    document.querySelector("#rc-widget-adapter-frame").contentWindow.postMessage({
      type: 'rc-adapter-authorization-code',
      callbackUri: request.callbackUri,
    }, '*');
    sendResponse({ result: 'ok' });
  } else if (request.type === 'c2sms') {
    document.querySelector("#rc-widget-adapter-frame").contentWindow.postMessage({
      type: 'rc-adapter-new-sms',
      phoneNumber: request.phoneNumber,
    }, '*');
    sendResponse({ result: 'ok' });
  } else if (request.type === 'c2d') {
    document.querySelector("#rc-widget-adapter-frame").contentWindow.postMessage({
      type: 'rc-adapter-new-call',
      phoneNumber: request.phoneNumber,
      toCall: true,
    }, '*');
    sendResponse({ result: 'ok' });
  }
});

async function handleOAuthWindow(oAuthUri) {
  chrome.runtime.sendMessage({
    type: 'openOAuthWindow',
    oAuthUri,
  });
  // chrome.identity.launchWebAuthFlow(
  //   {
  //     url: oAuthUri,
  //     interactive: true,
  //   },
  //   (responseUrl) => {
  //     if (responseUrl) {
  //       document.querySelector("#rc-widget-adapter-frame").contentWindow.postMessage({
  //         type: 'rc-adapter-authorization-code',
  //         callbackUri: responseUrl,
  //       }, '*');
  //     }
  //   },
  // );
}

function getServiceConfig(serviceName) {
  const services = {
    // settingsPath: '/settings',
    // settings: [
    //   {
    //     name: 'Do not show create new contact form',
    //     value: hideContactForm
    //   }
    // ],
    name: serviceName,
    // // show contacts in ringcentral widgets
    contactsPath: '/contacts',
    contactIcon: 'https://cdn-icons-png.flaticon.com/512/2991/2991148.png',
    // contactSearchPath: '/contacts/search',
    // contactMatchPath: '/contacts/match',

    // show auth/unauth button in ringcentral widgets
    // authorizationPath: '/authorize',
    // authorizedTitle: 'Unauthorize',
    // unauthorizedTitle: 'Authorize',
    // authorized: false,

    // Enable call log sync feature
    callLoggerPath: '/callLogger',
    callLoggerTitle: `Log to ${serviceName}`,
    callLogEntityMatcherPath: '/callLogger/match',
    showLogModal: true,


    messageLoggerPath: '/messageLogger',
    messageLoggerTitle: `Log to ${serviceName}`,

    // messageLogEntityMatcherPath: '/messageLogger/match'
  }
  return services;
}