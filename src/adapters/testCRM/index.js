/* eslint-disable no-control-regex */
/* eslint-disable no-param-reassign */
const axios = require('axios');
const moment = require('moment');
const { parsePhoneNumber } = require('awesome-phonenumber');
const { secondsToHoursMinutesSeconds } = require('../../lib/util');

// -----------------------------------------------------------------------------------------------
// ---TODO: Delete below mock entities and other relevant code, they are just for test purposes---
// -----------------------------------------------------------------------------------------------
let mockContact = null;
let mockCallLog = null;
let mockMessageLog = null;

function getAuthType() {
    return 'apiKey'; // Return either 'oauth' OR 'apiKey'
}

// Choose 1 of the following 3 functions, delete the rest. getBasicAuth is enabled just for testing

// CHOOSE: If using apiKey auth
function getBasicAuth({ apiKey }) {
    return Buffer.from(`${apiKey}:`).toString('base64');
}
exports.getBasicAuth = getBasicAuth;

// CHOOSE: If using OAuth
// async function getOauthInfo() {
//     return {
//         clientId: process.env.TEST_CRM_CLIENT_ID,
//         clientSecret: process.env.TEST_CRM_CLIENT_SECRET,
//         accessTokenUri: process.env.TEST_CRM_TOKEN_URI,
//         redirectUri: process.env.TEST_CRM_REDIRECT_URI
//     }
// }
// exports.getOauthInfo = getOauthInfo;

// CHOOSE: If using OAuth somehow uses query not body to pass code
// function getOverridingOAuthOption({ code }) {
//     return {
//         query: {
//             grant_type: 'authorization_code',
//             code,
//             client_id: process.env.TEST_OAUTH_CRM_CLIENT_ID,
//             client_secret: process.env.TEST_OAUTH_CRM_CLIENT_SECRET,
//             redirect_uri: process.env.TEST_OAUTH_CRM_REDIRECT_URI,
//         },
//         headers: {
//             Authorization: ''
//         }
//     }
// }
// exports.getOverridingOAuthOption = getOverridingOAuthOption;


// For params, if OAuth, then accessToken, refreshToken, tokenExpiry; If apiKey, then apiKey
// ------------
// - additionalInfo: contains custom additional fields on auth page (eg. username and password for redtail)
// ------------
// Optional input params:
// - oauth: tokenUrl, apiUrl, hostname
// - apiKey: hostname
async function getUserInfo({ authHeader, additionalInfo }) {
    // ------------------------------------------------------
    // ---TODO.1: Implement API call to retrieve user info---
    // ------------------------------------------------------
    try {
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
        const timezoneOffset = mockUserInfoResponse.data.time_zone_offset ?? null; // Optional. Whether or not you want to log with regards to the user's timezone. It will need to be converted to a format that CRM platform uses,
        return {
            successful: true,
            platformUserInfo: {
                id,
                name,
                timezoneName,
                timezoneOffset,
                platformAdditionalInfo: {}  // this should save whatever extra info you want to save against the user
            },
            returnMessage: {
                messageType: 'success',
                message: 'Connected to TestCRM.',
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
                                text: `TestCRM was unable to fetch information for the currently logged in user. Please check your permissions in TestCRM and make sure you have permission to access and read user information.`
                            }
                        ]
                    }
                ],
                ttl: 3000
            }
        }
    }
    //---------------------------------------------------------------------------------------------------
    //---CHECK.1: Open db.sqlite (might need to install certain viewer) to check if user info is saved---
    //---------------------------------------------------------------------------------------------------
}

async function unAuthorize({ user }) {
    // -----------------------------------------------------------------
    // ---TODO.2: Implement token revocation if CRM platform requires---
    // -----------------------------------------------------------------

    // const revokeUrl = 'https://api.crm.com/oauth/unauthorize';
    // const revokeBody = {
    //     token: user.accessToken
    // }
    // const accessTokenRevokeRes = await axios.post(
    //     revokeUrl,
    //     revokeBody,
    //     {
    //         headers: { 'Authorization': `Basic ${getBasicAuth({ apiKey: user.accessToken })}` }
    //     });
    await user.destroy();
    return {
        returnMessage: {
            messageType: 'success',
            message: 'Logged out of TestCRM',
            ttl: 1000
        }
    }

    //--------------------------------------------------------------
    //---CHECK.2: Open db.sqlite to check if user info is removed---
    //--------------------------------------------------------------
}

