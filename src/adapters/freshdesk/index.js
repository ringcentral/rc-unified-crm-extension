const axios = require('axios');
const moment = require('moment');
const { parsePhoneNumber } = require('awesome-phonenumber');
const { secondsToHoursMinutesSeconds } = require('../../lib/util');
const { cat } = require('shelljs');
const DEFAULT_RETRY_DELAY = 2000;

function getApiUrl(fdDomain) {
    return `https://${fdDomain}/api/v2`;
}

function getAuthType() {
    return 'apiKey'; // Return either 'oauth' OR 'apiKey'
}

function getBasicAuth({ apiKey, hostname }) {
    return Buffer.from(`${apiKey}:`).toString('base64');
}

async function getUserInfo({ authHeader, additionalInfo }) {
    try {

        // API call to get logged in user info
        let url = `${getApiUrl(additionalInfo.fdDomain)}/agents/me`;
        const userInfoResponse = await axios.get(url, {
            headers: {
                'Authorization': authHeader
            }
        });

        if (!userInfoResponse.data || !userInfoResponse.data.contact)
            throw new Error("Freshdesk API returned invalid response");

        // toString() the id otherwise we get an error
        const id = userInfoResponse.data.id.toString();
        const name = userInfoResponse.data.contact.name;
        const timezoneName = ''; // Optional. Whether or not you want to log with regards to the user's timezone
        const timezoneOffset = null; // Optional. Whether or not you want to log with regards to the user's timezone. It will need to be converted to a format that CRM platform uses,

        return {
            successful: true,
            platformUserInfo: {
                id,
                name,
                timezoneName,
                timezoneOffset,
                platformAdditionalInfo: additionalInfo  // this should save whatever extra info you want to save against the user
            },
            returnMessage: {
                messageType: 'success',
                message: 'Successfully connected to Freshdesk.',
                ttl: 3000
            }
        };
    }
    catch (e) {
        return {
            successful: false,
            returnMessage: {
                messageType: 'warning',
                message: e.message || 'Failed to get user info.',
                ttl: 3000
            }
        }
    }
}

async function unAuthorize({ user }) {
    await user.destroy();
    return {
        returnMessage: {
            messageType: 'success',
            message: 'Successfully logged out from Freshdesk account.',
            ttl: 3000
        }
    }
}

//  - phoneNumber: phone number in E.164 format
//  - overridingFormat: optional, if you want to override the phone number format
async function findContact({ user, authHeader, phoneNumber, overridingFormat, isExtension }) {
    const matchedContactInfo = [];
    phoneNumber = phoneNumber.trim();
    console.log(`[RC App] phone number: ${phoneNumber}`);
    console.log(`[RC App] is extension number? ${isExtension}`);

    let searchResponse = null;
    try {
        searchResponse = await searchFDContact(user.platformAdditionalInfo.fdDomain, authHeader, phoneNumber);
    } catch (error) {
        return processErrorToRC(error);
    }

    // add found contacts to matchedContactInfo or create and add a contact if needed
    if (searchResponse && searchResponse.results.length > 0) {
        const contacts = searchResponse.results;
        for (var c of contacts) {
            matchedContactInfo.push({
                id: c.id,
                name: c.name,
                type: "Contact",
                phone: c.phone,
                additionalInfo: null
            })
        }
    } else {

        let contactResponse = null
        try {
            contactResponse = await createFDContact(user.platformAdditionalInfo.fdDomain, authHeader, phoneNumber, `Unknown caller ${phoneNumber}`);
        } catch (error) {
            return processErrorToRC(error);
        }

        if (contactResponse) {
            matchedContactInfo.push({
                id: contactResponse.id,
                name: contactResponse.name,
                type: "Contact",
                phone: contactResponse.phone,
                additionalInfo: null
            })
        }
    }

    // If you want to support creating a new contact from the extension, below placeholder contact should be used
    matchedContactInfo.push({
        id: 'createNewContact',
        name: 'Create new contact...',
        additionalInfo: null,
        isNewContact: true
    });

    console.log('[RC App] findContact returning:', matchedContactInfo);

    return {
        successful: true,
        matchedContactInfo: matchedContactInfo,
        returnMessage: {
            messageType: 'success',
            message: 'Successfully found contact.',
            detaisl: [
                {
                    title: 'Details',
                    items: [
                        {
                            id: '1',
                            type: 'text',
                            text: `Found ${matchedContactInfo.length} contacts`
                        }
                    ]
                }
            ],
            ttl: 3000
        }
    };  
}

