const { responseMessage } = require('./util');
const auth = require('./core/auth');

window.__ON_RC_POPUP_WINDOW = 1;

var registered = false;
// Interact with RingCentral Embeddable Voice:
window.addEventListener('message', async (e) => {
  const data = e.data;
  try {

    if (data) {
      switch (data.type) {
        case 'rc-webphone-connection-status-notify':
          // get call on active call updated event
          if (data.connectionStatus === 'connectionStatus-connected') { // connectionStatus-connected, connectionStatus-disconnected
            await auth.checkAuth();
          }
          break;
        case 'rc-adapter-pushAdapterState':
          if (!registered) {
            registered = true;
            document.querySelector("#rc-widget-adapter-frame").contentWindow.postMessage({
              type: 'rc-adapter-register-third-party-service',
              service: getServiceConfig('TestService')
            }, '*');
          }
          break;
        case 'rc-login-status-notify':
          // get login status from widget
          console.log('rc-login-status-notify:', data.loggedIn, data.loginNumber);
          const rcUserInfo = { rcUserNumber: data.loginNumber };
          await chrome.storage.local.set(rcUserInfo);
        case 'rc-login-popup-notify':
          handleRCOAuthWindow(data.oAuthUri);
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
          switch (data.path) {
            case '/authorize':
              const { rcUnifiedCrmExtJwt } = await chrome.storage.local.get('rcUnifiedCrmExtJwt');
              if (!rcUnifiedCrmExtJwt) {
                const authUri = 'https://oauth.pipedrive.com/oauth/authorize?' +
                  'client_id=6c1976beeb0cb1b4' +
                  '&state=' +
                  '&redirect_uri=https://ringcentral.github.io/ringcentral-embeddable/redirect.html';
                handleThirdPartyOAuthWindow(authUri);
              }
              else {
                await auth.unAuthorize(rcUnifiedCrmExtJwt);
              }
              responseMessage(
                data.requestId,
                {
                  data: 'OK'
                }
              );
              break;
            case '/contacts/match':
              console.log(data); // include phone number array that need to match
              const incomingCallNumbers = data.body.phoneNumbers;
              // query on 3rd party API to get the matched contact info and return
              const matchedContacts = {
                '+13133982125': [
                  {
                    id: '123456', // id to identify third party contact
                    type: 'TestService', // need to same as service name
                    name: 'TestService 10',
                    phoneNumbers: [{
                      phoneNumber: '+13133982125',
                      phoneType: 'direct', // support: business, extension, home, mobile, phone, unknown, company, direct, fax, other
                    }]
                  }
                ]
              };
              // return matched contact object with phone number as key
              responseMessage(
                data.requestId,
                {
                  data: matchedContacts
                }
              );
              break;
            case '/callLogger':
              if (!data.body.triggerType || data.body.call.result === 'Disconnected') {
                // add your codes here to log call to your service
                const callLogMessageObj = {
                  type: 'rc-log-modal',
                  logProps: {
                    logType: 'Call',
                    id: data.body.call.sessionId
                  }
                }
                window.postMessage(callLogMessageObj, '*')
                // response to widget
                responseMessage(
                  data.requestId,
                  {
                    data: 'ok'
                  }
                );
              }
              break;
            case '/callLogger/match':
              const storedLog = await chrome.storage.local.get(data.body.sessionIds);
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
            case '/messageLogger':
              // add your codes here to log call to your service
              const messageLogMessageObj = {
                type: 'rc-log-modal',
                logProps: {
                  logType: 'Message',
                  id: data.body.conversation.conversationLogId
                }
              }
              window.postMessage(messageLogMessageObj, '*')
              // response to widget
              responseMessage(
                data.requestId,
                {
                  data: 'ok'
                }
              );
              break;
            case '/messageLogger/match':
              break;
            default:
              break;
          }
          break;
        default:
          break;
      }
    }
  }
  catch (e) {
    console.log(e);
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'oauthCallBack') {
    if (request.platform === 'rc') {
      document.querySelector("#rc-widget-adapter-frame").contentWindow.postMessage({
        type: 'rc-adapter-authorization-code',
        callbackUri: request.callbackUri,
      }, '*');
    }
    else if (request.platform === 'thirdParty') {
      auth.onAuthCallback(request.callbackUri);
    }
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

function handleRCOAuthWindow(oAuthUri) {
  chrome.runtime.sendMessage({
    type: 'openRCOAuthWindow',
    oAuthUri,
  });
}

function handleThirdPartyOAuthWindow(oAuthUri) {
  chrome.runtime.sendMessage({
    type: 'openThirdPartyAuthWindow',
    oAuthUri
  });
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
    // contactsPath: '/contacts',
    // contactIcon: 'https://cdn-icons-png.flaticon.com/512/2991/2991148.png',
    // contactSearchPath: '/contacts/search',
    contactMatchPath: '/contacts/match',

    // show auth/unauth button in ringcentral widgets
    authorizationPath: '/authorize',
    authorizedTitle: 'Unauthorize',
    unauthorizedTitle: 'Authorize',
    authorized: false,

    // Enable call log sync feature
    callLoggerPath: '/callLogger',
    callLoggerTitle: `Log to ${serviceName}`,
    callLogEntityMatcherPath: '/callLogger/match',


    messageLoggerPath: '/messageLogger',
    messageLoggerTitle: `Log to ${serviceName}`,
    messageLogEntityMatcherPath: '/messageLogger/match'
  }
  return services;
}