//  - phoneNumber: phone number in E.164 format
//  - overridingFormat: optional, if you want to override the phone number format
async function findContact({ user, authHeader, phoneNumber, overridingFormat, isExtension }) {
    // ----------------------------------------
    // ---TODO.3: Implement contact matching---
    // ----------------------------------------

    console.log(`phone number: ${phoneNumber}`)
    console.log(`is extesnion number? ${isExtension}`)
    const numberToQueryArray = [];
    if (isExtension) {
        numberToQueryArray.push(phoneNumber);
    }
    else {
        numberToQueryArray.push(phoneNumber.replace(' ', '+'));
    }
    // You can use parsePhoneNumber functions to further parse the phone number
    const matchedContactInfo = [];
    // for (var numberToQuery of numberToQueryArray) {
    //     const personInfo = await axios.get(
    //         `https://api.crm.com/contacts?query=number:${numberToQuery}`,
    //         {
    //             headers: { 'Authorization': authHeader }
    //         });
    //     if (personInfo.data.length > 0) {
    //         for (var result of personInfo.data) {
    //             foundContacts.push({
    //                 id: result.id,
    //                 name: result.name,
    //                 type: result.type,
    //                 phone: numberToQuery,
    //                 additionalInfo: null
    //             })
    //         }
    //     }
    // }
    if (mockContact != null) {
        matchedContactInfo.push(mockContact);
    }
    console.log(`found contacts... \n\n${JSON.stringify(matchedContactInfo, null, 2)}`);

    // If you want to support creating a new contact from the extension, below placeholder contact should be used
    matchedContactInfo.push({
        id: 'createNewContact',
        name: 'Create new contact...',
        additionalInfo: null,
        isNewContact: true
    });
    //-----------------------------------------------------
    //---CHECK.3: In console, if contact info is printed---
    //-----------------------------------------------------
    return {
        successful: true,
        matchedContactInfo,
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
    };  //[{id, name, phone, additionalInfo}]
}

// - contactInfo: { id, type, phoneNumber, name }
// - callLog: same as in https://developers.ringcentral.com/api-reference/Call-Log/readUserCallRecord
// - note: note submitted by user
// - additionalSubmission: all additional fields that are setup in manifest under call log page
async function createCallLog({ user, contactInfo, authHeader, callLog, note, additionalSubmission, aiNote, transcript }) {
    // ------------------------------------
    // ---TODO.4: Implement call logging---
    // ------------------------------------
    let body = '';
    if (user.userSettings?.addCallLogNote?.value ?? true) { body = upsertCallAgentNote({ body, note }); }
    if (user.userSettings?.addCallLogContactNumber?.value ?? true) { body = upsertContactPhoneNumber({ body, phoneNumber: contactInfo.phoneNumber, direction: callLog.direction }); }
    if (user.userSettings?.addCallLogResult?.value ?? true) { body = upsertCallResult({ body, result: callLog.result }); }
    if (user.userSettings?.addCallLogDuration?.value ?? true) { body = upsertCallDuration({ body, duration: callLog.duration }); }
    if (!!callLog.recording?.link && (user.userSettings?.addCallLogRecording?.value ?? true)) { body = upsertCallRecording({ body, recordingLink: callLog.recording.link }); }
    if (!!aiNote && (user.userSettings?.addCallLogAiNote?.value ?? true)) { body = upsertAiNote({ body, aiNote }); }
    if (!!transcript && (user.userSettings?.addCallLogTranscript?.value ?? true)) { body = upsertTranscript({ body, transcript }); }

    // const postBody = {
    //     subject: callLog.customSubject ?? `[Call] ${callLog.direction} Call ${callLog.direction === 'Outbound' ? 'to' : 'from'} ${contactInfo.name} [${contactInfo.phone}]`,
    //     body: `\nContact Number: ${contactInfo.phoneNumber}\nCall Result: ${callLog.result}\nNote: ${note}${callLog.recording ? `\n[Call recording link] ${callLog.recording.link}` : ''}\n\n--- Created via RingCentral App Connect`,
    //     type: 'PhoneCommunication',
    //     received_at: moment(callLog.startTime).toISOString()
    // }
    // const addLogRes = await axios.post(
    //     `https://api.crm.com/activity`,
    //     postBody,
    //     {
    //         headers: { 'Authorization': authHeader }
    //     });
    console.log(`adding call log... \n${JSON.stringify(callLog, null, 2)}`);
    console.log(`body... \n${body}`);
    console.log(`with additional info... \n${JSON.stringify(additionalSubmission, null, 2)}`);
    mockCallLog = {
        id: 'testCallLogId',
        subject: callLog.customSubject,
        note: body,
        contactName: contactInfo.name
    }
    const addLogRes = {
        data: {
            id: mockCallLog.id
        }
    }
    //----------------------------------------------------------------------------
    //---CHECK.4: Open db.sqlite and CRM website to check if call log is saved ---
    //----------------------------------------------------------------------------
    return {
        logId: addLogRes.data.id,
        returnMessage: {
            message: 'Call logged',
            messageType: 'success',
            ttl: 2000
        }
    };
}