// - contactInfo: { id, type, phoneNumber, name }
// - callLog: same as in https://developers.ringcentral.com/api-reference/Call-Log/readUserCallRecord
// - note: note submitted by user
// - additionalSubmission: all additional fields that are setup in manifest under call log page
async function createCallLog({ user, contactInfo, authHeader, callLog, note, additionalSubmission, aiNote, transcript }) {
    console.log('[RC App] createCallLog');
    // console.log('[RC App] createCallLog', contactInfo, callLog, note, additionalSubmission);
    // console.log(`[RC App] adding call log... \n${JSON.stringify(callLog, null, 2)}`);
    console.log(`[RC App] with note... \n${note}`);
    // console.log(`[RC App]  with additional info... \n${JSON.stringify(additionalSubmission, null, 2)}`);

    try {
        console.debug('[RC App] START logActivity');
        await logActivity(user);
    } catch (error) {
        console.error('[RC App] logActivity failed');
        return processErrorToRC(error);
    }

    let noteBody = '<b>RingCentral call details</b><br>';
    if (user.userSettings?.addCallLogContactNumber?.value ?? true) { noteBody = upsertContactPhoneNumber({ body: noteBody, phoneNumber: contactInfo.phoneNumber, direction: callLog.direction }); }
    if (user.userSettings?.addCallLogDateTime?.value ?? true) { noteBody = upsertCallDateTime({ body: noteBody, startTime: callLog.startTime, timezoneOffset: user.timezoneOffset }); }
    if (user.userSettings?.addCallLogDuration?.value ?? true) { noteBody = upsertCallDuration({ body: noteBody, duration: callLog.duration }); }
    if (user.userSettings?.addCallLogResult?.value ?? true) { noteBody = upsertCallResult({ body: noteBody, result: callLog.result }); }
    if (!!callLog.recording?.link && (user.userSettings?.addCallLogRecording?.value ?? true)) { noteBody = upsertCallRecording({ body: noteBody, recordingLink: callLog.recording.link }); }
    noteBody += '</ul>';
    if (!!aiNote && (user.userSettings?.addCallLogAiNote?.value ?? true)) { noteBody = upsertAiNote({ body: noteBody, aiNote }); }
    if (!!transcript && (user.userSettings?.addCallLogTranscript?.value ?? true)) { noteBody = upsertTranscript({ body: noteBody, transcript }); }

    // pass requester_id if contact was found, otherwise provide a phone value so FD will create a contact
    let ticketBody = {
        subject: callLog.customSubject ?? `[Call] ${callLog.direction} Call ${callLog.direction === 'Outbound' ? 'to' : 'from'} ${contactInfo.name} [${contactInfo.phone}]`,
        description: (!note || note.trim().length === 0) ? "No note provided" : note,
        requester_id: contactInfo.id ?? null,
        status: 2,
        priority: 1,
        phone: contactInfo && contactInfo.id ? null : contactInfo.phoneNumber
    };

    // create ticket with the call log information
    let ticketResponse = null
    try {
        ticketResponse = await createFDTicket(user.platformAdditionalInfo.fdDomain, authHeader, ticketBody);
    } catch (error) {
        return processErrorToRC(error);
    }

    let recordId = ticketResponse.id;

    // create ticket note with the call log information
    let noteResponse = null
    try {
        noteResponse = await createFDTicketNote(user.platformAdditionalInfo.fdDomain, authHeader, ticketResponse.id, noteBody, callLog.recording?.link);
    } catch (error) {
        return processErrorToRC(error);
    }

    recordId += '-' + noteResponse.id;

    // the id we communicate is built up like this: <ticketid>-<noteid>
    return {
        logId: recordId,
        returnMessage: {
            message: 'Call log added.',
            messageType: 'success',
            ttl: 3000
        }
    };
}

