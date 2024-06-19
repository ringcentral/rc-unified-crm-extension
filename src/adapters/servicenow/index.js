const axios = require('axios');
const moment = require('moment');
const { parsePhoneNumber } = require('awesome-phonenumber');
// const { saveUserInfo} = require('../core/auth');
// const { UserModel } = require('../../models/userModel');
// const { UserModel1 } = require('../models/userModel');
// const { ConfigModel1 } = require('../models/configModel');
// const { CallLogModel1 } = require('../models/callLogModel');
// const { MessageLogModel1 } = require('../models/messageLogModel');

// -----------------------------------------------------------------------------------------------
// ---TODO: Delete below mock entities and other relevant code, they are just for test purposes---
// -----------------------------------------------------------------------------------------------
let mockContact = null;
let mockCallLog = null;
let mockMessageLog = null;

// async function initDB()
// {
//     await UserModel1.sync({ force: true,alter:true });
//     await CallLogModel1.sync({ force: true,alter:true });
//     await MessageLogModel1.sync({ force: true,alter:true });
//     await ConfigModel1.sync({ force: true,alter:true });
// }
// initDB();

function getAuthType() {
    return 'oauth'; // Return either 'oauth' OR 'apiKey'
}

function getBasicAuth({ apiKey }) {
    return Buffer.from(`${apiKey}:`).toString('base64');
}

// CASE: If using OAuth
function getOauthInfo() {
    return {
        clientId: process.env.SERVICE_NOW_CLIENT_ID,
        clientSecret: process.env.SERVICE_NOW_CLIENT_SECRET,
        accessTokenUri: process.env.SERVICE_NOW_TOKEN_URL,
        redirectUri: process.env.SERVICE_NOW_CRM_REDIRECT_URI
    }
}

// // CASE: If using OAuth and Auth server requires CLIENT_ID in token exchange request
// function getOverridingOAuthOption({ code }) {
//     console.log("code ", code)
//     return {
//         query: {
//             grant_type: 'authorization_code',
//             code,
//             client_id: process.env.SERVICE_NOW_CLIENT_ID,
//             client_secret: process.env.SERVICE_NOW_CLIENT_SECRET,
//             redirect_uri: process.env.SERVICE_NOW_CRM_REDIRECT_URI,
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

    // const checkActiveUsers = await UserModel1.findAndCountAll({
    //     where:{
    //         license_key_id:process.env.license_key_id
    //     },
    //     // include:[{
    //     //     model:ConfigModel1,
    //     //     required:true,
    //     //     attributes:["max_allowed_users"]
    //     // }]
    // })
    // // const getMaxUsersCount = await ConfigModel1.findOne({
    // //     where:{
    // //         license_key_id
    // //     }
    // // })
    // console.log("checkActiveUsers",checkActiveUsers);
    

    const userInfoResponse = await axios.get(`https://${process.env.SERVICE_NOW_INSTANCE_ID}.service-now.com/api/${process.env.SERVICE_NOW_USER_DETAILS_PATH}`, {
        headers: {
            'Authorization': authHeader
        }
    });
    
    const id = userInfoResponse.data.result.id;
    const name = userInfoResponse.data.result.user_name;
    const timezoneName = userInfoResponse.data.result.time_zone ?? ''; // Optional. Whether or not you want to log with regards to the user's timezone
    const timezoneOffset = userInfoResponse.data.result.time_zone_offset ?? null; // Optional. Whether or not you want to log with regards to the user's timezone. It will need to be converted to a format that CRM platform uses,
    // await saveUserInfo(userInfoResponse.data.result);
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

async function findContact({ user, authHeader, phoneNumber, overridingFormat }) {
    // ----------------------------------------
    // ---TODO.3: Implement contact matching---
    // ----------------------------------------

    const numberToQueryArray = [];

    numberToQueryArray.push(phoneNumber.trim());

    const categorySelection = await axios.get(
        `https://${process.env.SERVICE_NOW_INSTANCE_ID}.service-now.com/api/now/table/sys_choice?sysparm_query=name=incident^element=category&sysparm_fields=sys_id,label,value`,
        {
            headers: { 'Authorization':  authHeader }
        });

    const cateogries = categorySelection.data.result.length > 0 ? categorySelection.data.result.map(m => { return { const: m.sys_id, title: m.label } }) : null;
    
    const subcategorySelection = await axios.get(
        `https://${process.env.SERVICE_NOW_INSTANCE_ID}.service-now.com/api/now/table/sys_choice?sysparm_query=name=incident^element=subcategory&sysparm_fields=sys_id,label,dependent_value`,
        {
            headers: { 'Authorization':  authHeader }
        });
    
    const subcateogries = subcategorySelection.data.result.length > 0 ? subcategorySelection.data.result.map(m => { return { const: m.sys_id, title: m.label } }) : null;

    const impactSelection = [{ const: 1, title: "High" }, { const: 2, title: "Medium" }, { const: 3, title: "Low" }]
    const urgencySelection = [{ const: 1, title: "High" }, { const: 2, title: "Medium" }, { const: 3, title: "Low" }]
    

    // You can use parsePhoneNumber functions to further parse the phone number
    const foundContacts = [];


    for (var numberToQuery of numberToQueryArray) {
        const personInfo = await axios.get(
            `https://${process.env.SERVICE_NOW_INSTANCE_ID}.service-now.com/api/now/contact?sysparm_query=phoneLIKE${numberToQuery}`,
            {
                headers: { 'Authorization':  authHeader }
            });

        if (personInfo.data.result.length > 0) {
            for (var result of personInfo.data.result) {
                foundContacts.push({
                    id: result.sys_id,
                    name: result.name,
                    phone: numberToQuery,
                    additionalInfo: {category: cateogries, subcategory: subcateogries, impact: impactSelection, urgency: urgencySelection}
                })
            }
        }
    }

    foundContacts.push({
        id: 'createNewContact',
        name: 'Create new contact...',
        additionalInfo: null,
        isNewContact: true
    });

    //-----------------------------------------------------
    //---CHECK.3: In console, if contact info is printed---
    //-----------------------------------------------------
    return foundContacts;  //[{id, name, phone, additionalInfo}]
}

