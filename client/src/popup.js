const auth = require('./core/auth');
const { checkLog } = require('./core/log');
const { getContact, showIncomingCallContactInfo, showInCallContactInfo, openContactPage } = require('./core/contact');
const config = require('./config.json');
const { responseMessage, isObjectEmpty, showNotification } = require('./lib/util');
const { getUserInfo } = require('./lib/rcAPI');
const { apiKeyLogin, showCRMLoginStatusDot } = require('./core/auth');
const moment = require('moment');
const { openDB } = require('idb');
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
  trackSentSMS,
  trackCreateMeeting,
  trackEditSettings,
  trackConnectedCall,
  trackOpenFeedback
} = require('./lib/analytics');

window.__ON_RC_POPUP_WINDOW = 1;

let registered = false;
let platform = null;
let platformName = '';
let rcUserInfo = {};
let extensionUserSettings = null;
let incomingCallContactInfo = null;

const errorLogWebhookUrl = "https://hooks.ringcentral.com/webhook/v2/eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJvdCI6ImMiLCJvaSI6IjQ0NDY2MTc3IiwiaWQiOiIyMDc4MDgxMDUxIn0.NnAUGG4stGsPz8mhNsy6Qo2yosX0ydk58Dv70fmbugc";
import axios from 'axios';

async function checkC2DCollision() {
  const { rcForGoogleCollisionChecked } = await chrome.storage.local.get({ rcForGoogleCollisionChecked: false });
  const collidingC2DResponse = await fetch("chrome-extension://fddhonoimfhgiopglkiokmofecgdiedb/redirect.html");
  if (!rcForGoogleCollisionChecked && collidingC2DResponse.status === 200) {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: '/images/logo32.png',
      title: `Click-to-dial may not work`,
      message: "The RingCentral for Google Chrome extension has been detected. You may wish to customize your click-to-dial preferences for your desired behavior",
      priority: 1,
      buttons: [
        {
          title: 'Configure'
        }
      ]
    });
    chrome.notifications.onButtonClicked.addListener(
      (notificationId, buttonIndex) => {
        window.open('https://youtu.be/tbCOM27GUbc');
      }
    )

    await chrome.storage.local.set({ rcForGoogleCollisionChecked: true });
  }
}

checkC2DCollision();

