import { pluginProperties } from './pluginAnalytics';
const { getHashValue } = require('./util');

/** Export installation state separately from behavioral events. Never export stored credentials/config. */
export function buildPluginInventory(rows: any[], hashKey: string, asOf = new Date().toISOString()) {
    if (!hashKey) throw new Error('HASH_KEY is required to preserve account identity');
    return {
        asOf,
        installations: rows.filter(row => row.dataKey === 'pluginData').map(row => ({
            ...pluginProperties({ id: row.platformName, data: row.data }),
            rcAccountId: getHashValue(String(row.rcAccountId), hashKey),
        })),
    };
}
