const axios = require('axios');
const moment = require('moment');
const url = require('url');
const { parsePhoneNumber } = require('awesome-phonenumber');
const { secondsToHoursMinutesSeconds } = require('../../lib/util');

function getAuthType() {
    return 'oauth';
}

async function getOauthInfo() {
    return {
        clientId: process.env.PIPEDRIVE_CLIENT_ID,
        clientSecret: process.env.PIPEDRIVE_CLIENT_SECRET,
        accessTokenUri: process.env.PIPEDRIVE_ACCESS_TOKEN_URI,
        redirectUri: process.env.PIPEDRIVE_REDIRECT_URI
    }
}

async function getUserInfo({ authHeader, hostname }) {
    try {
        const userInfoResponse = await axios.get('https://api.pipedrive.com/v1/users/me', {
            headers: {
                'Authorization': authHeader
            }
        });
        const id = userInfoResponse.data.data.id.toString();
        const name = userInfoResponse.data.data.name;
        const timezoneName = userInfoResponse.data.data.timezone_name;
        const timezoneOffset = userInfoResponse.data.data.timezone_offset;
        return {
            successful: true,
            platformUserInfo: {
                id,
                name,
                timezoneName,
                timezoneOffset,
                platformAdditionalInfo: {
                    companyId: userInfoResponse.data.data.company_id,
                    companyName: userInfoResponse.data.data.company_name,
                    companyDomain: userInfoResponse.data.data.company_domain,
                },
                overridingHostname: hostname == 'temp' ? `${userInfoResponse.data.data.company_domain}.pipedrive.com` : null
            },
            returnMessage: {
                messageType: 'success',
                message: 'Connected to Pipedrive.',
                ttl: 1000
            }
        };
    }
    catch (e) {
        return {
            successful: false,
            returnMessage: {
                messageType: 'warning',
                message: 'Could not load user information',
                details:[
                    {
                        title: 'Details',
                        items: [
                            {
                                id: '1',
                                type: 'text',
                                text: `Pipedrive was unable to fetch information for the currently logged in user. Please check your permissions in Pipedrive and make sure you have permission to access and read user information.`
                            }
                        ]
                    }
                ],
                ttl: 3000
            }
        }
    }
}

async function unAuthorize({ user }) {
    const revokeUrl = 'https://oauth.pipedrive.com/oauth/revoke';
    const basicAuthHeader = Buffer.from(`${process.env.PIPEDRIVE_CLIENT_ID}:${process.env.PIPEDRIVE_CLIENT_SECRET}`).toString('base64');
    const refreshTokenParams = new url.URLSearchParams({
        token: user.refreshToken
    });
    const refreshTokenRevokeRes = await axios.post(
        revokeUrl,
        refreshTokenParams,
        {
            headers: { 'Authorization': `Basic ${basicAuthHeader}` }
        });
    const accessTokenParams = new url.URLSearchParams({
        token: user.accessToken
    });
    const accessTokenRevokeRes = await axios.post(
        revokeUrl,
        accessTokenParams,
        {
            headers: { 'Authorization': `Basic ${basicAuthHeader}` }
        });
    await user.destroy();
    return {
        returnMessage: {
            messageType: 'success',
            message: 'Logged out of Pipedrive',
            ttl: 1000
        }
    }
}

async function findContact({ user, authHeader, phoneNumber, overridingFormat }) {
    phoneNumber = phoneNumber.replace(' ', '+')
    // without + is an extension, we don't want to search for that
    if (!phoneNumber.includes('+')) {
        return {
            matchedContactInfo: null,
            returnMessage: {
                message: 'Logging against internal extension number is not supported.',
                messageType: 'warning',
                ttl: 3000
            }
        };
    }
    const phoneNumberObj = parsePhoneNumber(phoneNumber);
    let phoneNumberWithoutCountryCode = phoneNumber;
    if (phoneNumberObj.valid) {
        phoneNumberWithoutCountryCode = phoneNumberObj.number.significant;
    }
    const personInfo = await axios.get(
        `https://${user.hostname}/v1/persons/search?term=${phoneNumberWithoutCountryCode}&fields=phone`,
        {
            headers: { 'Authorization': authHeader }
        });
    const matchedContactInfo = [];
    for (const person of personInfo.data.data.items) {
        const dealsResponse = await axios.get(
            `https://${user.hostname}/v1/persons/${person.item.id}/deals?status=open`,
            {
                headers: { 'Authorization': authHeader }
            });
        const relatedDeals = dealsResponse.data.data ?
            dealsResponse.data.data.map(d => { return { const: d.id, title: d.title } })
            : null;
        matchedContactInfo.push(formatContact(person.item, relatedDeals));
    }
    matchedContactInfo.push({
        id: 'createNewContact',
        name: 'Create new contact...',
        isNewContact: true
    });
    return { matchedContactInfo };
}

