import { getHashValue } from './util';

export function normalizeRawId(value: unknown): string | undefined {
    if (typeof value === 'number') {
        return Number.isSafeInteger(value) && value > 0 ? String(value) : undefined;
    }
    return typeof value === 'string' && /^[1-9]\d{0,31}$/.test(value) ? value : undefined;
}

export function getRawAnalyticsProperties({ accountId, extensionId, rcAccountIdRaw, rcExtensionIdRaw }: {
    accountId?: string | number;
    extensionId?: string | number;
    rcAccountIdRaw?: unknown;
    rcExtensionIdRaw?: unknown;
}): Record<string, string> {
    if (process.env.MIXPANEL_RAW_IDS_ENABLED === 'false') {
        return { analyticsIdentityStatus: 'disabled' };
    }
    const account = normalizeRawId(rcAccountIdRaw);
    const extension = normalizeRawId(rcExtensionIdRaw);
    if ((rcAccountIdRaw != null && !account) || (rcExtensionIdRaw != null && !extension)) {
        return { analyticsIdentityStatus: 'invalid' };
    }
    if ((account && (!accountId || getHashValue(account, process.env.HASH_KEY) !== accountId)) ||
        (extension && (!extensionId || getHashValue(extension, process.env.HASH_KEY) !== extensionId))) {
        return { analyticsIdentityStatus: 'mismatch' };
    }
    return {
        ...(account ? { rcAccountIdRaw: account } : {}),
        ...(extension ? { rcExtensionIdRaw: extension } : {}),
        analyticsIdentityStatus: account && extension ? 'complete' : account || extension ? 'partial' : 'missing'
    };
}
