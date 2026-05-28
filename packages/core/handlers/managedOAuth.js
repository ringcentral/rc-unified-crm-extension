const { AccountDataModel } = require('../models/accountDataModel');
const { CacheModel } = require('../models/cacheModel');
const { encode, decoded } = require('../lib/encode');

const MANAGED_OAUTH_ACCOUNT_DATA_KEY = 'managed-oauth-account';
const MANAGED_OAUTH_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const MANAGED_OAUTH_FIELDS = [
    'clientId',
    'clientSecret',
    'accessTokenUri',
    'authorizationUri',
    'redirectUri',
    'scopes',
    'hostname'
];

function getPendingManagedOAuthCacheId({ rcAccountId }) {
    return `${rcAccountId}-${MANAGED_OAUTH_ACCOUNT_DATA_KEY}`;
}

function isFilled(value) {
    return value !== undefined && value !== null && value !== '';
}

function encryptStoredValue(value) {
    return {
        version: 1,
        encrypted: true,
        value: encode(JSON.stringify(value))
    };
}

function decryptStoredValue(value) {
    if (!value) {
        return undefined;
    }
    if (value?.encrypted && value?.value) {
        return JSON.parse(decoded(value.value));
    }
    return value;
}

function normalizeManagedOAuthValues(values = {}) {
    const normalized = {};
    MANAGED_OAUTH_FIELDS.forEach(field => {
        if (isFilled(values[field])) {
            normalized[field] = values[field];
        }
    });
    return normalized;
}

function buildStoredData(values = {}) {
    const normalized = normalizeManagedOAuthValues(values);
    const fields = {};
    Object.keys(normalized).forEach(key => {
        fields[key] = encryptStoredValue(normalized[key]);
    });
    return { fields };
}

function decryptStoredData(data = {}) {
    const fields = data?.fields ?? {};
    const values = {};
    Object.keys(fields).forEach(key => {
        values[key] = decryptStoredValue(fields[key]);
    });
    return values;
}

function removeSecret(values = {}) {
    const sanitized = { ...values };
    delete sanitized.clientSecret;
    return sanitized;
}

async function getAccountManagedOAuthRecord({ rcAccountId, platform }) {
    if (!rcAccountId || !platform) {
        return null;
    }
    return AccountDataModel.findOne({
        where: {
            rcAccountId,
            platformName: platform,
            dataKey: MANAGED_OAUTH_ACCOUNT_DATA_KEY
        }
    });
}

async function getPendingManagedOAuthRecord({ rcAccountId }) {
    if (!rcAccountId) {
        return null;
    }
    const record = await CacheModel.findByPk(getPendingManagedOAuthCacheId({ rcAccountId }));
    if (!record) {
        return null;
    }
    if (record.expiry && new Date(record.expiry).getTime() <= Date.now()) {
        await record.destroy();
        return null;
    }
    return record;
}

async function getAccountManagedOAuthValues({ rcAccountId, platform }) {
    const record = await getAccountManagedOAuthRecord({ rcAccountId, platform });
    return decryptStoredData(record?.data);
}

async function getPendingManagedOAuthValues({ rcAccountId }) {
    const record = await getPendingManagedOAuthRecord({ rcAccountId });
    return decryptStoredData(record?.data);
}

async function getManagedOAuthState({ rcAccountId, platform, isAdmin }) {
    const accountValues = await getAccountManagedOAuthValues({ rcAccountId, platform });
    const hasAccountOAuth = Object.keys(accountValues).length > 0;
    const pendingValues = isAdmin && !hasAccountOAuth
        ? await getPendingManagedOAuthValues({ rcAccountId })
        : {};
    const hasPendingOAuth = Object.keys(pendingValues).length > 0;

    return {
        isAdmin: !!isAdmin,
        hasAccountOAuth,
        hasPendingOAuth,
        ...(hasAccountOAuth ? { oauthValues: removeSecret(accountValues) } : {}),
        ...(isAdmin && hasPendingOAuth ? { pendingValues } : {})
    };
}

