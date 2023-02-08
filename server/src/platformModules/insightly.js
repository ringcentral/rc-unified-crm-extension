const axios = require('axios');
const moment = require('moment');
const { UserModel } = require('../models/userModel');
const Op = require('sequelize').Op;

// TODO: replace this with user.additionalInfo.apiUrl
const BASE_URL = 'https://api.na1.insightly.com/v3.1';

function getAuthType() {
    return 'apiKey';
}

function getBasicAuth({ apiKey }) {
    return Buffer.from(`${apiKey}:`).toString('base64');
}


async function getUserInfo({ user, authHeader, additionalInfo }) {
    const userInfoResponse = await axios.get(`${additionalInfo.apiUrl}/v3.1/users/me`, {
        headers: {
            'Authorization': authHeader
        }
    });;
    // Insightly timezone = server location + non-standard tz area id (eg.'Central Standard Time')
    // We use UTC here for now
    const timezoneOffset = null;
    return {
        id: userInfoResponse.data.USER_ID.toString(),
        name: `${userInfoResponse.data.FIRST_NAME} ${userInfoResponse.data.LAST_NAME}`,
        timezoneName: userInfoResponse.data.TIMEZONE_ID,
        timezoneOffset,
        additionalInfo
    };
}

async function saveApiKeyUserInfo({ id, name, hostname, apiKey, rcUserNumber, timezoneName, timezoneOffset, additionalInfo }) {
    const existingUser = await UserModel.findOne({
        where: {
            [Op.and]: [
                {
                    id,
                    platform: 'insightly'
                }
            ]
        }
    });
    if (existingUser) {
        await existingUser.update({
            name,
            hostname,
            timezoneName,
            timezoneOffset,
            accessToken: apiKey,
            rcUserNumber,
            platformAdditionalInfo: additionalInfo
        });
    }
    else {
        await UserModel.create({
            id,
            name,
            hostname,
            timezoneName,
            timezoneOffset,
            platform: 'insightly',
            accessToken: apiKey,
            rcUserNumber,
            platformAdditionalInfo: additionalInfo
        });
    }
}

