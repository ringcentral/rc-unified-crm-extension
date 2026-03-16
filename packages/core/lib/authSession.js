/**
 * Auth Session Helper
 * 
 * Helper functions for managing OAuth auth sessions using CacheModel
 */

const { CacheModel } = require('../models/cacheModel');

const AUTH_SESSION_PREFIX = 'auth-session';
const SESSION_EXPIRY_MINUTES = 5;

/**
 * Create (or reset) an auth session.
 * If a record already exists for the sessionId (e.g., user retries auth within
 * the same ChatGPT conversation), it is reset to 'pending' so polling works
 * correctly for the new attempt.
 */
async function createAuthSession(sessionId, data) {
    const id = `${AUTH_SESSION_PREFIX}-${sessionId}`;
    const expiry = new Date(Date.now() + SESSION_EXPIRY_MINUTES * 60 * 1000);
    const sessionData = { ...data, createdAt: new Date().toISOString() };

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
    const record = await CacheModel.findByPk(`${AUTH_SESSION_PREFIX}-${sessionId}`);
    
    if (!record) return null;
    
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
    const record = await CacheModel.findByPk(`${AUTH_SESSION_PREFIX}-${sessionId}`);
    
    if (!record) return;
    
    const existingData = record.data || {};
    await record.update({
        status: data.status || record.status,
        data: {
            ...existingData,
            ...data,
            updatedAt: new Date().toISOString()
        }
    });
}

module.exports = {
    createAuthSession,
    getAuthSession,
    updateAuthSession
};

