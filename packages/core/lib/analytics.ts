import type { AnalyticsTrackParams } from '../types';

const Mixpanel = require('mixpanel');
const parser = require('ua-parser-js');
const logger = require('./logger');

let packageJson: { version: string };

try {
    packageJson = require('../package.json');
} catch (e) {
    logger.warn('Error loading package.json', { stack: e.stack });
    packageJson = require('../../package.json');
}

const appName = 'App Connect';
const defaultEventAddedVia = 'server';
const version = packageJson.version;

type MixpanelClient = {
    people: {
        set_once: (distinctId: string | number, properties: Record<string, unknown>) => void;
    };
    track: (eventName: string, properties: Record<string, unknown>) => void;
};

let mixpanel: MixpanelClient | null = null;

function init(): void {
    if (!process.env.MIXPANEL_TOKEN) {
        return;
    }

    mixpanel = Mixpanel.init(process.env.MIXPANEL_TOKEN);
}

function track({
    eventName,
    interfaceName,
    connectorName,
    accountId,
    extensionId,
    success,
    requestDuration,
    userAgent,
    ip,
    author,
    eventAddedVia,
    extras = null
}: AnalyticsTrackParams): void {
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

    logger.info(`Event: ${eventName}`);
}

export {
    init,
    track
};
