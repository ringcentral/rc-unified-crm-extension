// @ts-check
/** @typedef {import('../types').CallDownJwtData} CallDownJwtData */
/** @typedef {import('../types').CallDownListParams} CallDownListParams */
/** @typedef {import('../types').CallDownListResult} CallDownListResult */
/** @typedef {import('../types').CallDownMarkCalledParams} CallDownMarkCalledParams */
/** @typedef {import('../types').CallDownOperationResult} CallDownOperationResult */
/** @typedef {import('../types').CallDownRecordParams} CallDownRecordParams */
/** @typedef {import('../types').CallDownScheduleParams} CallDownScheduleParams */
/** @typedef {import('../types').CallDownScheduleResult} CallDownScheduleResult */
/** @typedef {import('../types').CallDownSnapshot} CallDownSnapshot */
/** @typedef {import('../types').CallDownSyncEvent} CallDownSyncEvent */
/** @typedef {import('../types').CallDownSyncResult} CallDownSyncResult */
/** @typedef {import('../types').CreateCallbackParams} CreateCallbackParams */
/** @typedef {import('../types').UpdateCallbackParams} UpdateCallbackParams */
/** @typedef {import('../types').MarkCalledCallbackParams} MarkCalledCallbackParams */
/** @typedef {import('../types').DeleteCallbackParams} DeleteCallbackParams */
/** @typedef {import('../types').CallDownUpdateParams} CallDownUpdateParams */
/** @typedef {import('../types').ReturnMessage} ReturnMessage */

const { UserModel: UserModelImport } = require('../models/userModel');
const UserModel = /** @type {any} */ (UserModelImport);
const { CallDownListModel: CallDownListModelImport } = require('../models/callDownListModel');
const CallDownListModel = /** @type {any} */ (CallDownListModelImport);
const { Op: OpImport } = require('sequelize');
const Op = /** @type {any} */ (OpImport);
const jwt = /** @type {any} */ (require('../lib/jwt'));
const oauth = /** @type {any} */ (require('../lib/oauth'));
const connectorRegistry = /** @type {any} */ (require('../connector/registry'));
const { handleApiError, handleDatabaseError } = require('../lib/errorHandler');
const logger = require('../lib/logger');

const PERSISTED_FIELDS = ['contactId', 'contactType', 'status', 'scheduledAt', 'lastCallAt'];

const CRM_SYNC_FAILED_MESSAGE = {
    message: 'Callback saved in App Connect. CRM sync failed.',
    messageType: 'warning',
    ttl: 5000,
};

const CRM_SESSION_EXPIRED_MESSAGE = {
    message: 'Callback saved in App Connect. CRM session expired.',
    messageType: 'warning',
    ttl: 5000,
};

/**
 * @param {unknown} value
 * @returns {string | null}
 */
