const axios = require('axios');
const moment = require('moment');
const url = require('url');
const { parsePhoneNumber } = require('awesome-phonenumber');

// -----------------------------------------------------------------------------------------------
// ---TODO: Delete below mock entities and other relevant code, they are just for test purposes---
// -----------------------------------------------------------------------------------------------
let mockContact = null;
let mockCallLog = null;
let mockMessageLog = null;

function getAuthType() {
    return 'oauth'; 
}


function getOauthInfo() {
    return {
        clientId: process.env.NETSUITE_CRM_CLIENT_ID,
        clientSecret: process.env.NETSUITE_CRM_CLIENT_SECRET,
        accessTokenUri: process.env.NETSUITE_CRM_TOKEN_URI,
        redirectUri: process.env.NETSUITE_CRM_REDIRECT_URI
    }
}

async function getUserInfo({ authHeader, additionalInfo }) {
    // ---TODO.1: Implement API call to retrieve user info---
    const mockUserInfoResponse = {
        data: {
            id: '-5',
            name: 'Cathy Cadigan'
        }
    }
    const id = mockUserInfoResponse.data.id;
    const name = mockUserInfoResponse.data.name;
    const timezoneName = mockUserInfoResponse.data.time_zone ?? ''; 
    const timezoneOffset = mockUserInfoResponse.data.time_zone_offset ?? null; 
    return {
        id,
        name,
        timezoneName,
        timezoneOffset,
        platformAdditionalInfo: {
            email: 'pratyusha.mudrakarta@ringcentral.com'
        }
    };
}

async function unAuthorize({ user }) {
    const revokeUrl = `https://${user.hostname.split(".")[0]}.suitetalk.api.netsuite.com/services/rest/auth/oauth2/v1/revoke`;
    const basicAuthHeader = Buffer.from(`${process.env.NETSUITE_CRM_CLIENT_ID}:${process.env.NETSUITE_CRM_CLIENT_SECRET}`).toString('base64');
    const refreshTokenParams = new url.URLSearchParams({
        token: user.refreshToken
    });
    const accessTokenRevokeRes = await axios.post(
        revokeUrl,
        refreshTokenParams,
        {
            headers: { 'Authorization': `Basic ${basicAuthHeader}` }
        });
    console.log(`Access and Refresh Token is revoked for user ${user.id}...`);
    await user.destroy();
}

async function getContact({ user, authHeader, phoneNumber, overridingFormat }) {
    console.log(phoneNumber);
    const numberToQueryArray = [];
    numberToQueryArray.push(phoneNumber.replace(' ', '+'));
    const foundContacts = [];
    for (var numberToQuery of numberToQueryArray) {
        console.log({ numberToQuery });
        if (numberToQuery!=='undefined' && numberToQuery!==null && numberToQuery!=='') {
            const personInfo = await axios.post(
                `https://${user.hostname.split(".")[0]}.suitetalk.api.netsuite.com/services/rest/query/v1/suiteql`,
                {
                    q: `SELECT id,firstname,middlename,lastname FROM contact WHERE phone LIKE ${numberToQuery}`
                },
                {
                    headers: { 'Authorization': authHeader, 'Content-Type': 'application/json', 'Prefer': 'transient' }
                });
            console.log(personInfo);
            if (personInfo.data.items.length > 0) {
                for (var result of personInfo.data.items) {
                    let firstName = result.firstname ?? '';
                    let middleName = result.middlename ?? '';
                    let lastName = result.lastname ?? '';
                    foundContacts.push({
                        id: result.id,
                        name: `${firstName} ${middleName} ${lastName}`,
                        phone: numberToQuery,
                        additionalInfo: null
                    })
                }
            }
        }
    }
    if (mockContact != null) {
        foundContacts.push(mockContact);
    }
    console.log(`found netsuite contacts... \n\n${JSON.stringify(foundContacts, null, 2)}`);
    return foundContacts;
}