async function getCallLog({ user, callLogId, authHeader }) {
    console.log('[RC App] getCallLog');

    let splitted = callLogId.split('-');
    let fdTicketId = null;
    let fdNoteId = null;
    if (splitted.length > 1) {
        fdTicketId = splitted[0];
        fdNoteId = splitted[1];
        console.log('[RC App] updateCallLog got fd ids', fdTicketId, fdNoteId);
    }

    let getLogRes = {};
    if (fdTicketId) {
        let url = `${getApiUrl(user.platformAdditionalInfo.fdDomain)}/tickets/${callLogId}`;


        let ticketResponse = null
        try {
            ticketResponse = await axios.get(url, { headers: { 'Authorization': authHeader } });
        } catch (error) {
            return processErrorToRC(error);
        }
        getLogRes = { subject: ticketResponse.data.subject, note: ticketResponse.data.description_text };
    }

    return {
        callLogInfo: {
            subject: getLogRes.subject,
            note: getLogRes.note
        },
        returnMessage: {
            message: 'Call log fetched.',
            messageType: 'success',
            ttl: 3000
        }
    }
}

// Will be called by RC when recordinglink is ready OR by user action when updating the call log manually
async function updateCallLog({ user, existingCallLog, authHeader, recordingLink, subject, note, startTime, duration, result, aiNote, transcript }) {
    console.log('[RC App] updateCallLog', note ? 'hasnote' : 'no note');

    let splitted = existingCallLog.thirdPartyLogId.split('-');
    let fdTicketId = null;
    let fdNoteId = null;
    if (splitted.length > 1) {
        fdTicketId = splitted[0];
        fdNoteId = splitted[1];
        console.log('[RC App] updateCallLog got fd ids', fdTicketId, fdNoteId);
    }

    let ticketNote = null
    try {
        ticketNote = await getTicketNoteById(user.platformAdditionalInfo.fdDomain, authHeader, fdTicketId, fdNoteId);
    } catch (error) {
        return processErrorToRC(error);
    }


    let logBody = ticketNote.body;
    if (!!startTime && (user.userSettings?.addCallLogDateTime?.value ?? true)) { logBody = upsertCallDateTime({ body: logBody, startTime, timezoneOffset: user.timezoneOffset }); }
    if (!!duration && (user.userSettings?.addCallLogDuration?.value ?? true)) { logBody = upsertCallDuration({ body: logBody, duration }); }
    if (!!result && (user.userSettings?.addCallLogResult?.value ?? true)) { logBody = upsertCallResult({ body: logBody, result }); }
    if (!!recordingLink && (user.userSettings?.addCallLogRecording?.value ?? true)) { logBody = upsertCallRecording({ body: logBody, recordingLink }); }
    if (!!aiNote && (user.userSettings?.addCallLogAiNote?.value ?? true)) { logBody = upsertAiNote({ body: logBody, aiNote }); }
    if (!!transcript && (user.userSettings?.addCallLogTranscript?.value ?? true)) { logBody = upsertTranscript({ body: logBody, transcript }); }

    // if note is given this is a user initiated update, update the ticket body only, otherwise add RC call info to ticket not contains call log info
    if (note) {
        try {
            await updateFDTicket(user.platformAdditionalInfo.fdDomain, authHeader, fdTicketId, note);
        } catch (error) {
            return processErrorToRC(error);
        }
    } else {
        try {
            await updateFDTicketNote(user.platformAdditionalInfo.fdDomain, authHeader, fdNoteId, logBody);
        } catch (error) {
            return processErrorToRC(error);
        }
    }

    return {
        updatedNote: note,
        returnMessage: {
            message: 'Call log updated.',
            messageType: 'success',
            ttl: 3000
        }
    };
}

