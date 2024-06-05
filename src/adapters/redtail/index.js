const axios = require('axios');
const moment = require('moment');
const { UserModel } = require('../../models/userModel');
const Op = require('sequelize').Op;
const { parsePhoneNumber } = require('awesome-phonenumber');

const crmName = 'redtail';

function getAuthType() {
    return 'apiKey';
}

function getBasicAuth({ apiKey }) {
    return Buffer.from(`${apiKey}`).toString('base64');
}

function getAuthHeader({ userKey }) {
    return Buffer.from(`${process.env.REDTAIL_API_KEY}:${userKey}`).toString('base64');
}

async function getUserInfo({ authHeader, additionalInfo }) {
    const overrideAPIKey = `${process.env.REDTAIL_API_KEY}:${additionalInfo.username}:${additionalInfo.password}`;
    const overrideAuthHeader = `Basic ${getBasicAuth({ apiKey: overrideAPIKey })}`;
    const authResponse = await axios.get(`${process.env.REDTAIL_API_SERVER}/authentication`, {
        headers: {
            'Authorization': overrideAuthHeader
        }
    });
    additionalInfo['userResponse'] = authResponse.data.authenticated_user;
    delete additionalInfo.password;
    const id = additionalInfo.username;
    const name = additionalInfo.username;
    const timezoneName = '';
    const timezoneOffset = null;
    return {
        id,
        name,
        timezoneName,
        timezoneOffset,
        overridingApiKey: additionalInfo.userResponse.user_key,
        platformAdditionalInfo: additionalInfo
    }
}

async function unAuthorize({ user }) {
    await user.destroy();
}

async function findContact({ user, phoneNumber }) {
    const matchedContacts = [];
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
    for (let rawPersonInfo of personInfo.data.contacts) {
        rawPersonInfo['phoneNumber'] = phoneNumber;
        matchedContacts.push(formatContact(rawPersonInfo));
    }
    matchedContacts.push({
        id: 'createNewContact',
        name: 'Create new contact...',
        additionalInfo: null,
        isNewContact: true
    });
    return matchedContacts;
}

async function createContact({ user, phoneNumber, newContactName }) {
    const overrideAuthHeader = getAuthHeader({ userKey: user.platformAdditionalInfo.userResponse.user_key });
    const phoneNumberObj = parsePhoneNumber(phoneNumber.replace(' ', '+'));
    const personInfo = await axios.post(
        `${process.env.REDTAIL_API_SERVER}/contacts`,
        {
            type: 'Crm::Contact::Individual',
            first_name: newContactName.split(' ').length > 1 ? newContactName.split(' ')[0] : '',
            last_name: newContactName.split(' ').length > 1 ? newContactName.split(' ')[1] : newContactName.split(' ')[0],
            phones: [
                {
                    phone_type: 6,
                    number: phoneNumberObj.number.significant,
                    country_code: phoneNumberObj.countryCode
                }
            ]
        },
        {
            headers: { 'Authorization': overrideAuthHeader }
        }
    );
    return {
        id: personInfo.data.contact.id,
        name: `${personInfo.data.contact.first_name} ${personInfo.data.contact.last_name}`
    }
}

