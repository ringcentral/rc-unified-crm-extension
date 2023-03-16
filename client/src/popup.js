const auth = require('./core/auth');
const { checkLog } = require('./core/log');
const { getContact, showIncomingCallContactInfo, showInCallContactInfo, openContactPage } = require('./core/contact');
const config = require('./config.json');
const { responseMessage, isObjectEmpty, showNotification } = require('./lib/util');
const { getUserInfo } = require('./lib/rcAPI');
const moment = require('moment');
const {
  trackFirstTimeSetup,
  identify,
  group,
  trackPage,
  trackRcLogin,
  trackRcLogout,
  trackPlacedCall,
  trackAnsweredCall,
  trackCallEnd,
  trackUpdateStatus,
  trackSentSMS,
  trackCreateMeeting,
  trackEditSettings
} = require('./lib/analytics');

window.__ON_RC_POPUP_WINDOW = 1;

let registered = false;
let platform = null;
let platformName = '';
let rcUserInfo = {};
let extensionUserSettings = null;
let incomingCallContactInfo = null;
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
          extensionUserSettings = (await chrome.storage.local.get('extensionUserSettings')).extensionUserSettings;
          if (!registered) {
            const platformInfo = await chrome.storage.local.get('platform-info');
            platformName = platformInfo['platform-info'].platformName;
            platform = config.platforms[platformName];
            registered = true;
            document.querySelector("#rc-widget-adapter-frame").contentWindow.postMessage({
              type: 'rc-adapter-register-third-party-service',
              service: getServiceConfig(platformName)
            }, '*');
            const isFirstTime = await chrome.storage.local.get('isFirstTime');
            if (isObjectEmpty(isFirstTime)) {
              trackFirstTimeSetup({ platform: platformName });
              await chrome.storage.local.set({ isFirstTime: false });
            }
          }
          break;
        case 'rc-login-status-notify':
          // get login status from widget
          console.log('rc-login-status-notify:', data.loggedIn, data.loginNumber, data.contractedCountryCode);
          const platformInfo = await chrome.storage.local.get('platform-info');
          platformName = platformInfo['platform-info'].platformName;
          rcUserInfo = (await chrome.storage.local.get('rcUserInfo')).rcUserInfo;
          if (data.loggedIn) {
            if (!rcUserInfo || isObjectEmpty(rcUserInfo)) {
              const accessToken = JSON.parse(localStorage.getItem('sdk-rc-widgetplatform')).access_token;
              const userInfoResponse = await getUserInfo(accessToken);
              rcUserInfo = { rcUserName: userInfoResponse.name, rcUserEmail: userInfoResponse.contact.email, rcUserNumber: data.loginNumber, rcAccountId: userInfoResponse.account.id, rcExtensionId: userInfoResponse.id };
              await chrome.storage.local.set({ ['rcUserInfo']: rcUserInfo });
              identify({ platformName, rcAccountId: rcUserInfo?.rcAccountId, extensionId: rcUserInfo.rcExtensionId });
              group({ platformName, rcAccountId: rcUserInfo?.rcAccountId });
            }
            else {
              identify({ platformName, rcAccountId: rcUserInfo?.rcAccountId, extensionId: rcUserInfo.rcExtensionId });
              group({ platformName, rcAccountId: rcUserInfo?.rcAccountId });
            }
            document.getElementById('rc-widget').style.zIndex = 0;
            const { rcUnifiedCrmExtJwt } = await chrome.storage.local.get('rcUnifiedCrmExtJwt');
            if (!rcUnifiedCrmExtJwt) {
              showNotification({ level: 'warning', message: 'Please authorize CRM platform account via More Menu (right most on top bar) -> Settings.', ttl: 10000 });
            }
          }

          let { rcLoginStatus } = await chrome.storage.local.get('rcLoginStatus');
          if (rcLoginStatus === false || !rcLoginStatus || isObjectEmpty(rcLoginStatus)) {
            if (data.loggedIn) {
              trackRcLogin({ platformName, rcAccountId: rcUserInfo?.rcAccountId });
              rcLoginStatus = true;
              await chrome.storage.local.set({ ['rcLoginStatus']: rcLoginStatus });
            }
          }
          else {
            if (!data.loggedIn) {
              trackRcLogout({ platformName, rcAccountId: rcUserInfo?.rcAccountId });
              rcLoginStatus = false;
            }
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
          incomingCallContactInfo = await showIncomingCallContactInfo({ phoneNumber: data.call.from });
          if (!!extensionUserSettings && extensionUserSettings.find(e => e.name === 'Open contact web page from incoming call')?.value) {
            openContactPage({ incomingCallContactInfo });
          }
          break;
        case 'rc-call-init-notify':
          trackPlacedCall({ platformName, rcAccountId: rcUserInfo?.rcAccountId });
          break;
        case 'rc-call-start-notify':
          // get call when a incoming call is accepted or a outbound call is connected
          if (data.call.direction === 'Inbound') {
            trackAnsweredCall({ platformName, rcAccountId: rcUserInfo?.rcAccountId });
            showInCallContactInfo({ incomingCallContactInfo });
          }
          break;
        case 'rc-call-end-notify':
          // get call on call end event
          const callDurationInSeconds = (data.call.endTime - data.call.startTime) / 1000;
          trackCallEnd({ durationInSeconds: callDurationInSeconds, platformName, rcAccountId: rcUserInfo?.rcAccountId });
          break;
        case "rc-active-call-notify":
          if (data.call.telephonyStatus === 'CallConnected') {
            window.postMessage({ type: 'rc-expandable-call-note-open', sessionId: data.call.sessionId }, '*');
          }
          if (data.call.telephonyStatus === 'NoCall' && data.call.terminationType === 'final') {
            window.postMessage({ type: 'rc-expandable-call-note-terminate' }, '*');
          }
          break;
        case 'rc-adapter-syncPresence':
          // get dndStatus, telephonyStatus, userStatus defined here https://developers.ringcentral.com/api-reference/Extension-Presence-Event
          if (data.userStatus) {
            if (data.dndStatus === 'DoNotAcceptAnyCalls') {
              trackUpdateStatus({ presenceStatus: 'DND', platformName, rcAccountId: rcUserInfo?.rcAccountId });
            }
            else {
              trackUpdateStatus({ presenceStatus: data.userStatus, platformName, rcAccountId: rcUserInfo?.rcAccountId });
            }
          }
          break;
        case 'rc-analytics-track':
          switch (data.event) {
            case 'SMS: SMS sent successfully':
              trackSentSMS({ platformName, rcAccountId: rcUserInfo?.rcAccountId });
              break;
            case 'Meeting Scheduled':
              trackCreateMeeting({ platformName, rcAccountId: rcUserInfo?.rcAccountId });
              break;
          }
          break;
        case 'rc-callLogger-auto-log-notify':
          trackEditSettings({ changedItem: 'auto-call-log', platformName, status: data.autoLog, rcAccountId: rcUserInfo?.rcAccountId });
          break;
        case 'rc-route-changed-notify':
          if (data.path !== '/') {
            trackPage(data.path, { platformName, rcAccountId: rcUserInfo?.rcAccountId });
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
                      `response_type=code` +
                      `&client_id=${platform.clientId}` +
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
                  matchedContacts[contactPhoneNumber] = [{
                    id: contactInfo.id,
                    type: platformName,
                    name: contactInfo.name,
                    phoneNumbers: [
                      {
                        phoneNumber: contactPhoneNumber,
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
              const { callLogs: singleCallLog } = await checkLog({
                logType: 'Call',
                sessionIds: data.body.call.sessionId
              });
              const { matched: callContactMatched, message: callLogContactMatchMessage, contactInfo: callMatchedContact, additionalLogInfo: callLogAdditionalInfo } = await getContact({ phoneNumber: contactPhoneNumber });
              if (singleCallLog[data.body.call.sessionId].matched) {
                showNotification({ level: 'warning', message: 'Call log already exists', ttl: 3000 });
              }
              else if (!callContactMatched) {
                showNotification({ level: 'warning', message: callLogContactMatchMessage, ttl: 3000 });
              }
              else {
                // add your codes here to log call to your service
                window.postMessage({
                  type: 'rc-log-modal',
                  platform: platformName,
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
              const { successful, callLogs, message: checkLogMessage } = await checkLog({ logType: 'Call', sessionIds: data.body.sessionIds.toString() });
              if (successful) {
                for (const sessionId of data.body.sessionIds) {
                  const correspondingLog = callLogs[sessionId];
                  if (correspondingLog.matched) {
                    callLogMatchData[sessionId] = [{ id: sessionId, note: '' }];
                  }
                }
              }
              else {
                showNotification({ level: 'warning', message: checkLogMessage, ttl: 3000 });
                break;
              }
              responseMessage(
                data.requestId,
                {
                  data: callLogMatchData
                });
              break;
            case '/messageLogger':
              const messageLogDateInfo = data.body.conversation.conversationLogId.split('/'); // 2052636401630275685/11/10/2022
              const isToday = moment(`${messageLogDateInfo[3]}.${messageLogDateInfo[1]}.${messageLogDateInfo[2]}`).isSame(new Date(), 'day');
              if (data.body.triggerType !== 'manual' && isToday) {
                break;
              }
              window.postMessage({ type: 'rc-log-modal-loading-on' }, '*');
              const { matched: messageContactMatched, message: messageContactMatchMessage, contactInfo: messageMatchedContact, additionalLogInfo: messageLogAdditionalLogInfo } = await getContact({
                phoneNumber: data.body.conversation.correspondents[0].phoneNumber
              });
              const existingMessageLog = await chrome.storage.local.get(data.body.conversation.conversationLogId);
              if (!messageContactMatched) {
                showNotification({ level: 'warning', message: messageContactMatchMessage, ttl: 3000 });
              }
              else if (isObjectEmpty(existingMessageLog)) {
                // add your codes here to log call to your service
                window.postMessage({
                  type: 'rc-log-modal',
                  platform: platformName,
                  logProps: {
                    logType: 'Message',
                    logInfo: data.body.conversation,
                    contactName: messageMatchedContact.name,
                    isToday
                  },
                  additionalLogInfo: messageLogAdditionalLogInfo
                }, '*');
              }
              else {
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
            case '/feedback':
              // response to widget
              document.querySelector("#rc-widget-adapter-frame").contentWindow.postMessage({
                type: 'rc-post-message-response',
                responseId: data.requestId,
                response: { data: 'ok' },
              }, '*');
              // add your codes here to show your feedback form
              window.postMessage({
                type: 'rc-feedback-open',
                props: {
                  userName: rcUserInfo.rcUserName,
                  userEmail: rcUserInfo.rcUserEmail
                }
              }, '*');
              break;
            case '/settings':
              extensionUserSettings = data.body.settings;
              await chrome.storage.local.set({ extensionUserSettings });
              for (const setting of extensionUserSettings) {
                trackEditSettings({ changedItem: setting.name.replaceAll(' ', '-'), platformName, status: setting.value, rcAccountId: rcUserInfo?.rcAccountId });
              }
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
    if (e.response && e.response.data && !noShowNotification) {
      showNotification({ level: 'warning', message: e.response.data, ttl: 5000 });
    }
    else {
      console.error(e);
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
    name: serviceName,
    contactMatchPath: '/contacts/match',

    // show auth/unauth button in ringcentral widgets
    authorizationPath: '/authorize',
    authorizedTitle: 'Unauthorize',
    unauthorizedTitle: 'Authorize',
    authorized: false,
    authorizedAccount: '',

    // Enable call log sync feature
    callLoggerPath: '/callLogger',
    callLogEntityMatcherPath: '/callLogger/match',

    messageLoggerPath: '/messageLogger',
    messageLogEntityMatcherPath: '/messageLogger/match',

    feedbackPath: '/feedback',
    settingsPath: '/settings',
    settings: [{ name: 'Open contact web page from incoming call', value: !!extensionUserSettings && extensionUserSettings.find(e => e.name === 'Open contact web page from incoming call')?.value }],
  }
  return services;
}