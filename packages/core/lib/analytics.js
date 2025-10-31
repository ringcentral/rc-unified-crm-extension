const Mixpanel = require('mixpanel');
const parser = require('ua-parser-js');
let packageJson = null;
try {
    packageJson = require('../package.json');
}
catch (e) {
    packageJson = require('../../package.json');
}
const appName = 'App Connect';
const defaultEventAddedVia = 'server';
const version = packageJson.version;
let mixpanel = null;

exports.init = function init() {
    if (!process.env.MIXPANEL_TOKEN) {
        return;
    }
    mixpanel = Mixpanel.init(process.env.MIXPANEL_TOKEN);
}

exports.track = function track({ eventName, interfaceName, connectorName, accountId, extensionId, success, requestDuration, userAgent, ip, author, eventAddedVia, extras = null }) {
    if (!mixpanel || !extensionId) {
        return;
    }
    const inUseEventAddedVia = eventAddedVia || defaultEventAddedVia;
    mixpanel.people.set_once(extensionId, {
        version,
        appName,
        crmPlatform: connectorName
    });
    const ua = parser(userAgent);
    mixpanel.track(eventName, {
        distinct_id: extensionId,
        interfaceName,
        adapterName: connectorName,
        rcAccountId: accountId,
        extensionId,
        success,
        requestDuration,
        collectedFrom: 'server',
        version,
        appName,
        eventAddedVia: inUseEventAddedVia,
        $browser: ua.browser.name,
        $os: ua.os.name,
        $device: ua.device.type,
        ip,
        author,
        ...extras
    });
    console.log(`Event: ${eventName}`);
}