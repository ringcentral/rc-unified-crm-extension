const axios = require('axios');
const moment = require('moment');
const { UserModel } = require('../models/userModel');
const Op = require('sequelize').Op;
const url = require('url');
const { parsePhoneNumber } = require('awesome-phonenumber');

function getAuthType() {
    return 'oauth';
}

function getOauthInfo() {
    return {
        clientId: process.env.PIPEDRIVE_CLIENT_ID,
        clientSecret: process.env.PIPEDRIVE_CLIENT_SECRET,
        accessTokenUri: process.env.PIPEDRIVE_ACCESS_TOKEN_URI,
        redirectUri: process.env.PIPEDRIVE_REDIRECT_URI
    }
}

async function getUserInfo({ authHeader }) {
    const userInfoResponse = await axios.get('https://api.pipedrive.com/v1/users/me', {
        headers: {
            'Authorization': authHeader
        }
    });
    return {
        id: userInfoResponse.data.data.id.toString(),
        name: userInfoResponse.data.data.name,
        timezoneName: userInfoResponse.data.data.timezone_name,
        timezoneOffset: userInfoResponse.data.data.timezone_offset,
        additionalInfo: {
            companyId: userInfoResponse.data.data.company_id,
            companyName: userInfoResponse.data.data.company_name,
            companyDomain: userInfoResponse.data.data.company_domain,
        }
    };
}

async function saveUserOAuthInfo({ id, name, hostname, accessToken, refreshToken, tokenExpiry, rcUserNumber, timezoneName, timezoneOffset, additionalInfo }) {
    const existingUser = await UserModel.findOne({
        where: {
            [Op.and]: [
                {
                    id,
                    platform: 'pipedrive'
                }
            ]
        }
    });
    if (existingUser) {
        await existingUser.update(
            {
                name,
                hostname: hostname == 'temp' ? `${additionalInfo.companyDomain}.pipedrive.com` : hostname,
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
            hostname: hostname == 'temp' ? `${additionalInfo.companyDomain}.pipedrive.com` : hostname,
            timezoneName,
            timezoneOffset,
            platform: 'pipedrive',
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
                platform: 'pipedrive'
            }
        });
    const revokeUrl = 'https://oauth.pipedrive.com/oauth/revoke';
    const basicAuthHeader = Buffer.from(`${process.env.PIPEDRIVE_CLIENT_ID}:${process.env.PIPEDRIVE_CLIENT_SECRET}`).toString('base64');
    const refreshTokenParams = new url.URLSearchParams({
        token: user.refreshToken
    });
    const refreshTokenRevokeRes = await axios.post(
        revokeUrl,
        refreshTokenParams,
        {
            headers: { 'Authorization': `Basic ${basicAuthHeader}` }
        });
    const accessTokenParams = new url.URLSearchParams({
        token: user.accessToken
    });
    const accessTokenRevokeRes = await axios.post(
        revokeUrl,
        accessTokenParams,
        {
            headers: { 'Authorization': `Basic ${basicAuthHeader}` }
        });
    await user.destroy();
}

async function addCallLog({ user, contactInfo, authHeader, callLog, note, additionalSubmission, timezoneOffset, contactNumber }) {
    const dealId = additionalSubmission ? additionalSubmission.dealId : '';
    const orgId = contactInfo.organization ? contactInfo.organization.id : '';
    const timeUtc = moment(callLog.startTime).utcOffset(0).format('hh:mm')
    const dateUtc = moment(callLog.startTime).utcOffset(0).format('YYYY-MM-DD');
    const postBody = {
        user_id: user.id,
        subject: callLog.customSubject ?? `${callLog.direction} Call ${callLog.direction === 'Outbound' ? 'to' : 'from'} ${contactInfo.name}`,
        duration: callLog.duration,    // secs
        person_id: contactInfo.id,
        org_id: orgId,
        deal_id: dealId,
        note: `<p>[Phone Number] ${contactNumber}</p><p>[Time] ${moment(callLog.startTime).utcOffset(timezoneOffset).format('YYYY-MM-DD hh:mm:ss A')}</p><p>[Duration] ${callLog.duration} seconds</p><p>[Call result] ${callLog.result}</p><p>[Note] ${note}</p>${callLog.recording ? `<p>[Call recording link] ${callLog.recording.link}</p>` : ''}`,
        done: true,
        due_date: timeUtc,
        due_time: dateUtc
    }
    const addLogRes = await axios.post(
        `https://${user.hostname}/v1/activities`,
        postBody,
        {
            headers: { 'Authorization': authHeader }
        });
    return addLogRes.data.data.id;
}

