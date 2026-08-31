const connectorRegistry = /** @type {any} */ (require('../connector/registry'));
const { AccountDataModel } = /** @type {any} */ (require('../models/accountDataModel'));
const logger = /** @type {any} */ (require('./logger'));

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

function getAccountDataDescriptor(platform: string, dataKey: string): any {
    const platformModule = connectorRegistry.getConnector(platform);
    const descriptor = platformModule?.accountData?.[dataKey];
    if (!descriptor || typeof descriptor.fetch !== 'function') {
        return null;
    }
    return descriptor;
}

function getAccountDataKeys(platform: string): string[] {
    const platformModule = connectorRegistry.getConnector(platform);
    return Object.keys(platformModule?.accountData ?? {});
}

// Get-or-fetch account-level data registered by a connector's accountData descriptor table.
// Freshness model: lazy TTL-on-read with serve-stale-on-error; see .scratch/account-level-data/PRD.md
async function getAccountData({ platform, user, authHeader, dataKey, forceRefresh = false }: {
    platform: string;
    user: any;
    authHeader?: string;
    dataKey: string;
    forceRefresh?: boolean;
}): Promise<any> {
    const descriptor = getAccountDataDescriptor(platform, dataKey);
    if (!descriptor) {
        throw new Error(`Unknown account data key '${dataKey}' for platform '${platform}'`);
    }
    if (!user?.rcAccountId) {
        throw new Error(`Cannot resolve account data '${dataKey}': user has no rcAccountId`);
    }
    const existing = await AccountDataModel.findOne({
        where: {
            rcAccountId: user.rcAccountId,
            platformName: platform,
            dataKey
        }
    });
    const ttlMs = descriptor.ttlMs ?? DEFAULT_TTL_MS;
    const isExpired = !existing || (Date.now() - new Date(existing.updatedAt).getTime() > ttlMs);
    if (existing && !isExpired && !forceRefresh) {
        return existing.data;
    }
    let fresh;
    try {
        fresh = await descriptor.fetch({ user, authHeader });
    }
    catch (e: any) {
        if (existing) {
            logger.error('Account data fetch failed, serving stale data', { platform, dataKey, stack: e.stack });
            return existing.data;
        }
        throw e;
    }
    // Connectors with independently fetched object properties can omit failed
    // properties from a refresh without erasing their last known good values.
    const dataToStore = descriptor.mergePartialResult && existing
        ? { ...existing.data, ...fresh }
        : fresh;
    if (existing) {
        // force the save even when fresh data deep-equals the old value, so updatedAt resets the TTL window
        existing.set('data', dataToStore);
        existing.changed('data', true);
        await existing.save();
    }
    else {
        await AccountDataModel.create({
            rcAccountId: user.rcAccountId,
            platformName: platform,
            dataKey,
            data: dataToStore
        });
    }
    return dataToStore;
}

export {
    getAccountData,
    getAccountDataKeys
};
