/**
 * Auth Session Helper
 * 
 * Helper functions for managing OAuth auth sessions using CacheModel
 */

const { CacheModel } = require('../models/cacheModel');

const AUTH_SESSION_PREFIX = 'auth-session';
const PENDING_SESSION_EXPIRY_MINUTES = 5;
const SETTLED_SESSION_EXPIRY_MINUTES = 15;

function getSessionRecordId(sessionId) {
    return `${AUTH_SESSION_PREFIX}-${sessionId}`;
}

function getExpiry(minutes) {
    return new Date(Date.now() + minutes * 60 * 1000);
}

function isExpired(record) {
    return Boolean(record?.expiry && record.expiry <= new Date());
}

/**
 * Create (or reset) an auth session.
 * If a record already exists for the sessionId (e.g., user retries auth within
 * the same ChatGPT conversation), it is reset to 'pending' so polling works
 * correctly for the new attempt.
 */
async function createAuthSession(sessionId, data) {
    const id = getSessionRecordId(sessionId);
    const expiry = getExpiry(PENDING_SESSION_EXPIRY_MINUTES);
    const sessionData = {
        platform: data.platform,
        hostname: data.hostname || '',
        createdAt: new Date().toISOString(),
    };

    const existing = await CacheModel.findByPk(id);
    if (existing) {
        await existing.update({ status: 'pending', data: sessionData, expiry });
    } else {
        await CacheModel.create({
            id,
            cacheKey: AUTH_SESSION_PREFIX,
            userId: sessionId,
            status: 'pending',
            data: sessionData,
            expiry,
        });
    }
}

/**
 * Get an auth session by ID
 */
async function getAuthSession(sessionId) {
    const record = await CacheModel.findByPk(getSessionRecordId(sessionId));

    if (!record) return null;

    if (isExpired(record)) {
        if (record.status !== 'expired') {
            await record.update({ status: 'expired' });
        }
        return {
            sessionId: record.userId,
            status: 'expired',
            ...record.data
        };
    }

    return {
        sessionId: record.userId,
        status: record.status,
        ...record.data
    };
}

/**
 * Update an auth session
 */
async function updateAuthSession(sessionId, data) {
    const record = await CacheModel.findByPk(getSessionRecordId(sessionId));

    if (!record) return;

    const existingData = record.data || {};
    const nextStatus = data.status || record.status;
    await record.update({
        status: nextStatus,
        data: {
            ...existingData,
            ...data,
            updatedAt: new Date().toISOString()
        },
        expiry: nextStatus === 'pending'
            ? getExpiry(PENDING_SESSION_EXPIRY_MINUTES)
            : getExpiry(SETTLED_SESSION_EXPIRY_MINUTES)
    });
}

module.exports = {
    createAuthSession,
    getAuthSession,
    updateAuthSession
};

