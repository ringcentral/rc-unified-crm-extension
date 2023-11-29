const axios = require('axios');
const moment = require('moment');
const { UserModel } = require('../models/userModel');
const Op = require('sequelize').Op;
const { parsePhoneNumber } = require('awesome-phonenumber');

function getAuthType() {
    return 'apiKey';
}

function getBasicAuth({ apiKey }) {
    return Buffer.from(`${apiKey}`).toString('base64');
}

function getAuthHeader({ userKey }) {
    return Buffer.from(`${process.env.REDTAIL_API_KEY}:${userKey}`).toString('base64');
}

async function getUserInfo({ user, authHeader, additionalInfo }) {
    const overrideAPIKey = `${process.env.REDTAIL_API_KEY}:${additionalInfo.username}:${additionalInfo.password}`;
    const overrideAuthHeader = `Basic ${getBasicAuth({ apiKey: overrideAPIKey })}`;
    const authResponse = await axios.get(`${process.env.REDTAIL_API_SERVER}/authentication`, {
        headers: {
            'Authorization': overrideAuthHeader
        }
    });
    additionalInfo['userResponse'] = authResponse.data.authenticated_user;
    delete additionalInfo.password;
    return {
        id: additionalInfo.username,
        name: additionalInfo.username,
        timezoneName: '',
        timezoneOffset: null,
        additionalInfo
    }
}

