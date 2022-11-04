const axios = require('axios');
const { UserModel } = require('../models/userModel');
const { checkAndRefreshAccessToken } = require('../lib/oauth');

const BASE_URL = 'https://ringcentral-sandbox.pipedrive.com';

async function addCallLog({ userId, incomingData }) {
    const callLog = incomingData.logInfo;
    const note = incomingData.note;
    const dealId = incomingData.additionalDropdownSelection;
    const user = await UserModel.findByPk(userId);
    if (!user.accessToken) {
        throw `Cannot find user with id: ${userId}`;
    }
    await checkAndRefreshAccessToken(user);
    const authHeader = `Bearer ${user.accessToken}`;
    const personNumber = callLog.direction === 'Inbound' ? callLog.from.phoneNumber : callLog.to.phoneNumber;
    const personInfo = await getContact({ userId, phoneNumber: personNumber });
    if (personInfo == null) {
        throw `Person not found for number ${contactNumber}`;
    }
    // TODO: contact match
    const postBody = {
        user_id: userId,
        subject: `${callLog.direction} Call - ${callLog.from.name ?? callLog.fromName}(${callLog.from.phoneNumber}) to ${callLog.to.name ?? callLog.toName}(${callLog.to.phoneNumber})`,
        duration: callLog.duration,    // secs
        person_id: personInfo.id,
        deal_id: dealId ?? '',
        note: `<p>[Call result] ${callLog.result}</p><p>[Note] ${note}</p>${callLog.recording ? `<p>[Call recording link] ${callLog.recording.link}</p>` : ''}<p> </p><p><em><span style="font-size:9px">--- Added by RingCentral Unified CRM Extension(<a href="https://github.com/ringcentral">https://github.com/ringcentral</a>)</span></em></p>`,
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

async function addMessageLog({ userId, message, incomingData, recordingLink }) {
    const contactNumber = incomingData.logInfo.correspondents[0].phoneNumber;
    const dealId = incomingData.additionalDropdownSelection;
    const user = await UserModel.findByPk(userId);
    if (!user.accessToken) {
        throw `Cannot find user with id: ${userId}`;
    }
    await checkAndRefreshAccessToken(user);
    const authHeader = `Bearer ${user.accessToken}`;
    const personInfo = await getContact({ userId, phoneNumber: contactNumber });
    if (personInfo == null) {
        throw `Person not found for number ${contactNumber}`;
    }
    const postBody = {
        user_id: userId,
        subject: `${message.direction} SMS - ${message.from.name ?? ''}(${message.from.phoneNumber}) to ${message.to[0].name ?? ''}(${message.to[0].phoneNumber})`,
        person_id: personInfo.data.data.items[0].item.id,
        deal_id: dealId ?? '',
        note: `${!!message.subject ? `Message: ${message.subject}` : ''} ${!!recordingLink ? `\nRecording Link: ${recordingLink}` : ''}`,
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

async function getContact({ userId, phoneNumber }) {
    const user = await UserModel.findByPk(userId);
    if (!user.accessToken) {
        throw `Cannot find user with id: ${userId}`;
    }
    await checkAndRefreshAccessToken(user);
    const authHeader = `Bearer ${user.accessToken}`;
    const personInfo = await axios.get(
        `${BASE_URL}/v1/persons/search?term=${phoneNumber}&fields=phone&limit=1`,
        {
            headers: { 'Authorization': authHeader }
        });
    if (personInfo.data.data.items.length === 0) {
        return null;
    }
    else {
        const dealsResponse = await axios.get(
            `${BASE_URL}/v1/persons/${personInfo.data.data.items[0].item.id}/deals?status=open`,
            {
                headers: { 'Authorization': authHeader }
            });
        let result = personInfo.data.data.items[0].item;
        result['relatedDeals'] = dealsResponse.data.data.map(d => { return { id: d.id, title: d.title } });
        return result;
    }
}

exports.addCallLog = addCallLog;
exports.addMessageLog = addMessageLog;
exports.getContact = getContact;