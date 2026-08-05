// @ts-check
/** @typedef {import('../types').CallDownJwtData} CallDownJwtData */
/** @typedef {import('../types').CallDownListParams} CallDownListParams */
/** @typedef {import('../types').CallDownListResult} CallDownListResult */
/** @typedef {import('../types').CallDownMarkCalledParams} CallDownMarkCalledParams */
/** @typedef {import('../types').CallDownOperationResult} CallDownOperationResult */
/** @typedef {import('../types').CallDownRecordParams} CallDownRecordParams */
/** @typedef {import('../types').CallDownScheduleParams} CallDownScheduleParams */
/** @typedef {import('../types').CallDownScheduleResult} CallDownScheduleResult */
/** @typedef {import('../types').CallDownUpdateParams} CallDownUpdateParams */

const { UserModel: UserModelImport } = require('../models/userModel');
const UserModel = /** @type {any} */ (UserModelImport);
const { CallDownListModel: CallDownListModelImport } = require('../models/callDownListModel');
const CallDownListModel = /** @type {any} */ (CallDownListModelImport);
const { Op: OpImport } = require('sequelize');
const Op = /** @type {any} */ (OpImport);
const jwt = /** @type {any} */ (require('../lib/jwt'));
const { handleDatabaseError } = require('../lib/errorHandler');

/**
 * @param {CallDownScheduleParams} params
 * @returns {Promise<CallDownScheduleResult>}
 */
async function schedule({ jwtToken, body }) {
    const unAuthData = /** @type {CallDownJwtData | null} */ (jwt.decodeJwt(jwtToken));
    if (!unAuthData?.id) throw new Error('Unauthorized');
    const user = await UserModel.findByPk(unAuthData.id);
    if (!user) throw new Error('User not found');
    const crypto = require('crypto');
    const recordId = crypto.randomBytes(16).toString('hex');
    const payload = {
        id: recordId,
        userId: user.id,
        contactId: body.contactId?.toString?.() ?? body.contactId,
        contactType: body.contactType ?? 'contact',
        contactName: body.contactName ?? '',
        phoneNumber: body.phoneNumber ?? '',
        status: 'scheduled',
        scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : null,
        lastCallAt: null
    };
    await CallDownListModel.create(payload);
    return { id: recordId };
}

/**
 * @param {CallDownListParams} params
 * @returns {Promise<CallDownListResult>}
 */
async function list({ jwtToken, status }) {
    const unAuthData = /** @type {CallDownJwtData | null} */ (jwt.decodeJwt(jwtToken));
    if (!unAuthData?.id) throw new Error('Unauthorized');
    const statusParam = (status || 'All').toString().toLowerCase();
    /** @type {{ userId: string | number, status?: unknown }} */
    const whereClause: any = { userId: unAuthData.id };
    if (statusParam === 'called') whereClause.status = 'called';
    else if (['not called', 'not_called', 'notcalled'].includes(statusParam)) whereClause.status = { [Op.ne]: 'called' };
    const items = await CallDownListModel.findAll({ where: whereClause, order: [["scheduledAt", "ASC"]] });
    return { items };
}

/**
 * @param {CallDownRecordParams} params
 * @returns {Promise<CallDownOperationResult>}
 */
async function remove({ jwtToken, id }) {
    const unAuthData = /** @type {CallDownJwtData | null} */ (jwt.decodeJwt(jwtToken));
    if (!unAuthData?.id) throw new Error('Unauthorized');
    const deleted = await CallDownListModel.destroy({ where: { id, userId: unAuthData.id } });
    if (!deleted) throw new Error('Not found');
    return { successful: true };
}

/**
 * @param {CallDownMarkCalledParams} params
 * @returns {Promise<CallDownOperationResult>}
 */
async function markCalled({ jwtToken, id, lastCallAt }) {
    const unAuthData = /** @type {CallDownJwtData | null} */ (jwt.decodeJwt(jwtToken));
    if (!unAuthData?.id) throw new Error('Unauthorized');
    const when = lastCallAt ? new Date(/** @type {any} */ (lastCallAt)) : new Date();
    try {
        const [affected] = await CallDownListModel.update({ status: 'called', lastCallAt: when }, { where: { id, userId: unAuthData.id } });
        if (!affected) throw new Error('Not found');
        return { successful: true };
    }
    catch (error) {
        return handleDatabaseError(error, 'Error marking call as called', { id, userId: unAuthData.id });
    }
}

/**
 * @param {CallDownUpdateParams} params
 * @returns {Promise<CallDownOperationResult>}
 */
async function update({ jwtToken, id, updateData }) {
    const unAuthData = /** @type {CallDownJwtData | null} */ (jwt.decodeJwt(jwtToken));
    if (!unAuthData?.id) throw new Error('Unauthorized');
    
    // Prepare the update object with only valid fields
    const allowedFields = ['contactId', 'contactType', 'contactName', 'phoneNumber', 'status', 'scheduledAt', 'lastCallAt', 'note'];
    /** @type {Record<string, unknown>} */
    const updateObject = {};
    
    // Filter and prepare update data
    Object.keys(updateData).forEach(key => {
        if (allowedFields.includes(key)) {
            let value = updateData[key];
            
            // Handle date fields
            if ((key === 'scheduledAt' || key === 'lastCallAt') && value) {
                value = new Date(/** @type {any} */ (value));
            }
            
            updateObject[key] = value;
        }
    });
    
    // If no valid fields to update, throw error
    if (Object.keys(updateObject).length === 0) {
        throw new Error('No valid fields to update');
    }
    
    const [affected] = await CallDownListModel.update(updateObject, { where: { id, userId: unAuthData.id } });
    if (!affected) throw new Error('Not found');
    return { successful: true };
}

exports.schedule = schedule;
exports.list = list;
exports.remove = remove;
exports.markCalled = markCalled;
exports.update = update;


export {};