async function createCallLog({ user, contactInfo, callLog, note }) {
    const overrideAuthHeader = getAuthHeader({ userKey: user.platformAdditionalInfo.userResponse.user_key });
    const linkedNotes = note ?? '';
    const descriptionNotes = note ? `\n\nAgent notes: ${note}` : '';
    const callRecordingDetail = callLog.recording ? `\nCall recording link: <a target="_blank" href=${callLog.recording.link}>open</a>` : "";
    const postBody = {
        subject: callLog.customSubject ?? `${callLog.direction} Call ${callLog.direction === 'Outbound' ? 'to' : 'from'} ${contactInfo.name}`,
        description: `This was a ${callLog.duration} seconds call ${callLog.direction === 'Outbound' ? `to ${contactInfo.name}(${callLog.to.phoneNumber})` : `from ${contactInfo.name}(${callLog.from.phoneNumber})`}.<br>${descriptionNotes}<br>${callRecordingDetail}<br><em> Created via: <a href="https://chrome.google.com/webstore/detail/ringcentral-crm-extension/kkhkjhafgdlihndcbnebljipgkandkhh?hl=en">RingCentral CRM Extension</a></span></em>`,
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

async function updateCallLog({ user, existingCallLog, authHeader, recordingLink, subject, note }) {
    const overrideAuthHeader = getAuthHeader({ userKey: user.platformAdditionalInfo.userResponse.user_key });
    const existingRedtailLogId = existingCallLog.thirdPartyLogId;
    const getLogRes = await axios.get(
        `${process.env.REDTAIL_API_SERVER}/activities/${existingRedtailLogId}`,
        {
            headers: { 'Authorization': overrideAuthHeader }
        });
    let logBody = getLogRes.data.activity.description;
    let logSubject = getLogRes.data.activity.subject;
    if (!!recordingLink) {
        if (logBody.includes('<em> Created via:')) {
            logBody = logBody.replace('<em> Created via:', `Call recording link: <a target="_blank" href=${recordingLink}>open</a><br/><em> Created via:`);
        }
        else {
            logBody += `Call recording link: <a target="_blank" href=${recordingLink}>open</a>`;
        }
    }
    else {
        let originalNote = '';
        if (logBody.includes('Call recording link:')) {
            originalNote = logBody.split('Agent notes: ')[1].split('<br><br>Call recording link:')[0];
        }
        else {
            originalNote = logBody.split('Agent notes: ')[1].split('<br><br><em> Created via:')[0];
        }

        logBody = logBody.replace(`Agent notes: ${originalNote}`, `Agent notes: ${note}`);
        logSubject = subject ?? '';
    }

    const putBody = {
        subject: logSubject,
        description: logBody
    }
    const putLogRes = await axios.patch(
        `${process.env.REDTAIL_API_SERVER}/activities/${existingRedtailLogId}`,
        putBody,
        {
            headers: { 'Authorization': overrideAuthHeader }
        });
    return putBody.description;
}

async function createMessageLog({ user, contactInfo, authHeader, message, additionalSubmission, recordingLink }) {
    const overrideAuthHeader = getAuthHeader({ userKey: user.platformAdditionalInfo.userResponse.user_key });
    const userName = user.id;
    const subject = !!recordingLink ? `Voicemail left by ${contactInfo.name} - ${moment(message.creationTime).format('YY/MM/DD')}` : `SMS conversation with ${contactInfo.name} - ${moment(message.creationTime).format('YY/MM/DD')}`;
    const description = !!recordingLink ?
        recordingLink :
        `<br><b>${subject}</b><br>` +
        '<b>Conversation summary</b><br>' +
        `${moment(message.creationTime).format('dddd, MMMM DD, YYYY')}<br>` +
        'Participants<br>' +
        `<ul><li><b>${userName}</b><br></li>` +
        `<li><b>${contactInfo.name}</b></li></ul><br>` +
        'Conversation(1 messages)<br>' +
        'BEGIN<br>' +
        '------------<br>' +
        '<ul>' +
        `<li>${message.direction === 'Inbound' ? `${contactInfo.name} (${contactInfo.phoneNumber})` : userName} ${moment(message.creationTime).format('hh:mm A')}<br>` +
        `<b>${message.subject}</b></li>` +
        '</ul>' +
        '------------<br>' +
        'END<br><br>' +
        '--- Created via RingCentral CRM Extension';
    const postBody = {
        subject,
        description,
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

async function updateMessageLog({ user, contactInfo, existingMessageLog, message, authHeader }) {
    const overrideAuthHeader = getAuthHeader({ userKey: user.platformAdditionalInfo.userResponse.user_key });
    const existingLogId = existingMessageLog.thirdPartyLogId;
    const userName = user.id;
    const getLogRes = await axios.get(
        `${process.env.REDTAIL_API_SERVER}/activities/${existingLogId}`,
        {
            headers: { 'Authorization': overrideAuthHeader, 'include': 'linked_contacts' }
        });
    let logBody = getLogRes.data.activity.description;
    let putBody = {};
    const newMessageLog =
        `<li>${message.direction === 'Inbound' ? `${contactInfo.name} (${contactInfo.phoneNumber})` : userName} ${moment(message.creationTime).format('hh:mm A')}<br>` +
        `<b>${message.subject}</b></li>`;
    logBody = logBody.replace('------------<br><ul>', `------------<br><ul>${newMessageLog}`);

    const regex = RegExp('<br>Conversation.(.*) messages.');
    const matchResult = regex.exec(logBody);
    logBody = logBody.replace(matchResult[0], `<br>Conversation(${parseInt(matchResult[1]) + 1} messages)`);

    putBody = {
        description: logBody,
        end_date: moment(message.creationTime).utc().toISOString()
    }
    const putLogRes = await axios.patch(
        `${process.env.REDTAIL_API_SERVER}/activities/${existingLogId}`,
        putBody,
        {
            headers: { 'Authorization': overrideAuthHeader }
        });
}

async function getCallLog({ user, callLogId, authHeader }) {
    const overrideAuthHeader = getAuthHeader({ userKey: user.platformAdditionalInfo.userResponse.user_key });
    const getLogRes = await axios.get(
        `${process.env.REDTAIL_API_SERVER}/activities/${callLogId}`,
        {
            headers: { 'Authorization': overrideAuthHeader, 'include': 'linked_contacts' }
        });
    const logBody = getLogRes.data.activity.description;
    const note = logBody.includes('Call recording link:') ?
        logBody?.split('Agent notes: ')[1]?.split('<br><br>Call recording link:')[0] :
        logBody?.split('Agent notes: ')[1]?.split('<br><br><em> Created via:')[0];
    return {
        subject: getLogRes.data.activity.subject,
        note,
        contactName: `${getLogRes.data.activity.linked_contacts[0].first_name} ${getLogRes.data.activity.linked_contacts[0].last_name}`,
    }
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
exports.createCallLog = createCallLog;
exports.updateCallLog = updateCallLog;
exports.createMessageLog = createMessageLog;
exports.updateMessageLog = updateMessageLog;
exports.getCallLog = getCallLog;
exports.findContact = findContact;
exports.createContact = createContact;
exports.unAuthorize = unAuthorize;