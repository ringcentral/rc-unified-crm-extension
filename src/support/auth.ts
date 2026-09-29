// @ts-check

const crypto = require('crypto');
const axios = /** @type {any} */ (require('axios'));
const logger = /** @type {any} */ (require('@app-connect/core/lib/logger'));

const RC_EXTENSION_INFO_URL = 'https://platform.ringcentral.com/restapi/v1.0/account/~/extension/~';

// Only RingCentral staff signed in with the RingCentral corporate account may use the Support console.
const SUPPORT_RC_ACCOUNT_ID = '37439510';

const RC_REQUEST_TIMEOUT_MS = 10 * 1000;
const SESSION_CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * @typedef {{ accountId: string, extensionId: string, name: string, email: string }} SupportUser
 */

/** @type {Map<string, { supportUser: SupportUser, expiresAt: number }>} */
const sessionCache = new Map();

class SupportAuthError extends Error {
    status: number;

    /**
     * @param {number} status
     * @param {string} message
     */
    constructor(status, message) {
        super(message);
        this.name = 'SupportAuthError';
        this.status = status;
    }
}

/**
 * The token is read from the header only; query strings end up in access logs.
 *
 * @param {any} req
 * @returns {string}
 */
function getRcAccessTokenFromRequest(req) {
    const headerValue = req.get('X-RC-Access-Token');
    return typeof headerValue === 'string' ? headerValue.trim() : '';
}

/**
 * @param {string} rcAccessToken
 * @returns {string}
 */
function hashToken(rcAccessToken) {
    return crypto.createHash('sha256').update(rcAccessToken).digest('hex');
}

/**
 * @param {number} now
 */
function pruneExpiredSessions(now) {
    for (const [key, entry] of sessionCache) {
        if (entry.expiresAt <= now) {
            sessionCache.delete(key);
        }
    }
}

/**
 * Validates that a RingCentral access token belongs to an enabled extension of the
 * RingCentral corporate account. Successful results are cached per token for five minutes.
 *
 * @param {string} rcAccessToken
 * @returns {Promise<SupportUser>}
 */
async function validateSupportUser(rcAccessToken) {
    if (!rcAccessToken) {
        throw new SupportAuthError(401, 'RingCentral access token is required');
    }

    const cacheKey = hashToken(rcAccessToken);
    const now = Date.now();
    const cached = sessionCache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
        return cached.supportUser;
    }

    let extensionInfo;
    try {
        const response = await axios.get(RC_EXTENSION_INFO_URL, {
            headers: { Authorization: `Bearer ${rcAccessToken}` },
            timeout: RC_REQUEST_TIMEOUT_MS
        });
        extensionInfo = response.data;
    }
    catch (e) {
        const error = /** @type {any} */ (e);
        if (error?.response?.status === 401) {
            throw new SupportAuthError(401, 'RingCentral access token is invalid or expired');
        }
        throw e;
    }

    const accountId = extensionInfo?.account?.id?.toString() ?? '';
    const extensionId = extensionInfo?.id?.toString() ?? '';
    if (accountId !== SUPPORT_RC_ACCOUNT_ID || extensionInfo?.status !== 'Enabled') {
        logger.warn('Support console access denied', {
            accountId,
            extensionId,
            extensionStatus: extensionInfo?.status
        });
        throw new SupportAuthError(403, 'Support console access is limited to RingCentral staff');
    }

    /** @type {SupportUser} */
    const supportUser = {
        accountId,
        extensionId,
        name: extensionInfo?.name ?? '',
        email: extensionInfo?.contact?.email ?? ''
    };
    pruneExpiredSessions(now);
    sessionCache.set(cacheKey, { supportUser, expiresAt: now + SESSION_CACHE_TTL_MS });
    return supportUser;
}

/**
 * Express middleware for every /support/* route. It sets req.supportUser on success.
 *
 * @param {any} req
 * @param {any} res
 * @param {Function} next
 */
async function requireSupportUser(req, res, next) {
    try {
        req.supportUser = await validateSupportUser(getRcAccessTokenFromRequest(req));
        next();
    }
    catch (e) {
        if (e instanceof SupportAuthError) {
            res.status(e.status).json({ error: e.message });
            return;
        }
        const error = /** @type {any} */ (e);
        logger.error('Error validating Support console user', {
            message: error?.message,
            stack: error?.stack,
            status: error?.response?.status
        });
        res.status(500).json({ error: 'Internal server error' });
    }
}

function clearSupportSessionCache() {
    sessionCache.clear();
}

exports.SUPPORT_RC_ACCOUNT_ID = SUPPORT_RC_ACCOUNT_ID;
exports.SupportAuthError = SupportAuthError;
exports.getRcAccessTokenFromRequest = getRcAccessTokenFromRequest;
exports.validateSupportUser = validateSupportUser;
exports.requireSupportUser = requireSupportUser;
exports.clearSupportSessionCache = clearSupportSessionCache;

export {};
