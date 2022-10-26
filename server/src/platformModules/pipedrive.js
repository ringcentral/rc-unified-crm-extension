const axios = require('axios');
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
        subject: `${callLog.direction} Call - ${callLog.from.name ?? callLog.fromName}(${callLog.from.phoneNumber}) to ${callLog.to.name ?? callLog.toName}(${callLog.to.phoneNumber})`,
        duration: callLog.duration,    // secs
        person_id: personInfo.data.data.items[0].item.id,
        // deal_id: '',
        note: `[${callLog.result}] ${note}`,
        done: true
    }
    const addLogRes = await axios.post(
        `${BASE_URL}/v1/activities`,
        postBody,
        {
            headers: { 'Authorization': authHeader }
        });
    return addLogRes.data.data.id;
}

async function addMessageLog(userId, message, contactNumber, recordingLink) {
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
    const postBody = {
        user_id: userId,
        subject: `${message.direction} SMS - ${message.from.name ?? ''}(${message.from.phoneNumber}) to ${message.to[0].name ?? ''}(${message.to[0].phoneNumber})`,
        person_id: personInfo.data.data.items[0].item.id,
        // deal_id: '',
        note: `${!!message.subject? `Message: ${message.subject}`: ''} ${!!recordingLink ? `\nRecording Link: ${recordingLink}` : ''}`,
        done: true
    }
    const addLogRes = await axios.post(
        `${BASE_URL}/v1/activities`,
        postBody,
        {
            headers: { 'Authorization': authHeader }
        });
    return addLogRes.data.data.id;
}

exports.addCallLog = addCallLog;
exports.addMessageLog = addMessageLog;