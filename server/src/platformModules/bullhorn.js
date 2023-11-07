const axios = require('axios');
const { UserModel } = require('../models/userModel');
const Op = require('sequelize').Op;
const moment = require('moment');
const { parsePhoneNumber } = require('awesome-phonenumber');

function getAuthType() {
    return 'oauth';
}

function getOauthInfo({ tokenUrl }) {
    return {
        clientId: process.env.BULLHORN_CLIENT_ID,
        clientSecret: process.env.BULLHORN_CLIENT_SECRET,
        accessTokenUri: tokenUrl,
        redirectUri: process.env.BULLHORN_REDIRECT_URI
    }
}

async function getUserInfo({ authHeader, tokenUrl, apiUrl, username }) {
    const userLoginResponse = await axios.post(`${apiUrl}/login?version=2.0&access_token=${authHeader.split('Bearer ')[1]}`);
    const { BhRestToken: bhRestToken, restUrl } = userLoginResponse.data;
    const userInfoResponse = await axios.get(`${restUrl}query/CorporateUser?fields=id,name,timeZoneOffsetEST&BhRestToken=${bhRestToken}&where=username='${username}'`);
    const userData = userInfoResponse.data.data[0];
    const utcTimeOffset = userData.timeZoneOffsetEST - 5 * 60;
    return {
        id: `${userData.id.toString()}-bullhorn`,
        name: userData.name,
        timezoneOffset: utcTimeOffset,
        additionalInfo: {
            tokenUrl,
            restUrl,
            loginUrl: apiUrl,
            bhRestToken
        }
    };
}

async function saveUserOAuthInfo({ id, name, hostname, accessToken, refreshToken, tokenExpiry, rcUserNumber, timezoneName, timezoneOffset, additionalInfo }) {
    const existingUser = await UserModel.findByPk(id);
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
    const commentAction = additionalSubmission.commentAction ?? '';
    const subject = callLog.customSubject ?? `${callLog.direction} Call ${callLog.direction === 'Outbound' ? 'to' : 'from'} ${contactInfo.name} (${contactInfo.phone})`;
    const putBody = {
        comments: `<ul><li>Subject: <b>${subject}</b></li><li>Time: <b>${moment(callLog.startTime).utcOffset(Number(timezoneOffset)).format('YYYY-MM-DD hh:mm:ss A')}</b></li><li>Duration: <b>${callLog.duration} seconds</b></li><li>Result: <b>${callLog.result}</b></li><li>Note: <b>${note}</b></li>${callLog.recording ? `<li>Recording link: <b>${callLog.recording.link}</b></li>` : ''}</ul><br/><em><i>--- Created via RingCentral CRM Extension</i></em>`,
        action: commentAction,
        personReference: {
            id: contactInfo.id
        }
    }
    let addLogRes;
    try {
        addLogRes = await axios.put(
            `${user.platformAdditionalInfo.restUrl}entity/Note?BhRestToken=${user.platformAdditionalInfo.bhRestToken}`,
            putBody
        );
    }
    catch (e) {
        if (e.response.status === 401) {
            user = await refreshSessionToken(user);
            addLogRes = await axios.put(
                `${user.platformAdditionalInfo.restUrl}entity/Note?BhRestToken=${user.platformAdditionalInfo.bhRestToken}`,
                putBody
            );
        }
    }
    return addLogRes.data.changedEntityId;
}

