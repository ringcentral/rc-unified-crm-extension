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
exports.trackRcLogin = function trackRcLogin() {
    track('Login with RingCentral account', {
        appName
    });
}
exports.trackRcLogout = function trackRcLogout() {
    track('Logout with RingCentral account', {
        appName
    });
}
exports.trackCrmLogin = function trackCrmLogin() {
    track('Login with CRM account', {
        appName
    });
}
exports.trackCrmLogout = function trackCrmLogout() {
    track('Logout with CRM account', {
        appName
    });
}
exports.trackPlacedCall = function trackPlacedCall() {
    track('A new call placed', {
        appName
    });
}
exports.trackAnsweredCall = function trackAnsweredCall() {
    track('A new call answered', {
        appName
    });
}
exports.trackConnectedCall = function trackConnectedCall() {
    track('A new call connected', {
        appName
    });
}
exports.trackCallEnd = function trackCallEnd({ durationInSeconds }) {
    track('A call is ended', {
        durationInSeconds,
        appName
    });
}
exports.trackSentSMS = function trackSentSMS() {
    track('A new SMS sent', {
        appName
    });
}
exports.trackSyncCallLog = function trackSyncCallLog({ hasNote }) {
    track('Sync call log', {
        hasNote,
        appName
    })
}
exports.trackSyncMessageLog = function trackSyncMessageLog() {
    track('Sync message log', {
        appName
    })
}
exports.trackEditSettings = function trackEditSettings({ changedItem, status }) {
    track('Edit settings', {
        changedItem,
        status,
        appName
    })
}

exports.trackCreateMeeting = function trackCreateMeeting() {
    track('Create meeting', {
        appName
    })
}
exports.trackOpenFeedback = function trackOpenFeedback() {
    track('Open feedback', {
        appName
    })
}
exports.trackSubmitFeedback = function trackSubmitFeedback() {
    track('Submit feedback', {
        appName
    })
}