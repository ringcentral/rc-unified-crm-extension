// @ts-check

/** @typedef {import('../types').ExtensionActivityParams} ExtensionActivityParams */
/** @typedef {import('../types').ExtensionAdoptionStatsParams} ExtensionAdoptionStatsParams */
/** @typedef {import('../types').ExtensionAdoptionStatsResult} ExtensionAdoptionStatsResult */

const { Op } = require('sequelize');
const { ExtensionActivityModel: RawExtensionActivityModel } = require('../models/extensionActivityModel');
const ExtensionActivityModel = /** @type {any} */ (RawExtensionActivityModel);
const { UserModel: RawUserModel } = require('../models/userModel');
const UserModel = /** @type {any} */ (RawUserModel);
const logger = /** @type {{ warn(message: string, context?: Record<string, unknown>): void }} */ (require('../lib/logger'));

// Repeated logins inside this window do not touch the database.
const ACTIVITY_THROTTLE_MS = 60 * 60 * 1000;

/**
 * Records that a hashed RingCentral extension logged in to the browser
 * extension under a RingCentral account. Best effort: never throws, so it is
 * safe to call fire-and-forget from the /userInfoHash route.
 *
 * @param {ExtensionActivityParams} params
 * @returns {Promise<boolean>} true when a row was inserted or refreshed
 */
async function recordExtensionActivity({ hashedRcExtensionId, rcAccountId }) {
    if (!hashedRcExtensionId || !rcAccountId) {
        return false;
    }
    try {
        const now = new Date();
        const existing = await ExtensionActivityModel.findOne({
            where: { hashedRcExtensionId, rcAccountId },
        });
        if (existing) {
            // updatedAt is the last recorded login: this refresh is the only write to the row.
            const lastSeen = existing.updatedAt ? new Date(existing.updatedAt).getTime() : 0;
            if (now.getTime() - lastSeen < ACTIVITY_THROTTLE_MS) {
                return false;
            }
            // No attribute changes, so mark updatedAt dirty to force Sequelize to bump it.
            existing.changed('updatedAt', true);
            await existing.save();
            return true;
        }
        // upsert (not create) so two concurrent first logins do not raise a
        // primary-key conflict; createdAt then only differs by milliseconds.
        await ExtensionActivityModel.upsert({ hashedRcExtensionId, rcAccountId });
        return true;
    }
    catch (e) {
        // Best effort only: never surface a database failure to the /userInfoHash caller.
        logger.warn('Record extension activity failed', { message: e?.message });
        return false;
    }
}

/**
 * Aggregates adoption numbers for one RingCentral account.
 *
 * - activated (A): hashed extension ids seen in ExtensionActivityModel for the account
 * - connected (C): UserModel rows with a non-empty accessToken that belong to the
 *   account, either by rcAccountId or (fallback, since rcAccountId is client
 *   supplied and may be empty for older users) by hashedRcExtensionId in A
 * - installedCount = |A ∪ C| (union, not max: connected users who have not logged
 *   in since the server upgrade are only in C; users without a CRM are only in A)
 * - connectedCount = |C|
 * - lastActiveAt = max(updatedAt) over C rows, or null when C is empty. This is the
 *   last time a connected user's row was written (token refresh, settings save,
 *   ...), not a precise usage event.
 *
 * @param {ExtensionAdoptionStatsParams} params
 * @returns {Promise<ExtensionAdoptionStatsResult>}
 */
async function getExtensionAdoptionStats({ rcAccountId }) {
    if (!rcAccountId) {
        throw new Error('rcAccountId is required');
    }
    const activityRows = await ExtensionActivityModel.findAll({
        where: { rcAccountId },
        attributes: ['hashedRcExtensionId'],
    });
    const activated = new Set(
        activityRows
            .map((row) => row.hashedRcExtensionId)
            .filter((value) => !!value),
    );

    const accountConditions: Array<Record<string, unknown>> = [{ rcAccountId }];
    if (activated.size > 0) {
        accountConditions.push({ hashedRcExtensionId: { [Op.in]: [...activated] } });
    }
    const userRows = await UserModel.findAll({
        where: {
            [Op.and]: [
                { accessToken: { [Op.and]: [{ [Op.ne]: null }, { [Op.ne]: '' }] } },
                { [Op.or]: accountConditions },
            ],
        },
        attributes: ['id', 'hashedRcExtensionId', 'updatedAt'],
    });

    const connected = new Set<string>();
    let lastActiveAt: Date | null = null;
    for (const row of userRows) {
        // A user connected to several CRMs has several rows sharing one hashed
        // extension id; count the person once. Legacy rows without a hashed id
        // fall back to the row id so they are still counted.
        connected.add(row.hashedRcExtensionId || `user:${row.id}`);
        const updatedAt = row.updatedAt ? new Date(row.updatedAt) : null;
        if (updatedAt && !Number.isNaN(updatedAt.getTime()) && (!lastActiveAt || updatedAt > lastActiveAt)) {
            lastActiveAt = updatedAt;
        }
    }

    const installed = new Set([...activated, ...connected]);
    return {
        installedCount: installed.size,
        connectedCount: connected.size,
        lastActiveAt: lastActiveAt ? lastActiveAt.toISOString() : null,
    };
}

exports.recordExtensionActivity = recordExtensionActivity;
exports.getExtensionAdoptionStats = getExtensionAdoptionStats;
exports.ACTIVITY_THROTTLE_MS = ACTIVITY_THROTTLE_MS;

export {};