// Important: Is for SMS, Fax and Voicemail. SMS is only delivered once per 24 hours to prevent overloading the CRM API
// - contactInfo: { id, type, phoneNumber, name }
// - message : same as in https://developers.ringcentral.com/api-reference/Message-Store/readMessage
// - recordingLink: recording link of voice mail
// - additionalSubmission: all additional fields that are setup in manifest under call log page
async function createMessageLog({ user, contactInfo, authHeader, message, additionalSubmission, recordingLink, faxDocLink }) {
    console.log('[RC App] createMessageLog');
    const messageType = !!recordingLink ? 'Voicemail' : (!!faxDocLink ? 'Fax' : 'SMS');
    let subject = '';
    let note = '';
    switch (messageType) {
        case 'SMS':
            subject = `SMS conversation with ${contactInfo.name} - ${moment(message.creationTime).utcOffset(user.timezoneOffset ?? 0).format('YYYY-MM-DD hh:mm:ss A')}`;
            note =
                `<br><b>${subject}</b><br>` +
                '<b>Conversation summary</b><br><br>' +
                `${moment(message.creationTime).utcOffset(user.timezoneOffset ?? 0).format('dddd, MMMM DD, YYYY')}<br>` +
                'Participants<br>' +
                `<ul><li>To: ${message.to[0].name}</li>` +
                `<li>From: ${contactInfo.name}</li></ul>` +
                'Conversation(1 messages)<br>' +
                'BEGIN<br>' +
                '------------<br>' +
                '<ul>' +
                `<li>${message.direction === 'Inbound' ? `${contactInfo.name} (${contactInfo.phoneNumber})` : userName} ${moment(message.creationTime).utcOffset(user.timezoneOffset ?? 0).format('hh:mm A')}<br>` +
                `<b>${message.subject}</b></li>` +
                '</ul>' +
                '------------<br>' +
                'END<br><br>';
            break;
        case 'Fax':
            subject = `Fax document sent from ${contactInfo.name} - ${moment(message.creationTime).utcOffset(user.timezoneOffset ?? 0).format('YYYY-MM-DD')}`;
            note = `<br><b>${subject}</b><br>Fax document link: ${faxDocLink}`;
            break;
        case 'Voicemail':
            subject = `Voicemail left by ${contactInfo.name} - ${moment(message.creationTime).utcOffset(user.timezoneOffset ?? 0).format('YYYY-MM-DD hh:mm:ss A')}`;
            note = `<br><b>${subject}</b><br>Voicemail recording link: <a target="_blank" href="${recordingLink}">open</a>`;
            break;
    }

    let ticketBody = {
        subject: subject,
        description: note,
        requester_id: contactInfo.id ?? null,
        status: 2,
        priority: 1,
        phone: contactInfo && contactInfo.id ? null : contactInfo.phoneNumber
    };

    console.log('[RC App] createMessageLog with payload', ticketBody);

    let ticketResponse = null
    try {
        ticketResponse = await createFDTicket(user.platformAdditionalInfo.fdDomain, authHeader, ticketBody);
    } catch (error) {
        return processErrorToRC(error);
    }

    return {
        logId: ticketResponse.id,
        returnMessage: {
            message: 'Message log added.',
            messageType: 'success',
            ttl: 3000
        }
    };
}

// Used to update existing message log so to group message in the same day together
async function updateMessageLog({ user, contactInfo, existingMessageLog, message, authHeader }) {
    console.log('[RC App] updateMessageLog');
    const existingLogId = existingMessageLog.thirdPartyLogId

    let url = `${getApiUrl(user.platformAdditionalInfo.fdDomain)}/tickets/${existingLogId}`;

    let ticketResponse = null
    try {
        ticketResponse = await axios.get(url, { headers: { 'Authorization': authHeader } });
    } catch (error) {
        // RC considers messages part of the same conversation if its within a certain period, however, if the ticket does not exist anymore we need to re-create it
        if (error.response && error.response.status === 404)
            createMessageLog({ user, contactInfo, authHeader, message });
        else
            return processErrorToRC(error);
    }

    getLogRes = { subject: ticketResponse.data.subject, note: ticketResponse.data.description_text };

    let logBody = ticketResponse.data.description;
    const newMessageLog =
        `<li>${message.direction === 'Inbound' ? `${contactInfo.name} (${contactInfo.phoneNumber})` : message.from.name} ${moment(message.creationTime).utcOffset(Number(user.timezoneOffset ?? 0)).format('hh:mm A')}<br>` +
        `<b>${message.subject}</b></li>`;
    logBody = logBody.replace('------------<br><ul>', `------------<br><ul>${newMessageLog}`);

    const regex = RegExp('<br>Conversation.(.*) messages.');
    const matchResult = regex.exec(logBody);
    logBody = logBody.replace(matchResult[0], `<br>Conversation(${parseInt(matchResult[1]) + 1} messages)`);

    // console.log(`[RC App] update message log with... \n\n${JSON.stringify(message, null, 2)}`);

    try {
        await updateFDTicket(user.platformAdditionalInfo.fdDomain, authHeader, existingMessageLog.thirdPartyLogId, logBody);
    } catch (error) {
        return processErrorToRC(error);
    }
}