async function addCallLog({ user, contactInfo, authHeader, callLog, note, additionalSubmission, timezoneOffset, contactNumber }) {  
    const originalMessage = note;
    const temporedMessage = originalMessage + generateRandomString(20);
    const title = callLog.customSubject ?? `${callLog.direction} Call ${callLog.direction === 'Outbound' ? 'to' : 'from'} ${contactInfo.name}`;
    console.log({originalMessage, temporedMessage});
    const postBody = {
        title: title,
        phone: contactNumber || '',
        priority: "MEDIUM",
        startDate: moment(callLog.startTime).toISOString(),
        message: temporedMessage,
    }
    console.log(`adding call log... \n${JSON.stringify(callLog, null, 2)}`);
    console.log(`with note... \n${note}`);
    console.log(`with additional info... \n${JSON.stringify(additionalSubmission, null, 2)}`);
    
    const addLogRes = await axios.post(
        `https://${user.hostname.split(".")[0]}.suitetalk.api.netsuite.com/services/rest/record/v1/phonecall`,
        postBody,
        {
            headers: { 'Authorization': authHeader }
        });
    const phoneCallResponse = await axios.post(
        `https://${user.hostname.split(".")[0]}.suitetalk.api.netsuite.com/services/rest/query/v1/suiteql`,
        {
            q: `SELECT * FROM PhoneCall WHERE title = '${title}' AND message = '${temporedMessage}'`
        },
        {
            headers: { 'Authorization': authHeader, 'Content-Type': 'application/json', 'Prefer': 'transient' }
        });
    let callLogId = null;
    if (phoneCallResponse.data.items.length > 0) {
         callLogId = phoneCallResponse.data.items[0].id;
    }
    console.log(`call log id... \n${callLogId}`);
    await axios.patch(`https://${user.hostname.split(".")[0]}.suitetalk.api.netsuite.com/services/rest/record/v1/phoneCall/${callLogId}`,
        {
            message: originalMessage
        },
        {
            headers: { 'Authorization': authHeader }
        });
    return callLogId;
}

async function getCallLog({ user, callLogId, authHeader }) {
    console.log({ callLogId });
    const getLogRes = await axios.get(`https://${user.hostname.split(".")[0]}.suitetalk.api.netsuite.com/services/rest/record/v1/phonecall/${callLogId}`,
        {
            headers: { 'Authorization': authHeader }
        });
    return {
        subject: getLogRes.data.title,
        note: getLogRes.data?.message??'',
        additionalSubmission: {}
    }
}

async function updateCallLog({ user, existingCallLog, authHeader, recordingLink, subject, note }) {
    console.log({ user, existingCallLog, authHeader, recordingLink, subject, note });
    const existingLogId = existingCallLog.thirdPartyLogId;
    const patchLogRes = await axios.patch(
        `https://${user.hostname.split(".")[0]}.suitetalk.api.netsuite.com/services/rest/record/v1/phoneCall/${existingLogId}`,
        {
            title: subject,
            message: note
        },
        {
            headers: { 'Authorization': authHeader }
        });
}

async function addMessageLog({ user, contactInfo, authHeader, message, additionalSubmission, recordingLink, timezoneOffset, contactNumber }) {
    console.log("In Add message log");
    console.log({ user, contactInfo, authHeader, message, additionalSubmission, recordingLink, timezoneOffset, contactNumber });
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
async function updateMessageLog({user, contactInfo, existingMessageLog, message, authHeader}){
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
    const nameParts = splitName(newContactName);
    console.log({ message: 'NetSuite Create contact', phoneNumber, newContactName, newContactType });
    const payLoad = {
        firstName: nameParts.firstName,
        middleName: nameParts.middleName,
        lastName: nameParts.lastName,
        phone: phoneNumber || ''
    };
    const createContactRes = await axios.post(
        `https://${user.hostname.split(".")[0]}.suitetalk.api.netsuite.com/services/rest/record/v1/contact`,
         payLoad
        ,
        {
            headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' }
        });
    return { };
}

function splitName(fullName) {
    const parts = fullName.trim().split(/\s+/); // Split by one or more spaces
    const firstName = parts.shift() || "";
    const lastName = parts.pop() || "";
    const middleName = parts.join(" ");
    return { firstName, middleName, lastName };
}

function generateRandomString(length) {
    let result = '';
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const charactersLength = characters.length;
    let counter = 0;
    while (counter < length) {
      result += characters.charAt(Math.floor(Math.random() * charactersLength));
      counter += 1;
    }
    return result;
}


exports.getAuthType = getAuthType;
exports.getOauthInfo = getOauthInfo;
exports.getUserInfo = getUserInfo;
exports.addCallLog = addCallLog;
exports.updateCallLog = updateCallLog;
exports.getCallLog = getCallLog;
exports.addMessageLog = addMessageLog;
exports.updateMessageLog = updateMessageLog;
exports.getContact = getContact;
exports.createContact = createContact;
exports.unAuthorize = unAuthorize;