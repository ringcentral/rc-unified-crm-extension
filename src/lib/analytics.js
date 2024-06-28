const Mixpanel = require('mixpanel');
const parser = require('ua-parser-js');
const package = require('../../package.json');
const appName = 'RingCentral CRM Extension';
const version = package.version;
let mixpanel = null;

exports.init = function init() {
    if (!!!process.env.MIXPANEL_TOKEN) {
        return;
    }
    mixpanel = Mixpanel.init(process.env.MIXPANEL_TOKEN);
}

exports.track = function track({ eventName, interfaceName, adapterName, accountId, extensionId, success, requestDuration, userAgent, ip, author }) {
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
        author
    });
    console.log(`Event: ${eventName}`);
}