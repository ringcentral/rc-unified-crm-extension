import type {
    AuthSessionCreateData,
    AuthSessionRecord,
    AuthSessionResult,
    AuthSessionUpdateData
} from '../types';

const { CacheModel } = require('../models/cacheModel');

const AUTH_SESSION_PREFIX = 'auth-session';
const PENDING_SESSION_EXPIRY_MINUTES = 5;
const SETTLED_SESSION_EXPIRY_MINUTES = 15;

function getSessionRecordId(sessionId: string): string {
    return `${AUTH_SESSION_PREFIX}-${sessionId}`;
}

function getExpiry(minutes: number): Date {
    return new Date(Date.now() + minutes * 60 * 1000);
}

function isExpired(record: AuthSessionRecord | null | undefined): boolean {
    return Boolean(record?.expiry && record.expiry <= new Date());
}

async function createAuthSession(sessionId: string, data: AuthSessionCreateData): Promise<void> {
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

async function getAuthSession(sessionId: string): Promise<AuthSessionResult | null> {
    const record = await CacheModel.findByPk(getSessionRecordId(sessionId)) as AuthSessionRecord | null;

    if (!record) return null;

    if (isExpired(record)) {
        if (record.status !== 'expired') {
            await record.update({ status: 'expired' });
        }
        return {
            sessionId: record.userId,
            status: 'expired',
            ...(record.data || {})
        };
    }

    return {
        sessionId: record.userId,
        status: record.status,
        ...(record.data || {})
    };
}

async function updateAuthSession(sessionId: string, data: AuthSessionUpdateData): Promise<void> {
    const record = await CacheModel.findByPk(getSessionRecordId(sessionId)) as AuthSessionRecord | null;

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

export {
    createAuthSession,
    getAuthSession,
    updateAuthSession
};