function formatContact(rawContactInfo, relatedDeals) {
    return {
        id: rawContactInfo.id,
        name: rawContactInfo.name,
        phone: rawContactInfo.phones[0],
        organization: rawContactInfo.organization?.name ?? '',
        additionalInfo: relatedDeals ? { deals: relatedDeals } : null

    }
}

async function createContact({ user, authHeader, phoneNumber, newContactName }) {
    const postBody = {
        name: newContactName,
        phone: phoneNumber
    }
    const createContactRes = await axios.post(
        `https://${user.hostname}/v1/persons`,
        postBody,
        {
            headers: { 'Authorization': authHeader }
        });
    return {
        contactInfo: {
            id: createContactRes.data.data.id,
            name: createContactRes.data.data.name
        },
        returnMessage: {
            message: `Contact created.`,
            messageType: 'success',
            ttl: 2000
        }
    }
}

async function createCallLog({ user, contactInfo, authHeader, callLog, note, additionalSubmission, aiNote, transcript }) {
    const dealId = additionalSubmission ? additionalSubmission.deals : '';
    const personResponse = await axios.get(`https://${user.hostname}/v1/persons/${contactInfo.id}`, { headers: { 'Authorization': authHeader } });
    const orgId = personResponse.data.data.org_id?.value ?? '';
    const timeUtc = moment(callLog.startTime).utcOffset(0).format('HH:mm')
    const dateUtc = moment(callLog.startTime).utcOffset(0).format('YYYY-MM-DD');
    let noteBody = '<b>Agent notes</b>';;
    if (user.userSettings?.addCallLogNote?.value ?? true) { noteBody = upsertCallAgentNote({ body: noteBody, note }); }
    noteBody += '<b>Call details</b><ul>';
    if (user.userSettings?.addCallLogContactNumber?.value ?? true) { noteBody = upsertContactPhoneNumber({ body: noteBody, phoneNumber: contactInfo.phoneNumber, direction: callLog.direction }); }
    if (user.userSettings?.addCallLogDateTime?.value ?? true) { noteBody = upsertCallDateTime({ body: noteBody, startTime: callLog.startTime, timezoneOffset: user.timezoneOffset }); }
    if (user.userSettings?.addCallLogDuration?.value ?? true) { noteBody = upsertCallDuration({ body: noteBody, duration: callLog.duration }); }
    if (user.userSettings?.addCallLogResult?.value ?? true) { noteBody = upsertCallResult({ body: noteBody, result: callLog.result }); }
    if (!!callLog.recording?.link && (user.userSettings?.addCallLogRecording?.value ?? true)) { noteBody = upsertCallRecording({ body: noteBody, recordingLink: callLog.recording.link }); }
    noteBody += '</ul>';
    if (!!aiNote && (user.userSettings?.addCallLogAiNote?.value ?? true)) { noteBody = upsertAiNote({ body: noteBody, aiNote }); }
    if (!!transcript && (user.userSettings?.addCallLogTranscript?.value ?? true)) { noteBody = upsertTranscript({ body: noteBody, transcript }); }
    const postBody = {
        user_id: user.id,
        subject: callLog.customSubject ?? `${callLog.direction} Call ${callLog.direction === 'Outbound' ? 'to' : 'from'} ${contactInfo.name}`,
        duration: callLog.duration,    // secs
        person_id: contactInfo.id,
        org_id: orgId,
        deal_id: dealId,
        note: noteBody,
        done: true,
        due_date: dateUtc,
        due_time: timeUtc
    }
    const addLogRes = await axios.post(
        `https://${user.hostname}/v1/activities`,
        postBody,
        {
            headers: { 'Authorization': authHeader }
        });
    return {
        logId: addLogRes.data.data.id,
        returnMessage: {
            message: 'Call logged',
            messageType: 'success',
            ttl: 2000
        }
    };
}

