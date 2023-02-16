import { AnalyticsBrowser } from '@segment/analytics-next'

const analytics = AnalyticsBrowser.load({ writeKey: 'xlXnHES4XlHyloBQnzSDGRvq8axDmoi8' });
const appName = 'RingCentral CRM Extension';

exports.identify = function identify({ platformName, accountId, extensionId }) {
    const identifyTraits = {
        crmPlatform: platformName,
        accountId
    };
    analytics.identify(extensionId, identifyTraits, {
        integrations: {
            All: true,
            Mixpanel: true,
        }
    });
}

exports.group = function group({ platformName, accountId }) {
    analytics.group(accountId, { crmPlatform: platformName }, {
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


exports.trackFirstTimeSetup = function trackFirstTimeSetup({ platformName }) {
    track('First time setup', {
        crmPlatform: platformName,
        appName
    });
}
exports.trackRcLogin = function trackRcLogin({ platformName, rcAccountId }) {
    track('Login with RingCentral account', {
        crmPlatform: platformName,
        appName,
        rcAccountId
    });
}
exports.trackRcLogout = function trackRcLogout({ platformName }) {
    track('Logout with RingCentral account', {
        crmPlatform: platformName,
        appName
    });
}
exports.trackCrmLogin = function trackCrmLogin({ platformName, rcAccountId }) {
    track('Login with CRM account', {
        crmPlatform: platformName,
        appName,
        rcAccountId
    });
}
exports.trackCrmLogout = function trackCrmLogout({ platformName, rcAccountId }) {
    track('Logout with CRM account', {
        crmPlatform: platformName,
        appName,
        rcAccountId
    });
}
exports.trackPlacedCall = function trackPlacedCall({ platformName, rcAccountId }) {
    track('A new call placed', {
        crmPlatform: platformName,
        appName,
        rcAccountId
    });
}
exports.trackAnsweredCall = function trackAnsweredCall({ platformName, rcAccountId }) {
    track('A new call answered', {
        crmPlatform: platformName,
        appName,
        rcAccountId
    });
}
exports.trackCallEnd = function trackCallEnd({ durationInSeconds, platformName, rcAccountId }) {
    track('A call is ended', {
        durationInSeconds,
        crmPlatform: platformName,
        appName,
        rcAccountId
    });
}
// TODO
exports.trackSentSMS = function trackSentSMS({ platformName, rcAccountId }) {
    track('A new SMS sent'), {
        crmPlatform: platformName,
        appName,
        rcAccountId
    }
}
exports.trackSyncCallLog = function trackSyncCallLog({ hasNote, platformName, rcAccountId }) {
    track('Sync call log', {
        hasNote,
        crmPlatform: platformName,
        appName,
        rcAccountId
    })
}
exports.trackSyncMessageLog = function trackSyncMessageLog({ platformName, rcAccountId }) {
    track('Sync message log', {
        crmPlatform: platformName,
        appName,
        rcAccountId
    })
}
// TODO
exports.trackEditSettings = function trackEditSettings({ changedItem, platformName, rcAccountId }) {
    track('Edit settings', {
        changedItem,
        crmPlatform: platformName,
        appName,
        rcAccountId
    })
}
// TODO
exports.trackUpdateStatus = function trackUpdateStatus({ from, to, platformName, rcAccountId }) {
    track('Update status', {
        from, to,
        crmPlatform: platformName,
        appName,
        rcAccountId
    })
}
// TODO
exports.trackCreateMeeting = function trackCreateMeeting({ meetingType, platformName, rcAccountId }) {
    track('Create meeting', {
        meetingType,
        crmPlatform: platformName,
        appName,
        rcAccountId
    })
}