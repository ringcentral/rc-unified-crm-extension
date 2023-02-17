import { AnalyticsBrowser } from '@segment/analytics-next'
import manifest from '../../public/manifest.json';

const analytics = AnalyticsBrowser.load({ writeKey: 'xlXnHES4XlHyloBQnzSDGRvq8axDmoi8' });
const appName = 'RingCentral CRM Extension';
const version = manifest.version;

exports.identify = function identify({ platformName, rcAccountId, extensionId }) {
    const identifyTraits = {
        crmPlatform: platformName,
        rcAccountId,
        version
    };
    analytics.identify(extensionId, identifyTraits, {
        integrations: {
            All: true,
            Mixpanel: true,
        }
    });
}

exports.group = function group({ platformName, rcAccountId }) {
    analytics.group(rcAccountId, {
        crmPlatform: platformName,
        version
    }, {
        integrations: {
            All: true,
            Mixpanel: true,
        }
    });
}

function track(event, properties = {}) {
    const trackProps = {
        appName: appName,
        version,
        ...properties,
    };
    analytics.track(event, trackProps, {
        integrations: {
            All: true,
            Mixpanel: true,
        },
    });
}

exports.trackPage = function page(name, properties = {}) {
    analytics.page(name, {
        appName: appName,
        version,
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
exports.trackRcLogout = function trackRcLogout({ platformName, rcAccountId }) {
    track('Logout with RingCentral account', {
        crmPlatform: platformName,
        appName,
        rcAccountId
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
exports.trackSentSMS = function trackSentSMS({ platformName, rcAccountId }) {
    track('A new SMS sent', {
        crmPlatform: platformName,
        appName,
        rcAccountId
    });
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
exports.trackEditSettings = function trackEditSettings({ changedItem, status, platformName, rcAccountId }) {
    track('Edit settings', {
        changedItem,
        status,
        crmPlatform: platformName,
        appName,
        rcAccountId
    })
}
exports.trackUpdateStatus = function trackUpdateStatus({ presenceStatus, platformName, rcAccountId }) {
    track('Update status', {
        presenceStatus,
        crmPlatform: platformName,
        appName,
        rcAccountId
    })
}
exports.trackCreateMeeting = function trackCreateMeeting({ platformName, rcAccountId }) {
    track('Create meeting', {
        crmPlatform: platformName,
        appName,
        rcAccountId
    })
}