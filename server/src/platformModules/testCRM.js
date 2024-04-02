const axios = require('axios');
const { UserModel } = require('../models/userModel');
const Op = require('sequelize').Op;
const moment = require('moment');
const { parsePhoneNumber } = require('awesome-phonenumber');

const crmName = 'testCRM';

let tempContact = null;
let tempCallLog = null;

function getAuthType() {
    return 'apiKey'; // Return either 'oauth' OR 'apiKey'
}

// For OAuth
function getOauthInfo() {
    return {
        clientId: process.env.TEST_CLIENT_ID,
        clientSecret: process.env.TEST_CLIENT_SECRET,
        accessTokenUri: process.env.TEST_ACCESS_TOKEN_URI,
        redirectUri: process.env.TEST_REDIRECT_URI
    }
}

// For API Key
function getBasicAuth({ apiKey }) {
    return Buffer.from(`${apiKey}:`).toString('base64');
}

// For params, if OAuth, then accessToken, refreshToken, tokenExpiry; If apiKey, then apiKey
async function saveUserInfo({ authHeader, hostname, apiKey, accessToken, refreshToken, tokenExpiry, additionalInfo }) {
    // API call to get logged in user info
    // const userInfoResponse = await axios.get('https://api.crm.com/user/me', {
    //     headers: {
    //         'Authorization': authHeader
    //     }
    // });

    const mockUserInfoResponse = {
        data: {
            id: 'testUserId',
            name: 'Test User',
            time_zone: 'America/Los_Angeles',
            time_zone_offset: 0
        }
    }

    const id = mockUserInfoResponse.data.id;
    const name = mockUserInfoResponse.data.name;
    const timezoneName = mockUserInfoResponse.data.time_zone ?? ''; // Optional. Whether or not you want to log with regards to the user's timezone
    const timezoneOffset = mockUserInfoResponse.data.time_zone_offset ?? null; // Optional. Whether or not you want to log with regards to the user's timezone

    // Save user info in DB
    const existingUser = await UserModel.findOne({
        where: {
            [Op.and]: [
                {
                    id,
                    platform: crmName
                }
            ]
        }
    });
    if (existingUser) {
        await existingUser.update(
            {
                hostname,
                timezoneName,
                timezoneOffset,
                accessToken: apiKey,
                // refreshToken,
                // tokenExpiry,
                platformAdditionalInfo: additionalInfo
            }
        );
    }
    else {
        await UserModel.create({
            id,
            hostname,
            timezoneName,
            timezoneOffset,
            platform: crmName,
            accessToken: apiKey,
            // refreshToken,
            // tokenExpiry,
            platformAdditionalInfo: additionalInfo
        });
    }
    return {
        id,
        name
    };
}

async function unAuthorize({ user }) {
    // const revokeUrl = 'https://api.crm.com/oauth/unauthorize';
    // const revokeBody = {
    //     token: user.accessToken
    // }
    // Some platform may require revoking tokens
    // const accessTokenRevokeRes = await axios.post(
    //     revokeUrl,
    //     revokeBody,
    //     {
    //         headers: { 'Authorization': `Bearer ${user.accessToken}` }
    //     });
    await user.destroy();
}

async function getContact({ user, authHeader, phoneNumber, overridingFormat }) {
    return tempContact != null ? [tempContact] : [];
    // Format E.164 numbers to the format that the CRM uses
    const numberToQueryArray = [];
    if (overridingFormat === '') {
        numberToQueryArray.push(phoneNumber.replace(' ', '+'));
    }
    else {
        const formats = overridingFormat.split(',');
        for (var format of formats) {
            const phoneNumberObj = parsePhoneNumber(phoneNumber.replace(' ', '+'));
            if (phoneNumberObj.valid) {
                const phoneNumberWithoutCountryCode = phoneNumberObj.number.significant;
                let formattedNumber = format;
                for (const numberBit of phoneNumberWithoutCountryCode) {
                    formattedNumber = formattedNumber.replace('*', numberBit);
                }
                numberToQueryArray.push(formattedNumber);
            }
        }
    }
    const foundContacts = [];
    for (var numberToQuery of numberToQueryArray) {
        const personInfo = await axios.get(
            `https://api.crm.com/contacts?query=number:${numberToQuery}`,
            {
                headers: { 'Authorization': authHeader }
            });
        if (personInfo.data.length > 0) {
            for (var result of personInfo.data) {
                foundContacts.push({
                    id: result.id,
                    name: result.name,
                    phone: numberToQuery,
                    additionalInfo: null
                })
            }
        }
    }
    return foundContacts;
}

async function createContact({ user, authHeader, phoneNumber, newContactName, newContactType }) {
    const postBody = {
        name: newContactName,
        type: newContactType,
        phone_numbers: [
            {
                name: "Work",
                number: phoneNumber,
                default_number: true
            }
        ]
    }
    // const personInfo = await axios.post(
    //     `https://api.crm.com/contacts`,
    //     postBody,
    //     {
    //         headers: { 'Authorization': authHeader }
    //     }
    // );
    tempContact = {
        id: 'testContactId',
        name: newContactName,
        type: newContactType,
        phone: phoneNumber,
        additionalInfo: {
            testSelection: [
                {
                    const: '1',
                    title: 'Selection 1'
                },
                {
                    const: '2',
                    title: 'Selection 2'
                },
                {
                    const: '3',
                    title: 'Selection 3'
                }
            ]
        }
    }

    return {
        id: tempContact.id,
        name: tempContact.newContactName
    }
}