async function addMessageLog({ user, contactInfo, authHeader, message, additionalSubmission, recordingLink, timezoneOffset, contactNumber }) {
    const commentAction = additionalSubmission.commentAction ?? '';
    const subject = `${message.direction} SMS ${message.direction === 'Outbound' ? 'to' : 'from'} ${contactInfo.name}(${contactInfo.phone})`;
    const putBody = {
        comments: `<ul><li>Subject: <b>${subject}</b></li><li>Time: <b>${moment(message.creationTime).utcOffset(Number(timezoneOffset)).format('YYYY-MM-DD hh:mm:ss A')}</b></li><li>Message: <b>${message.subject}</b></li>${recordingLink ? `<li>Recording link: <b>${recordingLink}</b></li>` : ''}</ul><br/><em><i>--- Created via RingCentral CRM Extension</i></em>`,
        action: commentAction,
        personReference: {
            id: contactInfo.id
        }
    }
    let addLogRes;
    try {
        addLogRes = await axios.put(
            `${user.platformAdditionalInfo.restUrl}entity/Note?BhRestToken=${user.platformAdditionalInfo.bhRestToken}`,
            putBody
        );
    }
    catch (e) {
        if (e.response.status === 401) {
            user = await refreshSessionToken(user);
            addLogRes = await axios.put(
                `${user.platformAdditionalInfo.restUrl}entity/Note?BhRestToken=${user.platformAdditionalInfo.bhRestToken}`,
                putBody
            );
        }
    }
    return addLogRes.data.changedEntityId;
}

async function getContact({ user, authHeader, phoneNumber, overridingFormat }) {
    let commentActionListResponse;
    try {
        commentActionListResponse = await axios.get(`${user.platformAdditionalInfo.restUrl}settings/commentActionList?BhRestToken=${user.platformAdditionalInfo.bhRestToken}`);
    }
    catch (e) {
        if (e.response.status === 401) {
            user = await refreshSessionToken(user);
            commentActionListResponse = await axios.get(`${user.platformAdditionalInfo.restUrl}settings/commentActionList?BhRestToken=${user.platformAdditionalInfo.bhRestToken}`);
        }
    }
    const commentActionList = commentActionListResponse.data.commentActionList.map(a => { return { id: a, title: a } });
    const phoneNumberObj = parsePhoneNumber(phoneNumber.replace(' ', '+'));
    const phoneNumberWithoutCountryCode = phoneNumberObj.number.significant;
    let personInfo;
    // check for Contact
    personInfo = await axios.post(
        `${user.platformAdditionalInfo.restUrl}search/ClientContact?BhRestToken=${user.platformAdditionalInfo.bhRestToken}&fields=id,name,email,phone'`,
        {
            query: `phone:${phoneNumberWithoutCountryCode}`
        });
    if (personInfo.data.data.length > 0) {
        const result = personInfo.data.data[0];
        return {
            id: result.id,
            name: result.name,
            phone: result.phone,
            contactType: 'Contact',
            commentActionList
        }
    }
    // check for Candidate
    personInfo = await axios.post(
        `${user.platformAdditionalInfo.restUrl}search/Candidate?BhRestToken=${user.platformAdditionalInfo.bhRestToken}&fields=id,name,email,phone'`,
        {
            query: `phone:${phoneNumberWithoutCountryCode}`
        });
    if (personInfo.data.data.length > 0) {
        const result = personInfo.data.data[0];
        return {
            id: result.id,
            name: result.name,
            phone: result.phone,
            contactType: 'Candidate',
            commentActionList
        }
    }
    return null;
}

async function refreshSessionToken(user) {
    const userLoginResponse = await axios.post(`${user.platformAdditionalInfo.loginUrl}/login?version=2.0&access_token=${user.accessToken}`);
    const { BhRestToken, restUrl } = userLoginResponse.data;
    let updatedPlatformAdditionalInfo = user.platformAdditionalInfo;
    updatedPlatformAdditionalInfo.bhRestToken = BhRestToken;
    updatedPlatformAdditionalInfo.restUrl = restUrl;
    // Not sure why, assigning platformAdditionalInfo first then give it another value so that it can be saved to db
    user.platformAdditionalInfo = {};
    user.platformAdditionalInfo = updatedPlatformAdditionalInfo;
    await user.save();
    return user;
}


exports.getAuthType = getAuthType;
exports.getOauthInfo = getOauthInfo;
exports.saveUserOAuthInfo = saveUserOAuthInfo;
exports.getUserInfo = getUserInfo;
exports.addCallLog = addCallLog;
exports.addMessageLog = addMessageLog;
exports.getContact = getContact;
exports.unAuthorize = unAuthorize;