async function updateCallLog({ user, existingCallLog, authHeader, recordingLink, subject, note, startTime, duration, result, aiNote, transcript }) {
    const existingPipedriveLogId = existingCallLog.thirdPartyLogId;
    const getLogRes = await axios.get(
        `https://${user.hostname}/v1/activities/${existingPipedriveLogId}`,
        {
            headers: { 'Authorization': authHeader }
        });
    let putBody = {};
    let logBody = getLogRes.data.data.note;

    if (!!note && (user.userSettings?.addCallLogNote?.value ?? true)) { logBody = upsertCallAgentNote({ body: logBody, note }); }
    if (!!startTime && (user.userSettings?.addCallLogDateTime?.value ?? true)) { logBody = upsertCallDateTime({ body: logBody, startTime, timezoneOffset: user.timezoneOffset }); }
    if (!!duration && (user.userSettings?.addCallLogDuration?.value ?? true)) { logBody = upsertCallDuration({ body: logBody, duration }); }
    if (!!result && (user.userSettings?.addCallLogResult?.value ?? true)) { logBody = upsertCallResult({ body: logBody, result }); }
    if (!!recordingLink && (user.userSettings?.addCallLogRecording?.value ?? true)) { logBody = upsertCallRecording({ body: logBody, recordingLink }); }
    if (!!aiNote && (user.userSettings?.addCallLogAiNote?.value ?? true)) { logBody = upsertAiNote({ body: logBody, aiNote }); }
    if (!!transcript && (user.userSettings?.addCallLogTranscript?.value ?? true)) { logBody = upsertTranscript({ body: logBody, transcript }); }
    putBody.note = logBody;

    if (!!subject) {
        putBody.subject = subject;
    }

    const putLogRes = await axios.put(
        `https://${user.hostname}/v1/activities/${existingPipedriveLogId}`,
        putBody,
        {
            headers: { 'Authorization': authHeader }
        });
    return {
        updatedNote: putBody.note,
        returnMessage: {
            message: 'Call log updated.',
            messageType: 'success',
            ttl: 2000
        }
    };
}

async function createMessageLog({ user, contactInfo, authHeader, message, additionalSubmission, recordingLink, faxDocLink }) {
    const userInfoResponse = await axios.get(`https://${user.hostname}/v1/users/me`, {
        headers: {
            'Authorization': authHeader
        }
    });
    const userName = userInfoResponse.data.data.name;
    const dealId = additionalSubmission ? additionalSubmission.deals : '';
    const orgId = contactInfo.organization ? contactInfo.organization.id : '';
    const timeUtc = moment(message.creationTime).utcOffset(0).format('HH:mm')
    const dateUtc = moment(message.creationTime).utcOffset(0).format('YYYY-MM-DD');
    const activityTypesResponse = await axios.get(`https://${user.hostname}/v1/activityTypes`, { headers: { 'Authorization': authHeader } });
    const hasSMSType = activityTypesResponse.data.data.some(t => t.name === 'SMS' && t.active_flag);

    const messageType = !!recordingLink ? 'Voicemail' : (!!faxDocLink ? 'Fax' : 'SMS');
    let subject = '';
    let note = '';
    switch (messageType) {
        case 'SMS':
            subject = `SMS conversation with ${contactInfo.name} - ${moment(message.creationTime).utcOffset(user.timezoneOffset).format('YY/MM/DD')}`;
            note =
                `<br><b>${subject}</b><br>` +
                '<b>Conversation summary</b><br>' +
                `${moment(message.creationTime).utcOffset(user.timezoneOffset).format('dddd, MMMM DD, YYYY')}<br>` +
                'Participants<br>' +
                `<ul><li><b>${userName}</b><br></li>` +
                `<li><b>${contactInfo.name}</b></li></ul><br>` +
                'Conversation(1 messages)<br>' +
                'BEGIN<br>' +
                '------------<br>' +
                '<ul>' +
                `<li>${message.direction === 'Inbound' ? `${contactInfo.name} (${contactInfo.phoneNumber})` : userName} ${moment(message.creationTime).utcOffset(user.timezoneOffset).format('hh:mm A')}<br>` +
                `<b>${message.subject}</b></li>` +
                '</ul>' +
                '------------<br>' +
                'END<br><br>' +
                '--- Created via RingCentral App Connect';
            break;
        case 'Voicemail':
            subject = `Voicemail left by ${contactInfo.name} - ${moment(message.creationTime).utcOffset(user.timezoneOffset).format('YY/MM/DD')}`;
            note = `<br><b>${subject}</b><br>Voicemail recording link: ${recordingLink} <br><br>--- Created via RingCentral App Connect`;
            break;
        case 'Fax':
            subject = `Fax document sent from ${contactInfo.name} - ${moment(message.creationTime).utcOffset(user.timezoneOffset).format('YY/MM/DD')}`;
            note = `<br><b>${subject}</b><br>Fax document link: ${faxDocLink} <br><br>--- Created via RingCentral App Connect`;
            break;
    }
    const postBody = {
        user_id: user.id,
        subject,
        person_id: contactInfo.id,
        org_id: orgId,
        deal_id: dealId,
        note,
        done: true,
        due_date: dateUtc,
        due_time: timeUtc,
        type: hasSMSType ? 'SMS' : 'Call'
    }
    const addLogRes = await axios.post(
        `https://${user.hostname}/v1/activities`,
        postBody,
        {
            headers: { 'Authorization': authHeader }
        });
    return {
        logId: addLogRes.data.data.id,
        returnMessage: {
            message: 'Message logged',
            messageType: 'success',
            ttl: 1000
        }
    };
}