async function createContact({ user, authHeader, phoneNumber, newContactName, newContactType }) {
    console.log('[RC App] createContact');

    const contactResponse = await createFDContact(user.platformAdditionalInfo.fdDomain, authHeader, phoneNumber, newContactName);

    return {
        contactInfo: {
            id: contactResponse.id,
            name: newContactName
        },
        returnMessage: {
            message: `New contact created.`,
            messageType: 'success',
            ttl: 3000
        }
    }
}

//#region Helper functions - formatting call log and related
// The RC interface functions can handle errors but we need to return it in the response
function processErrorToRC(error) {
    console.debug('[RC App] processErrorToRC', error);
    return {
        logId: 'testlogid',
        returnMessage: {
            message: error.message,
            messageType: 'danger',
            ttl: 3000
        }
    };
}

function upsertContactPhoneNumber({ body, phoneNumber, direction }) {
    const phoneNumberRegex = RegExp('- Contact Number: (.+?)<br>');
    if (phoneNumberRegex.test(body)) {
        body = body.replace(phoneNumberRegex, `- Contact Number: ${phoneNumber}<br>`);
    } else {
        body += `- Contact Number: ${phoneNumber}<br>`;
    }
    return body;
}

function upsertCallDateTime({ body, startTime, timezoneOffset }) {
    const dateTimeRegex = RegExp('- Date/time: (.+?)<br>');
    if (dateTimeRegex.test(body)) {
        const updatedDateTime = moment(startTime).utcOffset(timezoneOffset ?? 0).format('YYYY-MM-DD hh:mm:ss A');
        body = body.replace(dateTimeRegex, `- Date/time: ${updatedDateTime}<br>`);
    } else {
        const updatedDateTime = moment(startTime).utcOffset(timezoneOffset ?? 0).format('YYYY-MM-DD hh:mm:ss A');
        body += `- Date/time: ${updatedDateTime}<br>`;
    }
    return body;
}

function upsertCallResult({ body, result }) {
    const resultRegex = RegExp('- Result: (.+?)<br>');
    if (resultRegex.test(body)) {
        body = body.replace(resultRegex, `- Result: ${result}<br>`);
    } else {
        body += `- Result: ${result}<br>`;
    }
    return body;
}

function upsertCallDuration({ body, duration }) {
    const durationRegex = RegExp('- Duration: (.+?)<br>');
    if (durationRegex.test(body)) {
        body = body.replace(durationRegex, `- Duration: ${secondsToHoursMinutesSeconds(duration)}<br>`);
    } else {
        body += `- Duration: ${secondsToHoursMinutesSeconds(duration)}<br>`;
    }
    return body;
}

function upsertCallRecording({ body, recordingLink }) {
    const recordingLinkRegex = /- Call recording link: \(pending\.\.\.\)/;

    if (recordingLink) {
        if (recordingLinkRegex.test(body)) {
            // Replace placeholder with actual recording link
            body = body.replace(recordingLinkRegex, `- Call recording link: <a target="_blank" href="${recordingLink}">open</a><br>`);
        } else if (recordingLink.startsWith('http')) {
            // Append if the placeholder doesn't exist
            body += `- Call recording link: <a target="_blank" href="${recordingLink}">open</a><br>`;
        } else {
            // Ensure pending placeholder is only added if it's missing
            if (!recordingLinkRegex.test(body)) {
                body += '- Call recording link: (pending...)';
            }
        }
    }

    return body;
}