async function addCallLog({ user, contactInfo, authHeader, callLog, note, additionalSubmission, timezoneOffset }) {
    const noteDetail = note ? `\n\nAgent notes: ${note}` : '';
    const callRecordingDetail = callLog.recording ? `\nCall recording link: ${callLog.recording.link}` : "";
    const postBody = {
        TITLE: `${callLog.direction} Call ${callLog.direction === 'Outbound' ? 'to' : 'from'} ${contactInfo.name}`,
        DETAILS: `This was a ${callLog.duration} seconds call ${callLog.direction === 'Outbound' ? `to ${contactInfo.name}(${callLog.to.phoneNumber})` : `from ${contactInfo.name}(${callLog.from.phoneNumber})`}.${noteDetail}${callRecordingDetail}\n\n--- Added by RingCentral CRM Extension`,
        START_DATE_UTC: moment(callLog.startTime).utc(),
        END_DATE_UTC: moment(callLog.startTime).utc().add(callLog.duration, 'seconds')
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
    if (additionalSubmission != null) {
        // add org link
        if (additionalSubmission.orgSelection != null) {
            await axios.post(
                `${BASE_URL}/events/${addLogRes.data.EVENT_ID}/links`,
                {
                    LINK_OBJECT_NAME: 'Organisation',
                    LINK_OBJECT_ID: additionalSubmission.orgSelection
                },
                {
                    headers: { 'Authorization': authHeader }
                });
        }
        // add opportunity link
        if (additionalSubmission.opportunitySelection != null) {
            await axios.post(
                `${BASE_URL}/events/${addLogRes.data.EVENT_ID}/links`,
                {
                    LINK_OBJECT_NAME: 'Opportunity',
                    LINK_OBJECT_ID: additionalSubmission.opportunitySelection
                },
                {
                    headers: { 'Authorization': authHeader }
                });
        }
        // add org link
        if (additionalSubmission.projectSelection != null) {
            await axios.post(
                `${BASE_URL}/events/${addLogRes.data.EVENT_ID}/links`,
                {
                    LINK_OBJECT_NAME: 'Project',
                    LINK_OBJECT_ID: additionalSubmission.projectSelection
                },
                {
                    headers: { 'Authorization': authHeader }
                });
        }
    }
    return addLogRes.data.EVENT_ID;
}

async function addMessageLog({ user, contactInfo, authHeader, message, additionalSubmission, recordingLink, timezoneOffset }) {
    const postBody = {
        TITLE: `SMS Log`,
        DETAILS: `${message.direction} SMS - ${message.direction == 'Inbound' ? `from ${message.from.name ?? ''}(${message.from.phoneNumber})` : `to ${message.to[0].name ?? ''}(${message.to[0].phoneNumber})`} \n${!!message.subject ? `[Message] ${message.subject}` : ''} ${!!recordingLink ? `\n[Recording link] ${recordingLink}` : ''}\n\n--- Added by RingCentral CRM Extension`,
        START_DATE_UTC: moment(message.creationTime).utc(),
        END_DATE_UTC: moment(message.creationTime).utc()
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
    return addLogRes.data.EVENT_ID;
}

async function getContact({ user, authHeader, phoneNumber }) {
    const personInfo = await axios.get(
        `${BASE_URL}/contacts/search?field_name=PHONE&field_value=${phoneNumber.replace('+', '').trim()}&brief=false&top=1`,
        {
            headers: { 'Authorization': authHeader }
        });
    if (personInfo.data.length === 0) {
        return null;
    }
    const rawPersonInfo = personInfo.data[0];
    rawPersonInfo.linkData = [];
    for (const link of rawPersonInfo.LINKS) {
        switch (link.LINK_OBJECT_NAME) {
            case 'Organisation':
                const orgRes = await axios.get(
                    `${BASE_URL}/organisations/${link.LINK_OBJECT_ID}`,
                    {
                        headers: { 'Authorization': authHeader }
                    });
                rawPersonInfo.linkData.push({
                    label: link.LINK_OBJECT_NAME,
                    name: orgRes.data.ORGANISATION_NAME,
                    id: orgRes.data.ORGANISATION_ID
                })
                break;
            case 'Opportunity':
                const opportunityRes = await axios.get(
                    `${BASE_URL}/opportunities/${link.LINK_OBJECT_ID}`,
                    {
                        headers: { 'Authorization': authHeader }
                    });
                rawPersonInfo.linkData.push({
                    label: link.LINK_OBJECT_NAME,
                    name: opportunityRes.data.OPPORTUNITY_NAME,
                    id: opportunityRes.data.OPPORTUNITY_ID
                })
                break;
            case 'Project':
                const projectRes = await axios.get(
                    `${BASE_URL}/projects/${link.LINK_OBJECT_ID}`,
                    {
                        headers: { 'Authorization': authHeader }
                    });
                rawPersonInfo.linkData.push({
                    label: link.LINK_OBJECT_NAME,
                    name: projectRes.data.PROJECT_NAME,
                    id: projectRes.data.PROJECT_ID
                })
                break;
        }
    }
    return formatContact(rawPersonInfo);
}

function formatContact(rawContactInfo) {
    return {
        id: rawContactInfo.CONTACT_ID,
        name: `${rawContactInfo.FIRST_NAME} ${rawContactInfo.LAST_NAME}`,
        phone: rawContactInfo.PHONE,
        links: rawContactInfo.linkData
    }
}


exports.getAuthType = getAuthType;
exports.getBasicAuth = getBasicAuth;
exports.getUserInfo = getUserInfo;
exports.saveApiKeyUserInfo = saveApiKeyUserInfo;
exports.addCallLog = addCallLog;
exports.addMessageLog = addMessageLog;
exports.getContact = getContact;