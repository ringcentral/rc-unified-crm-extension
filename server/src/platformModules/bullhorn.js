const axios = require('axios');
const { UserModel } = require('../models/userModel');
const Op = require('sequelize').Op;
const moment = require('moment');
const url = require('url');
const { parsePhoneNumber } = require('awesome-phonenumber');

function getAuthType() {
    return 'oauth';
}

async function getOauthInfo({ tokenUrl }) {
    return {
        clientId: process.env.BULLHORN_CLIENT_ID,
        clientSecret: process.env.BULLHORN_CLIENT_SECRET,
        accessTokenUri: tokenUrl,
        redirectUri: process.env.BULLHORN_REDIRECT_URI
    }
}

async function getUserInfo({ authHeader, tokenUrl, apiUrl, username }) {
    const userLoginResponse = await axios.post(`${apiUrl}/login?version=2.0&access_token=${authHeader.split('Bearer ')[1]}`);
    const bhRestToken = userLoginResponse.data.BhRestToken;
    const restUrl = userLoginResponse.data.restUrl;
    const userInfoResponse = await axios.get(`${restUrl}query/CorporateUser?fields=id,name,timeZoneOffsetEST&BhRestToken=${bhRestToken}&where=username='${username}'`);
    const userData = userInfoResponse.data.data[0];
    const utcTimeOffset = userData.timeZoneOffsetEST - 5 * 60;
    return {
        id: userData.id.toString(),
        name: userData.name,
        timezoneOffset: utcTimeOffset,  //TODO: find timezone offset from timezone name/code
        additionalInfo: {
            tokenUrl,
            restUrl,
            bhRestToken
        }
    };
}

async function saveUserOAuthInfo({ id, name, hostname, accessToken, refreshToken, tokenExpiry, rcUserNumber, timezoneName, timezoneOffset, additionalInfo }) {
    const existingUser = await UserModel.findOne({
        where: {
            [Op.and]: [
                {
                    id,
                    platform: 'bullhorn'
                }
            ]
        }
    });
    if (existingUser) {
        await existingUser.update(
            {
                name,
                hostname,
                timezoneName,
                timezoneOffset,
                accessToken,
                refreshToken,
                tokenExpiry,
                rcUserNumber,
                platformAdditionalInfo: additionalInfo
            }
        );
    }
    else {
        await UserModel.create({
            id,
            name,
            hostname,
            timezoneName,
            timezoneOffset,
            platform: 'bullhorn',
            accessToken,
            refreshToken,
            tokenExpiry,
            rcUserNumber,
            platformAdditionalInfo: additionalInfo
        });
    }
}


async function unAuthorize({ id }) {
    const user = await UserModel.findOne(
        {
            where: {
                id,
                platform: 'bullhorn'
            }
        });
    await user.destroy();
}

async function addCallLog({ user, contactInfo, authHeader, callLog, note, additionalSubmission, timezoneOffset, contactNumber }) {
    const postBody = {
        data: {
            subject: callLog.customSubject ?? `[Call] ${callLog.direction} Call ${callLog.direction === 'Outbound' ? 'to' : 'from'} ${contactInfo.name} [${contactInfo.phone}]`,
            body: `\nCall Result: ${callLog.result}\nNote: ${note}${callLog.recording ? `\n[Call recording link] ${callLog.recording.link}` : ''}\n\n--- Created via RingCentral CRM Extension`,
            type: 'PhoneCommunication',
            received_at: moment(callLog.startTime).toISOString(),
            senders: [
                {
                    id: contactInfo.id,
                    type: 'Contact'
                }
            ],
            receivers: [
                {
                    id: user.id,
                    type: 'User'
                }
            ],
            notification_event_subscribers: [
                {
                    user_id: user.id
                }
            ]
        }
    }
    if (additionalSubmission && additionalSubmission.matterId) {
        postBody.data['matter'] = { id: additionalSubmission.matterId };
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
            type: 'TimeEntry'
        }
    }
    const addTimerRes = await axios.post(
        `https://${user.hostname}/api/v4/activities.json`,
        addTimerBody,
        {
            headers: { 'Authorization': authHeader }
        });
    return communicationId;
}

async function addMessageLog({ user, contactInfo, authHeader, message, additionalSubmission, recordingLink, timezoneOffset, contactNumber }) {
    const postBody = {
        data: {
            subject: `[SMS] ${message.direction} SMS - ${message.from.name ?? ''}(${message.from.phoneNumber}) to ${message.to[0].name ?? ''}(${message.to[0].phoneNumber})`,
            body: `${message.direction} SMS - ${message.direction == 'Inbound' ? `from ${message.from.name ?? ''}(${message.from.phoneNumber})` : `to ${message.to[0].name ?? ''}(${message.to[0].phoneNumber})`} \n${!!message.subject ? `[Message] ${message.subject}` : ''} ${!!recordingLink ? `\n[Recording link] ${recordingLink}` : ''}\n\n--- Created via RingCentral CRM Extension`,
            type: 'PhoneCommunication',
            received_at: moment(message.creationTime).toISOString(),
            senders: [
                {
                    id: contactInfo.id,
                    type: 'Contact'
                }
            ],
            receivers: [
                {
                    id: user.id,
                    type: 'User'
                }
            ],
            notification_event_subscribers: [
                {
                    user_id: user.id
                }
            ]
        }
    }
    if (additionalSubmission && additionalSubmission.matterId) {
        postBody.data['matter'] = { id: additionalSubmission.matterId };
    }
    const addLogRes = await axios.post(
        `https://${user.hostname}/api/v4/communications.json`,
        postBody,
        {
            headers: { 'Authorization': authHeader }
        });
    return addLogRes.data.data.id;
}

async function getContact({ user, authHeader, phoneNumber, overridingFormat }) {
    const numberToQueryArray = [];
    if (overridingFormat) {
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
    else {
        numberToQueryArray.push(phoneNumber.replace(' ', '+'));
    }
    for (var numberToQuery of numberToQueryArray) {
        const personInfo = await axios.get(
            `https://${user.hostname}/api/v4/contacts.json?type=Person&query=${numberToQuery}&fields=id,name,title,company`,
            {
                headers: { 'Authorization': authHeader }
            });
        if (personInfo.data.data.length > 0) {
            let result = personInfo.data.data[0];
            const matterInfo = await axios.get(
                `https://${user.hostname}/api/v4/matters.json?client_id=${result.id}`,
                {
                    headers: { 'Authorization': authHeader }
                });
            const matters = matterInfo.data.data.length > 0 ? matterInfo.data.data.map(m => { return { id: m.id, title: m.display_number } }) : null;
            return {
                id: result.id,
                name: result.name,
                title: result.title ?? "",
                company: result.company?.name ?? "",
                phone: numberToQuery,
                matters
            }
        }
    }
    return null;
}


exports.getAuthType = getAuthType;
exports.getOauthInfo = getOauthInfo;
exports.saveUserOAuthInfo = saveUserOAuthInfo;
exports.getUserInfo = getUserInfo;
exports.addCallLog = addCallLog;
exports.addMessageLog = addMessageLog;
exports.getContact = getContact;
exports.unAuthorize = unAuthorize;