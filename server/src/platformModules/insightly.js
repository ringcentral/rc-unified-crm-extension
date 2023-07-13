const axios = require('axios');
const moment = require('moment');
const { UserModel } = require('../models/userModel');
const Op = require('sequelize').Op;
const { parsePhoneNumber } = require('awesome-phonenumber');

const API_VERSION = 'v3.1';

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

async function unAuthorize({ id }) {
    const user = await UserModel.findByPk(id);
    if (user) {
        await user.destroy();
    }
}

async function addCallLog({ user, contactInfo, authHeader, callLog, note, additionalSubmission, timezoneOffset, contactNumber }) {
    const noteDetail = note ? `\n\nAgent notes: ${note}` : '';
    const callRecordingDetail = callLog.recording ? `\nCall recording link: ${callLog.recording.link}` : "";
    const postBody = {
        TITLE: `${callLog.direction} Call ${callLog.direction === 'Outbound' ? 'to' : 'from'} ${contactInfo.name}`,
        DETAILS: `This was a ${callLog.duration} seconds call ${callLog.direction === 'Outbound' ? `to ${contactInfo.name}(${callLog.to.phoneNumber})` : `from ${contactInfo.name}(${callLog.from.phoneNumber})`}.${noteDetail}${callRecordingDetail}\n\n--- Added by RingCentral CRM Extension`,
        START_DATE_UTC: moment(callLog.startTime).utc(),
        END_DATE_UTC: moment(callLog.startTime).utc().add(callLog.duration, 'seconds')
    }
    const addLogRes = await axios.post(
        `${user.platformAdditionalInfo.apiUrl}/${API_VERSION}/events`,
        postBody,
        {
            headers: { 'Authorization': authHeader }
        });
    // add linked contact to log
    await axios.post(
        `${user.platformAdditionalInfo.apiUrl}/${API_VERSION}/events/${addLogRes.data.EVENT_ID}/links`,
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
                `${user.platformAdditionalInfo.apiUrl}/${API_VERSION}/events/${addLogRes.data.EVENT_ID}/links`,
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
                `${user.platformAdditionalInfo.apiUrl}/${API_VERSION}/events/${addLogRes.data.EVENT_ID}/links`,
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
                `${user.platformAdditionalInfo.apiUrl}/${API_VERSION}/events/${addLogRes.data.EVENT_ID}/links`,
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

async function addMessageLog({ user, contactInfo, authHeader, message, additionalSubmission, recordingLink, timezoneOffset, contactNumber }) {
    const postBody = {
        TITLE: `SMS Log`,
        DETAILS: `${message.direction} SMS - ${message.direction == 'Inbound' ? `from ${contactInfo.name}(${message.from.phoneNumber})` : `to ${contactInfo.name}(${message.to[0].phoneNumber})`} \n${!!message.subject ? `[Message] ${message.subject}` : ''} ${!!recordingLink ? `\n[Recording link] ${recordingLink}` : ''}\n\n--- Added by RingCentral CRM Extension`,
        START_DATE_UTC: moment(message.creationTime).utc(),
        END_DATE_UTC: moment(message.creationTime).utc()
    }
    const addLogRes = await axios.post(
        `${user.platformAdditionalInfo.apiUrl}/${API_VERSION}/events`,
        postBody,
        {
            headers: { 'Authorization': authHeader }
        });
    // add linked contact to log
    await axios.post(
        `${user.platformAdditionalInfo.apiUrl}/${API_VERSION}/events/${addLogRes.data.EVENT_ID}/links`,
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
    phoneNumber = phoneNumber.replace(' ', '+')
    const phoneNumberObj = parsePhoneNumber(phoneNumber);
    let phoneNumberWithoutCountryCode = phoneNumber;
    if (phoneNumberObj.valid) {
        phoneNumberWithoutCountryCode = phoneNumberObj.number.significant;
    }
    // try Contact by PHONE
    let personInfo = await axios.get(
        `${user.platformAdditionalInfo.apiUrl}/${API_VERSION}/contacts/search?field_name=PHONE&field_value=${phoneNumberWithoutCountryCode}&brief=false&top=1`,
        {
            headers: { 'Authorization': authHeader }
        });
        console.log('contact phone...');
    if (personInfo.data.length === 0) {
        // try Contact by PHONE_MOBILE
        console.log('contact mobile...');
        personInfo = await axios.get(
            `${user.platformAdditionalInfo.apiUrl}/${API_VERSION}/contacts/search?field_name=PHONE_MOBILE&field_value=${phoneNumberWithoutCountryCode}&brief=false&top=1`,
            {
                headers: { 'Authorization': authHeader }
            });
        if (personInfo.data.length === 0) {
            // try Lead by PHONE
            personInfo = await axios.get(
                `${user.platformAdditionalInfo.apiUrl}/${API_VERSION}/leads/search?field_name=PHONE&field_value=${phoneNumberWithoutCountryCode}&brief=false&top=1`,
                {
                    headers: { 'Authorization': authHeader }
                });
                console.log('lead phone...');
            if (personInfo.data.length === 0) {
                // try Lead by MOBILE
                personInfo = await axios.get(
                    `${user.platformAdditionalInfo.apiUrl}/${API_VERSION}/leads/search?field_name=MOBILE&field_value=${phoneNumberWithoutCountryCode}&brief=false&top=1`,
                    {
                        headers: { 'Authorization': authHeader }
                    });
                    console.log('lead mobile...');
                if (personInfo.data.length === 0) {
                    return null;
                }
            }
        }
    }
    const rawPersonInfo = personInfo.data[0];
    rawPersonInfo.linkData = [];
    for (const link of rawPersonInfo.LINKS) {
        switch (link.LINK_OBJECT_NAME) {
            case 'Organisation':
                const orgRes = await axios.get(
                    `${user.platformAdditionalInfo.apiUrl}/${API_VERSION}/organisations/${link.LINK_OBJECT_ID}`,
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
                    `${user.platformAdditionalInfo.apiUrl}/${API_VERSION}/opportunities/${link.LINK_OBJECT_ID}`,
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
                    `${user.platformAdditionalInfo.apiUrl}/${API_VERSION}/projects/${link.LINK_OBJECT_ID}`,
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
        title: rawContactInfo.TITLE,
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
exports.unAuthorize = unAuthorize;