async function addMessageLog({ user, contactInfo, authHeader, message, additionalSubmission, recordingLink, timezoneOffset, contactNumber }) {
    const dealId = additionalSubmission ? additionalSubmission.dealId : '';
    const orgId = contactInfo.organization ? contactInfo.organization.id : '';
    const timeUtc = moment(message.creationTime).utcOffset(0).format('hh:mm')
    const dateUtc = moment(message.creationTime).utcOffset(0).format('YYYY-MM-DD');
    const postBody = {
        user_id: user.id,
        subject: `${message.direction} SMS - ${message.from.name ?? ''}(${message.from.phoneNumber}) to ${message.to[0].name ?? ''}(${message.to[0].phoneNumber})`,
        person_id: contactInfo.id,
        org_id: orgId,
        deal_id: dealId,
        note: `<p>[Time] ${moment(message.creationTime).utcOffset(timezoneOffset).format('YYYY-MM-DD hh:mm:ss A')}</p>${!!message.subject ? `<p>[Message] ${message.subject}</p>` : ''} ${!!recordingLink ? `\n<p>[Recording link] ${recordingLink}</p>` : ''}`,
        done: true,
        due_date: timeUtc,
        due_time: dateUtc
    }
    const addLogRes = await axios.post(
        `https://${user.hostname}/v1/activities`,
        postBody,
        {
            headers: { 'Authorization': authHeader }
        });
    return addLogRes.data.data.id;
}

async function getContact({ user, authHeader, phoneNumber }) {
    phoneNumber = phoneNumber.replace(' ', '+')
    // without + is an extension, we don't want to search for that
    if (!phoneNumber.includes('+')) {
        return null;
    }
    const phoneNumberObj = parsePhoneNumber(phoneNumber);
    let phoneNumberWithoutCountryCode = phoneNumber;
    if (phoneNumberObj.valid) {
        phoneNumberWithoutCountryCode = phoneNumberObj.number.significant;
    }
    const personInfo = await axios.get(
        `https://${user.hostname}/v1/persons/search?term=${phoneNumberWithoutCountryCode}&fields=phone&limit=1`,
        {
            headers: { 'Authorization': authHeader }
        });
    if (personInfo.data.data.items.length === 0) {
        return null;
    }
    else {
        let result = personInfo.data.data.items[0].item;
        const dealsResponse = await axios.get(
            `https://${user.hostname}/v1/persons/${personInfo.data.data.items[0].item.id}/deals?status=open`,
            {
                headers: { 'Authorization': authHeader }
            });
        const relatedDeals = dealsResponse.data.data ?
            dealsResponse.data.data.map(d => { return { id: d.id, title: d.title } })
            : null;
        return formatContact(result, relatedDeals);
    }
}

function formatContact(rawContactInfo, relatedDeals) {
    return {
        id: rawContactInfo.id,
        name: rawContactInfo.name,
        phone: rawContactInfo.phones[0],
        organization: rawContactInfo.organization?.name ?? '',
        relatedDeals
    }
}

exports.getAuthType = getAuthType;
exports.getOauthInfo = getOauthInfo;
exports.saveUserOAuthInfo = saveUserOAuthInfo;
exports.getUserInfo = getUserInfo;
exports.addCallLog = addCallLog;
exports.addMessageLog = addMessageLog;
exports.getContact = getContact;
exports.unAuthorize = unAuthorize;