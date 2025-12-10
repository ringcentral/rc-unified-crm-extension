const { UserModel } = require('../models/userModel');
const { CallDownListModel } = require('../models/callDownListModel');
const { Op } = require('sequelize');
const jwt = require('../lib/jwt');

async function schedule({ jwtToken, rcAccessToken, body }) {
    const unAuthData = jwt.decodeJwt(jwtToken);
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

async function list({ jwtToken, status }) {
    const unAuthData = jwt.decodeJwt(jwtToken);
    if (!unAuthData?.id) throw new Error('Unauthorized');
    const statusParam = (status || 'All').toString().toLowerCase();
    const whereClause = { userId: unAuthData.id };
    if (statusParam === 'called') whereClause.status = 'called';
    else if (['not called', 'not_called', 'notcalled'].includes(statusParam)) whereClause.status = { [Op.ne]: 'called' };
    const items = await CallDownListModel.findAll({ where: whereClause, order: [["scheduledAt", "ASC"]] });
    return { items };
}

async function remove({ jwtToken, id }) {
    const unAuthData = jwt.decodeJwt(jwtToken);
    if (!unAuthData?.id) throw new Error('Unauthorized');
    const deleted = await CallDownListModel.destroy({ where: { id, userId: unAuthData.id } });
    if (!deleted) throw new Error('Not found');
    return { successful: true };
}

async function markCalled({ jwtToken, id, lastCallAt }) {
    const unAuthData = jwt.decodeJwt(jwtToken);
    if (!unAuthData?.id) throw new Error('Unauthorized');
    const when = lastCallAt ? new Date(lastCallAt) : new Date();
    const [affected] = await CallDownListModel.update({ status: 'called', lastCallAt: when }, { where: { id, userId: unAuthData.id } });
    if (!affected) throw new Error('Not found');
    return { successful: true };
}

async function update({ jwtToken, id, updateData }) {
    const unAuthData = jwt.decodeJwt(jwtToken);
    if (!unAuthData?.id) throw new Error('Unauthorized');
    
    // Prepare the update object with only valid fields
    const allowedFields = ['contactId', 'contactType', 'contactName', 'phoneNumber', 'status', 'scheduledAt', 'lastCallAt', 'note'];
    const updateObject = {};
    
    // Filter and prepare update data
    Object.keys(updateData).forEach(key => {
        if (allowedFields.includes(key)) {
            let value = updateData[key];
            
            // Handle date fields
            if ((key === 'scheduledAt' || key === 'lastCallAt') && value) {
                value = new Date(value);
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