async function addCallLog({ user, contactInfo, authHeader, callLog, note, additionalSubmission, timezoneOffset, contactNumber }) {
    // const postBody = {
    //     subject: callLog.customSubject ?? `[Call] ${callLog.direction} Call ${callLog.direction === 'Outbound' ? 'to' : 'from'} ${contactInfo.name} [${contactInfo.phone}]`,
    //     body: `\nContact Number: ${contactNumber}\nCall Result: ${callLog.result}\nNote: ${note}${callLog.recording ? `\n[Call recording link] ${callLog.recording.link}` : ''}\n\n--- Created via RingCentral CRM Extension`,
    //     type: 'PhoneCommunication',
    //     received_at: moment(callLog.startTime).toISOString()
    // }
    // const addLogRes = await axios.post(
    //     `https://api.crm.com/activity`,
    //     postBody,
    //     {
    //         headers: { 'Authorization': authHeader }
    //     });
    tempCallLog = {
        id: 'testCallLogId',
        subject: callLog.customSubject,
        note,
        contactName: contactInfo.name
    }
    return tempCallLog.id;
}

async function getCallLog({ user, callLogId, authHeader }) {
    return tempCallLog;
    const getLogRes = await axios.get(
        `https://api.crm.com/activity/${callLogId}`,
        {
            headers: { 'Authorization': authHeader }
        });
    const note = getLogRes.data.body.includes('[Call recording link]') ?
        getLogRes.data.body.split('Note: ')[1].split('\n[Call recording link]')[0] :
        getLogRes.data.body.split('Note: ')[1].split('\n\n--- Created via RingCentral CRM Extension')[0];
    return {
        subject: getLogRes.data.subject,
        note,
        additionalSubmission: {}
    }
}

async function updateCallLog({ user, existingCallLog, authHeader, recordingLink, subject, note }) {
    // const existingLogId = existingCallLog.thirdPartyLogId.split('.')[0];
    // const getLogRes = await axios.get(
    //     `https://api.crm.com/activity/${existingLogId}`,
    //     {
    //         headers: { 'Authorization': authHeader }
    //     });
    // let logBody = getLogRes.data.body;
    // let patchBody = {};
    // // Case: update call recording link
    // if (!!recordingLink) {
    //     const urlDecodedRecordingLink = decodeURIComponent(recordingLink);
    //     if (logBody.includes('\n\n--- Created via RingCentral CRM Extension')) {
    //         logBody = logBody.replace('\n\n--- Created via RingCentral CRM Extension', `\n[Call recording link]${urlDecodedRecordingLink}\n\n--- Created via RingCentral CRM Extension`);
    //     }
    //     else {
    //         logBody += `\n[Call recording link]${urlDecodedRecordingLink}`;
    //     }

    //     patchBody = {
    //         data: {
    //             body: logBody
    //         }
    //     }
    // }
    // // Case: update subject or notes
    // else {
    //     let originalNote = '';
    //     if (logBody.includes('\n[Call recording link]')) {
    //         originalNote = logBody.split('\n[Call recording link]')[0].split('Note: ')[1];
    //     }
    //     else {
    //         originalNote = logBody.split('\n\n--- Created via RingCentral CRM Extension')[0].split('Note: ')[1];
    //     }

    //     logBody = logBody.replace(`Note: ${originalNote}`, `Note: ${note}`);

    //     patchBody = {
    //         data: {
    //             subject: subject,
    //             body: logBody
    //         }
    //     }
    // }
    // const patchLogRes = await axios.patch(
    //     `https://api.crm.com/activity/${existingLogId}`,
    //     patchBody,
    //     {
    //         headers: { 'Authorization': authHeader }
    //     });
    tempCallLog.subject = subject;
    tempCallLog.note = note;
    return tempCallLog.id;
}

async function addMessageLog({ user, contactInfo, authHeader, message, additionalSubmission, recordingLink, timezoneOffset, contactNumber }) {
    const postBody = {
        data: {
            subject: `[SMS] ${message.direction} SMS - ${message.from.name ?? ''}(${message.from.phoneNumber}) to ${message.to[0].name ?? ''}(${message.to[0].phoneNumber})`,
            body: `${message.direction} SMS - ${message.direction == 'Inbound' ? `from ${message.from.name ?? ''}(${message.from.phoneNumber})` : `to ${message.to[0].name ?? ''}(${message.to[0].phoneNumber})`} \n${!!message.subject ? `[Message] ${message.subject}` : ''} ${!!recordingLink ? `\n[Recording link] ${recordingLink}` : ''}\n\n--- Created via RingCentral CRM Extension`,
            type: 'SMSCommunication',
            received_at: moment(message.creationTime).toISOString(),
        }
    }
    const addLogRes = await axios.post(
        `https://api.crm.com/activity`,
        postBody,
        {
            headers: { 'Authorization': authHeader }
        });
    return addLogRes.data.id;
}

exports.getAuthType = getAuthType;
exports.getOauthInfo = getOauthInfo;
exports.getBasicAuth = getBasicAuth;
exports.saveUserInfo = saveUserInfo;
exports.addCallLog = addCallLog;
exports.updateCallLog = updateCallLog;
exports.getCallLog = getCallLog;
exports.addMessageLog = addMessageLog;
exports.getContact = getContact;
exports.createContact = createContact;
exports.unAuthorize = unAuthorize;