async function createCallLog({ user, contactInfo, authHeader, callLog, note, additionalSubmission, timezoneOffset, contactNumber }) {
    // ------------------------------------
    // ---TODO.4: Implement call logging---
    // ------------------------------------

    const caller_id = await axios.get(`https://${process.env.SERVICE_NOW_INSTANCE_ID}.service-now.com/api/${process.env.SERVICE_NOW_USER_DETAILS_PATH}`, {
        headers: {
            'Authorization': authHeader
        }
    });

    const postBody = {
        short_description: callLog.customSubject ?? `[Call] ${callLog.direction} Call ${callLog.direction === 'Outbound' ? 'to' : 'from'} ${contactInfo.name} [${contactInfo.phone}]`,
        description: `\nContact Number: ${contactNumber}\nCall Result: ${callLog.result}\nNote: ${note}${callLog.recording ? `\n[Call recording link] ${callLog.recording.link}` : ''}\n\n--- Created via RingCentral CRM Extension`,
        contact_type: "Phone",
        caller_id: caller_id.data.result.id
    }

    if (additionalSubmission && additionalSubmission.category){
        const categorySelection = await axios.get(
            `https://${process.env.SERVICE_NOW_INSTANCE_ID}.service-now.com/api/now/table/sys_choice?sysparm_query=name=incident^element=category^sys_id=${additionalSubmission.category}&sysparm_fields=sys_id,label,value`,
            {
                headers: { 'Authorization':  authHeader }
            });
    
        const returnedCateogry = categorySelection.data.result.length > 0 ? categorySelection.data.result[0].value : null;
        postBody.category = returnedCateogry;

        if (additionalSubmission.subcategory) {
            const subcategorySelection = await axios.get(
                `https://${process.env.SERVICE_NOW_INSTANCE_ID}.service-now.com/api/now/table/sys_choice?sysparm_query=name=incident^element=subcategory^sys_id=${additionalSubmission.subcategory}&sysparm_fields=sys_id,value,dependent_value`,
                {
                    headers: { 'Authorization':  authHeader }
                });
            
            const returnedSubcateogry = subcategorySelection.data.result.length > 0 ? subcategorySelection.data.result[0].value : null;

            postBody.subcategory = returnedSubcateogry;
        }
        
    }

    postBody.impact = (additionalSubmission && additionalSubmission.impact) ? additionalSubmission.impact : 3;
    postBody.urgency = (additionalSubmission && additionalSubmission.urgency) ? additionalSubmission.urgency : 3;

    const addLogRes = await axios.post(
        `https://${process.env.SERVICE_NOW_INSTANCE_ID}.service-now.com/api/now/table/incident`,
        postBody,
        {
            headers: { 'Authorization': authHeader }
        });

    //----------------------------------------------------------------------------
    //---CHECK.4: Open db.sqlite and CRM website to check if call log is saved ---
    //----------------------------------------------------------------------------
    return addLogRes.data.result.sys_id;
}

async function getCallLog({ user, callLogId, authHeader }) {
    // -----------------------------------------
    // ---TODO.5: Implement call log fetching---
    // -----------------------------------------

    const getLogRes = await axios.get(
        `https://${process.env.SERVICE_NOW_INSTANCE_ID}.service-now.com/api/now/table/incident/${callLogId}`,
        {
            headers: { 'Authorization': authHeader }
        });

    //-------------------------------------------------------------------------------------
    //---CHECK.5: In extension, for a logged call, click edit to see if info is fetched ---
    //-------------------------------------------------------------------------------------
    return {
        subject: getLogRes.data.result.short_description,
        note: getLogRes.data.result.description,
        additionalSubmission: {}
    }
}

