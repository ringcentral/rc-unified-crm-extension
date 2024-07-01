const axios = require('axios');
const moment = require('moment');
const url = require('url');
const { parsePhoneNumber } = require('awesome-phonenumber');

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
                message: 'Successfully connceted to Clio.',
                ttl: 3000
            }
        };
    }
    catch (e) {
        return {
            successful: false,
            returnMessage: {
                messageType: 'warning',
                message: 'Failed to get user info.',
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
    await user.destroy();
    return {
        returnMessage: {
            messageType: 'success',
            message: 'Successfully logged out from Clio account.',
            ttl: 3000
        }
    }
}

async function findContact({ user, authHeader, phoneNumber, overridingFormat }) {
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
    const matchedContactInfo = [];
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
                const matters = matterInfo.data.data.length > 0 ? matterInfo.data.data.map(m => { return { const: m.id, title: m.display_number } }) : null;
                const associatedMatterInfo = await axios.get(
                    `https://${user.hostname}/api/v4/relationships.json?contact_id=${result.id}&fields=matter`,
                    {
                        headers: { 'Authorization': authHeader }
                    });
                const associatedMatters = associatedMatterInfo.data.data.length > 0 ? associatedMatterInfo.data.data.map(m => { return { const: m.matter.id, title: m.matter.display_number } }) : null;
                let returnedMatters = [];
                returnedMatters = returnedMatters.concat(matters ?? []);
                returnedMatters = returnedMatters.concat(associatedMatters ?? []);
                matchedContactInfo.push({
                    id: result.id,
                    name: result.name,
                    title: result.title ?? "",
                    company: result.company?.name ?? "",
                    phone: numberToQuery,
                    additionalInfo: returnedMatters.length > 0 ? { matters: returnedMatters, logTimeEntry: true } : { logTimeEntry: true }
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
    return { matchedContactInfo };
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
        contactInfo: {
            id: personInfo.data.data.id,
            name: personInfo.data.data.name
        },
        returnMessage: {
            message: `New contact created.`,
            messageType: 'success',
            ttl: 3000
        }
    }
}

async function createCallLog({ user, contactInfo, authHeader, callLog, note, additionalSubmission }) {
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
    const postBody = {
        data: {
            subject: callLog.customSubject ?? `[Call] ${callLog.direction} Call ${callLog.direction === 'Outbound' ? 'to' : 'from'} ${contactInfo.name} [${contactInfo.phone}]`,
            body: `\nContact Number: ${contactInfo.phoneNumber}\nCall Result: ${callLog.result}\nNote: ${note}${callLog.recording ? `\n[Call recording link] ${callLog.recording.link}` : ''}\n\n--- Created via RingCentral CRM Extension`,
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
    return {
        logId: communicationId,
        returnMessage: {
            message: 'Call log added.',
            messageType: 'success',
            ttl: 3000
        }
    };
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
    return {
        updatedNote: patchBody.data?.body,
        returnMessage: {
            message: 'Call log updated.',
            messageType: 'success',
            ttl: 3000
        }
    };
}

async function createMessageLog({ user, contactInfo, authHeader, message, additionalSubmission, recordingLink, faxDocLink }) {
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
    const messageType = !!recordingLink ? 'Voicemail' : (!!faxDocLink ? 'Fax' : 'SMS');
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
                '--- Created via RingCentral CRM Extension';
            break;
        case 'Voicemail':
            logSubject = `Voicemail left by ${contactInfo.name} - ${moment(message.creationTime).format('YY/MM/DD')}`;
            logBody = `Voicemail recording link: ${recordingLink} \n\n--- Created via RingCentral CRM Extension`;
            break;
        case 'Fax':
            logSubject = `Fax document sent from ${contactInfo.name} - ${moment(message.creationTime).format('YY/MM/DD')}`;
            logBody = `Fax document link: ${faxDocLink} \n\n--- Created via RingCentral CRM Extension`;
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
    return {
        logId: addLogRes.data.data.id,
        returnMessage: {
            message: 'Message log added.',
            messageType: 'success',
            ttl: 3000
        }
    };
}

async function updateMessageLog({ user, contactInfo, existingMessageLog, message, authHeader }) {
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
        callLogInfo: {
            subject: getLogRes.data.data.subject,
            note,
            contactName: contactRes.data.data.name
        }
    }
}



exports.getAuthType = getAuthType;
exports.getOauthInfo = getOauthInfo;
exports.getUserInfo = getUserInfo;
exports.createCallLog = createCallLog;
exports.updateCallLog = updateCallLog;
exports.getCallLog = getCallLog;
exports.createMessageLog = createMessageLog;
exports.updateMessageLog = updateMessageLog;
exports.findContact = findContact;
exports.createContact = createContact;
exports.unAuthorize = unAuthorize;