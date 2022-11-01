const { responseMessage, isObjectEmpty } = require('./util');
const auth = require('./core/auth');
const { checkLog } = require('./core/log');
const { getContact } = require('./core/contact');
const config = require('./config.json');

window.__ON_RC_POPUP_WINDOW = 1;

let registered = false;
const platform = config.platforms[config.currentPlatform];
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
              service: getServiceConfig(config.currentPlatform)
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
        case 'rc-post-message-request':
          switch (data.path) {
            case '/authorize':
              const { rcUnifiedCrmExtJwt } = await chrome.storage.local.get('rcUnifiedCrmExtJwt');
              if (!rcUnifiedCrmExtJwt) {
                const authUri = `${platform.authUrl}?` +
                  `client_id=${platform.clientId}` +
                  `&state=platform=${config.currentPlatform}` +
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
              const { matched: contactMatched, contactInfo } = await getContact({ phoneNumber: incomingCallNumbers[0] });
              if (contactMatched) {
                let matchedContacts = {};
                matchedContacts[contactInfo.phones[0]] = [{
                  id: contactInfo.id,
                  type: config.currentPlatform,
                  name: contactInfo.name,
                  phoneNumbers: [
                    {
                      phoneNumber: contactInfo.phones[0],
                      phoneType: 'direct'
                    }
                  ]
                }];
                // return matched contact object with phone number as key
                responseMessage(
                  data.requestId,
                  {
                    data: matchedContacts
                  }
                );
              }
              else {
                // return matched contact object with phone number as key
                responseMessage(
                  data.requestId,
                  {
                    data: []
                  }
                );
              }
              break;
            case '/callLogger':
              const contactPhoneNumber = data.body.call.direction === 'Inbound' ?
                data.body.call.from.phoneNumber :
                data.body.call.to.phoneNumber;
              const { matched: callLogMatched, contactName: callLogContactName } = await checkLog({
                logType: 'Call',
                logId: data.body.call.sessionId,
                phoneNumber: contactPhoneNumber
              });
              if ((!callLogMatched && !data.body.triggerType) || data.body.triggerType === 'manual') {
                // add your codes here to log call to your service
                window.postMessage({
                  type: 'rc-log-modal',
                  logProps: {
                    logType: 'Call',
                    logInfo: data.body.call,
                    contactName: callLogContactName
                  }
                }, '*')
              }
              // response to widget
              responseMessage(
                data.requestId,
                {
                  data: 'ok'
                }
              );
              break;
            case '/callLogger/match':
              let callLogMatchData = {};
              for (const sessionId of data.body.sessionIds) {
                const { matched, logId } = await checkLog({ logType: 'Call', logId: sessionId, phoneNumber:'' });
                if (matched) {
                  callLogMatchData[sessionId] = [{ id: logId, note: '' }];
                }
              }
              responseMessage(
                data.requestId,
                {
                  data: callLogMatchData
                });
              break;
            case '/messageLogger':
              const { matched: messageMatched, contactInfo: messageMatchedContact } = await getContact({
                phoneNumber: data.body.conversation.correspondents[0].phoneNumber
              });
              const existingMessageLog = await chrome.storage.local.get(data.body.conversation.conversationLogId);
              if (messageMatched && (isObjectEmpty(existingMessageLog) || data.body.triggerType === 'manual')) {
                // add your codes here to log call to your service
                window.postMessage({
                  type: 'rc-log-modal',
                  logProps: {
                    logType: 'Message',
                    logInfo: data.body.conversation,
                    isManual: data.body.triggerType === 'manual',
                    contactName: messageMatchedContact.name
                  }
                }, '*')
              }
              // response to widget
              responseMessage(
                data.requestId,
                {
                  data: 'ok'
                }
              );
              break;
            case '/messageLogger/match':
              const localMessageLogs = await chrome.storage.local.get(data.body.conversationLogIds);
              responseMessage(
                data.requestId,
                {
                  data: localMessageLogs
                }
              );
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
    // TODO: show error message
    // window.postMessage({
    //   type: 'rc-log-modal',
    //   message: e.response.data
    // }, '*')
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
    callLogEntityMatcherPath: '/callLogger/match',


    messageLoggerPath: '/messageLogger',
    messageLogEntityMatcherPath: '/messageLogger/match'
  }
  return services;
}