import { AnalyticsBrowser } from '@segment/analytics-next'
import manifest from '../../public/manifest.json';
import config from '../config.json';

const analytics = AnalyticsBrowser.load({ writeKey: config.segmentKey });
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
    try {
        const pathSegments = name.split('/');
        const rootPath = `/${pathSegments[1]}`;
        const childPath = name.split(rootPath)[1];
        analytics.page(rootPath, {
            appName: appName,
            version,
            childPath,
            ...properties,
        }, {
            integrations: {
                All: true,
                Mixpanel: true,
            },
        });
    }
    catch (e) {
        console.log(e)
    }
}


exports.trackFirstTimeSetup = function trackFirstTimeSetup() {
    track('First time setup', {
        appName
    });
}
exports.trackRcLogin = function trackRcLogin({ rcAccountId }) {
    track('Login with RingCentral account', {
        appName,
        rcAccountId
    });
}
exports.trackRcLogout = function trackRcLogout({ rcAccountId }) {
    track('Logout with RingCentral account', {
        appName,
        rcAccountId
    });
}
exports.trackCrmLogin = function trackCrmLogin({ rcAccountId }) {
    track('Login with CRM account', {
        appName,
        rcAccountId
    });
}
exports.trackCrmLogout = function trackCrmLogout({ rcAccountId }) {
    track('Logout with CRM account', {
        appName,
        rcAccountId
    });
}
exports.trackPlacedCall = function trackPlacedCall({ rcAccountId }) {
    track('A new call placed', {
        appName,
        rcAccountId
    });
}
exports.trackAnsweredCall = function trackAnsweredCall({ rcAccountId }) {
    track('A new call answered', {
        appName,
        rcAccountId
    });
}
exports.trackConnectedCall = function trackConnectedCall({ rcAccountId }) {
    track('A new call connected', {
        appName,
        rcAccountId
    });
}
exports.trackCallEnd = function trackCallEnd({ rcAccountId, durationInSeconds }) {
    track('A call is ended', {
        durationInSeconds,
        appName,
        rcAccountId
    });
}
exports.trackSentSMS = function trackSentSMS({ rcAccountId }) {
    track('A new SMS sent', {
        appName,
        rcAccountId
    });
}
exports.trackSyncCallLog = function trackSyncCallLog({ rcAccountId, hasNote }) {
    track('Sync call log', {
        hasNote,
        appName,
        rcAccountId
    })
}
exports.trackSyncMessageLog = function trackSyncMessageLog({ rcAccountId }) {
    track('Sync message log', {
        appName,
        rcAccountId
    })
}
exports.trackEditSettings = function trackEditSettings({ rcAccountId, changedItem, status }) {
    track('Edit settings', {
        changedItem,
        status,
        appName,
        rcAccountId
    })
}

exports.trackCreateMeeting = function trackCreateMeeting({ rcAccountId }) {
    track('Create meeting', {
        appName,
        rcAccountId
    })
}
exports.trackOpenFeedback = function trackOpenFeedback({ rcAccountId }) {
    track('Open feedback', {
        appName,
        rcAccountId
    })
}
exports.trackSubmitFeedback = function trackSubmitFeedback({ rcAccountId }) {
    track('Submit feedback', {
        appName,
        rcAccountId
    })
}