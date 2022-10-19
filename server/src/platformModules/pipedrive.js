const axios = require('axios');
const moment = require('moment');
const { UserModel } = require('../models/userModel');
const { checkAndRefreshAccessToken } = require('../lib/oauth');

const BASE_URL = 'https://ringcentral-sandbox.pipedrive.com';

async function addCallLog(userId, callLog, note) {
    const user = await UserModel.findByPk(userId);
    if (!user.accessToken) {
        throw `Cannot find user with id: ${userId}`;
    }
    await checkAndRefreshAccessToken(user);
    const authHeader = `Bearer ${user.accessToken}`;
    const personNumber = callLog.direction === 'Inbound' ? callLog.from.phoneNumber : callLog.to.phoneNumber;
    const personInfo = await axios.get(
        `${BASE_URL}/v1/persons/search?term=${personNumber}&fields=phone`,
        {
            headers: { 'Authorization': authHeader }
        });
    if (personInfo.data.data.items.length === 0) {
        throw `Person not found for number ${personNumber}`;
    }
    // TODO: contact match
    const postBody = {
        user_id: userId,
        subject: 'Call',
        duration: callLog.duration,    // secs
        outcome: 'connected',   //connected,no_answer,left_message,left_voicemail,wrong_number,busy
        from_phone_number: callLog.from.phoneNumber,
        to_phone_number: callLog.to.phoneNumber,
        start_time: moment(callLog.startTime),
        end_time: moment(callLog.startTime).add(callLog.duration, 'seconds'),
        person_id: personInfo.data.data.items[0].item.id,
        // deal_id: '',
        note
    }
    const addLogRes = await axios.post(
        `${BASE_URL}/v1/callLogs`,
        postBody,
        {
            headers: { 'Authorization': authHeader }
        });
    return addLogRes.data.data.id;
}

async function addMessageLog(userId, message, contactNumber, note) {
    const user = await UserModel.findByPk(userId);
    if (!user.accessToken) {
        throw `Cannot find user with id: ${userId}`;
    }
    await checkAndRefreshAccessToken(user);
    const authHeader = `Bearer ${user.accessToken}`;
    const personInfo = await axios.get(
        `${BASE_URL}/v1/persons/search?term=${contactNumber}&fields=phone`,
        {
            headers: { 'Authorization': authHeader }
        });
    if (personInfo.data.data.items.length === 0) {
        throw `Person not found for number ${contactNumber}`;
    }
    // TODO: contact match
    const postBody = {
        user_id: userId,
        subject: 'SMS',
        outcome: 'connected',   //connected,no_answer,left_message,left_voicemail,wrong_number,busy
        from_phone_number: message.from.phoneNumber,
        to_phone_number: message.to[0].phoneNumber,
        start_time: moment(message.lastModifiedTime),
        end_time: moment(message.lastModifiedTime),
        person_id: personInfo.data.data.items[0].item.id,
        // deal_id: '',
        note: `Message: ${message.subject} \nNote:${note}`
    }
    const addLogRes = await axios.post(
        `${BASE_URL}/v1/callLogs`,
        postBody,
        {
            headers: { 'Authorization': authHeader }
        });
    return addLogRes.data.data.id;
}

exports.addCallLog = addCallLog;
exports.addMessageLog = addMessageLog;