import { getHash } from './util';
import { AnalyticsBrowser } from '@segment/analytics-next'

const analytics = AnalyticsBrowser.load({ writeKey: 'xlXnHES4XlHyloBQnzSDGRvq8axDmoi8' });
const appName = 'RingCentral CRM Extension';

exports.identify = function identify({ platformName, accountId, extensionId }) {
    const identifyTraits = {
        appName: appName,
        crmPlatform: platformName,
        accountId: getHash(accountId)
    };
    analytics.identify(getHash(extensionId), identifyTraits, {
        integrations: {
            All: true,
            Mixpanel: true,
        }
    });
}

function track(event, properties = {}) {
    const trackProps = {
        appName: appName,
        ...properties,
    };
    analytics.track(event, trackProps, {
        integrations: {
            All: true,
            Mixpanel: true,
        },
    });
}

function page(name, properties = {}) {
    analytics.page(name, {
        appName: appName,
        ...properties,
    }, {
        integrations: {
            All: true,
            Mixpanel: true,
        },
    });
}


exports.trackFirstTimeSetup = function trackFirstTimeSetup({ platform }) { track(`${appName} - First time setup`, { platform }); }
exports.trackRcLogin = function trackRcLogin() { track('Login with RingCentral account', {}); }
exports.trackRcLogout = function trackRcLogout() { track('Logout with RingCentral account', {}); }
exports.trackCrmLogin = function trackCrmLogin({ platform }) { track('Login with CRM account', { platform }); }
exports.trackCrmLogout = function trackCrmLogout({ platform }) { track('Logout with CRM account', { platform }); }
exports.trackPlacedCall = function trackPlacedCall() { track('A new call placed', {}); }
exports.trackAnsweredCall = function trackAnsweredCall() { track('A new call answered', {}); }
exports.trackCallEnd = function trackCallEnd({ durationInSeconds }) { track('A call is ended', { durationInSeconds }); }
exports.trackSentSMS = function trackSentSMS() { track('A new SMS sent'), {} }// TODO
exports.trackSyncCallLog = function trackSyncCallLog({ hasNote }) { track('Sync call log', { hasNote }) }
exports.trackSyncMessageLog = function trackSyncMessageLog() { track('Sync message log', {}) }
exports.trackEditSettings = function trackEditSettings({ changedItem }) { track('Edit settings', { changedItem }) }// TODO
exports.trackUpdateStatus = function trackUpdateStatus({ from, to }) { track('Update status', { from, to }) }// TODO
exports.trackCreateMeeting = function trackCreateMeeting({ meetingType }) { track('Create meeting', { meetingType }) }// TODO