async function upsertCallDisposition({ user, existingCallLog, authHeader, callDisposition }) {
    const existingLogId = existingCallLog.thirdPartyLogId;
    if (callDisposition?.dispositionItem) {
        // If has disposition item, check existence. If existing, update it, otherwise create it.
    }
    return {
        logId: existingLogId
    }
}

function upsertCallAgentNote({ body, note }) {
    if (!note) {
        return body;
    }
    const noteRegex = RegExp('- Agent note: ([\\s\\S]+?)\n');
    if (noteRegex.test(body)) {
        body = body.replace(noteRegex, `- Agent note: ${note}\n`);
    }
    else {
        body += `- Agent note: ${note}\n`;
    }
    return body;
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
function upsertCallDuration({ body, duration }) {
    const durationRegex = RegExp('- Duration: (.+?)\n');
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


async function getCallLog({ user, callLogId, authHeader }) {
    // -----------------------------------------
    // ---TODO.5: Implement call log fetching---
    // -----------------------------------------

    // const getLogRes = await axios.get(
    //     `https://api.crm.com/activity/${callLogId}`,
    //     {
    //         headers: { 'Authorization': authHeader }
    //     });

    const getLogRes = {
        subject: mockCallLog.subject,
        note: mockCallLog.note
    }
    const subject = getLogRes.subject;
    const note = getLogRes.note.split('- Agent note: ')[1].split('\n')[0];

    //-------------------------------------------------------------------------------------
    //---CHECK.5: In extension, for a logged call, click edit to see if info is fetched ---
    //-------------------------------------------------------------------------------------
    return {
        callLogInfo: {
            subject,
            note,
            dispositions:{
                testDispositionId: 'test disposition value'
            }
        },
        returnMessage: {
            message: 'Call log fetched.',
            messageType: 'success',
            ttl: 3000
        }
    }
}

// - note: note submitted by user
// - subject: subject submitted by user
// - startTime: more accurate startTime will be patched to this update function shortly after the call ends
// - duration: more accurate duration will be patched to this update function shortly after the call ends
// - result: final result will be patched to this update function shortly after the call ends
// - recordingLink: recordingLink updated from RingCentral. It's separated from createCallLog because recordings are not generated right after a call. It needs to be updated into existing call log
async function updateCallLog({ user, existingCallLog, authHeader, recordingLink, subject, note, startTime, duration, result, aiNote, transcript }) {
    // ---------------------------------------
    // ---TODO.6: Implement call log update---
    // ---------------------------------------
    let body = mockCallLog.note;
    if (!!note && (user.userSettings?.addCallLogNote?.value ?? true)) { body = upsertCallAgentNote({ body, note }); }
    if (!!duration && (user.userSettings?.addCallLogDuration?.value ?? true)) { body = upsertCallDuration({ body, duration }); }
    if (!!result && (user.userSettings?.addCallLogResult?.value ?? true)) { body = upsertCallResult({ body, result }); }
    if (!!recordingLink && (user.userSettings?.addCallLogRecording?.value ?? true)) { body = upsertCallRecording({ body, recordingLink: decodeURIComponent(recordingLink) }); }
    if (!!aiNote && (user.userSettings?.addCallLogAiNote?.value ?? true)) { body = upsertAiNote({ body, aiNote }); }
    if (!!transcript && (user.userSettings?.addCallLogTranscript?.value ?? true)) { body = upsertTranscript({ body, transcript }); }

    // const existingLogId = existingCallLog.thirdPartyLogId;
    // const getLogRes = await axios.get(
    //     `https://api.crm.com/activity/${existingLogId}`,
    //     {
    //         headers: { 'Authorization': authHeader }
    //     });
    // const originalNote = getLogRes.data.body;
    // let patchBody = {};

    // patchBody = {
    //     data: {
    //         subject: subject,
    //         body: note
    //     }
    // }
    // const patchLogRes = await axios.patch(
    //     `https://api.crm.com/activity/${existingLogId}`,
    //     patchBody,
    //     {
    //         headers: { 'Authorization': authHeader }
    //     });
    mockCallLog.subject = subject;
    mockCallLog.note = body;
    const patchLogRes = {
        data: {
            id: mockCallLog.id
        }
    }
    //-----------------------------------------------------------------------------------------
    //---CHECK.6: In extension, for a logged call, click edit to see if info can be updated ---
    //-----------------------------------------------------------------------------------------
    return {
        updatedNote: note,
        returnMessage: {
            message: 'Call log updated.',
            messageType: 'success',
            ttl: 2000
        }
    };
}

// - contactInfo: { id, type, phoneNumber, name }
// - message : same as in https://developers.ringcentral.com/api-reference/Message-Store/readMessage
// - recordingLink: recording link of voice mail
// - additionalSubmission: all additional fields that are setup in manifest under call log page
async function createMessageLog({ user, contactInfo, authHeader, message, additionalSubmission, recordingLink, faxDocLink }) {
    // ---------------------------------------
    // ---TODO.7: Implement message logging---
    // ---------------------------------------

    // const postBody = {
    //     data: {
    //         subject: `[SMS] ${message.direction} SMS - ${message.from.name ?? ''}(${message.from.phoneNumber}) to ${message.to[0].name ?? ''}(${message.to[0].phoneNumber})`,
    //         body: `${message.direction} SMS - ${message.direction == 'Inbound' ? `from ${message.from.name ?? ''}(${message.from.phoneNumber})` : `to ${message.to[0].name ?? ''}(${message.to[0].phoneNumber})`} \n${!!message.subject ? `[Message] ${message.subject}` : ''} ${!!recordingLink ? `\n[Recording link] ${recordingLink}` : ''}\n\n--- Created via RingCentral App Connect`,
    //         type: 'Message'
    //     }
    // }
    // const addLogRes = await axios.post(
    //     `https://api.crm.com/activity`,
    //     postBody,
    //     {
    //         headers: { 'Authorization': authHeader }
    //     });
    const messageType = recordingLink ? 'Voicemail' : (faxDocLink ? 'Fax' : 'SMS');
    console.log(`adding message log... \n\n${JSON.stringify(message, null, 2)}`);
    mockMessageLog = {
        id: 'testMessageLogId'
    }
    const addLogRes = {
        data: {
            id: mockMessageLog.id
        }
    }
    //-------------------------------------------------------------------------------------------------------------
    //---CHECK.7: For single message logging, open db.sqlite and CRM website to check if message logs are saved ---
    //-------------------------------------------------------------------------------------------------------------
    return {
        logId: addLogRes.data.id,
        returnMessage: {
            message: 'Message logged',
            messageType: 'success',
            ttl: 1000
        }
    };
}

// Used to update existing message log so to group message in the same day together
async function updateMessageLog({ user, contactInfo, existingMessageLog, message, authHeader }) {
    // ---------------------------------------
    // ---TODO.8: Implement message logging---
    // ---------------------------------------

    // const existingLogId = existingMessageLog.thirdPartyLogId;
    // const getLogRes = await axios.get(
    //     `https://api.crm.com/activity/${existingLogId}`,
    //     {
    //         headers: { 'Authorization': authHeader }
    //     });
    // const originalNote = getLogRes.data.body;
    // const updateNote = orginalNote.replace();

    // const patchBody = {
    //     data: {
    //         body: updateNote,
    //     }
    // }
    // const updateLogRes = await axios.patch(
    //     `https://api.crm.com/activity`,
    //     patchBody,
    //     {
    //         headers: { 'Authorization': authHeader }
    //     });
    console.log(`update message log with... \n\n${JSON.stringify(message, null, 2)}`);

    //---------------------------------------------------------------------------------------------------------------------------------------------
    //---CHECK.8: For multiple messages or additional message during the day, open db.sqlite and CRM website to check if message logs are saved ---
    //---------------------------------------------------------------------------------------------------------------------------------------------
}

async function createContact({ user, authHeader, phoneNumber, newContactName, newContactType }) {
    // ----------------------------------------
    // ---TODO.9: Implement contact creation---
    // ----------------------------------------

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
    // const contactInfoRes = await axios.post(
    //     `https://api.crm.com/contacts`,
    //     postBody,
    //     {
    //         headers: { 'Authorization': authHeader }
    //     }
    // );
    mockContact = {
        id: 'testContactId',
        name: newContactName,
        type: newContactType,
        phone: phoneNumber,
        additionalInfo: {
            associatedDeal: [
                {
                    const: 'csA351',
                    title: 'Christmas special A351'
                },
                {
                    const: 'eA22',
                    title: 'Easter A22'
                },
                {
                    const: 'aC92',
                    title: 'Anniversary C92'
                }
            ],
            address: ''
        }
    }

    const contactInfoRes = {
        data: {
            id: mockContact.id,
            name: mockContact.name
        }
    }

    //--------------------------------------------------------------------------------
    //---CHECK.9: In extension, try create a new contact against an unknown number ---
    //--------------------------------------------------------------------------------
    return {
        contactInfo: {
            id: contactInfoRes.id,
            name: contactInfoRes.name
        },
        returnMessage: {
            message: `Contact created.`,
            messageType: 'success',
            ttl: 2000
        }
    }
}


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