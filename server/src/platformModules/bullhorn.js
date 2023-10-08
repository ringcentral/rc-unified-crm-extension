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
    const subject = callLog.customSubject ?? `${callLog.direction} Call ${callLog.direction === 'Outbound' ? 'to' : 'from'} ${contactInfo.name} (${contactInfo.phone})`;
    const putBody = {
        comments: `<ul><li>Subject: <b>${subject}</b></li><li>Time: <b>${moment(callLog.startTime).utcOffset(timezoneOffset).format('YYYY-MM-DD hh:mm:ss A')}</b></li><li>Duration: <b>${callLog.duration} seconds</b></li><li>Result: <b>${callLog.result}</b></li><li>Note: <b>${note}</b></li>${callLog.recording ? `<li>Recording link: <b>${callLog.recording.link}</b></li>` : ''}</ul><br/><em><i>--- Created via RingCentral CRM Extension</i></em>`,
        action: `${callLog.direction} Call`,
        personReference: {
            id: contactInfo.id
        }
    }
    const addLogRes = await axios.put(
        `${user.platformAdditionalInfo.restUrl}entity/Note?BhRestToken=${user.platformAdditionalInfo.bhRestToken}`,
        putBody
    );
    return addLogRes.data.changedEntityId;
}

async function addMessageLog({ user, contactInfo, authHeader, message, additionalSubmission, recordingLink, timezoneOffset, contactNumber }) {
    const subject = `${message.direction} SMS ${message.direction === 'Outbound' ? 'to' : 'from'} ${contactInfo.name}(${contactInfo.phone})`;
    const putBody = {
        comments: `<ul><li>Subject: <b>${subject}</b></li><li>Time: <b>${moment(message.creationTime).utcOffset(timezoneOffset).format('YYYY-MM-DD hh:mm:ss A')}</b></li><li>Message: <b>${message.subject}</b></li>${recordingLink ? `<li>Recording link: <b>${recordingLink}</b></li>` : ''}</ul><br/><em><i>--- Created via RingCentral CRM Extension</i></em>`,
        action: `${message.direction} SMS`,
        personReference: {
            id: contactInfo.id
        }
    }
    const addLogRes = await axios.put(
        `${user.platformAdditionalInfo.restUrl}entity/Note?BhRestToken=${user.platformAdditionalInfo.bhRestToken}`,
        putBody
    );
    return addLogRes.data.changedEntityId;
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
        numberToQuery = encodeURIComponent(numberToQuery);
        let personInfo;
        try {
            personInfo = await axios.get(
                `${user.platformAdditionalInfo.restUrl}query/ClientContact?BhRestToken=${user.platformAdditionalInfo.bhRestToken}&fields=id,name,email,phone&where=phone='${numberToQuery}'`);
        }
        catch (e) {
            if (e.response.status === 401) {
                const updatedUser = refreshSessionToken(user);
                personInfo = await axios.get(
                    `${user.platformAdditionalInfo.restUrl}query/ClientContact?BhRestToken=${updatedUser.platformAdditionalInfo.bhRestToken}&fields=id,name,email,phone&where=phone='${numberToQuery}'`);
            }
        }
        if (personInfo.data.data.length > 0) {
            const result = personInfo.data.data[0];
            return {
                id: result.id,
                name: result.name,
                phone: result.phone
            }
        }
    }
    return null;
}

async function refreshSessionToken(user) {
    console.log('refreshing bullhorn session token...');
    const userLoginResponse = await axios.post(`${user.platformAdditionalInfo.loginUrl}login?version=2.0&access_token=${user.accessToken}`);
    const { BhRestToken, restUrl } = userLoginResponse.data;
    let updatedPlatformAdditionalInfo = user.platformAdditionalInfo;
    updatedPlatformAdditionalInfo.bhRestToken = BhRestToken;
    updatedPlatformAdditionalInfo.restUrl = restUrl;
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