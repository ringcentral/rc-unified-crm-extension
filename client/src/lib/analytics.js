import manifest from '../../public/manifest.json';
import config from '../config.json';
import mixpanel from 'mixpanel-browser';

mixpanel.init(config.mixpanelToken);

const appName = 'RingCentral CRM Extension';
const version = manifest.version;

exports.reset = function reset() {
    mixpanel.reset();
}

exports.identify = function identify({ platformName, rcAccountId, extensionId }) {
    mixpanel.identify(extensionId);
    mixpanel.people.set({
        platformName,
        rcAccountId,
        version
    });
}

exports.group = function group({ rcAccountId }) {
    mixpanel.add_group('rcAccountId', rcAccountId);
    mixpanel.set_group('rcAccountId', rcAccountId);
}

function track(event, properties = {}) {
    mixpanel.track(event, { appName, version, ...properties });
}

exports.trackPage = function page(name, properties = {}) {
    try {
        const pathSegments = name.split('/');
        const rootPath = `/${pathSegments[1]}`;
        const childPath = name.split(rootPath)[1];
        mixpanel.track_pageview(
            {
                appName,
                version,
                path: window.location.pathname,
                childPath,
                search: window.location.search,
                url: window.location.href,
                ...properties
            },
            {
                event_name: `Viewed ${rootPath}`
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
exports.createNewContact = function createNewContact() {
    track('Create a new contact', {
        appName
    })
}