const auth = require('./core/auth');
const { checkLog, openLog, addLog, updateLog, getCachedNote, cacheCallNote } = require('./core/log');
const { getContact, createContact, openContactPage } = require('./core/contact');
const { responseMessage, isObjectEmpty, showNotification } = require('./lib/util');
const { getUserInfo } = require('./lib/rcAPI');
const { apiKeyLogin } = require('./core/auth');
const { openDB } = require('idb');
const logPage = require('./components/logPage');
const authPage = require('./components/authPage');
const feedbackPage = require('./components/feedbackPage');
const releaseNotesPage = require('./components/releaseNotesPage');
const {
  identify,
  reset,
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

let config = require('./config.json');
let registered = false;
let crmAuthed = false;
let platform = null;
let platformName = '';
let rcUserInfo = {};
let extensionUserSettings = null;
// trailing SMS logs need to know if leading SMS log is ready and page is open. The waiting is for getContact call
let leadingSMSCallReady = false;
let trailingSMSLogInfo = [];
let firstTimeLogoutAbsorbed = false;

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

async function getCustomConfig() {
  const { customCrmConfig } = await chrome.storage.local.get({ customCrmConfig: null });
  if (!!customCrmConfig) {
    config = customCrmConfig;
  }
}

getCustomConfig();

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

            RCAdapter.showFeedback({
              onFeedback: function () {
                const feedbackPageRender = feedbackPage.getFeedbackPageRender();
                document.querySelector("#rc-widget-adapter-frame").contentWindow.postMessage({
                  type: 'rc-adapter-register-customized-page',
                  page: feedbackPageRender
                });
                document.querySelector("#rc-widget-adapter-frame").contentWindow.postMessage({
                  type: 'rc-adapter-navigate-to',
                  path: `/customized/${feedbackPageRender.id}`, // '/meeting', '/dialer', '//history', '/settings'
                }, '*');
                trackOpenFeedback();
              },
            });
          }
          break;
        case 'rc-adapter-pushAdapterState':
          extensionUserSettings = (await chrome.storage.local.get('extensionUserSettings')).extensionUserSettings;
          if (!registered) {
            const platformInfo = await chrome.storage.local.get('platform-info');
            platformName = platformInfo['platform-info'].platformName;
            platformHostname = platformInfo['platform-info'].hostname;
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
          const platformInfo = await chrome.storage.local.get('platform-info');
          platformName = platformInfo['platform-info'].platformName;
          rcUserInfo = (await chrome.storage.local.get('rcUserInfo')).rcUserInfo;
          if (data.loggedIn) {
            document.getElementById('rc-widget').style.zIndex = 0;
            const { rcUnifiedCrmExtJwt } = await chrome.storage.local.get('rcUnifiedCrmExtJwt');
            crmAuthed = !!rcUnifiedCrmExtJwt;
            // Unique: Pipedrive
            if (platformName === 'pipedrive' && !(await auth.checkAuth())) {
              chrome.runtime.sendMessage(
                {
                  type: 'popupWindowRequestPipedriveCallbackUri'
                }
              );
            }
            else if (!rcUnifiedCrmExtJwt) {
              showNotification({ level: 'warning', message: 'Please authorize CRM platform account via Settings.', ttl: 10000 });
            }
            try {
              const extId = JSON.parse(localStorage.getItem('sdk-rc-widgetplatform')).owner_id;
              const indexDB = await openDB(`rc-widget-storage-${extId}`, 2);
              const rcInfo = await indexDB.get('keyvaluepairs', 'dataFetcherV2-storageData');
              const userInfoResponse = await getUserInfo({
                extensionId: rcInfo.value.cachedData.extensionInfo.id,
                accountId: rcInfo.value.cachedData.extensionInfo.account.id
              });
              rcUserInfo = {
                rcUserName: rcInfo.value.cachedData.extensionInfo.name,
                rcUserEmail: rcInfo.value.cachedData.extensionInfo.contact.email,
                rcAccountId: userInfoResponse.accountId,
                rcExtensionId: userInfoResponse.extensionId
              };
              await chrome.storage.local.set({ ['rcUserInfo']: rcUserInfo });
              reset();
              identify({ extensionId: rcUserInfo?.rcExtensionId, rcAccountId: rcUserInfo?.rcAccountId, platformName });
              group({ rcAccountId: rcUserInfo?.rcAccountId });
            }
            catch (e) {
              reset();
              console.error(e);
            }
          }

          let { rcLoginStatus } = await chrome.storage.local.get('rcLoginStatus');
          // case 1: fresh login
          if (rcLoginStatus === null) {
            if (data.loggedIn) {
              trackRcLogin();
              rcLoginStatus = true;
              await chrome.storage.local.set({ ['rcLoginStatus']: rcLoginStatus });
            }
          }
          // case 2: login status changed
          else {
            // case 2.1: logged in
            if (data.loggedIn && !rcLoginStatus) {
              trackRcLogin();
              rcLoginStatus = true;
              await chrome.storage.local.set({ ['rcLoginStatus']: rcLoginStatus });
            }
            // case 2.2: logged out
            if (!data.loggedIn && rcLoginStatus) {
              // first time open the extension, it'll somehow send a logout event anyway
              if (!firstTimeLogoutAbsorbed) {
                firstTimeLogoutAbsorbed = true;
              }
              else {
                trackRcLogout();
                rcLoginStatus = false;
                await chrome.storage.local.set({ ['rcLoginStatus']: rcLoginStatus });
              }
            }
          }
          // Check version and show release notes
          const registeredVersionInfo = await chrome.storage.local.get('rc-crm-extension-version');
          if (!!registeredVersionInfo[['rc-crm-extension-version']]) {
            const releaseNotesPageRender = releaseNotesPage.getReleaseNotesPageRender({ config, platformName, registeredVersion: registeredVersionInfo['rc-crm-extension-version'] });
            if (!!releaseNotesPageRender) {
              document.querySelector("#rc-widget-adapter-frame").contentWindow.postMessage({
                type: 'rc-adapter-register-customized-page',
                page: releaseNotesPageRender
              });
              document.querySelector("#rc-widget-adapter-frame").contentWindow.postMessage({
                type: 'rc-adapter-navigate-to',
                path: `/customized/${releaseNotesPageRender.id}`, // '/meeting', '/dialer', '//history', '/settings'
              }, '*');
            }
          }
          await chrome.storage.local.set({
            ['rc-crm-extension-version']: config.version
          });
          break;
        case 'rc-login-popup-notify':
          handleRCOAuthWindow(data.oAuthUri);
          break;
        case 'rc-call-init-notify':
          trackPlacedCall();
          break;
        case 'rc-call-start-notify':
          // get call when a incoming call is accepted or a outbound call is connected
          if (data.call.direction === 'Inbound') {
            trackAnsweredCall();
          }
          break;
        case 'rc-call-end-notify':
          // get call on call end event
          const callDurationInSeconds = (data.call.endTime - data.call.startTime) / 1000;
          trackCallEnd({ durationInSeconds: callDurationInSeconds });
          break;
        case 'rc-ringout-call-notify':
          // get call on active call updated event
          if (data.call.telephonyStatus === 'NoCall' && data.call.terminationType === 'final') {
            const callDurationInSeconds = (data.call.endTime - data.call.startTime) / 1000;
            trackCallEnd({ durationInSeconds: callDurationInSeconds });
          }
          if (data.call.telephonyStatus === 'CallConnected') {
            trackConnectedCall();
          }
          break;
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
            if (!!extensionUserSettings && extensionUserSettings.find(e => e.name === 'Open contact web page from incoming call')?.value) {
              openContactPage({ platformName, phoneNumber: data.call.direction === 'Inbound' ? data.call.from.phoneNumber : data.call.to.phoneNumber });
            }
          }
          break;
        case 'rc-analytics-track':
          switch (data.event) {
            case 'SMS: SMS sent successfully':
              trackSentSMS();
              break;
            case 'Meeting Scheduled':
              trackCreateMeeting();
              break;
          }
          break;
        case 'rc-callLogger-auto-log-notify':
          await chrome.storage.local.set({ rc_callLogger_auto_log_notify: data.autoLog });
          trackEditSettings({ changedItem: 'auto-call-log', status: data.autoLog });
          break;
        case 'rc-messageLogger-auto-log-notify':
          await chrome.storage.local.set({ rc_messageLogger_auto_log_notify: data.autoLog });
          trackEditSettings({ changedItem: 'auto-message-log', status: data.autoLog });
          break;
        case 'rc-route-changed-notify':
          if (data.path !== '/') {
            trackPage(data.path);
          }
          if (!!data.path) {
            if (data.path.startsWith('/conversations/') || data.path.startsWith('/composeText')) {
              window.postMessage({ type: 'rc-expandable-call-note-terminate' }, '*');
            }
            else if (data.path.startsWith('/calls/active/')) {
              window.postMessage({ type: 'rc-expandable-call-note-open' }, '*');
            }
          }
          break;
        case 'rc-post-message-request':
          if (!crmAuthed && (data.path === '/callLogger' || data.path === '/messageLogger')) {
            showNotification({ level: 'warning', message: 'Please authorize CRM platform account via Settings.', ttl: 10000 });
            break;
          }
          switch (data.path) {
            case '/authorize':
              const { rcUnifiedCrmExtJwt } = await chrome.storage.local.get('rcUnifiedCrmExtJwt');
              crmAuthed = !!rcUnifiedCrmExtJwt;
              if (!rcUnifiedCrmExtJwt) {
                switch (platform.authType) {
                  case 'oauth':
                    let authUri;
                    // Unique: Pipedrive
                    if (platformName === 'pipedrive') {
                      authUri = config.platforms.pipedrive.redirectUri;
                    }
                    // Unique: Bullhorn
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
                        `${!!platform.scopes ? `&scope=${platform.scopes}` : ''}` +
                        `&state=platform=${platform.name}` +
                        '&redirect_uri=https://ringcentral.github.io/ringcentral-embeddable/redirect.html';
                    }
                    handleThirdPartyOAuthWindow(authUri);
                    break;
                  case 'apiKey':
                    const authPageRender = authPage.getAuthPageRender({ config, platformName });
                    document.querySelector("#rc-widget-adapter-frame").contentWindow.postMessage({
                      type: 'rc-adapter-register-customized-page',
                      page: authPageRender
                    });
                    document.querySelector("#rc-widget-adapter-frame").contentWindow.postMessage({
                      type: 'rc-adapter-navigate-to',
                      path: `/customized/${authPageRender.id}`, // '/meeting', '/dialer', '//history', '/settings'
                    }, '*');
                    break;
                }
              }
              else {
                window.postMessage({ type: 'rc-log-modal-loading-on' }, '*');
                auth.unAuthorize({ platformName, rcUnifiedCrmExtJwt });
                window.postMessage({ type: 'rc-log-modal-loading-off' }, '*');
              }
              responseMessage(
                data.requestId,
                {
                  data: 'OK'
                }
              );
              break;
            case '/customizedPage/inputChanged':
              document.querySelector("#rc-widget-adapter-frame").contentWindow.postMessage({
                type: 'rc-post-message-response',
                responseId: data.requestId,
                response: { data: 'ok' },
              }, '*');
              break;
            case '/contacts/match':
              noShowNotification = true;
              let matchedContacts = {};
              const { tempContactMatchTask } = await chrome.storage.local.get({ tempContactMatchTask: null });
              if (data.body.phoneNumbers.length === 1 && !!tempContactMatchTask) {
                matchedContacts[tempContactMatchTask.phoneNumber] = [
                  {
                    id: tempContactMatchTask.id,
                    type: platformName,
                    name: tempContactMatchTask.contactName,
                    phoneNumbers: [
                      {
                        phoneNumber: tempContactMatchTask.phoneNumber,
                        phoneType: 'direct'
                      }
                    ],
                    entityType: platformName
                  }
                ];
                await chrome.storage.local.remove('tempContactMatchTask');
              }
              else {
                for (const contactPhoneNumber of data.body.phoneNumbers) {
                  // skip contact with just extension number
                  if (!contactPhoneNumber.startsWith('+')) {
                    continue;
                  }
                  // query on 3rd party API to get the matched contact info and return
                  const { matched: contactMatched, contactInfo } = await getContact({ phoneNumber: contactPhoneNumber });
                  if (contactMatched) {
                    matchedContacts[contactPhoneNumber] = [];
                    for (var contactInfoItem of contactInfo) {
                      matchedContacts[contactPhoneNumber].push({
                        id: contactInfoItem.id,
                        type: platformName,
                        name: contactInfoItem.name,
                        phoneNumbers: [
                          {
                            phoneNumber: contactPhoneNumber,
                            phoneType: 'direct'
                          }
                        ],
                        entityType: platformName,
                        contactType: contactInfoItem.type,
                        additionalInfo: contactInfoItem.additionalInfo
                      });
                    }
                  }
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
            case '/contacts/view':
              window.postMessage({ type: 'rc-log-modal-loading-on' }, '*');
              openContactPage({ platformName, phoneNumber: data.body.phoneNumbers[0].phoneNumber });
              window.postMessage({ type: 'rc-log-modal-loading-off' }, '*');
              responseMessage(
                data.requestId,
                {
                  data: 'ok'
                });
              break;
            case '/callLogger':
              // data.body.call?.to?.phoneNumber?.length > 4 to distinguish extension from external number
              if (data.body.triggerType && data.body.call?.to?.phoneNumber?.length > 4) {
                // Sync events
                if (data.body.triggerType === 'callLogSync') {
                  if (!!data.body.call?.recording?.link) {
                    console.log('call recording updating...');
                    await chrome.storage.local.set({ ['rec-link-' + data.body.call.sessionId]: { recordingLink: data.body.call.recording.link } });
                    await updateLog(
                      {
                        logType: 'Call',
                        sessionId: data.body.call.sessionId,
                        recordingLink: data.body.call.recording.link
                      });
                  }
                  break;
                }
                // Presence events, but not hang up event
                if (data.body.triggerType === 'presenceUpdate' && data.body.call.result !== 'Disconnected') {
                  break;
                }
              }
              window.postMessage({ type: 'rc-log-modal-loading-on' }, '*');
              const contactPhoneNumber = data.body.call.direction === 'Inbound' ?
                data.body.call.from.phoneNumber :
                data.body.call.to.phoneNumber;
              const { callLogs: fetchedCallLogs } = await checkLog({
                logType: 'Call',
                sessionIds: data.body.call.sessionId
              });
              const { matched: callContactMatched, message: callLogContactMatchMessage, contactInfo: callMatchedContact } = await getContact({ phoneNumber: contactPhoneNumber });
              let note = '';
              switch (data.body.triggerType) {
                // createLog and editLog share the same page
                case 'createLog':
                  note = await getCachedNote({ sessionId: data.body.call.sessionId });
                case 'editLog':
                  if (!!fetchedCallLogs.find(l => l.sessionId == data.body.call.sessionId)?.logData?.note) {
                    note = fetchedCallLogs.find(l => l.sessionId == data.body.call.sessionId).logData.note;
                  }
                  // add your codes here to log call to your service
                  const callPage = logPage.getLogPageRender({ config, logType: 'Call', triggerType: data.body.triggerType, platformName, direction: data.body.call.direction, contactInfo: callMatchedContact ?? [], subject: fetchedCallLogs.find(l => l.sessionId == data.body.call.sessionId)?.logData?.subject, note });
                  document.querySelector("#rc-widget-adapter-frame").contentWindow.postMessage({
                    type: 'rc-adapter-update-call-log-page',
                    page: callPage,
                  }, '*');

                  // navigate to call log page
                  document.querySelector("#rc-widget-adapter-frame").contentWindow.postMessage({
                    type: 'rc-adapter-navigate-to',
                    path: `/log/call/${data.body.call.sessionId}`,
                  }, '*');
                  break;
                case 'viewLog':
                  if (config.platforms[platformName].canOpenLogPage) {
                    for (const c of callMatchedContact) {
                      openLog({ platformName, hostname: platformHostname, logId: fetchedCallLogs.find(l => l.sessionId == data.body.call.sessionId)?.logId, contactType: c.type });
                    }
                  }
                  else {
                    openContactPage({ platformName, phoneNumber: contactPhoneNumber });
                  }
                  break;
                case 'logForm':
                  let additionalSubmission = {};
                  const additionalFields = config.platforms[platformName].page?.callLog?.additionalFields ?? [];
                  for (const f of additionalFields) {
                    if (data.body.formData[f.const] != "none") {
                      additionalSubmission[f.const] = data.body.formData[f.const];
                    }
                  }
                  switch (data.body.formData.triggerType) {
                    case 'createLog':
                      let newContactInfo = {};
                      if (data.body.formData.contact === 'createNewContact') {
                        const newContactResp = await createContact({
                          phoneNumber: contactPhoneNumber,
                          newContactName: data.body.formData.newContactName,
                          newContactType: data.body.formData.newContactType
                        });
                        newContactInfo = newContactResp.contactInfo;
                      }
                      await addLog(
                        {
                          logType: 'Call',
                          logInfo: data.body.call,
                          isMain: true,
                          note: data.body.formData.note ?? "",
                          subject: data.body.formData.activityTitle ?? "",
                          additionalSubmission,
                          contactId: newContactInfo?.id ?? data.body.formData.contact,
                          contactType: data.body.formData.newContactName === '' ? data.body.formData.contactType : data.body.formData.newContactType,
                          contactName: data.body.formData.newContactName === '' ? data.body.formData.contactName : data.body.formData.newContactName
                        });
                      break;
                    case 'editLog':
                      await updateLog({
                        logType: 'Call',
                        sessionId: data.body.call.sessionId,
                        subject: data.body.formData.activityTitle ?? "",
                        note: data.body.formData.note ?? "",
                      });
                      break;
                  }
                  break;
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
            case '/callLogger/inputChanged':
              await cacheCallNote({
                sessionId: data.body.call.sessionId,
                note: data.body.formData.note ?? ''
              });
              const page = logPage.getUpdatedLogPageRender({ config, platformName, updateData: data.body });
              document.querySelector("#rc-widget-adapter-frame").contentWindow.postMessage({
                type: 'rc-adapter-update-call-log-page',
                page
              }, '*');
              responseMessage(
                data.requestId,
                {
                  data: 'ok'
                }
              );
              break;
            case '/callLogger/match':
              let callLogMatchData = {};
              const { successful, callLogs, message: checkLogMessage } = await checkLog({ logType: 'Call', sessionIds: data.body.sessionIds.toString() });
              if (successful) {
                for (const sessionId of data.body.sessionIds) {
                  const correspondingLog = callLogs.find(l => l.sessionId === sessionId);
                  if (!!correspondingLog?.matched) {
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
              if (data.body.triggerType === 'logForm') {
                if (data.body.redirect) {
                  window.postMessage({ type: 'rc-log-modal-loading-on' }, '*');
                  let additionalSubmission = {};
                  const additionalFields = config.platforms[platformName].page?.messageLog?.additionalFields ?? [];
                  for (const f of additionalFields) {
                    if (data.body.formData[f.const] != "none") {
                      additionalSubmission[f.const] = data.body.formData[f.const];
                    }
                  }
                  let newContactInfo = {};
                  if (data.body.formData.contact === 'createNewContact') {
                    const newContactResp = await createContact({
                      phoneNumber: data.body.conversation.correspondents[0].phoneNumber,
                      newContactName: data.body.formData.newContactName,
                      newContactType: data.body.formData.newContactType
                    });
                    newContactInfo = newContactResp.contactInfo;
                  }
                  await addLog({
                    logType: 'Message',
                    logInfo: data.body.conversation,
                    isMain: true,
                    note: '',
                    additionalSubmission,
                    contactId: newContactInfo?.id ?? data.body.formData.contact,
                    contactType: data.body.formData.newContactName === '' ? data.body.formData.contactType : data.body.formData.newContactType,
                    contactName: data.body.formData.newContactName === '' ? data.body.formData.contactName : data.body.formData.newContactName
                  });
                  for (const trailingConversations of trailingSMSLogInfo) {
                    await addLog({
                      logType: 'Message',
                      logInfo: trailingConversations,
                      isMain: false,
                      note: '',
                      additionalSubmission,
                      contactId: newContactInfo?.id ?? data.body.formData.contact,
                      contactType: data.body.formData.newContactName === '' ? data.body.formData.contactType : data.body.formData.newContactType,
                      contactName: data.body.formData.newContactName === '' ? data.body.formData.contactName : data.body.formData.newContactName
                    });
                  }
                  window.postMessage({ type: 'rc-log-modal-loading-off' }, '*');
                }
              }
              else {
                const { rc_messageLogger_auto_log_notify: messageAutoLogOn } = await chrome.storage.local.get({ rc_messageLogger_auto_log_notify: false });
                if (!messageAutoLogOn && data.body.triggerType === 'auto') {
                  break;
                }
                const isTrailing = !data.body.redirect && data.body.triggerType !== 'auto';
                if (isTrailing) {
                  if (!leadingSMSCallReady) {
                    trailingSMSLogInfo.push(data.body.conversation);
                    break;
                  }
                }
                else {
                  leadingSMSCallReady = false;
                  trailingSMSLogInfo = [];
                }
                window.postMessage({ type: 'rc-log-modal-loading-on' }, '*');
                let getContactMatchResult = null;
                if (!isTrailing) {
                  getContactMatchResult = await getContact({
                    phoneNumber: data.body.conversation.correspondents[0].phoneNumber
                  });
                }
                // add your codes here to log call to your service
                const messagePage = logPage.getLogPageRender({ config, logType: 'Message', triggerType: data.body.triggerType, platformName, direction: '', contactInfo: getContactMatchResult.contactInfo ?? [] });
                document.querySelector("#rc-widget-adapter-frame").contentWindow.postMessage({
                  type: 'rc-adapter-update-messages-log-page',
                  page: messagePage
                }, '*');

                // navigate to message log page
                document.querySelector("#rc-widget-adapter-frame").contentWindow.postMessage({
                  type: 'rc-adapter-navigate-to',
                  path: `/log/messages/${data.body.conversation.conversationId}`, // conversation id that you received from message logger event
                }, '*');
                if (!isTrailing) {
                  leadingSMSCallReady = true;
                }
                window.postMessage({ type: 'rc-log-modal-loading-off' }, '*');
              }
              // response to widget
              responseMessage(
                data.requestId,
                {
                  data: 'ok'
                }
              );
              break;
            case '/messageLogger/inputChanged':
              const updatedPage = logPage.getUpdatedLogPageRender({ config, logType: 'Message', platformName, updateData: data.body });
              document.querySelector("#rc-widget-adapter-frame").contentWindow.postMessage({
                type: 'rc-adapter-update-messages-log-page',
                page: updatedPage
              }, '*');
              responseMessage(
                data.requestId,
                {
                  data: 'ok'
                }
              );
              break;
            case '/messageLogger/match':
              let localMessageLogs = {};
              for (const conversationLogId of data.body.conversationLogIds) {
                const savedMessageLogRecord = await chrome.storage.local.get(conversationLogId);
                if (!!savedMessageLogRecord && !isObjectEmpty(savedMessageLogRecord)) {
                  localMessageLogs[conversationLogId] = [{ id: 'dummyId' }]
                }
              }
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
              const feedbackPageRender = feedbackPage.getFeedbackPageRender();
              document.querySelector("#rc-widget-adapter-frame").contentWindow.postMessage({
                type: 'rc-adapter-register-customized-page',
                page: feedbackPageRender
              });
              document.querySelector("#rc-widget-adapter-frame").contentWindow.postMessage({
                type: 'rc-adapter-navigate-to',
                path: `/customized/${feedbackPageRender.id}`, // '/meeting', '/dialer', '//history', '/settings'
              }, '*');
              trackOpenFeedback();
              break;
            case '/settings':
              extensionUserSettings = data.body.settings;
              await chrome.storage.local.set({ extensionUserSettings });
              for (const setting of extensionUserSettings) {
                trackEditSettings({ changedItem: setting.name.replaceAll(' ', '-'), status: setting.value });
              }
              break;
            case '/custom-button-click':
              switch (data.body.button.id) {
                case 'sms-template-button':
                  window.postMessage({
                    type: 'rc-select-sms-template'
                  }, '*');
                  break;
                case 'insightlyGetApiKey':
                  const platformInfo = await chrome.storage.local.get('platform-info');
                  const hostname = platformInfo['platform-info'].hostname;
                  window.open(`https://${hostname}/Users/UserSettings`);
                  break;
                case 'authPage':
                  window.postMessage({ type: 'rc-log-modal-loading-on' }, '*');
                  const returnedToken = await auth.apiKeyLogin({ apiKey: data.body.button.formData.apiKey, apiUrl: data.body.button.formData.apiUrl, username: data.body.button.formData.username, password: data.body.button.formData.password });
                  crmAuthed = !!returnedToken;
                  window.postMessage({ type: 'rc-log-modal-loading-off' }, '*');
                  break;
                case 'feedbackPage':
                  const feedbackText = encodeURIComponent(data.body.button.formData.feedback);
                  const platformNameInUrl = platformName.charAt(0).toUpperCase() + platformName.slice(1)
                  const formUrl = `https://docs.google.com/forms/d/e/1FAIpQLSd3vF5MVJ5RAo1Uldy0EwsibGR8ZVucPW4E3JUnyAkHz2_Zpw/viewform?usp=pp_url&entry.912199227=${data.body.button.formData.score}&entry.2052354973=${platformNameInUrl}&entry.844920872=${feedbackText}&entry.1467064016=${rcUserInfo.rcUserName}&entry.1822789675=${rcUserInfo.rcUserEmail}`;
                  window.open(formUrl, '_blank');
                  document.querySelector("#rc-widget-adapter-frame").contentWindow.postMessage({
                    type: 'rc-adapter-navigate-to',
                    path: 'goBack',
                  }, '*');
                  break;
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
    if (e.response && e.response.data && !noShowNotification && typeof e.response.data === 'string') {
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
      const returnedToken = await auth.onAuthCallback(request.callbackUri);
      crmAuthed = !!returnedToken;
    }
    sendResponse({ result: 'ok' });
  }
  // Unique: Pipedrive
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
      const feedbackPageRender = feedbackPage.getFeedbackPageRender();
      document.querySelector("#rc-widget-adapter-frame").contentWindow.postMessage({
        type: 'rc-adapter-register-customized-page',
        page: feedbackPageRender
      });
      document.querySelector("#rc-widget-adapter-frame").contentWindow.postMessage({
        type: 'rc-adapter-navigate-to',
        path: `/customized/${feedbackPageRender.id}`, // '/meeting', '/dialer', '//history', '/settings'
      }, '*');
      trackOpenFeedback();
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
    customizedPageInputChangedEventPath: '/customizedPage/inputChanged',
    // buttonEventPath: '/button-click',
    contactMatchPath: '/contacts/match',
    viewMatchedContactPath: '/contacts/view',

    // show auth/unauth button in ringcentral widgets
    authorizationPath: '/authorize',
    authorizedTitle: 'Logout',
    unauthorizedTitle: 'Connect',
    showAuthRedDot: true,
    authorized: false,
    authorizedAccount: '',

    // Enable call log sync feature
    callLoggerPath: '/callLogger',
    callLogPageInputChangedEventPath: '/callLogger/inputChanged',
    callLogEntityMatcherPath: '/callLogger/match',
    callLoggerAutoSettingLabel: 'Auto pop up call logging page after call',

    messageLoggerPath: '/messageLogger',
    messagesLogPageInputChangedEventPath: '/messageLogger/inputChanged',
    messageLogEntityMatcherPath: '/messageLogger/match',
    messageLoggerAutoSettingLabel: 'Auto pop up SMS logging page',

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
      },
      {
        name: 'Open contact web page after creating it',
        value: !!extensionUserSettings && (extensionUserSettings.find(e => e.name === 'Open contact web page after creating it')?.value ?? true)
      }
    ],

    // SMS template button
    buttonEventPath: '/custom-button-click',
    buttons: [{
      fill: 'rgba(102, 102, 102, 0.88)',
      id: 'sms-template-button',
      type: 'smsToolbar',
      icon: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACgAAAAoCAYAAACM/rhtAAABhGlDQ1BJQ0MgcHJvZmlsZQAAKJF9kT1Iw0AcxV8/RNGqgxlEHDJUXSyIijhKFYtgobQVWnUwufQLmjQkKS6OgmvBwY/FqoOLs64OroIg+AHi6uKk6CIl/i8ptIjx4Lgf7+497t4B/nqZqWZwAlA1y0jGomImuyp2vqIHAoIYQ5/ETD2eWkzDc3zdw8fXuwjP8j735+hVciYDfCLxHNMNi3iDeGbT0jnvEwusKCnE58TjBl2Q+JHrsstvnAsO+3mmYKST88QCsVhoY7mNWdFQiaeJw4qqUb4/47LCeYuzWq6y5j35C0M5bSXFdZrDiGEJcSQgQkYVJZRhIUKrRoqJJO1HPfxDjj9BLplcJTByLKACFZLjB/+D392a+alJNykUBTpebPtjBOjcBRo12/4+tu3GCRB4Bq60lr9SB2Y/Sa+1tPAR0L8NXFy3NHkPuNwBBp90yZAcKUDTn88D72f0TVlg4BboXnN7a+7j9AFIU1fLN8DBITBaoOx1j3d3tff275lmfz9t63Kl20nLgAAAAAZiS0dEAMcAxwDHM5ZYYgAAAAlwSFlzAAAN1wAADdcBQiibeAAAAAd0SU1FB+cLFAQoM4q6FyMAAAIvSURBVFjD7Zg9aBRBFIC/vctd/kgRIiksFJU0aQMhJAREG/9QEhElSZFmEGRMiNEQSfM6QRNQmUamMypKII2F2OgVaiCFKEIghYKNSKJYCAZRLjYjnGu4Pfaye6vsg2XhzVvet29m3nszkHDxlJZbQGuEPs5ZI5/CflwHHAN2Rgh4sZqPM0mf4hSwWqkDzgD1EfpYI5VU/mHxlJb7QFuEPoatkbVqdnF/xJWkIU3UKaATpaVZaWnwr8HDQC5Cvx8rhBsDZoGfSstZa2QewEtI5IaB+RKeInDKGln0EgCXA1aBPb6hb0BXttaAL5cLxa7u/U+AIV9Kyv1eg7WK3G5gArhgjbxRWgaBR0C+xKzRU1qWgPaQfqatkYUQcK3AM6ATuGaNTDn9CHDbrcVN4EAG2AXsDfm0hIDLAwsODuCS0jIOYI3cAWacfsYaKWRintaMi9BB39Cc0jLgIK8AJ9079kR9FTi9hT4L3FVa+hzkYuyVRGk5D0yWMWksmd4/Kkmv+4Mwsl4h3ABwPcDsLTD6Vz8YQ+S6gadAUxmzz0CfNbIaa7OgtOwDHgbAbQDHt4KLFFBp2eESb7kcWwRGrJEXsbZbSkuTi1xHgOlE6Y6NBVBpyQL3gJ6glGON3KxFw3oDOBFg8wC4XNGpbpuj1ws8DzArAIeske+1aPnzAeMrwGClcHGXug/AEWvkSxIPTV+Bo9bI+ySe6n6488WrsDcL2ynvgGmf7rU18vi/vTz6Bc+FlUoLYeXrAAAAAElFTkSuQmCC',
      label: 'SMS Template',
    }],
  }
  return services;
}