// Interact with RingCentral Embeddable Voice:
window.addEventListener('message', async (e) => {
  const data = e.data;
  let noShowNotification = false;
  try {
    if (data) {
      switch (data.type) {
        case 'rc-region-settings-notify':
          // get region settings from widget
          console.log('rc-region-settings-notify:', data);
          if (data.countryCode) {
            await chrome.storage.local.set(
              { selectedRegion: data.countryCode }
            )
          }
          break;
        case 'rc-dialer-status-notify':
          if (data.ready) {
            // check for Click-To-Dial or Click-To-SMS cached action
            const cachedClickToXRequest = await chrome.runtime.sendMessage(
              {
                type: 'checkForClickToXCache'
              }
            )
            if (cachedClickToXRequest) {
              if (cachedClickToXRequest.type === 'c2d') {
                document.querySelector("#rc-widget-adapter-frame").contentWindow.postMessage({
                  type: 'rc-adapter-new-call',
                  phoneNumber: cachedClickToXRequest.phoneNumber,
                  toCall: true,
                }, '*');
              }
              if (cachedClickToXRequest.type === 'c2sms') {
                document.querySelector("#rc-widget-adapter-frame").contentWindow.postMessage({
                  type: 'rc-adapter-new-sms',
                  phoneNumber: cachedClickToXRequest.phoneNumber,
                  conversation: true, // will go to conversation page if conversation existed
                }, '*');
              }
            }
          }
        case 'rc-webphone-connection-status-notify':
          // get call on active call updated event
          if (data.connectionStatus === 'connectionStatus-connected') { // connectionStatus-connected, connectionStatus-disconnected
            await auth.checkAuth();
          }
          // Hack: add a feedback button
          if (!document.querySelector('.Adapter_header .header_feedback_button')) {
            const headerElement = document.querySelector('.Adapter_header');
            const feedbackButtonElement = document.createElement('div');
            headerElement.appendChild(feedbackButtonElement);
            feedbackButtonElement.className = 'header_feedback_button';
            feedbackButtonElement.style = "position: absolute;right: 5px;top: 5px; width: 24px;cursor: pointer;";
            feedbackButtonElement.innerHTML = '<svg class="MuiSvgIcon-root MuiSvgIcon-fontSizeMedium MuiBox-root css-uqopch" focusable="false" aria-hidden="true" viewBox="0 0 24 24" data-testid="FeedbackIcon"><path fill="#2559E4" d="M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-7 12h-2v-2h2v2zm0-4h-2V6h2v4z"></path></svg>';
            feedbackButtonElement.onclick = () => {
              window.postMessage({
                type: 'rc-feedback-open',
                props: {
                  userName: rcUserInfo.rcUserName,
                  userEmail: rcUserInfo.rcUserEmail
                }
              }, '*');
              trackOpenFeedback({ rcAccountId: rcUserInfo?.rcAccountId });
            }
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
              trackFirstTimeSetup();
              await chrome.storage.local.set({ isFirstTime: false });
              // show welcome page when first-time open the extension
              // window.postMessage({
              //   type: 'rc-show-first-time-welcome'
              // }, '*');
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
            document.getElementById('rc-widget').style.zIndex = 0;
            const { rcUnifiedCrmExtJwt } = await chrome.storage.local.get('rcUnifiedCrmExtJwt');
            // Juuuuuust for Pipedrive
            if (platformName === 'pipedrive' && !(await auth.checkAuth())) {
              chrome.runtime.sendMessage(
                {
                  type: 'popupWindowRequestPipedriveCallbackUri'
                }
              );
            }
            else if (!rcUnifiedCrmExtJwt) {
              showNotification({ level: 'warning', message: 'Please authorize CRM platform account via More Menu (right most on top bar) -> Settings.', ttl: 10000 });
            }
            let stepperLog = '';
            try {
              const extId = JSON.parse(localStorage.getItem('sdk-rc-widgetplatform')).owner_id;
              stepperLog += `extId: ${extId}; `
              const indexDB = await openDB(`rc-widget-storage-${extId}`, 2);
              const rcInfo = await indexDB.get('keyvaluepairs', 'dataFetcherV2-storageData');
              stepperLog += `rcInfo extId: ${rcInfo.value.cachedData.extensionInfo.id}; `
              const userInfoResponse = await getUserInfo({
                extensionId: rcInfo.value.cachedData.extensionInfo.id,
                accountId: rcInfo.value.cachedData.extensionInfo.account.id
              });
              stepperLog += `userInfoResponse: ${userInfoResponse}; `
              rcUserInfo = {
                rcUserName: rcInfo.value.cachedData.extensionInfo.name,
                rcUserEmail: rcInfo.value.cachedData.extensionInfo.contact.email,
                rcUserNumber: data.loginNumber,
                rcAccountId: userInfoResponse.accountId,
                rcExtensionId: userInfoResponse.extensionId
              };
              stepperLog += `rcUserInfo: ${rcUserInfo}; `
              await chrome.storage.local.set({ ['rcUserInfo']: rcUserInfo });
              identify({ platformName, rcAccountId: rcUserInfo?.rcAccountId, extensionId: rcUserInfo?.rcExtensionId });
              group({ platformName, rcAccountId: rcUserInfo?.rcAccountId });
            }
            catch (e) {
              identify({ platformName });
              group({ platformName });
              await axios.post(errorLogWebhookUrl, {
                activity: "Error Log",
                title: "Log",
                text: stepperLog
              });
            }
          }

          let { rcLoginStatus } = await chrome.storage.local.get('rcLoginStatus');
          if (rcLoginStatus === false || !rcLoginStatus || isObjectEmpty(rcLoginStatus)) {
            if (data.loggedIn) {
              trackRcLogin({ rcAccountId: rcUserInfo?.rcAccountId });
              rcLoginStatus = true;
              await chrome.storage.local.set({ ['rcLoginStatus']: rcLoginStatus });
            }
          }
          else {
            if (!data.loggedIn) {
              trackRcLogout({ rcAccountId: rcUserInfo?.rcAccountId });
              rcLoginStatus = false;
            }
          }
          window.postMessage({
            type: 'rc-check-version'
          }, '*');
          break;
        case 'rc-login-popup-notify':
          handleRCOAuthWindow(data.oAuthUri);
          break;
        case 'rc-call-init-notify':
          trackPlacedCall({ rcAccountId: rcUserInfo?.rcAccountId });
          break;
        case 'rc-call-start-notify':
          // get call when a incoming call is accepted or a outbound call is connected
          if (data.call.direction === 'Inbound') {
            trackAnsweredCall({ rcAccountId: rcUserInfo?.rcAccountId });
            showInCallContactInfo({ incomingCallContactInfo });
          }
          break;
        case 'rc-call-end-notify':
          // get call on call end event
          const callDurationInSeconds = (data.call.endTime - data.call.startTime) / 1000;
          trackCallEnd({ rcAccountId: rcUserInfo?.rcAccountId, durationInSeconds: callDurationInSeconds });
          break;
        case 'rc-ringout-call-notify':
          // get call on active call updated event
          if (data.call.telephonyStatus === 'NoCall' && data.call.terminationType === 'final') {
            const callDurationInSeconds = (data.call.endTime - data.call.startTime) / 1000;
            trackCallEnd({ rcAccountId: rcUserInfo?.rcAccountId, durationInSeconds: callDurationInSeconds });
          }
          if (data.call.telephonyStatus === 'CallConnected') {
            trackConnectedCall({ rcAccountId: rcUserInfo?.rcAccountId });
          }
        case "rc-active-call-notify":
          if (data.call.telephonyStatus === 'CallConnected') {
            window.postMessage({ type: 'rc-expandable-call-note-open', sessionId: data.call.sessionId }, '*');
          }
          if (data.call.telephonyStatus === 'NoCall' && data.call.terminationType === 'final') {
            window.postMessage({ type: 'rc-expandable-call-note-terminate' }, '*');
          }
          if (data.call.telephonyStatus === 'Ringing' && data.call.direction === 'Inbound') {
            chrome.runtime.sendMessage({
              type: 'openPopupWindow'
            });
            incomingCallContactInfo = await showIncomingCallContactInfo({ phoneNumber: data.call.from.phoneNumber });
            if (!!extensionUserSettings && extensionUserSettings.find(e => e.name === 'Open contact web page from incoming call')?.value) {
              openContactPage({ incomingCallContactInfo });
            }
          }
          break;
        case 'rc-analytics-track':
          switch (data.event) {
            case 'SMS: SMS sent successfully':
              trackSentSMS({ rcAccountId: rcUserInfo?.rcAccountId });
              break;
            case 'Meeting Scheduled':
              trackCreateMeeting({ rcAccountId: rcUserInfo?.rcAccountId });
              break;
          }
          break;
        case 'rc-callLogger-auto-log-notify':
          trackEditSettings({ rcAccountId: rcUserInfo?.rcAccountId, changedItem: 'auto-call-log', status: data.autoLog });
          break;
        case 'rc-route-changed-notify':
          if (data.path !== '/') {
            trackPage(data.path);
          }
          const contentDocument = document.querySelector("#rc-widget-adapter-frame").contentWindow.document;
          if (data.path.includes('/settings')) {
            // Hack: change auto log wording
            const changeWordingList = contentDocument.querySelectorAll('.SettingsPanel_content > .Line_root > .IconField_wrapper > .IconField_content > span');
            for (const changeWordingNode of changeWordingList) {
              if (changeWordingNode.innerHTML.includes('calls')) {
                changeWordingNode.innerHTML = 'Auto pop up call logging page after call';
              }
              if (changeWordingNode.innerHTML.includes('messages')) {
                changeWordingNode.innerHTML = 'Auto pop up SMS logging page';
              }
            }

            // Hack: change authorize button wording
            const authorizeButtonNode = contentDocument.querySelector('.SettingsPanel_content > section > .Line_root > .AuthorizeSettingsSection_accountWrapper > .Button_root');
            if (!!authorizeButtonNode) {
              authorizeButtonNode.innerText = authorizeButtonNode.innerText === 'Authorize' ? 'Connect' : 'Disconnect';
            }

            // Hack: show login status
            showCRMLoginStatusDot();
          }
          // Hack: inject a button to open sms template
          if (data.path.includes('/conversations/') || data.path === '/composeText') {
            const buttonContainer = contentDocument.querySelector('.MessageInput_supportAttachment');
            const textField = contentDocument.querySelector('.MessageInput_supportAttachment > .MessageInput_textField');
            const attachmentButton = contentDocument.querySelector('.MessageInput_supportAttachment > .MessageInput_attachmentIcon');
            textField.style.marginLeft = '60px';
            const newButtonParent = attachmentButton.cloneNode(true);
            buttonContainer.appendChild(newButtonParent);
            newButtonParent.style.left = '30px';
            newButton = newButtonParent.querySelector('button');
            newButton.removeChild(newButton.querySelector('.attachment'))
            newButton.innerHTML = '<svg viewBox="-3 -3 30 30"><path d="M3 10h11v2H3v-2zm0-2h11V6H3v2zm0 8h7v-2H3v2zm15.01-3.13.71-.71c.39-.39 1.02-.39 1.41 0l.71.71c.39.39.39 1.02 0 1.41l-.71.71-2.12-2.12zm-.71.71-5.3 5.3V21h2.12l5.3-5.3-2.12-2.12z"></path></svg>'
            newButton.onclick = () => {
              window.postMessage({
                type: 'rc-select-sms-template'
              }, '*');
            }
          }
          break;
        case 'rc-post-message-request':
          switch (data.path) {
            case '/authorize':
              const { rcUnifiedCrmExtJwt } = await chrome.storage.local.get('rcUnifiedCrmExtJwt');
              if (!rcUnifiedCrmExtJwt) {
                switch (platform.authType) {
                  case 'oauth':
                    let authUri;
                    if (platformName === 'pipedrive') {
                      authUri = config.platforms.pipedrive.redirectUri;
                    }
                    else if (platformName === 'bullhorn') {
                      let { crm_extension_bullhorn_user_urls } = await chrome.storage.local.get({ crm_extension_bullhorn_user_urls: null });
                      if (crm_extension_bullhorn_user_urls?.oauthUrl) {
                        authUri = `${crm_extension_bullhorn_user_urls.oauthUrl}/authorize?` +
                          `response_type=code` +
                          `&action=Login` +
                          `&client_id=${platform.clientId}` +
                          `&state=platform=${platform.name}` +
                          '&redirect_uri=https://ringcentral.github.io/ringcentral-embeddable/redirect.html';
                      }
                      else {
                        const { crm_extension_bullhornUsername } = await chrome.storage.local.get({ crm_extension_bullhornUsername: null });
                        showNotification({ level: 'warning', message: 'Bullhorn authorize error. Please try again in 30 seconds', ttl: 30000 });
                        const { data: crm_extension_bullhorn_user_urls } = await axios.get(`https://rest.bullhornstaffing.com/rest-services/loginInfo?username=${crm_extension_bullhornUsername}`);
                        await chrome.storage.local.set({ crm_extension_bullhorn_user_urls });
                        if (crm_extension_bullhorn_user_urls?.oauthUrl) {
                          authUri = `${crm_extension_bullhorn_user_urls.oauthUrl}/authorize?` +
                            `response_type=code` +
                            `&action=Login` +
                            `&client_id=${platform.clientId}` +
                            `&state=platform=${platform.name}` +
                            '&redirect_uri=https://ringcentral.github.io/ringcentral-embeddable/redirect.html';
                        }
                      }
                    }
                    else {
                      authUri = `${platform.authUrl}?` +
                        `response_type=code` +
                        `&client_id=${platform.clientId}` +
                        `&state=platform=${platform.name}` +
                        '&redirect_uri=https://ringcentral.github.io/ringcentral-embeddable/redirect.html';
                    }
                    handleThirdPartyOAuthWindow(authUri);
                    break;
                  case 'apiKey':
                    window.postMessage({ type: 'rc-apiKey-input-modal', platform: platform.name }, '*');
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
                // skip contact with just extension number
                if (!contactPhoneNumber.startsWith('+')) {
                  continue;
                }
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
                    contactName: callMatchedContact.name,
                    autoLog: !!extensionUserSettings && extensionUserSettings.find(e => e.name === 'Auto log with countdown')?.value
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
              if (!data.body.correspondentEntity) {
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
                    autoLog: !!extensionUserSettings && extensionUserSettings.find(e => e.name === 'Auto log with countdown')?.value,
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
              trackOpenFeedback({ rcAccountId: rcUserInfo?.rcAccountId });
              break;
            case '/settings':
              extensionUserSettings = data.body.settings;
              await chrome.storage.local.set({ extensionUserSettings });
              for (const setting of extensionUserSettings) {
                trackEditSettings({ rcAccountId: rcUserInfo?.rcAccountId, changedItem: setting.name.replaceAll(' ', '-'), status: setting.value });
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
    console.log(e)
    if (e.response && e.response.data && !noShowNotification) {
      showNotification({ level: 'warning', message: e.response.data, ttl: 5000 });
    }
    else {
      console.error(e);
    }
    window.postMessage({ type: 'rc-log-modal-loading-off' }, '*');
  }
});

chrome.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
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
  }
  else if (request.type === 'pipedriveCallbackUri' && !(await auth.checkAuth())) {
    await auth.onAuthCallback(`${request.pipedriveCallbackUri}&state=platform=pipedrive`);
    console.log('pipedriveAltAuthDone')
    chrome.runtime.sendMessage(
      {
        type: 'pipedriveAltAuthDone'
      }
    );
  }
  else if (request.type === 'c2sms') {
    document.querySelector("#rc-widget-adapter-frame").contentWindow.postMessage({
      type: 'rc-adapter-new-sms',
      phoneNumber: request.phoneNumber,
      conversation: true, // will go to conversation page if conversation existed
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
  else if (request.type === 'navigate') {
    if (request.path === '/feedback') {
      window.postMessage({
        type: 'rc-feedback-open',
        props: {
          userName: rcUserInfo?.rcUserName,
          userEmail: rcUserInfo?.rcUserEmail
        }
      }, '*');
      trackOpenFeedback({ rcAccountId: rcUserInfo?.rcAccountId });
    }
    else {
      document.querySelector("#rc-widget-adapter-frame").contentWindow.postMessage({
        type: 'rc-adapter-navigate-to',
        path: request.path, // '/meeting', '/dialer', '//history', '/settings'
      }, '*');
    }
    sendResponse({ result: 'ok' });
  }
  else if (request.type === 'insightlyAuth') {
    await apiKeyLogin({
      apiKey: request.apiKey,
      apiUrl: request.apiUrl
    });
    window.postMessage({ type: 'rc-apiKey-input-modal-close', platform: platform.name }, '*');
    chrome.runtime.sendMessage({
      type: 'openPopupWindow'
    });
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
    settings: [
      {
        name: 'Auto log with countdown',
        value: !!extensionUserSettings && (extensionUserSettings.find(e => e.name === 'Auto log with countdown')?.value ?? false)
      },
      {
        name: 'Open contact web page from incoming call',
        value: !!extensionUserSettings && (extensionUserSettings.find(e => e.name === 'Open contact web page from incoming call')?.value ?? false)
      }
    ],
  }
  return services;
}