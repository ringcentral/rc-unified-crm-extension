const axios = require('axios');
const { UserModel } = require('../models/userModel');
const moment = require('moment');
const { parsePhoneNumber } = require('awesome-phonenumber');

// To think: exactly same data from client-side to here?

const crmName = 'daCrm';

function getAuthType() {
    return 'oauth';
}

function getOauthInfo() {
    return {
        clientId: process.env.CLIENT_ID,
        clientSecret: process.env.CLIENT_SECRET,
        accessTokenUri: process.env.ACCESS_TOKEN_URI,
        redirectUri: process.env.REDIRECT_URI
    }
}

async function getUserInfo({ authHeader }) {
    const userInfoResponse = await axios.get('https://api.crm.com/currentUser', {
        headers: {
            'Authorization': authHeader
        }
    });
    return {
        id: userInfoResponse.data.id,
        name: userInfoResponse.data.name,
        timezoneName: userInfoResponse.data.timezone,
        timezoneOffset: userInfoResponse.data.timezoneOffset,
        additionalInfo: {}
    };
}

async function saveUserOAuthInfo({ id, name, hostname, accessToken, refreshToken, tokenExpiry, rcUserNumber, timezoneName, timezoneOffset, additionalInfo }) {
    await UserModel.create({
        id,
        name,
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

async function unAuthorize({ id }) {
    const user = await UserModel.findOne(
        {
            where: {
                id,
                platform: crmName
            }
        });
    const revokeUrl = 'https://api.crm.com/oauth/deauthorize';
    const revokeBody = { id };
    const accessTokenRevokeRes = await axios.post(
        revokeUrl,
        revokeBody,
        {
            headers: { 'Authorization': `Bearer ${user.accessToken}` }
        });
    await user.destroy();
}

async function getCallLog({ user, callLogId, authHeader }) {
    const getLogRes = await axios.get(
        `https://api.crm.com/activity/${callLogId}`,
        {
            headers: { 'Authorization': authHeader }
        });
    return {
        subject: getLogRes.data.subject,
        note: getLogRes.data.note,
        additionalSubmission: {
            matterId: getLogRes.data.deal?.id
        }
    }
}

async function addCallLog({ user, contactInfo, authHeader, callLog, note, additionalSubmission, timezoneOffset, contactNumber }) {
    const postBody = {}
    if (!!additionalSubmission?.dealId) {
        postBody.data['dealId'] = { id: additionalSubmission.dealId };
    }
    const addLogRes = await axios.post(
        `https://api.crm.com/activity`,
        postBody,
        {
            headers: { 'Authorization': authHeader }
        });
    return addLogRes.data.id;
}

async function updateCallLog({ user, existingCallLog, authHeader, recordingLink, logInfo, note }) {
    const getLogRes = await axios.get(
        `https://api.crm.com/activity/${existingClioLogId}`,
        {
            headers: { 'Authorization': authHeader }
        });
    let logBody = getLogRes.data.body;
    //TODO: update log body
    const patchLogRes = await axios.patch(
        `https://${user.hostname}/api/v4/communications/${existingClioLogId}.json`,
        logBody,
        {
            headers: { 'Authorization': authHeader }
        });
    return patchLogRes.data.id;
}

async function addMessageLog({ user, contactInfo, authHeader, message, additionalSubmission, recordingLink, timezoneOffset, contactNumber }) {
    const postBody = {}
    if (!!additionalSubmission?.dealId) {
        postBody.data['dealId'] = { id: additionalSubmission.dealId };
    }
    const addLogRes = await axios.post(
        `https://api.crm.com/activity`,
        postBody,
        {
            headers: { 'Authorization': authHeader }
        });
    return addLogRes.data.id;
}

async function getContact({ user, authHeader, phoneNumber, overridingFormat }) {
    const matchedContacts = [];
    const numberToQueryArray = [];
    for (const numberToQuery of numberToQueryArray) {
        const contactInfoResponse = await axios.get(
            `https://api.crm.com/contact?type=Person&query=${numberToQuery}&fields=id,name,title,company`,
            {
                headers: { 'Authorization': authHeader }
            });
        if (contactInfoResponse.data.length > 0) {
            for (const contact of contactInfoResponse.data) {
                const dealInfo = await axios.get(
                    `https://api.crm.com/deal?query=contactId=${contact.id}`,
                    {
                        headers: { 'Authorization': authHeader }
                    });
                const deals = dealInfo.data.length > 0 ? dealInfo.data.map(m => { return { id: m.id, title: m.title } }) : null;
                matchedContacts.push({
                    id: contact.id,
                    name: contact.name,
                    title: contact.title ?? "",
                    company: contact.company?.name ?? "",
                    phone: numberToQuery,
                    additionalInfo: { deals }
                })
            }
        }
    }
    return matchedContacts;
}

async function createContact({ user, authHeader, phoneNumber, newContactName }) {
    const contactInfoResponse = await axios.post(
        `https://api.crm.com/contact`,
        {
            name: newContactName,
            type: 'Contact',
            phone_numbers: [
                {
                    number: phoneNumber
                }
            ],
        },
        {
            headers: { 'Authorization': authHeader }
        }
    );
    return {
        id: contactInfoResponse.data.id,
        name: contactInfoResponse.data.name
    }
}

exports.getAuthType = getAuthType;
exports.getOauthInfo = getOauthInfo;
exports.saveUserOAuthInfo = saveUserOAuthInfo;
exports.getUserInfo = getUserInfo;
exports.addCallLog = addCallLog;
exports.updateCallLog = updateCallLog;
exports.getCallLog = getCallLog;
exports.addMessageLog = addMessageLog;
exports.getContact = getContact;
exports.createContact = createContact;
exports.unAuthorize = unAuthorize;