function toIso(value) {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(/** @type {any} */ (value));
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/**
 * CRM contact ids are strings. A JSON number bound into SQLite comes back with a
 * trailing ".0", which no longer matches the contact cached by the client.
 * @param {unknown} value
 * @returns {string | null}
 */
function canonicalContactId(value) {
    if (value == null || value === '') return null;
    const text = String(value).trim();
    return text.replace(/^(\d+)\.0$/, '$1');
}

/**
 * CRM record ids are stored as strings, matching call-log thirdPartyLogId.
 * @param {unknown} value
 * @returns {string | null}
 */
function canonicalThirdPartyId(value) {
    if (value == null || value === '') return null;
    const text = String(value).trim();
    return text || null;
}

/**
 * @param {any} record
 * @returns {string | null}
 */
function readThirdPartyId(record) {
    const value = typeof record?.get === 'function' ? record.get('thirdPartyId') : record?.thirdPartyId;
    return canonicalThirdPartyId(value);
}

/**
 * The phone number is taken from the current client request and is not stored.
 * Delete and called events have no request body, so they do not include it.
 * @param {any} source
 * @returns {string | undefined}
 */
function requestPhoneNumber(source) {
    if (!source || !Object.prototype.hasOwnProperty.call(source, 'phoneNumber') || source.phoneNumber == null || source.phoneNumber === '') {
        return undefined;
    }
    return String(source.phoneNumber);
}

/**
 * @param {any} record
 * @param {any} [requestFields]
 * @returns {CallDownSnapshot}
 */
function serializeCallback(record, requestFields = undefined) {
    const plain = typeof record?.get === 'function' ? record.get({ plain: true }) : record;
    const phoneNumber = requestPhoneNumber(requestFields);
    return {
        id: plain.id,
        contactId: canonicalContactId(plain.contactId),
        contactType: plain.contactType ?? null,
        ...(phoneNumber ? { phoneNumber } : {}),
        status: plain.status ?? null,
        scheduledAt: toIso(plain.scheduledAt),
        lastCallAt: toIso(plain.lastCallAt),
    };
}

/**
 * @param {CallDownSnapshot | null} previous
 * @param {CallDownSnapshot} next
 * @returns {CallDownSyncEvent}
 */
function resolveEvent(previous, next) {
    if (!previous) return 'created';
    if (next.status === 'called' && previous.status !== 'called') return 'called';
    return 'updated';
}

/**
 * @param {string} jwtToken
 * @returns {Promise<{ userId: string | number, user: any }>}
 */
async function loadUser(jwtToken) {
    const unAuthData = /** @type {CallDownJwtData | null} */ (jwt.decodeJwt(jwtToken));
    if (!unAuthData?.id) throw new Error('Unauthorized');
    const user = await UserModel.findByPk(unAuthData.id);
    return { userId: unAuthData.id, user };
}

/**
 * @param {any} user
 * @param {any} platformModule
 */
async function resolveSyncAuth(user, platformModule) {
    const proxyId = user.platformAdditionalInfo?.proxyId;
    let proxyConfig = null;
    if (proxyId) {
        const { Connector } = /** @type {any} */ (require('../models/dynamo/connectorSchema'));
        proxyConfig = await Connector.getProxyConfig(proxyId);
    }

    const authType = await platformModule.getAuthType({ proxyId, proxyConfig });
    /** @type {any} */
    let currentUser = user;
    let authHeader = '';
    if (authType === 'oauth') {
        const oauthInfo = await platformModule.getOauthInfo({
            tokenUrl: user?.platformAdditionalInfo?.tokenUrl,
            hostname: user?.hostname,
            proxyId,
            proxyConfig,
        });
        const oauthApp = oauth.getOAuthApp(oauthInfo);
        currentUser = await oauth.checkAndRefreshAccessToken(oauthApp, user);
        if (!currentUser) {
            return {
                successful: false,
                returnMessage: CRM_SESSION_EXPIRED_MESSAGE,
            };
        }
        authHeader = `Bearer ${currentUser.accessToken}`;
    }
    else if (authType === 'apiKey') {
        const basicAuth = platformModule.getBasicAuth({ apiKey: user.accessToken });
        authHeader = `Basic ${basicAuth}`;
    }

    return {
        successful: true,
        user: currentUser,
        authHeader,
        proxyConfig,
    };
}

/**
 * @param {CallDownSyncEvent} event
 * @returns {'createCallback' | 'updateCallback' | 'markCalledCallback' | 'deleteCallback'}
 */
function callbackInterfaceName(event) {
    if (event === 'created') return 'createCallback';
    if (event === 'called') return 'markCalledCallback';
    if (event === 'deleted') return 'deleteCallback';
    return 'updateCallback';
}

/**
 * @param {{ user: any, event: CallDownSyncEvent, callbackRecord: any, previousRecord: any, requestFields?: any }} params
 * @returns {Promise<{ skipped: boolean, returnMessage?: ReturnMessage, thirdPartyId?: string | null }>}
 */
async function notifyCrm({ user, event, callbackRecord, previousRecord, requestFields = undefined }) {
    if (!user?.platform) return { skipped: true };

    const interfaceName = callbackInterfaceName(event);
    /** @type {any} */
    let platformModule;
    try {
        platformModule = connectorRegistry.getConnector(user.platform);
    }
    catch (error) {
        return { skipped: true };
    }
    if (typeof platformModule[interfaceName] !== 'function') {
        return { skipped: true };
    }

    try {
        const auth = await resolveSyncAuth(user, platformModule);
        if (!auth.successful) {
            return { skipped: false, returnMessage: auth.returnMessage };
        }

        const callback = serializeCallback(callbackRecord, requestFields);
        /** @type {CreateCallbackParams | UpdateCallbackParams | MarkCalledCallbackParams | DeleteCallbackParams} */
        let payload;
        if (event === 'created') {
            payload = {
                user: auth.user,
                authHeader: auth.authHeader,
                proxyConfig: auth.proxyConfig,
                callback,
            };
        }
        else if (event === 'deleted') {
            payload = {
                user: auth.user,
                authHeader: auth.authHeader,
                proxyConfig: auth.proxyConfig,
                callback,
                thirdPartyId: readThirdPartyId(callbackRecord),
            };
        }
        else {
            payload = {
                user: auth.user,
                authHeader: auth.authHeader,
                proxyConfig: auth.proxyConfig,
                callback,
                previous: previousRecord ? serializeCallback(previousRecord) : null,
                thirdPartyId: readThirdPartyId(callbackRecord),
            };
        }

        const result = /** @type {CallDownSyncResult | null | undefined} */ (
            await platformModule[interfaceName](payload)
        );
        if (result && typeof result === 'object' && result.successful === false) {
            return {
                skipped: false,
                returnMessage: result.returnMessage || CRM_SYNC_FAILED_MESSAGE,
            };
        }

        return {
            skipped: false,
            returnMessage: result?.returnMessage,
            thirdPartyId: event === 'created' ? canonicalThirdPartyId(result?.thirdPartyId) : null,
        };
    }
    catch (error) {
        const handled = handleApiError(/** @type {any} */ (error), user.platform, interfaceName, { userId: user.id });
        return {
            skipped: false,
            returnMessage: handled.returnMessage || CRM_SYNC_FAILED_MESSAGE,
        };
    }
}

/**
 * @template T
 * @param {T} base
 * @param {{ skipped?: boolean, returnMessage?: ReturnMessage }} syncResult
 * @returns {T & { returnMessage?: ReturnMessage }}
 */
function withSyncResult(base, syncResult) {
    if (!syncResult || syncResult.skipped || !syncResult.returnMessage) return base;
    return { ...base, returnMessage: syncResult.returnMessage };
}

/**
 * @param {CallDownScheduleParams} params
 * @returns {Promise<CallDownScheduleResult>}
 */
async function schedule({ jwtToken, body }) {
    const { user } = await loadUser(jwtToken);
    if (!user) throw new Error('User not found');
    const crypto = require('crypto');
    const recordId = crypto.randomBytes(16).toString('hex');
    const payload = {
        id: recordId,
        userId: user.id,
        contactId: canonicalContactId(body.contactId),
        contactType: body.contactType ?? 'contact',
        status: 'scheduled',
        scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : null,
        lastCallAt: null,
        platform: user.platform ?? null,
        thirdPartyId: null,
    };
    const record = await CallDownListModel.create(payload);
    const syncResult = await notifyCrm({
        user,
        event: 'created',
        callbackRecord: record,
        previousRecord: null,
        requestFields: body,
    });
    if (syncResult.thirdPartyId) {
        await CallDownListModel.update(
            { thirdPartyId: syncResult.thirdPartyId },
            { where: { id: recordId } },
        );
        logger.info('Stored call-back thirdPartyId', {
            id: recordId,
            thirdPartyId: syncResult.thirdPartyId,
        });
    }
    return withSyncResult({ id: recordId }, syncResult);
}

/**
 * @param {CallDownListParams} params
 * @returns {Promise<CallDownListResult>}
 */
async function list({ jwtToken, status }) {
    const { userId } = await loadUser(jwtToken);
    const statusParam = (status || 'All').toString().toLowerCase();
    /** @type {{ userId: string | number, status?: unknown }} */
    const whereClause: any = { userId };
    if (statusParam === 'called') whereClause.status = 'called';
    else if (['not called', 'not_called', 'notcalled'].includes(statusParam)) whereClause.status = { [Op.ne]: 'called' };
    const items = await CallDownListModel.findAll({ where: whereClause, order: [["scheduledAt", "ASC"]] });
    for (const item of items) {
        if (item.contactId != null) item.contactId = canonicalContactId(item.contactId);
    }
    return { items };
}

/**
 * @param {CallDownRecordParams} params
 * @returns {Promise<CallDownOperationResult>}
 */
async function remove({ jwtToken, id }) {
    const { userId, user } = await loadUser(jwtToken);
    const existing = await CallDownListModel.findOne({ where: { id, userId } });
    if (!existing) throw new Error('Not found');
    const deleted = await CallDownListModel.destroy({ where: { id, userId } });
    if (!deleted) throw new Error('Not found');
    const syncResult = await notifyCrm({
        user,
        event: 'deleted',
        callbackRecord: existing,
        previousRecord: existing,
    });
    return withSyncResult({ successful: true }, syncResult);
}

/**
 * @param {CallDownMarkCalledParams} params
 * @returns {Promise<CallDownOperationResult>}
 */
async function markCalled({ jwtToken, id, lastCallAt }) {
    const { userId, user } = await loadUser(jwtToken);
    const when = lastCallAt ? new Date(/** @type {any} */ (lastCallAt)) : new Date();
    try {
        const existing = await CallDownListModel.findOne({ where: { id, userId } });
        if (!existing) throw new Error('Not found');
        const [affected] = await CallDownListModel.update({ status: 'called', lastCallAt: when }, { where: { id, userId } });
        if (!affected) throw new Error('Not found');
        const updated = await CallDownListModel.findOne({ where: { id, userId } });
        const syncResult = await notifyCrm({
            user,
            event: resolveEvent(serializeCallback(existing), serializeCallback(updated)),
            callbackRecord: updated,
            previousRecord: existing,
        });
        return withSyncResult({ successful: true }, syncResult);
    }
    catch (error) {
        return handleDatabaseError(error, 'Error marking call as called', { id, userId });
    }
}

/**
 * @param {CallDownUpdateParams} params
 * @returns {Promise<CallDownOperationResult>}
 */
async function update({ jwtToken, id, updateData }) {
    const { userId, user } = await loadUser(jwtToken);
    
    // Prepare the update object with only valid fields
    const hasRequestDetails = Object.prototype.hasOwnProperty.call(updateData, 'phoneNumber') && updateData.phoneNumber != null && updateData.phoneNumber !== '';
    /** @type {Record<string, unknown>} */
    const updateObject = {};
    
    // Personal fields stay on the request and are forwarded only when this edit calls updateCallback.
    Object.keys(updateData).forEach(key => {
        if (PERSISTED_FIELDS.includes(key)) {
            let value = updateData[key];
            
            // Handle date fields
            if ((key === 'scheduledAt' || key === 'lastCallAt') && value) {
                value = new Date(/** @type {any} */ (value));
            }
            if (key === 'contactId') {
                value = canonicalContactId(value);
            }
            
            updateObject[key] = value;
        }
    });
    
    // If no valid fields to update, throw error
    if (Object.keys(updateObject).length === 0 && !hasRequestDetails) {
        throw new Error('No valid fields to update');
    }

    const existing = await CallDownListModel.findOne({ where: { id, userId } });
    if (!existing) throw new Error('Not found');
    if (Object.keys(updateObject).length > 0) {
        const [affected] = await CallDownListModel.update(updateObject, { where: { id, userId } });
        if (!affected) throw new Error('Not found');
    }
    const updated = await CallDownListModel.findOne({ where: { id, userId } });
    const syncResult = await notifyCrm({
        user,
        event: resolveEvent(serializeCallback(existing), serializeCallback(updated, updateData)),
        callbackRecord: updated,
        previousRecord: existing,
        requestFields: updateData,
    });
    return withSyncResult({ successful: true }, syncResult);
}

exports.schedule = schedule;
exports.list = list;
exports.remove = remove;
exports.markCalled = markCalled;
exports.update = update;


export {};
