/**
 * Auth Session Helper
 * 
 * Helper functions for managing OAuth auth sessions using CacheModel
 */

const { CacheModel } = require('../models/cacheModel');

const AUTH_SESSION_PREFIX = 'auth-session';
const SESSION_EXPIRY_MINUTES = 5;

/**
 * Create a new auth session
 */
async function createAuthSession(sessionId, data) {
    await CacheModel.create({
        id: `${AUTH_SESSION_PREFIX}-${sessionId}`,
        cacheKey: AUTH_SESSION_PREFIX,
        userId: sessionId,
        status: 'pending',
        data: {
            ...data,
            createdAt: new Date().toISOString()
        },
        expiry: new Date(Date.now() + SESSION_EXPIRY_MINUTES * 60 * 1000)
    });
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