async function updateCallLog({ user, existingCallLog, authHeader, recordingLink, subject, note }) {
    // ---------------------------------------
    // ---TODO.6: Implement call log update---
    // ---------------------------------------

    const existingLogId = existingCallLog.thirdPartyLogId;
    const getLogRes = await axios.get(
        `https://${process.env.SERVICE_NOW_INSTANCE_ID}.service-now.com/api/now/table/incident/${existingLogId}`,
        {
            headers: { 'Authorization': authHeader }
        });
    const originalNote = getLogRes.data.result.description;
    let patchBody = {};

    patchBody = {
        data: {
            short_description: subject,
            description: recordingLink ? note + `\nCall Recording Link: \n${recordingLink}` : note
        }
    }
    const patchLogRes = await axios.patch(
        `https://${process.env.SERVICE_NOW_INSTANCE_ID}.service-now.com/api/now/table/incident/${existingLogId}`,
        patchBody,
        {
            headers: { 'Authorization': authHeader }
        });

    //-----------------------------------------------------------------------------------------
    //---CHECK.6: In extension, for a logged call, click edit to see if info can be updated ---
    //-----------------------------------------------------------------------------------------
    return patchLogRes.data.result.sys_id;
}

async function createMessageLog({ user, contactInfo, authHeader, message, additionalSubmission, recordingLink, faxDocLink }) { // contactNumber is now ContactInfo.phoneNumber
    // ---------------------------------------
    // ---TODO.7: Implement message logging---
    // ---------------------------------------

    const caller_id = await axios.get(`https://${process.env.SERVICE_NOW_INSTANCE_ID}.service-now.com/api/${process.env.SERVICE_NOW_USER_DETAILS_PATH}`, {
        headers: {
            'Authorization': authHeader
        }
    });
    
    const postBody = {
        data: {
            short_description: `[SMS] ${message.direction} SMS - ${message.from.name ?? ''}(${message.from.phoneNumber}) to ${message.to[0].name ?? ''}(${message.to[0].phoneNumber})`,
            description: `${message.direction} SMS - ${message.direction == 'Inbound' ? `from ${message.from.name ?? ''}(${message.from.phoneNumber})` : `to ${message.to[0].name ?? ''}(${message.to[0].phoneNumber})`} \n${!!message.subject ? `[Message] ${message.subject}` : ''} ${!!recordingLink ? `\n[Recording link] ${recordingLink}` : ''}\n\n--- Created via RingCentral CRM Extension`,
            contact_type: "Chat",
            caller_id: caller_id.data.result.id
        }
    }
    const addLogRes = await axios.post(
        `https://${process.env.SERVICE_NOW_INSTANCE_ID}.service-now.com/api/now/table/incident`,
        postBody,
        {
            headers: { 'Authorization': authHeader }
        });

    //-------------------------------------------------------------------------------------------------------------
    //---CHECK.7: For single message logging, open db.sqlite and CRM website to check if message logs are saved ---
    //-------------------------------------------------------------------------------------------------------------
    return addLogRes.data.result.sys_id;
}

// Used to update existing message log so to group message in the same day together
async function updateMessageLog({ user, contactInfo, existingMessageLog, message, authHeader, contactNumber }) {
    // ---------------------------------------
    // ---TODO.8: Implement message logging---
    // ---------------------------------------

    const existingLogId = existingMessageLog.thirdPartyLogId;
    const getLogRes = await axios.get(
        `https://${process.env.SERVICE_NOW_INSTANCE_ID}.service-now.com/api/now/table/incident/${existingLogId}`,
        {
            headers: { 'Authorization': authHeader }
        });
    const originalNote = getLogRes.data.body;
    const updateNote = orginalNote.replace();

    const patchBody = {
        data: {
            body: updateNote,
        }
    }
    const updateLogRes = await axios.patch(
        `https://${process.env.SERVICE_NOW_INSTANCE_ID}.service-now.com/api/now/table/incident/${existingLogId}`,
        patchBody,
        {
            headers: { 'Authorization': authHeader }
        });

    //---------------------------------------------------------------------------------------------------------------------------------------------
    //---CHECK.8: For multiple messages or additional message during the day, open db.sqlite and CRM website to check if message logs are saved ---
    //---------------------------------------------------------------------------------------------------------------------------------------------
}

async function createContact({ user, authHeader, phoneNumber, newContactName, newContactType }) {
    // ----------------------------------------
    // ---TODO.9: Implement contact creation---
    // ----------------------------------------

    const account = await axios.get(`https://${process.env.SERVICE_NOW_INSTANCE_ID}.service-now.com/api/now/account`, {
        headers: {
            'Authorization': authHeader
        }
    });

    const postBody = {
        name: newContactName,
        phone: phoneNumber,
        type: newContactType,
        account: account.data.result[0].sys_id
    }

    const contactInfoRes = await axios.post(
        `https://${process.env.SERVICE_NOW_INSTANCE_ID}.service-now.com/api/now/contact`,
        postBody,
        {
            headers: { 'Authorization': authHeader }
        }
    );

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