async function updateMessageLog({ user, contactInfo, existingMessageLog, message, authHeader }) {
    const existingLogId = existingMessageLog.thirdPartyLogId;
    const userInfoResponse = await axios.get('https://api.pipedrive.com/v1/users/me', {
        headers: {
            'Authorization': authHeader
        }
    });
    const userName = userInfoResponse.data.data.name;
    const getLogRes = await axios.get(
        `https://${user.hostname}/v1/activities/${existingLogId}`,
        {
            headers: { 'Authorization': authHeader }
        });
    let logBody = getLogRes.data.data.note;
    let putBody = {};
    const newMessageLog =
        `<li>${message.direction === 'Inbound' ? `${contactInfo.name} (${contactInfo.phoneNumber})` : userName} ${moment(message.creationTime).utcOffset(user.timezoneOffset).format('hh:mm A')}<br>` +
        `<b>${message.subject}</b></li>`;
    logBody = logBody.replace('------------<br><ul>', `------------<br><ul>${newMessageLog}`);

    const regex = RegExp('<br>Conversation.(.*) messages.');
    const matchResult = regex.exec(logBody);
    logBody = logBody.replace(matchResult[0], `<br>Conversation(${parseInt(matchResult[1]) + 1} messages)`);

    putBody = {
        note: logBody
    }
    const putLogRes = await axios.put(
        `https://${user.hostname}/v1/activities/${existingLogId}`,
        putBody,
        {
            headers: { 'Authorization': authHeader }
        });
}


async function getCallLog({ user, callLogId, authHeader }) {
    const getLogRes = await axios.get(
        `https://${user.hostname}/v1/activities/${callLogId}`,
        {
            headers: { 'Authorization': authHeader }
        });
    const logBody = getLogRes.data.data.note;
    const note = logBody.split('<b>Agent notes</b>')[1]?.split('<b>Call details</b>')[0]?.replaceAll('<br>', '') ?? '';
    const relatedContact = getLogRes.data.related_objects?.person;
    let contactName = 'Unknown';
    if (!!relatedContact) {
        const contactKeys = Object.keys(relatedContact);
        contactName = relatedContact[contactKeys[0]].name;
    }
    return {
        callLogInfo: {
            subject: getLogRes.data.data.subject,
            note,
            contactName
        }
    }
}

function upsertCallAgentNote({ body, note }) {
    if (!!!note) {
        return body;
    }
    const noteRegex = RegExp('<b>Agent notes</b>([\\s\\S]+?)Call details</b>');
    if (noteRegex.test(body)) {
        body = body.replace(noteRegex, `<b>Agent notes</b><br>${note}<br><br><b>Call details</b>`);
    }
    else {
        body += `<br>${note}<br><br>`;
    }
    return body;
}

function upsertContactPhoneNumber({ body, phoneNumber, direction }) {
    const phoneNumberRegex = RegExp(`<li><b>${direction === 'Outbound' ? 'Recipient' : 'Caller'} phone number</b>: (.+?)(?:<li>|</ul>)`);
    if (phoneNumberRegex.test(body)) {
        body = body.replace(phoneNumberRegex, (match, p1) => `<li><b>${direction === 'Outbound' ? 'Recipient' : 'Caller'} phone number</b>: ${phoneNumber}${p1.endsWith('</ul>') ? '</ul>' : '<li>'}`);
    } else {
        body += `<li><b>${direction === 'Outbound' ? 'Recipient' : 'Caller'} phone number</b>: ${phoneNumber}<li>`;
    }
    return body;
}

