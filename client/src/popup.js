const auth = require('./core/auth');
const { checkLog } = require('./core/log');
const { getContact } = require('./core/contact');
const config = require('./config.json');
const { responseMessage, isObjectEmpty, showNotification } = require('./lib/util');
const moment = require('moment');

window.__ON_RC_POPUP_WINDOW = 1;

let registered = false;
let platform = null;
// Interact with RingCentral Embeddable Voice:
window.addEventListener('message', async (e) => {
  const data = e.data;
  let noShowNotification = false;
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
            const platformInfo = await chrome.storage.local.get('platform-info');
            const platformName = platformInfo['platform-info'].platformName;
            platform = config.platforms[platformName];
            registered = true;
            document.querySelector("#rc-widget-adapter-frame").contentWindow.postMessage({
              type: 'rc-adapter-register-third-party-service',
              service: getServiceConfig(platformName)
            }, '*');
          }
          break;
        case 'rc-login-status-notify':
          // get login status from widget
          console.log('rc-login-status-notify:', data.loggedIn, data.loginNumber, data.contractedCountryCode);
          const rcUserInfo = { rcUserNumber: data.loginNumber };
          await chrome.storage.local.set(rcUserInfo);
          document.getElementById('rc-widget').style.zIndex = 0;
          const { rcUnifiedCrmExtJwt } = await chrome.storage.local.get('rcUnifiedCrmExtJwt');
          if (!rcUnifiedCrmExtJwt) {
            showNotification({ level: 'warning', message: 'Please authorize CRM platform account in User Settings.', ttl: 10000 });
          }
          break;
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
        case "rc-active-call-notify":
          if (data.call.telephonyStatus === 'CallConnected') {
            window.postMessage({ type: 'rc-expandable-call-note-open', sessionId: data.call.sessionId }, '*');
          }
          if (data.call.telephonyStatus === 'NoCall' && data.call.terminationType === 'final') {
            window.postMessage({ type: 'rc-expandable-call-note-terminate' }, '*');
          }
          break;
        case 'rc-post-message-request':
          switch (data.path) {
            case '/authorize':
              const { rcUnifiedCrmExtJwt } = await chrome.storage.local.get('rcUnifiedCrmExtJwt');
              if (!rcUnifiedCrmExtJwt) {
                switch (platform.authType) {
                  case 'oauth':
                    const authUri = `${platform.authUrl}?` +
                      `client_id=${platform.clientId}` +
                      `&state=platform=${platform.name}` +
                      '&redirect_uri=https://ringcentral.github.io/ringcentral-embeddable/redirect.html';
                    handleThirdPartyOAuthWindow(authUri);
                    break;
                  case 'apiKey':
                    window.postMessage({ type: 'rc-apiKey-input-modal' }, '*');
                    break;
                }
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
              noShowNotification = true;
              let matchedContacts = {};
              for (const contactPhoneNumber of data.body.phoneNumbers) {
                // query on 3rd party API to get the matched contact info and return
                const { matched: contactMatched, contactInfo } = await getContact({ phoneNumber: contactPhoneNumber });
                if (contactMatched) {
                  matchedContacts[contactInfo.phone] = [{
                    id: contactInfo.id,
                    type: config.currentPlatform,
                    name: contactInfo.name,
                    phoneNumbers: [
                      {
                        phoneNumber: contactInfo.phone,
                        phoneType: 'direct'
                      }
                    ]
                  }];
                }
              }
              // return matched contact object with phone number as key
              responseMessage(
                data.requestId,
                {
                  data: matchedContacts
                }
              );
              break;
            case '/callLogger':
              if (data.body.triggerType) {
                if (data.body.triggerType === 'callLogSync') {
                  break;
                }
                if (data.body.triggerType === 'presenceUpdate' && data.body.call.result !== 'Disconnected') {
                  break;
                }
              }
              window.postMessage({ type: 'rc-log-modal-loading-on' }, '*');
              const contactPhoneNumber = data.body.call.direction === 'Inbound' ?
                data.body.call.from.phoneNumber :
                data.body.call.to.phoneNumber;
              const { matched: callLogMatched } = await checkLog({
                logType: 'Call',
                logId: data.body.call.sessionId
              });
              const { matched: callContactMatched, message: callLogContactMatchMessage, contactInfo: callMatchedContact, additionalLogInfo: callLogAdditionalInfo } = await getContact({ phoneNumber: contactPhoneNumber });
              if (callLogMatched) {
                showNotification({ level: 'warning', message: 'Call log already exists', ttl: 3000 });
              }
              else if (!callContactMatched) {
                showNotification({ level: 'warning', message: callLogContactMatchMessage, ttl: 3000 });
              }
              else {
                // add your codes here to log call to your service
                window.postMessage({
                  type: 'rc-log-modal',
                  logProps: {
                    logType: 'Call',
                    logInfo: data.body.call,
                    contactName: callMatchedContact.name
                  },
                  additionalLogInfo: callLogAdditionalInfo
                }, '*')
              }
              // response to widget
              responseMessage(
                data.requestId,
                {
                  data: 'ok'
                }
              );
              window.postMessage({ type: 'rc-log-modal-loading-off' }, '*');
              break;
            case '/callLogger/match':
              let callLogMatchData = {};
              for (const sessionId of data.body.sessionIds) {
                const { matched, logId } = await checkLog({ logType: 'Call', logId: sessionId });
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
              window.postMessage({ type: 'rc-log-modal-loading-on' }, '*');
              const { matched: messageContactMatched, message: messageContactMatchMessage, contactInfo: messageMatchedContact, additionalLogInfo: messageLogAdditionalLogInfo } = await getContact({
                phoneNumber: data.body.conversation.correspondents[0].phoneNumber
              });
              const existingMessageLog = await chrome.storage.local.get(data.body.conversation.conversationLogId);
              const messageLogDateInfo = data.body.conversation.conversationLogId.split('/'); // 2052636401630275685/11/10/2022
              const isToday = moment(`${messageLogDateInfo[3]}.${messageLogDateInfo[1]}.${messageLogDateInfo[2]}`).isSame(new Date(), 'day');
              if (!messageContactMatched) {
                showNotification({ level: 'warning', message: messageContactMatchMessage, ttl: 3000 });
              }
              else if (isObjectEmpty(existingMessageLog)) {
                if (data.body.triggerType === 'manual') {
                  // add your codes here to log call to your service
                  window.postMessage({
                    type: 'rc-log-modal',
                    logProps: {
                      logType: 'Message',
                      logInfo: data.body.conversation,
                      contactName: messageMatchedContact.name,
                      isToday
                    },
                    additionalLogInfo: messageLogAdditionalLogInfo
                  }, '*')
                }
                showNotification({ level: 'warning', message: 'Message log already exists', ttl: 3000 });
              }
              // response to widget
              responseMessage(
                data.requestId,
                {
                  data: 'ok'
                }
              );
              window.postMessage({ type: 'rc-log-modal-loading-off' }, '*');
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
    if (e.response.data && !noShowNotification) {
      showNotification({ level: 'warning', message: e.response.data, ttl: 5000 });
    }
    window.postMessage({ type: 'rc-log-modal-loading-off' }, '*');
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