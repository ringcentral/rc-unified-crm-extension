const axios = require('axios');
const { UserModel } = require('../models/userModel');
const Op = require('sequelize').Op;
const moment = require('moment');
const url = require('url');
const { parsePhoneNumber } = require('awesome-phonenumber');

const crmName = 'clio';

function getAuthType() {
    return 'oauth';
}

function getOauthInfo() {
    return {
        clientId: process.env.CLIO_CLIENT_ID,
        clientSecret: process.env.CLIO_CLIENT_SECRET,
        accessTokenUri: process.env.CLIO_ACCESS_TOKEN_URI,
        redirectUri: process.env.CLIO_REDIRECT_URI
    }
}

async function saveUserInfo({ authHeader, hostname, accessToken, refreshToken, tokenExpiry, rcUserNumber, additionalInfo }) {
    const userInfoResponse = await axios.get('https://app.clio.com/api/v4/users/who_am_i.json?fields=id,name,time_zone', {
        headers: {
            'Authorization': authHeader
        }
    });
    const id = userInfoResponse.data.data.id.toString();
    const name = userInfoResponse.data.data.name;
    const timezoneName = userInfoResponse.data.data.time_zone;
    const timezoneOffset = 0;  //TODO: find timezone offset from timezone name/code
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
                accessToken,
                refreshToken,
                tokenExpiry,
                rcUserNumber,
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
            accessToken,
            refreshToken,
            tokenExpiry,
            rcUserNumber,
            platformAdditionalInfo: additionalInfo
        });
    }
    return {
        id,
        name
    };
}
async function unAuthorize({ user }) {
    const revokeUrl = 'https://app.clio.com/oauth/deauthorize';
    const accessTokenParams = new url.URLSearchParams({
        token: user.accessToken
    });
    const accessTokenRevokeRes = await axios.post(
        revokeUrl,
        accessTokenParams,
        {
            headers: { 'Authorization': `Bearer ${user.accessToken}` }
        });
    await user.destroy();
}

async function getContact({ user, authHeader, phoneNumber, overridingFormat }) {
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
            `https://${user.hostname}/api/v4/contacts.json?type=Person&query=${numberToQuery}&fields=id,name,title,company`,
            {
                headers: { 'Authorization': authHeader }
            });
        if (personInfo.data.data.length > 0) {
            for (var result of personInfo.data.data) {
                const matterInfo = await axios.get(
                    `https://${user.hostname}/api/v4/matters.json?client_id=${result.id}`,
                    {
                        headers: { 'Authorization': authHeader }
                    });
                const matters = matterInfo.data.data.length > 0 ? matterInfo.data.data.map(m => { return { id: m.id, name: m.display_number } }) : null;
                const associatedMatterInfo = await axios.get(
                    `https://${user.hostname}/api/v4/relationships.json?contact_id=${result.id}&fields=matter`,
                    {
                        headers: { 'Authorization': authHeader }
                    });
                const associatedMatters = associatedMatterInfo.data.data.length > 0 ? associatedMatterInfo.data.data.map(m => { return { id: m.matter.id, name: m.matter.display_number } }) : null;
                let returnedMatters = [];
                returnedMatters = returnedMatters.concat(matters ?? []);
                returnedMatters = returnedMatters.concat(associatedMatters ?? []);
                foundContacts.push({
                    id: result.id,
                    name: result.name,
                    title: result.title ?? "",
                    company: result.company?.name ?? "",
                    phone: numberToQuery,
                    additionalInfo: returnedMatters.length > 0 ? { matters: returnedMatters } : null
                })
            }
        }
    }
    return foundContacts;
}

async function createContact({ user, authHeader, phoneNumber, newContactName }) {
    const personInfo = await axios.post(
        `https://${user.hostname}/api/v4/contacts.json`,
        {
            data: {
                name: newContactName,
                type: 'Person',
                phone_numbers: [
                    {
                        name: "Work",
                        number: phoneNumber,
                        default_number: true
                    }
                ],
            }
        },
        {
            headers: { 'Authorization': authHeader }
        }
    );

    return {
        id: personInfo.data.data.id,
        name: personInfo.data.data.name
    }
}

async function addCallLog({ user, contactInfo, authHeader, callLog, note, additionalSubmission, timezoneOffset, contactNumber }) {
    const sender = callLog.direction === 'Outbound' ?
        {
            id: user.id,
            type: 'User'
        } :
        {
            id: contactInfo.overridingContactId ?? contactInfo.id,
            type: 'Contact'
        }
    const receiver = callLog.direction === 'Outbound' ?
        {
            id: contactInfo.overridingContactId ?? contactInfo.id,
            type: 'Contact'
        } :
        {
            id: user.id,
            type: 'User'
        }
    const postBody = {
        data: {
            subject: callLog.customSubject ?? `[Call] ${callLog.direction} Call ${callLog.direction === 'Outbound' ? 'to' : 'from'} ${contactInfo.name} [${contactInfo.phone}]`,
            body: `\nContact Number: ${contactNumber}\nCall Result: ${callLog.result}\nNote: ${note}${callLog.recording ? `\n[Call recording link] ${callLog.recording.link}` : ''}\n\n--- Created via RingCentral CRM Extension`,
            type: 'PhoneCommunication',
            received_at: moment(callLog.startTime).toISOString(),
            senders: [sender],
            receivers: [receiver],
            notification_event_subscribers: [
                {
                    user_id: user.id
                }
            ]
        }
    }
    if (additionalSubmission && additionalSubmission.matterId) {
        postBody.data['matter'] = { id: additionalSubmission.matterId };
    }
    const addLogRes = await axios.post(
        `https://${user.hostname}/api/v4/communications.json`,
        postBody,
        {
            headers: { 'Authorization': authHeader }
        });
    const communicationId = addLogRes.data.data.id;
    if (additionalSubmission?.logTimeEntry === undefined || additionalSubmission.logTimeEntry) {
        const addTimerBody = {
            data: {
                communication: {
                    id: communicationId
                },
                quantity: callLog.duration,
                date: moment(callLog.startTime).toISOString(),
                type: 'TimeEntry'
            }
        }
        const addTimerRes = await axios.post(
            `https://${user.hostname}/api/v4/activities.json`,
            addTimerBody,
            {
                headers: { 'Authorization': authHeader }
            });
    }
    return communicationId;
}