async function saveApiKeyUserInfo({ id, name, hostname, apiKey, rcUserNumber, timezoneName, timezoneOffset, additionalInfo }) {
    const existingUser = await UserModel.findOne({
        where: {
            [Op.and]: [
                {
                    id,
                    platform: 'redtail'
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
            accessToken: additionalInfo.userResponse.user_key,
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
            platform: 'redtail',
            accessToken: additionalInfo.userResponse.user_key,
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
    const overrideAuthHeader = getAuthHeader({ userKey: user.platformAdditionalInfo.userResponse.user_key });
    const linkedNotes = note ?? '';
    const descriptionNotes = note ? `\n\nAgent notes: ${note}` : '';
    const callRecordingDetail = callLog.recording ? `\nCall recording link: <a target="_blank" href=${callLog.recording.link}>open</a>` : "";
    const postBody = {
        subject: callLog.customSubject ?? `${callLog.direction} Call ${callLog.direction === 'Outbound' ? 'to' : 'from'} ${contactInfo.name}`,
        description: `This was a ${callLog.duration} seconds call ${callLog.direction === 'Outbound' ? `to ${contactInfo.name}(${callLog.to.phoneNumber})` : `from ${contactInfo.name}(${callLog.from.phoneNumber})`}.<br>${descriptionNotes}<br>${callRecordingDetail}<br><em> Created via: <a href="https://www.pipedrive.com/en/marketplace/app/ring-central-crm-extension/5d4736e322561f57">RingCentral CRM Extension</a></span></em>`,
        start_date: moment(callLog.startTime).utc().toISOString(),
        end_date: moment(callLog.startTime).utc().add(callLog.duration, 'seconds').toISOString(),
        activity_code_id: 3,
        repeats: 'never',
        linked_contacts: [
            {
                contact_id: contactInfo.id
            }
        ]
    }
    const addLogRes = await axios.post(
        `${process.env.REDTAIL_API_SERVER}/activities`,
        postBody,
        {
            headers: { 'Authorization': overrideAuthHeader }
        });
    if (!!linkedNotes) {
        const addNoteRes = await axios.post(
            `${process.env.REDTAIL_API_SERVER}/activities/${addLogRes.data.activity.id}/notes`,
            {
                category_id: 2,
                note_type: 1,
                body: linkedNotes
            },
            {
                headers: { 'Authorization': overrideAuthHeader }
            });
    }
    const completeLogRes = await axios.put(
        `${process.env.REDTAIL_API_SERVER}/activities/${addLogRes.data.activity.id}`,
        {
            'completed': true
        },
        {
            headers: { 'Authorization': overrideAuthHeader }
        });
    return completeLogRes.data.activity.id;
}

async function updateCallLog({ user, existingCallLog, authHeader, recordingLink }) {
    const overrideAuthHeader = getAuthHeader({ userKey: user.platformAdditionalInfo.userResponse.user_key });
    const existingRedtailLogId = existingCallLog.thirdPartyLogId;
    const getLogRes = await axios.get(
        `${process.env.REDTAIL_API_SERVER}/activities/${existingRedtailLogId}`,
        {
            headers: { 'Authorization': overrideAuthHeader }
        });
    let logBody = getLogRes.data.activity.description;
    if (logBody.includes('<em> Created via:')) {
        logBody = logBody.replace('<em> Created via:', `Call recording link: <a target="_blank" href=${recordingLink}>open</a><br/><em> Created via:`);
    }
    else {
        logBody += `Call recording link: <a target="_blank" href=${recordingLink}>open</a>`;
    }

    const putBody = {
        description: logBody
    }
    const putLogRes = await axios.patch(
        `${process.env.REDTAIL_API_SERVER}/activities/${existingRedtailLogId}`,
        putBody,
        {
            headers: { 'Authorization': overrideAuthHeader }
        });
}

async function addMessageLog({ user, contactInfo, authHeader, message, additionalSubmission, recordingLink, timezoneOffset, contactNumber }) {
    const overrideAuthHeader = getAuthHeader({ userKey: user.platformAdditionalInfo.userResponse.user_key });
    const postBody = {
        subject: `${message.direction} SMS ${message.direction == 'Inbound' ? `from ${contactInfo.name}(${message.from.phoneNumber})` : `to ${contactInfo.name}(${message.to[0].phoneNumber})`}`,
        description: `${!!message.subject ? `[Message] ${message.subject}` : ''}<br><br><em> Created via: <a href="https://www.pipedrive.com/en/marketplace/app/ring-central-crm-extension/5d4736e322561f57">RingCentral CRM Extension</a></span></em>`,
        start_date: moment(message.creationTime).utc().toISOString(),
        end_date: moment(message.creationTime).utc().toISOString(),
        activity_code_id: 3,
        repeats: 'never',
        linked_contacts: [
            {
                contact_id: contactInfo.id
            }
        ]
    }
    const addLogRes = await axios.post(
        `${process.env.REDTAIL_API_SERVER}/activities`,
        postBody,
        {
            headers: { 'Authorization': overrideAuthHeader }
        });
    const completeLogRes = await axios.put(
        `${process.env.REDTAIL_API_SERVER}/activities/${addLogRes.data.activity.id}`,
        {
            'completed': true
        },
        {
            headers: { 'Authorization': overrideAuthHeader }
        });
    return completeLogRes.data.activity.id;
}

async function getContact({ user, authHeader, phoneNumber }) {
    const overrideAuthHeader = getAuthHeader({ userKey: user.platformAdditionalInfo.userResponse.user_key });
    phoneNumber = phoneNumber.replace(' ', '+')
    const phoneNumberObj = parsePhoneNumber(phoneNumber);
    let phoneNumberWithoutCountryCode = phoneNumber;
    if (phoneNumberObj.valid) {
        phoneNumberWithoutCountryCode = phoneNumberObj.number.significant;
    }
    const personInfo = await axios.get(
        `${process.env.REDTAIL_API_SERVER}/contacts/search_basic?phone_number=${phoneNumberWithoutCountryCode}`,
        {
            headers: { 'Authorization': overrideAuthHeader }
        });
    if (personInfo.data.contacts.length === 0) {
        return null;
    }
    const rawPersonInfo = personInfo.data.contacts[0];
    rawPersonInfo['phoneNumber'] = phoneNumber;
    return formatContact(rawPersonInfo);
}
function formatContact(rawContactInfo) {
    return {
        id: rawContactInfo.id,
        name: `${rawContactInfo.full_name}`,
        phone: rawContactInfo.phoneNumber,
        title: rawContactInfo.job_title ?? ""
    }
}



exports.getAuthType = getAuthType;
exports.getBasicAuth = getBasicAuth;
exports.getUserInfo = getUserInfo;
exports.saveApiKeyUserInfo = saveApiKeyUserInfo;
exports.addCallLog = addCallLog;
exports.updateCallLog = updateCallLog;
exports.addMessageLog = addMessageLog;
exports.getContact = getContact;
exports.unAuthorize = unAuthorize;