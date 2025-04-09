/* eslint-disable no-control-regex */
/* eslint-disable no-param-reassign */
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
        clientId: process.env.CLIO_CLIENT_ID,
        clientSecret: process.env.CLIO_CLIENT_SECRET,
        accessTokenUri: process.env.CLIO_ACCESS_TOKEN_URI,
        redirectUri: process.env.CLIO_REDIRECT_URI
    }
}

async function getUserInfo({ authHeader }) {
    try {
        const userInfoResponse = await axios.get('https://app.clio.com/api/v4/users/who_am_i.json?fields=id,name,time_zone', {
            headers: {
                'Authorization': authHeader
            }
        });
        const id = userInfoResponse.data.data.id.toString();
        const name = userInfoResponse.data.data.name;
        const timezoneName = userInfoResponse.data.data.time_zone;
        const timezoneOffset = 0;
        return {
            successful: true,
            platformUserInfo: {
                id,
                name,
                timezoneName,
                timezoneOffset,
                platformAdditionalInfo: {}
            },
            returnMessage: {
                messageType: 'success',
                message: 'Connected to Clio.',
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
                details: [
                    {
                        title: 'Details',
                        items: [
                            {
                                id: '1',
                                type: 'text',
                                text: `Clio was unable to fetch information for the currently logged in user. Please check your permissions in Clio and make sure you have permission to access and read user information.`
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
    // remove user credentials
    user.accessToken = '';
    user.refreshToken = '';
    await user.save();
    return {
        returnMessage: {
            messageType: 'success',
            message: 'Logged out of Clio',
            ttl: 1000
        }
    }
}

async function findContact({ user, authHeader, phoneNumber, overridingFormat }) {
    const numberToQueryArray = [];
    let extraDataTracking = {};
    numberToQueryArray.push(phoneNumber.replace(' ', '+'));
    if (overridingFormat !== '') {
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
    const matchedContactInfo = [];
    for (var numberToQuery of numberToQueryArray) {
        const personInfo = await axios.get(
            `https://${user.hostname}/api/v4/contacts.json?type=Person&query=${numberToQuery}&fields=id,name,title,company`,
            {
                headers: { 'Authorization': authHeader }
            });
        extraDataTracking = {
            ratelimitRemaining: personInfo.headers['x-ratelimit-remaining'],
            ratelimitAmount: personInfo.headers['x-ratelimit-limit'],
            ratelimitReset: personInfo.headers['x-ratelimit-reset']
        };
        if (personInfo.data.data.length > 0) {
            for (var result of personInfo.data.data) {
                const matterInfo = await axios.get(
                    `https://${user.hostname}/api/v4/matters.json?client_id=${result.id}&fields=id,display_number,description,status`,
                    {
                        headers: { 'Authorization': authHeader }
                    });
                let matters = matterInfo.data.data.length > 0 ? matterInfo.data.data.map(m => { return { const: m.id, title: m.display_number, description: m.description, status: m.status } }) : null;
                matters = matters?.filter(m => m.status !== 'Closed');
                let associatedMatterInfo = await axios.get(
                    `https://${user.hostname}/api/v4/relationships.json?contact_id=${result.id}&fields=matter{id,display_number,description,status}`,
                    {
                        headers: { 'Authorization': authHeader }
                    });
                extraDataTracking = {
                    ratelimitRemaining: associatedMatterInfo.headers['x-ratelimit-remaining'],
                    ratelimitAmount: associatedMatterInfo.headers['x-ratelimit-limit'],
                    ratelimitReset: associatedMatterInfo.headers['x-ratelimit-reset']
                };
                let associatedMatters = associatedMatterInfo.data.data.length > 0 ? associatedMatterInfo.data.data.map(m => { return { const: m.matter.id, title: m.matter.display_number, description: m.matter.description, status: m.matter.status } }) : null;
                associatedMatters = associatedMatters?.filter(m => m.status !== 'Closed');
                let returnedMatters = [];
                returnedMatters = returnedMatters.concat(matters ?? []);
                returnedMatters = returnedMatters.concat(associatedMatters ?? []);
                matchedContactInfo.push({
                    id: result.id,
                    name: result.name,
                    title: result.title ?? "",
                    company: result.company?.name ?? "",
                    phone: numberToQuery,
                    additionalInfo: returnedMatters.length > 0 ?
                        {
                            matters: returnedMatters,
                            logTimeEntry: user.userSettings?.clioDefaultTimeEntryTick ?? true,
                            nonBillable: user.userSettings?.clioDefaultNonBillableTick ?? false
                        } :
                        {
                            logTimeEntry: user.userSettings?.clioDefaultTimeEntryTick ?? true
                        }
                })
            }
        }
    }
    matchedContactInfo.push({
        id: 'createNewContact',
        name: 'Create new contact...',
        additionalInfo: { logTimeEntry: true },
        isNewContact: true
    });
    return {
        successful: true,
        matchedContactInfo,
        extraDataTracking
    };
}

async function createContact({ user, authHeader, phoneNumber, newContactName }) {
    let extraDataTracking = {};
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
    extraDataTracking = {
        ratelimitRemaining: personInfo.headers['x-ratelimit-remaining'],
        ratelimitAmount: personInfo.headers['x-ratelimit-limit'],
        ratelimitReset: personInfo.headers['x-ratelimit-reset']
    };

    return {
        contactInfo: {
            id: personInfo.data.data.id,
            name: personInfo.data.data.name
        },
        returnMessage: {
            message: `Contact created.`,
            messageType: 'success',
            ttl: 2000
        },
        extraDataTracking
    }
}

async function createCallLog({ user, contactInfo, authHeader, callLog, note, additionalSubmission, aiNote, transcript }) {
    const sender = callLog.direction === 'Outbound' ?
        {
            id: user.id,
            type: 'User'
        } :
        {
            id: contactInfo.id,
            type: 'Contact'
        }
    const receiver = callLog.direction === 'Outbound' ?
        {
            id: contactInfo.id,
            type: 'Contact'
        } :
        {
            id: user.id,
            type: 'User'
        }
    let body = '\n';
    if (user.userSettings?.addCallLogContactNumber?.value ?? true) { body = upsertContactPhoneNumber({ body, phoneNumber: contactInfo.phoneNumber, direction: callLog.direction }); }
    if (user.userSettings?.addCallLogResult?.value ?? true) { body = upsertCallResult({ body, result: callLog.result }); }
    if (user.userSettings?.addCallLogNote?.value ?? true) { body = upsertCallAgentNote({ body, note }); }
    if (user.userSettings?.addCallLogDuration?.value ?? true) { body = upsertCallDuration({ body, duration: callLog.duration }); }
    if (!!callLog.recording?.link && (user.userSettings?.addCallLogRecording?.value ?? true)) { body = upsertCallRecording({ body, recordingLink: callLog.recording.link }); }
    if (!!aiNote && (user.userSettings?.addCallLogAiNote?.value ?? true)) { body = upsertAiNote({ body, aiNote }); }
    if (!!transcript && (user.userSettings?.addCallLogTranscript?.value ?? true)) { body = upsertTranscript({ body, transcript }); }

    let extraDataTracking = {
        withSmartNoteLog: !!aiNote && (user.userSettings?.addCallLogAiNote?.value ?? true),
        withTranscript: !!transcript && (user.userSettings?.addCallLogTranscript?.value ?? true)
    };
    const postBody = {
        data: {
            subject: callLog.customSubject ?? `[Call] ${callLog.direction} Call ${callLog.direction === 'Outbound' ? 'to' : 'from'} ${contactInfo.name} [${contactInfo.phone}]`,
            body,
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
    if (additionalSubmission && additionalSubmission.matters) {
        postBody.data['matter'] = { id: additionalSubmission.matters };
    }
    const addLogRes = await axios.post(
        `https://${user.hostname}/api/v4/communications.json`,
        postBody,
        {
            headers: { 'Authorization': authHeader }
        });
    const communicationId = addLogRes.data.data.id;
    const addTimerBody = {
        data: {
            communication: {
                id: communicationId
            },
            quantity: callLog.duration,
            date: moment(callLog.startTime).toISOString(),
            type: 'TimeEntry',
            non_billable: additionalSubmission.nonBillable,
            note: body
        }
    }
    const addTimerRes = await axios.post(
        `https://${user.hostname}/api/v4/activities.json`,
        addTimerBody,
        {
            headers: { 'Authorization': authHeader }
        });
    extraDataTracking = {
        ratelimitRemaining: addTimerRes.headers['x-ratelimit-remaining'],
        ratelimitAmount: addTimerRes.headers['x-ratelimit-limit'],
        ratelimitReset: addTimerRes.headers['x-ratelimit-reset']
    };
    return {
        logId: communicationId,
        returnMessage: {
            message: 'Call logged',
            messageType: 'success',
            ttl: 2000
        },
        extraDataTracking
    };
}

async function updateCallLog({ user, existingCallLog, authHeader, recordingLink, subject, note, startTime, duration, result, aiNote, transcript }) {
    const existingClioLogId = existingCallLog.thirdPartyLogId.split('.')[0];
    let extraDataTracking = {};
    const getLogRes = await axios.get(
        `https://${user.hostname}/api/v4/communications/${existingClioLogId}.json?fields=body,id`,
        {
            headers: { 'Authorization': authHeader }
        });
    let logBody = getLogRes.data.data.body;
    let patchBody = {};

    if (!!note && (user.userSettings?.addCallLogNote?.value ?? true)) { logBody = upsertCallAgentNote({ body: logBody, note }); }
    if (!!duration && (user.userSettings?.addCallLogDuration?.value ?? true)) { logBody = upsertCallDuration({ body: logBody, duration }); }
    if (!!result && (user.userSettings?.addCallLogResult?.value ?? true)) { logBody = upsertCallResult({ body: logBody, result }); }
    if (!!recordingLink && (user.userSettings?.addCallLogRecording?.value ?? true)) { logBody = upsertCallRecording({ body: logBody, recordingLink: decodeURIComponent(recordingLink) }); }
    if (!!aiNote && (user.userSettings?.addCallLogAiNote?.value ?? true)) { logBody = upsertAiNote({ body: logBody, aiNote }); }
    if (!!transcript && (user.userSettings?.addCallLogTranscript?.value ?? true)) { logBody = upsertTranscript({ body: logBody, transcript }); }
    patchBody = {
        data: {
            body: logBody
        }
    }
    if (subject) { patchBody.data.subject = subject; }
    if (startTime) { patchBody.data.received_at = moment(startTime).toISOString(); }
    // duration - update Timer
    if (duration) {
        const getTimerRes = await axios.get(
            `https://${user.hostname}/api/v4/activities?communication_id=${getLogRes.data.data.id}&fields=quantity,id`,
            {
                headers: { 'Authorization': authHeader }
            }
        )
        if (getTimerRes.data.data[0]) {
            const patchTimerBody = {
                data: {
                    quantity: duration,
                    note: logBody,
                }
            }
            if (startTime) {
                patchTimerBody.data.date = moment(startTime).toISOString();
            }
            const patchTimerRes = await axios.patch(
                `https://${user.hostname}/api/v4/activities/${getTimerRes.data.data[0].id}.json`,
                patchTimerBody,
                {
                    headers: { 'Authorization': authHeader }
                });
        }
    }
    const patchLogRes = await axios.patch(
        `https://${user.hostname}/api/v4/communications/${existingClioLogId}.json`,
        patchBody,
        {
            headers: { 'Authorization': authHeader }
        });
    extraDataTracking = {
        ratelimitRemaining: patchLogRes.headers['x-ratelimit-remaining'],
        ratelimitAmount: patchLogRes.headers['x-ratelimit-limit'],
        ratelimitReset: patchLogRes.headers['x-ratelimit-reset']
    };
    return {
        updatedNote: patchBody.data?.body,
        returnMessage: {
            message: 'Call log updated.',
            messageType: 'success',
            ttl: 2000
        },
        extraDataTracking
    };
}

async function upsertCallDisposition({ user, existingCallLog, authHeader, dispositions }) {
    let extraDataTracking = {};
    if (!dispositions.matters) {
        return {
            logId: null
        };
    }
    const existingClioLogId = existingCallLog.thirdPartyLogId.split('.')[0];
    const patchBody = {
        data: {
            matter: {
                id: dispositions.matters
            }
        }
    }
    const upsertDispositionRes = await axios.patch(
        `https://${user.hostname}/api/v4/communications/${existingClioLogId}.json`,
        patchBody,
        {
            headers: { 'Authorization': authHeader }
        });
    extraDataTracking = {
        ratelimitRemaining: upsertDispositionRes.headers['x-ratelimit-remaining'],
        ratelimitAmount: upsertDispositionRes.headers['x-ratelimit-limit'],
        ratelimitReset: upsertDispositionRes.headers['x-ratelimit-reset']
    };
    return {
        logId: existingClioLogId,
        extraDataTracking
    }
}

async function createMessageLog({ user, contactInfo, authHeader, message, additionalSubmission, recordingLink, faxDocLink }) {
    let extraDataTracking = {};
    const sender =
    {
        id: contactInfo.id,
        type: 'Contact'
    }
    const receiver =
    {
        id: user.id,
        type: 'User'
    }
    const userInfoResponse = await axios.get('https://app.clio.com/api/v4/users/who_am_i.json?fields=name', {
        headers: {
            'Authorization': authHeader
        }
    });
    const userName = userInfoResponse.data.data.name;
    const messageType = recordingLink ? 'Voicemail' : (faxDocLink ? 'Fax' : 'SMS');
    let logBody = '';
    let logSubject = '';
    switch (messageType) {
        case 'SMS':
            logSubject = `SMS conversation with ${contactInfo.name} - ${moment(message.creationTime).format('YY/MM/DD')}`;
            logBody =
                '\nConversation summary\n' +
                `${moment(message.creationTime).format('dddd, MMMM DD, YYYY')}\n` +
                'Participants\n' +
                `    ${userName}\n` +
                `    ${contactInfo.name}\n` +
                '\nConversation(1 messages)\n' +
                'BEGIN\n' +
                '------------\n' +
                `${message.direction === 'Inbound' ? `${contactInfo.name} (${contactInfo.phoneNumber})` : userName} ${moment(message.creationTime).format('hh:mm A')}\n` +
                `${message.subject}\n` +
                '------------\n' +
                'END\n\n' +
                '--- Created via RingCentral App Connect';
            break;
        case 'Voicemail':
            logSubject = `Voicemail left by ${contactInfo.name} - ${moment(message.creationTime).format('YY/MM/DD')}`;
            logBody = `Voicemail recording link: ${recordingLink} \n\n--- Created via RingCentral App Connect`;
            break;
        case 'Fax':
            logSubject = `Fax document sent from ${contactInfo.name} - ${moment(message.creationTime).format('YY/MM/DD')}`;
            logBody = `Fax document link: ${faxDocLink} \n\n--- Created via RingCentral App Connect`;
            break;
    }
    const postBody = {
        data: {
            subject: logSubject,
            body: logBody,
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
    if (additionalSubmission && additionalSubmission.matters) {
        postBody.data['matter'] = { id: additionalSubmission.matters };
    }
    const addLogRes = await axios.post(
        `https://${user.hostname}/api/v4/communications.json`,
        postBody,
        {
            headers: { 'Authorization': authHeader }
        });
    extraDataTracking = {
        ratelimitRemaining: addLogRes.headers['x-ratelimit-remaining'],
        ratelimitAmount: addLogRes.headers['x-ratelimit-limit'],
        ratelimitReset: addLogRes.headers['x-ratelimit-reset']
    };
    return {
        logId: addLogRes.data.data.id,
        returnMessage: {
            message: 'Message logged',
            messageType: 'success',
            ttl: 1000
        },
        extraDataTracking
    };
}

async function updateMessageLog({ user, contactInfo, existingMessageLog, message, authHeader }) {
    let extraDataTracking = {};
    const existingClioLogId = existingMessageLog.thirdPartyLogId.split('.')[0];
    const getLogRes = await axios.get(
        `https://${user.hostname}/api/v4/communications/${existingClioLogId}.json?fields=body`,
        {
            headers: { 'Authorization': authHeader }
        });
    const userInfoResponse = await axios.get('https://app.clio.com/api/v4/users/who_am_i.json?fields=name', {
        headers: {
            'Authorization': authHeader
        }
    });
    const userName = userInfoResponse.data.data.name;
    let logBody = getLogRes.data.data.body;
    let patchBody = {};
    const originalNote = logBody.split('BEGIN\n------------\n')[1];
    const newMessageLog =
        `${message.direction === 'Inbound' ? `${contactInfo.name} (${contactInfo.phoneNumber})` : userName} ${moment(message.creationTime).format('hh:mm A')}\n` +
        `${message.subject}\n`;
    logBody = logBody.replace(originalNote, `${newMessageLog}\n${originalNote}`);

    const regex = RegExp('Conversation.(.*) messages.');
    const matchResult = regex.exec(logBody);
    logBody = logBody.replace(matchResult[0], `Conversation(${parseInt(matchResult[1]) + 1} messages)`);

    patchBody = {
        data: {
            body: logBody
        }
    }
    const patchLogRes = await axios.patch(
        `https://${user.hostname}/api/v4/communications/${existingClioLogId}.json`,
        patchBody,
        {
            headers: { 'Authorization': authHeader }
        });

    extraDataTracking = {
        ratelimitRemaining: patchLogRes.headers['x-ratelimit-remaining'],
        ratelimitAmount: patchLogRes.headers['x-ratelimit-limit'],
        ratelimitReset: patchLogRes.headers['x-ratelimit-reset']
    };
    return {
        extraDataTracking
    }
}

async function getCallLog({ user, callLogId, authHeader }) {
    let extraDataTracking = {};
    const formattedLogId = callLogId.split('.')[0];
    const getLogRes = await axios.get(
        `https://${user.hostname}/api/v4/communications/${formattedLogId}.json?fields=subject,body,matter,senders,receivers`,
        {
            headers: { 'Authorization': authHeader }
        });
    const note = getLogRes.data.data.body.split('- Note: ')[1]?.split('\n')[0];
    const contactId = getLogRes.data.data.senders[0].type == 'Person' ?
        getLogRes.data.data.senders[0].id :
        getLogRes.data.data.receivers[0].id;
    const contactRes = await axios.get(
        `https://${user.hostname}/api/v4/contacts/${contactId}.json?fields=name`,
        {
            headers: { 'Authorization': authHeader }
        });
    extraDataTracking = {
        ratelimitRemaining: contactRes.headers['x-ratelimit-remaining'],
        ratelimitAmount: contactRes.headers['x-ratelimit-limit'],
        ratelimitReset: contactRes.headers['x-ratelimit-reset']
    };
    return {
        callLogInfo: {
            subject: getLogRes.data.data.subject,
            note,
            contactName: contactRes.data.data.name,
            dispositions: {
                matters: getLogRes.data.data.matter?.id
            }
        },
        extraDataTracking
    }
}

function upsertContactPhoneNumber({ body, phoneNumber, direction }) {
    const phoneNumberRegex = RegExp('- Contact Number: (.+?)\n');
    if (phoneNumberRegex.test(body)) {
        body = body.replace(phoneNumberRegex, `- Contact Number: ${phoneNumber}\n`);
    } else {
        body += `- Contact Number: ${phoneNumber}\n`;
    }
    return body;
}
function upsertCallResult({ body, result }) {
    const resultRegex = RegExp('- Result: (.+?)\n');
    if (resultRegex.test(body)) {
        body = body.replace(resultRegex, `- Result: ${result}\n`);
    } else {
        body += `- Result: ${result}\n`;
    }
    return body;
}

function upsertCallAgentNote({ body, note }) {
    if (!note) {
        return body;
    }
    const noteRegex = RegExp('- Note: ([\\s\\S]+?)\n');
    if (noteRegex.test(body)) {
        body = body.replace(noteRegex, `- Note: ${note}\n`);
    }
    else {
        body += `- Note: ${note}\n`;
    }
    return body;
}

function upsertCallDuration({ body, duration }) {
    const durationRegex = RegExp('- Duration: (.+?)?\n');
    if (durationRegex.test(body)) {
        body = body.replace(durationRegex, `- Duration: ${secondsToHoursMinutesSeconds(duration)}\n`);
    } else {
        body += `- Duration: ${secondsToHoursMinutesSeconds(duration)}\n`;
    }
    return body;
}


function upsertCallRecording({ body, recordingLink }) {
    const recordingLinkRegex = RegExp('- Call recording link: (.+?)\n');
    if (!!recordingLink && recordingLinkRegex.test(body)) {
        body = body.replace(recordingLinkRegex, `- Call recording link: ${recordingLink}\n`);
    } else if (recordingLink) {
        body += `- Call recording link: ${recordingLink}\n`;
    }
    return body;
}

function upsertAiNote({ body, aiNote }) {
    const aiNoteRegex = RegExp('- AI Note:([\\s\\S]*?)--- END');
    const clearedAiNote = aiNote.replace(/\n+$/, '');
    if (aiNoteRegex.test(body)) {
        body = body.replace(aiNoteRegex, `- AI Note:\n${clearedAiNote}\n--- END`);
    } else {
        body += `- AI Note:\n${clearedAiNote}\n--- END\n`;
    }
    return body;
}

function upsertTranscript({ body, transcript }) {
    const transcriptRegex = RegExp('- Transcript:([\\s\\S]*?)--- END');
    if (transcriptRegex.test(body)) {
        body = body.replace(transcriptRegex, `- Transcript:\n${transcript}\n--- END`);
    } else {
        body += `- Transcript:\n${transcript}\n--- END\n`;
    }
    return body;
}

exports.getAuthType = getAuthType;
exports.getOauthInfo = getOauthInfo;
exports.getUserInfo = getUserInfo;
exports.createCallLog = createCallLog;
exports.updateCallLog = updateCallLog;
exports.upsertCallDisposition = upsertCallDisposition;
exports.getCallLog = getCallLog;
exports.createMessageLog = createMessageLog;
exports.updateMessageLog = updateMessageLog;
exports.findContact = findContact;
exports.createContact = createContact;
exports.unAuthorize = unAuthorize;