async function updateCallLog({ user, existingCallLog, authHeader, recordingLink, subject, note }) {
    const existingClioLogId = existingCallLog.thirdPartyLogId.split('.')[0];
    const getLogRes = await axios.get(
        `https://${user.hostname}/api/v4/communications/${existingClioLogId}.json?fields=body`,
        {
            headers: { 'Authorization': authHeader }
        });
    let logBody = getLogRes.data.data.body;
    let patchBody = {};
    if (!!recordingLink) {
        const urlDecodedRecordingLink = decodeURIComponent(recordingLink);
        if (logBody.includes('\n\n--- Created via RingCentral CRM Extension')) {
            logBody = logBody.replace('\n\n--- Created via RingCentral CRM Extension', `\n[Call recording link]${urlDecodedRecordingLink}\n\n--- Created via RingCentral CRM Extension`);
        }
        else {
            logBody += `\n[Call recording link]${urlDecodedRecordingLink}`;
        }

        patchBody = {
            data: {
                body: logBody
            }
        }
    }
    else {
        let originalNote = '';
        if (logBody.includes('\n[Call recording link]')) {
            originalNote = logBody.split('\n[Call recording link]')[0].split('Note: ')[1];
        }
        else {
            originalNote = logBody.split('\n\n--- Created via RingCentral CRM Extension')[0].split('Note: ')[1];
        }

        logBody = logBody.replace(`Note: ${originalNote}`, `Note: ${note}`);

        patchBody = {
            data: {
                subject: subject,
                body: logBody
            }
        }
    }
    const patchLogRes = await axios.patch(
        `https://${user.hostname}/api/v4/communications/${existingClioLogId}.json`,
        patchBody,
        {
            headers: { 'Authorization': authHeader }
        });
}

async function addMessageLog({ user, contactInfo, authHeader, message, additionalSubmission, recordingLink, timezoneOffset, contactNumber }) {
    const sender = message.direction == 'Outbound' ?
        {
            id: user.id,
            type: 'User'
        } :
        {
            id: contactInfo.overridingContactId ?? contactInfo.id,
            type: 'Contact'
        }
    const receiver = message.direction == 'Outbound' ?
        {
            id: contactInfo.overridingContactId ?? contactInfo.id,
            type: 'Contact'
        } :
        {
            id: user.id,
            type: 'User'
        }
    const postBody = {
        data: {
            subject: `[SMS] ${message.direction} SMS - ${message.from.name ?? ''}(${message.from.phoneNumber}) to ${message.to[0].name ?? ''}(${message.to[0].phoneNumber})`,
            body: `${message.direction} SMS - ${message.direction == 'Inbound' ? `from ${message.from.name ?? ''}(${message.from.phoneNumber})` : `to ${message.to[0].name ?? ''}(${message.to[0].phoneNumber})`} \n${!!message.subject ? `[Message] ${message.subject}` : ''} ${!!recordingLink ? `\n[Recording link] ${recordingLink}` : ''}\n\n--- Created via RingCentral CRM Extension`,
            type: 'PhoneCommunication',
            received_at: moment(message.creationTime).toISOString(),
            senders: [sender],
            receivers: [receiver],
            notification_event_subscribers: [
                {
                    user_id: user.id
                }
            ]
        }
    }
    if (additionalSubmission && additionalSubmission.matterId) {
        postBody.data['matter'] = { id: additionalSubmission.matterId };
    }
    const addLogRes = await axios.post(
        `https://${user.hostname}/api/v4/communications.json`,
        postBody,
        {
            headers: { 'Authorization': authHeader }
        });
    return addLogRes.data.data.id;
}

async function getCallLog({ user, callLogId, authHeader }) {
    const formattedLogId = callLogId.split('.')[0];
    const getLogRes = await axios.get(
        `https://${user.hostname}/api/v4/communications/${formattedLogId}.json?fields=subject,body,matter,senders,receivers`,
        {
            headers: { 'Authorization': authHeader }
        });
    const note = getLogRes.data.data.body.includes('[Call recording link]') ?
        getLogRes.data.data.body.split('Note: ')[1].split('\n[Call recording link]')[0] :
        getLogRes.data.data.body.split('Note: ')[1].split('\n\n--- Created via RingCentral CRM Extension')[0];
    const contactId = getLogRes.data.data.senders[0].type == 'Person' ?
        getLogRes.data.data.senders[0].id :
        getLogRes.data.data.receivers[0].id;
    const contactRes = await axios.get(
        `https://${user.hostname}/api/v4/contacts/${contactId}.json?fields=name`,
        {
            headers: { 'Authorization': authHeader }
        });
    return {
        subject: getLogRes.data.data.subject,
        note,
        contactName: contactRes.data.data.name
    }
}

exports.getAuthType = getAuthType;
exports.getOauthInfo = getOauthInfo;
exports.saveUserInfo = saveUserInfo;
exports.addCallLog = addCallLog;
exports.updateCallLog = updateCallLog;
exports.getCallLog = getCallLog;
exports.addMessageLog = addMessageLog;
exports.getContact = getContact;
exports.createContact = createContact;
exports.unAuthorize = unAuthorize;