function upsertAiNote({ body, aiNote }) {
    const aiNoteRegex = RegExp('- AI Note:([\\s\\S]*?)--- END');
    const clearedAiNote = aiNote.replace(/\n+$/, '');
    if (aiNoteRegex.test(body)) {
        body = body.replace(aiNoteRegex, `- AI Note:<br>${clearedAiNote}<br>--- END`);
    } else {
        body += `- AI Note:<br>${clearedAiNote}<br>--- END<br>`;
    }
    return body;
}

function upsertTranscript({ body, transcript }) {
    const transcriptRegex = RegExp('- Transcript:([\\s\\S]*?)--- END');
    if (transcriptRegex.test(body)) {
        body = body.replace(transcriptRegex, `- Transcript:<br>${transcript}<br>--- END`);
    } else {
        body += `- Transcript:<br>${transcript}<br>--- END<br>`;
    }
    return body;
}
//#endregion

//#region  Helper functions - Freshdesk API
async function makeRequestWithRetry({ method, url, payload = null, headers = {}, retries = 3, delay = DEFAULT_RETRY_DELAY }) {
    let lastError = null;

    for (let i = 0; i < retries; i++) {
        try {
            const response = await axios({ method, url, headers, data: payload });
            return response.data; // Success: return API response data
        } catch (error) {
            lastError = error; // Store last error
            if (error.response && error.response.status === 429) {
                console.warn(`[API] Rate limited (429) - Retrying in ${delay}ms...`);
                await new Promise(res => setTimeout(res, delay)); // Delay before retry
            } else {
                console.error(`[API] Error during request: ${error.message}`);
                throw error; // Other errors, throw immediately
            }
        }
    }

    // If all retries exhausted due to rate limiting, return a specific error
    if (lastError && lastError.response && lastError.response.status === 429) {
        console.warn("[RC App] Freshdesk API Rate Limit reached.");
        throw new Error("Freshdesk Rate limit reached.");
    }

    // If a different error happened (shouldn't reach here normally)
    throw lastError;
}

async function searchFDContact(fdDomain, authHeader, phoneNumber) {
    phoneNumber = phoneNumber.trim();
    const phoneNumberArray = [phoneNumber, "+" + phoneNumber, "00" + phoneNumber];
    let query = ``;
    for (let index = 0; index < phoneNumberArray.length; index++) {
        const phoneNumber = phoneNumberArray[index];
        if (index == 0)
            query = `?query=%22phone:%27${encodeURIComponent(phoneNumber)}%27%20OR%20mobile:%27${encodeURIComponent(
                phoneNumber
            )}%27%22`;
        else {
            // snip off the last double quote and expand with another OR statement
            query = query.substring(0, query.length - 3);
            query += `%20OR%20phone:%27${encodeURIComponent(phoneNumber)}%27%20OR%20mobile:%27${encodeURIComponent(
                phoneNumber
            )}%27%22`;
        }
    }

    let url = `${getApiUrl(fdDomain)}/search/contacts${query}`;
    return await makeRequestWithRetry({
        method: "GET",
        url,
        headers: { 'Authorization': authHeader }
    });
}

async function createFDContact(fdDomain, authHeader, phoneNumber, newContactName) {
    console.log('[RC App] createFDContact');
    let url = `${getApiUrl(fdDomain)}/contacts`;

    let payload = {
        phone: phoneNumber,
        name: newContactName,
        unique_external_id: phoneNumber
    }

    return await makeRequestWithRetry({
        method: "POST",
        url,
        headers: { 'Authorization': authHeader },
        payload
    });
}

async function getTicketNoteById(fdDomain, authHeader, ticketId, noteId) {

    const resp = await getFDTicketNotes(fdDomain, authHeader, ticketId);
    const item = resp.find(item => item.id == noteId);
    return item;
}

async function getFDTicketNotes(fdDomain, authHeader, ticketId) {
    let url = `${getApiUrl(fdDomain)}/tickets/${ticketId}/conversations`;
    return await makeRequestWithRetry({ method: "GET", url, headers: { 'Authorization': authHeader } });
}