function upsertCallDateTime({ body, startTime, timezoneOffset }) {
    const dateTimeRegex = RegExp('<li><b>Date/time</b>: (.+?)(?:<li>|</ul>)');
    if (dateTimeRegex.test(body)) {
        const updatedDateTime = moment(startTime).utcOffset(timezoneOffset).format('YYYY-MM-DD hh:mm:ss A');
        body = body.replace(dateTimeRegex, (match, p1) => `<li><b>Date/time</b>: ${updatedDateTime}${p1.endsWith('</ul>') ? '</ul>' : '<li>'}`);
    } else {
        body += `<li><b>Date/time</b>: ${moment(startTime).utcOffset(timezoneOffset).format('YYYY-MM-DD hh:mm:ss A')}<li>`;
    }
    return body;
}

function upsertCallDuration({ body, duration }) {
    const durationRegex = RegExp('<li><b>Duration</b>: (.+?)(?:<li>|</ul>)');
    if (durationRegex.test(body)) {
        body = body.replace(durationRegex, (match, p1) => `<li><b>Duration</b>: ${secondsToHoursMinutesSeconds(duration)}${p1.endsWith('</ul>') ? '</ul>' : '<li>'}`);
    } else {
        body += `<li><b>Duration</b>: ${secondsToHoursMinutesSeconds(duration)}<li>`;
    }
    return body;
}

function upsertCallResult({ body, result }) {
    const resultRegex = RegExp('<li><b>Result</b>: (.+?)(?:<li>|</ul>)');
    if (resultRegex.test(body)) {
        body = body.replace(resultRegex, (match, p1) => `<li><b>Result</b>: ${result}${p1.endsWith('</ul>') ? '</ul>' : '<li>'}`);
    } else {
        body += `<li><b>Result</b>: ${result}<li>`;
    }
    return body;
}

function upsertCallRecording({ body, recordingLink }) {
    const recordingLinkRegex = RegExp('<li><b>Call recording link</b>: (.+?)(?:<li>|</ul>)');
    if (!!recordingLink) {
        if (recordingLinkRegex.test(body)) {
            body = body.replace(recordingLinkRegex, (match, p1) => `<li><b>Call recording link</b>: <a target="_blank" href=${recordingLink}>open</a>${p1.endsWith('</ul>') ? '</ul>' : '<li>'}`);
        }
        else {
            let text = '';
            // a real link
            if (recordingLink.startsWith('http')) {
                text = `<li><b>Call recording link</b>: <a target="_blank" href=${recordingLink}>open</a><li>`;
            } else {
                // placeholder
                text = '<li><b>Call recording link</b>: (pending...)<li>';
            }
            if (body.indexOf('</ul>') === -1) {
                body += text;
            } else {
                body = body.replace('</ul>', `${text}</ul>`);
            }
        }
    }
    return body;
}

function upsertAiNote({ body, aiNote }) {
    if (!!!aiNote) {
        return body;
    }
    const formattedAiNote = aiNote.replace(/\n+$/, '').replace(/(?:\r\n|\r|\n)/g, '<br>');
    const aiNoteRegex = RegExp('<div><b>AI note</b><br>(.+?)</div>');
    if (aiNoteRegex.test(body)) {
        body = body.replace(aiNoteRegex, `<div><b>AI note</b><br>${formattedAiNote}</div>`);
    }
    else {
        body += `<div><b>AI note</b><br>${formattedAiNote}</div><br>`;
    }
    return body;
}

function upsertTranscript({ body, transcript }) {
    if (!!!transcript) {
        return body;
    }
    const formattedTranscript = transcript.replace(/(?:\r\n|\r|\n)/g, '<br>');
    const transcriptRegex = RegExp('<div><b>Transcript</b><br>(.+?)</div>');
    if (transcriptRegex.test(body)) {
        body = body.replace(transcriptRegex, `<div><b>Transcript</b><br>${formattedTranscript}</div>`);
    }
    else {
        body += `<div><b>Transcript</b><br>${formattedTranscript}</div><br>`;
    }
    return body;
}

exports.getAuthType = getAuthType;
exports.getOauthInfo = getOauthInfo;
exports.getUserInfo = getUserInfo;
exports.createCallLog = createCallLog;
exports.updateCallLog = updateCallLog;
exports.createMessageLog = createMessageLog;
exports.updateMessageLog = updateMessageLog;
exports.getCallLog = getCallLog;
exports.findContact = findContact;
exports.createContact = createContact;
exports.unAuthorize = unAuthorize;