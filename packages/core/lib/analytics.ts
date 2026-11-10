import type { AnalyticsTrackParams } from '../types';
import { getRawAnalyticsProperties } from './analyticsIdentity';

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
        set: (distinctId: string | number, properties: Record<string, unknown>, callback: (error?: unknown) => void) => void;
    };
    track: (eventName: string, properties: Record<string, unknown>) => void;
};

let mixpanel: MixpanelClient | null = null;
const profileUpdates = new Map<string, number>();

function init(): void {
    profileUpdates.clear();
    mixpanel = null;
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
    rcAccountIdRaw,
    rcExtensionIdRaw,
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
    const raw = getRawAnalyticsProperties({ accountId, extensionId, rcAccountIdRaw, rcExtensionIdRaw });
    const profile = {
        ...(raw.rcAccountIdRaw ? { rcAccountIdRaw: raw.rcAccountIdRaw } : {}),
        ...(raw.rcExtensionIdRaw ? { rcExtensionIdRaw: raw.rcExtensionIdRaw } : {})
    };
    const profileKey = JSON.stringify([extensionId, profile]);
    if (Object.keys(profile).length && (profileUpdates.get(profileKey) || 0) < Date.now() - 3600000) {
        mixpanel.people.set(extensionId, profile, error => {
            if (error) {
                logger.warn('Raw analytics profile update failed');
            } else {
                if (profileUpdates.size >= 10000) profileUpdates.delete(profileUpdates.keys().next().value);
                profileUpdates.set(profileKey, Date.now());
            }
        });
    }
    mixpanel.people.set_once(extensionId, {
        version,
        appName,
        crmPlatform: connectorName
    });

    const ua = parser(userAgent);
    const eventExtras = { ...extras };
    for (const key of ['rcAccountIdRaw', 'rcExtensionIdRaw', 'analyticsSchemaVersion', 'analyticsIdentityStatus']) {
        delete eventExtras[key];
    }
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
        ...eventExtras,
        analyticsSchemaVersion: 2,
        ...raw
    });

    logger.info(`Event: ${eventName}`);
}

export {
    init,
    track
};