async function createFDTicket(fdDomain, authHeader, payload) {
    let url = `${getApiUrl(fdDomain)}/tickets`;
    console.log('[RC App] createFDTicket call api:', url, payload);
    return await makeRequestWithRetry({ method: "POST", url, payload, headers: { 'Authorization': authHeader } });
}

async function createFDTicketNote(fdDomain, authHeader, ticketId, note) {
    let payload = {};
    payload.private = true;
    if (note) payload.body = note;

    // when calling and leaving voicemail we do not have a note or recording link it seems...
    if (payload.body) {
        // Add the note and recordinglink as a ticket note. Ignoring subject input for now, we can update the ticket subject but costs additional API call (request limit)
        let url = `${getApiUrl(fdDomain)}/tickets/${ticketId}/notes`;
        console.log('[RC App] createFDTicketNote call api:', url, payload);
        return await makeRequestWithRetry({ method: "POST", url, payload, headers: { 'Authorization': authHeader } });
    }
}

async function updateFDTicketNote(fdDomain, authHeader, noteId, note) {
    let payload = {};
    payload.body = note;

    // Add the note and recordinglink as a ticket note. Ignoring subject input for now, we can update the ticket subject but costs additional API call (request limit)
    let url = `${getApiUrl(fdDomain)}/conversations/${noteId}`;
    console.log('[RC App] updateFDTicketNote call api:', url, payload);
    return await makeRequestWithRetry({ method: "PUT", url, payload, headers: { 'Authorization': authHeader } });
}

async function updateFDTicket(fdDomain, authHeader, ticketId, description) {
    let payload = {};
    payload.description = description.replace(/(\r\n|\n|\r)/gm, '<br>');

    // Add the note and recordinglink as a ticket note. Ignoring subject input for now, we can update the ticket subject but costs additional API call (request limit)
    let url = `${getApiUrl(fdDomain)}/tickets/${ticketId}`;
    console.log('[RC App] updateFDTicket call api:', url, payload);
    return await makeRequestWithRetry({ method: "PUT", url, payload, headers: { 'Authorization': authHeader } });
}

//#endregion


//#region Helper functions - Misc
function isEmpty(val) {
    return val === undefined || val === null || val.length <= 0 ? true : false;
}

function getLogActivityUrl(crmProduct, phoneProduct, userID, domain, version) {
    if (isEmpty(crmProduct) || isEmpty(phoneProduct) || isEmpty(userID) || isEmpty(domain) || isEmpty(version)) {
        console.error("Check your variables, one or more variable in getLogActivityUrl is invalid.");
        return null;
    } else {
        let beginURLProduction = "https://development.loyally.nl/licence-tracker/api/logactivity/v3";

        let URL =
            beginURLProduction +
            "?CrmProduct=" +
            crmProduct +
            "&PhoneProduct=" +
            phoneProduct +
            "&UserID=" +
            userID +
            "&Domain=" +
            domain +
            "&Version=" +
            version;
        return URL;
    }
}

function logActivity(user) {
    let result = null;
    const freshworksProduct = "Freshdesk";
    const telephonyPlatform = "RingcentralAppConnect";
    const currentVersion = "1.0.0";
    const url = getLogActivityUrl(freshworksProduct, telephonyPlatform, user.id, user.platformAdditionalInfo.fdDomain, currentVersion);


    return axios.post(url, user, { headers: { "Content-Type": "application/json; charset=utf-8" }, cache: false })
        .then(() => {
            console.log("[RC App] LogActivity Ok.");
        })
        .catch(error => {
            if (error.response && error.response.status === 409) {
                console.warn("[RC App] Not whitelisted for usage!");
                throw new Error("Unauthorized use of Freshdesk connector");
            }

            throw error; // Ensure other errors are also propagated
        });

}
//#endregion
exports.getBasicAuth = getBasicAuth;
exports.getAuthType = getAuthType;
exports.getUserInfo = getUserInfo;
exports.createCallLog = createCallLog;
exports.updateCallLog = updateCallLog;
exports.getCallLog = getCallLog;
exports.createMessageLog = createMessageLog;
exports.updateMessageLog = updateMessageLog;
exports.findContact = findContact;
exports.createContact = createContact;
exports.unAuthorize = unAuthorize;