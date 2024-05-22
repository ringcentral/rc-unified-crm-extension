const axios = require('axios');
const moment = require('moment');
const { parsePhoneNumber } = require('awesome-phonenumber');

// -----------------------------------------------------------------------------------------------
// ---TODO: Delete below mock entities and other relevant code, they are just for test purposes---
// -----------------------------------------------------------------------------------------------
let mockContact = null;
let mockCallLog = null;
let mockMessageLog = null;

function getAuthType() {
    return 'apiKey'; // Return either 'oauth' OR 'apiKey'
}

function getBasicAuth({ apiKey }) {
    return Buffer.from(`${apiKey}:`).toString('base64');
}

// CASE: If using OAuth
// function getOauthInfo() {
//     return {
//         clientId: process.env.TEST_CRM_CLIENT_ID,
//         clientSecret: process.env.TEST_CRM_CLIENT_SECRET,
//         accessTokenUri: process.env.TEST_CRM_TOKEN_URI,
//         redirectUri: process.env.TEST_CRM_REDIRECT_URI
//     }
// }

// CASE: If using OAuth and Auth server requires CLIENT_ID in token exchange request
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
async function getUserInfo({ authHeader, additionalInfo }) {
    // ------------------------------------------------------
    // ---TODO.1: Implement API call to retrieve user info---
    // ------------------------------------------------------

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
        id,
        name,
        timezoneName,
        timezoneOffset,
        platformAdditionalInfo: {}
    };

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

    //--------------------------------------------------------------
    //---CHECK.2: Open db.sqlite to check if user info is removed---
    //--------------------------------------------------------------
}

async function getContact({ user, authHeader, phoneNumber, overridingFormat }) {
    // ----------------------------------------
    // ---TODO.3: Implement contact matching---
    // ----------------------------------------

    const numberToQueryArray = [];
    numberToQueryArray.push(phoneNumber.replace(' ', '+'));
    // You can use parsePhoneNumber functions to further parse the phone number
    const foundContacts = [];
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
    //                 phone: numberToQuery,
    //                 additionalInfo: null
    //             })
    //         }
    //     }
    // }
    if (mockContact != null) {
        foundContacts.push(mockContact);
    }
    console.log(`found contacts... \n\n${JSON.stringify(foundContacts, null, 2)}`);
    //-----------------------------------------------------
    //---CHECK.3: In console, if contact info is printed---
    //-----------------------------------------------------
    return foundContacts;  //[{id, name, phone, additionalInfo}]
}

async function addCallLog({ user, contactInfo, authHeader, callLog, note, additionalSubmission, timezoneOffset, contactNumber }) {
    // ------------------------------------
    // ---TODO.4: Implement call logging---
    // ------------------------------------

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
    console.log(`adding call log... \n${JSON.stringify(callLog, null, 2)}`);
    console.log(`with note... \n${note}`);
    console.log(`with additional info... \n${JSON.stringify(additionalSubmission, null, 2)}`);
    mockCallLog = {
        id: 'testCallLogId',
        subject: callLog.customSubject,
        note,
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
    return addLogRes.data.id;
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

    //-------------------------------------------------------------------------------------
    //---CHECK.5: In extension, for a logged call, click edit to see if info is fetched ---
    //-------------------------------------------------------------------------------------
    return {
        subject: getLogRes.subject,
        note: getLogRes.note,
        additionalSubmission: {}
    }
}

async function updateCallLog({ user, existingCallLog, authHeader, recordingLink, subject, note }) {
    // ---------------------------------------
    // ---TODO.6: Implement call log update---
    // ---------------------------------------

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
    mockCallLog.note = note;
    const patchLogRes = {
        data: {
            id: mockCallLog.id
        }
    }
    //-----------------------------------------------------------------------------------------
    //---CHECK.6: In extension, for a logged call, click edit to see if info can be updated ---
    //-----------------------------------------------------------------------------------------
    return patchLogRes.data.id;
}

async function addMessageLog({ user, contactInfo, authHeader, message, additionalSubmission, recordingLink, timezoneOffset, contactNumber }) {
    // ---------------------------------------
    // ---TODO.7: Implement message logging---
    // ---------------------------------------

    // const postBody = {
    //     data: {
    //         subject: `[SMS] ${message.direction} SMS - ${message.from.name ?? ''}(${message.from.phoneNumber}) to ${message.to[0].name ?? ''}(${message.to[0].phoneNumber})`,
    //         body: `${message.direction} SMS - ${message.direction == 'Inbound' ? `from ${message.from.name ?? ''}(${message.from.phoneNumber})` : `to ${message.to[0].name ?? ''}(${message.to[0].phoneNumber})`} \n${!!message.subject ? `[Message] ${message.subject}` : ''} ${!!recordingLink ? `\n[Recording link] ${recordingLink}` : ''}\n\n--- Created via RingCentral CRM Extension`,
    //         type: 'Message'
    //     }
    // }
    // const addLogRes = await axios.post(
    //     `https://api.crm.com/activity`,
    //     postBody,
    //     {
    //         headers: { 'Authorization': authHeader }
    //     });
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
    return addLogRes.data.id;
}

// Used to update existing message log so to group message in the same day together
async function updateMessageLog({ user, contactInfo, existingMessageLog, message, authHeader, contactNumber }) {
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
        id: contactInfoRes.id,
        name: contactInfoRes.name
    }
}


exports.getAuthType = getAuthType;
exports.getBasicAuth = getBasicAuth;
exports.getUserInfo = getUserInfo;
exports.addCallLog = addCallLog;
exports.updateCallLog = updateCallLog;
exports.getCallLog = getCallLog;
exports.addMessageLog = addMessageLog;
exports.updateMessageLog = updateMessageLog;
exports.getContact = getContact;
exports.createContact = createContact;
exports.unAuthorize = unAuthorize;