const Mixpanel = require('mixpanel');
const parser = require('ua-parser-js');
let packageJson = null;
try {
    packageJson = require('../package.json');
}
catch (e) {
    packageJson = require('../../package.json');
}
const appName = 'RingCentral CRM Extension';
const version = packageJson.version;
let mixpanel = null;

exports.init = function init() {
    if (!!!process.env.MIXPANEL_TOKEN) {
        return;
    }
    mixpanel = Mixpanel.init(process.env.MIXPANEL_TOKEN);
}

exports.track = function track({ eventName, interfaceName, adapterName, accountId, extensionId, success, requestDuration, userAgent, ip, author, extras = null }) {
    if (!!!mixpanel) {
        return;
    }
    const ua = parser(userAgent);
    mixpanel.track(eventName, {
        distinct_id: extensionId,
        interfaceName,
        adapterName,
        accountId,
        extensionId,
        success,
        requestDuration,
        collectedFrom: 'server',
        version,
        appName,
        $browser: ua.browser.name,
        $os: ua.os.name,
        $device: ua.device.type,
        ip,
        author,
        ...extras
    });
    console.log(`Event: ${eventName}`);
}