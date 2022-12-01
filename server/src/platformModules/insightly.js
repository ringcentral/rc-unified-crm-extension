const axios = require('axios');
const moment = require('moment');
const { UserModel } = require('../models/userModel');

const BASE_URL = 'https://api.insightly.com/v3.1';

function getAuthType() {
    return 'apiKey';
}

function getBasicAuth({ apiKey }) {
    return Buffer.from(`${apiKey}:`).toString('base64');
}


async function getUserInfo({ authHeader }) {
    const userInfoResponse = await axios.get(`${BASE_URL}/users/me`, {
        headers: {
            'Authorization': authHeader
        }
    });;
    const timezoneOffset = moment().tz(userInfoResponse.data.TIMEZONE_ID).format('Z');
    return {
        id: userInfoResponse.data.USER_ID.toString(),
        name: `${userInfoResponse.data.FIRST_NAME} ${userInfoResponse.data.LAST_NAME}`,
        timezoneName: userInfoResponse.data.TIMEZONE_ID,
        timezoneOffset,
        platformAdditionalInfo: {}
    };
}

async function saveApiKeyUserInfo({ id, name, apiKey, rcUserNumber, timezoneName, timezoneOffset, additionalInfo }) {
    await UserModel.create({
        id,
        name,
        timezoneName,
        timezoneOffset,
        platform: 'pipedrive',
        accessToken: apiKey,
        rcUserNumber,
        additionalInfo
    });
}

async function addCallLog({ userId, contactInfo, authHeader, callLog, note, additionalSubmission, timezoneOffset }) {
    const postBody = {
        TITLE: 'Call Log',
        DETAILS: `${callLog.direction} Call - ${callLog.from.name ?? callLog.fromName}(${callLog.from.phoneNumber}) to ${callLog.to.name ?? callLog.toName}(${callLog.to.phoneNumber}) ${callLog.recording ? `[Call recording link] ${callLog.recording.link}` : ''} --- Added by RingCentral Unified CRM Extension`,
        START_DATE_UTC: moment(callLog.startTime).utc(),
        END_DATE_UTC: moment(callLog.startTime).utc().add(callLog.duration, 'seconds'),
    }
    const addLogRes = await axios.post(
        `${BASE_URL}/events`,
        postBody,
        {
            headers: { 'Authorization': authHeader }
        });
    // add linked contact to log
    await axios.post(
        `${BASE_URL}/events/${addLogRes.data.EVENT_ID}/links`,
        {
            LINK_OBJECT_NAME: 'contact',
            LINK_OBJECT_ID: contactInfo.id
        },
        {
            headers: { 'Authorization': authHeader }
        });
    return addLogRes.data.data.id;
}

async function addMessageLog({ userId, contactInfo, authHeader, message, additionalSubmission, recordingLink, timezoneOffset }) {
    const dealId = additionalSubmission ? additionalSubmission.dealId : '';
    const orgId = contactInfo.organization ? contactInfo.organization.id : '';
    const postBody = {
        user_id: userId,
        subject: `${message.direction} SMS - ${message.from.name ?? ''}(${message.from.phoneNumber}) to ${message.to[0].name ?? ''}(${message.to[0].phoneNumber})`,
        person_id: contactInfo.id,
        org_id: orgId,
        deal_id: dealId,
        note: `<p>[Time] ${moment(message.creationTime).utcOffset(timezoneOffset).format('YYYY-MM-DD hh:mm:ss A')}</p>${!!message.subject ? `<p>[Message] ${message.subject}</p>` : ''} ${!!recordingLink ? `\n<p>[Recording link] ${recordingLink}</p>` : ''}`,
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

async function getContact({ authHeader, phoneNumber }) {
    const personInfo = await axios.get(
        `${BASE_URL}/contacts/search??field_name=PHONE&field_value=${phoneNumber.replace('+', '')}&brief=true&top=1`,
        {
            headers: { 'Authorization': authHeader }
        });
    if (personInfo.data.length === 0) {
        return null;
    }
    else {
        let result = personInfo.data[0];
        return result;
    }
}


exports.getAuthType = getAuthType;
exports.getBasicAuth = getBasicAuth;
exports.getUserInfo = getUserInfo;
exports.saveApiKeyUserInfo = saveApiKeyUserInfo;
exports.addCallLog = addCallLog;
exports.addMessageLog = addMessageLog;
exports.getContact = getContact;