async function upsertPendingManagedOAuth({ rcAccountId, values = {} }) {
    if (!rcAccountId) {
        throw new Error('rcAccountId is required');
    }
    const id = getPendingManagedOAuthCacheId({ rcAccountId });
    const data = buildStoredData(values);
    const expiry = new Date(Date.now() + MANAGED_OAUTH_CACHE_TTL_MS);
    const existing = await CacheModel.findByPk(id);
    if (existing) {
        await existing.update({
            status: 'pending',
            userId: rcAccountId,
            cacheKey: MANAGED_OAUTH_ACCOUNT_DATA_KEY,
            data,
            expiry
        });
        return existing;
    }
    return CacheModel.create({
        id,
        status: 'pending',
        userId: rcAccountId,
        cacheKey: MANAGED_OAUTH_ACCOUNT_DATA_KEY,
        data,
        expiry
    });
}

async function migratePendingManagedOAuth({ rcAccountId, platform }) {
    const pending = await getPendingManagedOAuthRecord({ rcAccountId });
    if (!pending) {
        return false;
    }
    const existing = await getAccountManagedOAuthRecord({ rcAccountId, platform });
    const data = pending.data ?? { fields: {} };
    if (existing) {
        await existing.update({ data });
    }
    else {
        await AccountDataModel.create({
            rcAccountId,
            platformName: platform,
            dataKey: MANAGED_OAUTH_ACCOUNT_DATA_KEY,
            data
        });
    }
    await pending.destroy();
    return true;
}

async function resolveManagedOAuthInfo({ rcAccountId, platform }) {
    const accountValues = await getAccountManagedOAuthValues({ rcAccountId, platform });
    if (Object.keys(accountValues).length > 0) {
        return {
            source: 'account',
            oauthInfo: accountValues
        };
    }
    const pendingValues = await getPendingManagedOAuthValues({ rcAccountId });
    if (Object.keys(pendingValues).length > 0) {
        return {
            source: 'pending',
            oauthInfo: pendingValues
        };
    }
    return {
        source: null,
        oauthInfo: null
    };
}

async function clearPendingManagedOAuth({ rcAccountId }) {
    if (!rcAccountId) {
        return 0;
    }
    return CacheModel.destroy({
        where: {
            id: getPendingManagedOAuthCacheId({ rcAccountId })
        }
    });
}

async function clearAccountManagedOAuth({ rcAccountId, platform }) {
    if (!rcAccountId || !platform) {
        return 0;
    }
    return AccountDataModel.destroy({
        where: {
            rcAccountId,
            platformName: platform,
            dataKey: MANAGED_OAUTH_ACCOUNT_DATA_KEY
        }
    });
}

async function resetManagedOAuth({ rcAccountId, platform }) {
    const deletedAccountCount = await clearAccountManagedOAuth({ rcAccountId, platform });
    const deletedPendingCount = await clearPendingManagedOAuth({ rcAccountId });
    return {
        deletedAccountCount,
        deletedPendingCount
    };
}

exports.MANAGED_OAUTH_ACCOUNT_DATA_KEY = MANAGED_OAUTH_ACCOUNT_DATA_KEY;
exports.MANAGED_OAUTH_FIELDS = MANAGED_OAUTH_FIELDS;
exports.getManagedOAuthState = getManagedOAuthState;
exports.upsertPendingManagedOAuth = upsertPendingManagedOAuth;
exports.getPendingManagedOAuthValues = getPendingManagedOAuthValues;
exports.getAccountManagedOAuthValues = getAccountManagedOAuthValues;
exports.migratePendingManagedOAuth = migratePendingManagedOAuth;
exports.resolveManagedOAuthInfo = resolveManagedOAuthInfo;
exports.clearPendingManagedOAuth = clearPendingManagedOAuth;
exports.clearAccountManagedOAuth = clearAccountManagedOAuth;
exports.resetManagedOAuth = resetManagedOAuth;
exports.removeSecret = removeSecret;
