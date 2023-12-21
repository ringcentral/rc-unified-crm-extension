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
    const subject = callLog.customSubject ?? `${callLog.direction} Call ${callLog.direction === 'Outbound' ? `from ${user.name} to ${contactInfo.name}` : `from ${contactInfo.name} to ${user.name}`}`;
    const putBody = {
        comments: `${!!note ? `<br/>${note}<br/><br/>` : ''}<b>Call details</b><br/><ul><li><b>Summary</b>: ${subject}</li><li><b>${callLog.direction === 'Outbound' ? 'Recipient' : 'Caller'} phone number</b>: ${contactNumber}</li><li><b>Date/time</b>: ${moment(callLog.startTime).utcOffset(Number(timezoneOffset)).format('YYYY-MM-DD hh:mm:ss A')}</li><li><b>Duration</b>: ${callLog.duration} seconds</li><li><b>Result</b>: ${callLog.result}</li>${callLog.recording ? `<li><b>Call recording link</b>: <a target="_blank" href=${callLog.recording.link}>open</a></li>` : ''}</ul>`,
        action: commentAction,
        personReference: {
            id: contactInfo.overridingContactId ?? contactInfo.id
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

async function updateCallLog({ user, existingCallLog, authHeader, recordingLink }) {
    const existingBullhornLogId = existingCallLog.thirdPartyLogId;
    let getLogRes
    try {
        getLogRes = await axios.get(
            `${user.platformAdditionalInfo.restUrl}entity/Note/${existingBullhornLogId}?fields=comments&BhRestToken=${user.platformAdditionalInfo.bhRestToken}`);
    }
    catch (e) {
        if (e.response.status === 401) {
            user = await refreshSessionToken(user);
            getLogRes = await axios.get(
                `${user.platformAdditionalInfo.restUrl}entity/Note/${existingBullhornLogId}?fields=comments&BhRestToken=${user.platformAdditionalInfo.bhRestToken}`);
        }
    }
    let logBody = getLogRes.data.data.comments;
    if (logBody.includes('</ul>')) {
        logBody = logBody.replace('</ul>', `<li><b>Call recording link</b>: <a target="_blank" href=${recordingLink}>open</a></ul>`);
    }
    else {
        logBody += `<b>Call recording link</b>: <a target="_blank" src=${recordingLink}>open</a>`;
    }
    // I dunno, Bullhorn just uses POST as PATCH
    const postBody = {
        comments: logBody
    }
    const postLogRes = await axios.post(
        `${user.platformAdditionalInfo.restUrl}entity/Note/${existingBullhornLogId}?BhRestToken=${user.platformAdditionalInfo.bhRestToken}`,
        postBody);
}

async function addMessageLog({ user, contactInfo, authHeader, message, additionalSubmission, recordingLink, timezoneOffset, contactNumber }) {
    const commentAction = additionalSubmission.commentAction ?? '';
    const subject = `${message.direction} SMS ${message.direction === 'Outbound' ? `from ${user.name} to ${contactInfo.name}` : `from ${contactInfo.name} to ${user.name}`}`;
    const putBody = {
        comments: `<b>SMS details</b><br/><ul><li><b>Subject</b>: ${subject}</li><li><b>${message.direction === 'Outbound' ? 'Recipient' : 'Sender'} phone number</b>: ${contactInfo.phone}</li><li><b>Date/time</b>: ${moment(message.creationTime).utcOffset(Number(timezoneOffset)).format('YYYY-MM-DD hh:mm:ss A')}</li><li><b>Message</b>: ${message.subject}</li>${recordingLink ? `<li><b>Recording link</b>: ${recordingLink}</li>` : ''}</ul>`,
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


async function getContactV2({ user, phoneNumber }) {
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
    const matchedContactInfo = [];
    // check for Contact
    const contactPersonInfo = await axios.post(
        `${user.platformAdditionalInfo.restUrl}search/ClientContact?BhRestToken=${user.platformAdditionalInfo.bhRestToken}&fields=id,name,email,phone'`,
        {
            query: `(phone:${phoneNumberWithoutCountryCode} OR mobile:${phoneNumberWithoutCountryCode} OR mobile:${phoneNumberWithoutCountryCode}) AND isDeleted:false`
        });
    for (const result of contactPersonInfo.data.data) {
        matchedContactInfo.push({
            id: result.id,
            name: result.name,
            phone: result.phone,
            type: 'Contact',
            additionalInfo: commentActionList?.length > 0 ? { actions: commentActionList } : null
        });
    }
    // check for Candidate
    const candidatePersonInfo = await axios.post(
        `${user.platformAdditionalInfo.restUrl}search/Candidate?BhRestToken=${user.platformAdditionalInfo.bhRestToken}&fields=id,name,email,phone'`,
        {
            query: `(phone:${phoneNumberWithoutCountryCode} OR mobile:${phoneNumberWithoutCountryCode} OR mobile:${phoneNumberWithoutCountryCode}) AND isDeleted:false`
        });
    for (const result of candidatePersonInfo.data.data) {
        matchedContactInfo.push({
            id: result.id,
            name: result.name,
            phone: result.phone,
            type: 'Candidate',
            additionalInfo: commentActionList?.length > 0 ? { actions: commentActionList } : null
        });
    }
    return matchedContactInfo;
}

async function createContact({ user, authHeader, phoneNumber, newContactName, newContactType }) {
    switch (newContactType) {
        case 'Candidate':
            const candidatePostBody = {
                name: newContactName,
                firstName: newContactName.split(' ')[0],
                lastName: newContactName.split(' ').length > 1 ? newContactName.split(' ')[1] : '',
                phone: phoneNumber.replace(' ', '+')
            }
            const candidateInfo = await axios.put(
                `${user.platformAdditionalInfo.restUrl}entity/Candidate?BhRestToken=${user.platformAdditionalInfo.bhRestToken}`,
                candidatePostBody,
                {
                    headers: { 'Authorization': authHeader }
                }
            );
            console.log(`Candidate created with id: ${candidateInfo.data.changedEntityId} and name: ${newContactName}`)
            return {
                id: candidateInfo.data.changedEntityId,
                name: newContactName
            }
        case 'Contact':
            let companyId = 0;
            const companyInfo = await axios.post(
                `${user.platformAdditionalInfo.restUrl}search/ClientCorporation?BhRestToken=${user.platformAdditionalInfo.bhRestToken}&fields=id,name`,
                {
                    query: "name:RingCentral_CRM_Extension_Placeholder_Company"
                },
                {
                    headers: { 'Authorization': authHeader }
                }
            )
            if (companyInfo.data.total > 0 && companyInfo.data.data[0].name === 'RingCentral_CRM_Extension_Placeholder_Company') {
                companyId = companyInfo.data.data[0].id;
            }
            else {
                const createCompany = await axios.put(
                    `${user.platformAdditionalInfo.restUrl}entity/ClientCorporation?BhRestToken=${user.platformAdditionalInfo.bhRestToken}`,
                    {
                        name: "RingCentral_CRM_Extension_Placeholder_Company",
                        companyDescription: "<strong><span style=\"color: rgb(231,76,60);\">This is a placeholder company for RingCentral CRM Extension to create new contacts under. Further actions need to be done to relocate new contacts from this company to a real company.</span></strong>"
                    },
                    {
                        headers: { 'Authorization': authHeader }
                    }
                )
                companyId = createCompany.data.changedEntityId;
            }
            const contactPostBody = {
                name: newContactName,
                firstName: newContactName.split(' ')[0],
                lastName: newContactName.split(' ').length > 1 ? newContactName.split(' ')[1] : '',
                phone: phoneNumber.replace(' ', '+'),
                clientCorporation: {
                    id: companyId
                }
            }
            const contactInfo = await axios.put(
                `${user.platformAdditionalInfo.restUrl}entity/ClientContact?BhRestToken=${user.platformAdditionalInfo.bhRestToken}`,
                contactPostBody,
                {
                    headers: { 'Authorization': authHeader }
                }
            );
            console.log(`Contact created with id: ${contactInfo.data.changedEntityId} and name: ${newContactName}`)
            return {
                id: contactInfo.data.changedEntityId,
                name: newContactName
            }
    }
}

exports.getAuthType = getAuthType;
exports.getOauthInfo = getOauthInfo;
exports.saveUserOAuthInfo = saveUserOAuthInfo;
exports.getUserInfo = getUserInfo;
exports.addCallLog = addCallLog;
exports.updateCallLog = updateCallLog;
exports.addMessageLog = addMessageLog;
exports.getContact = getContact;
exports.getContactV2 = getContactV2;
exports.createContact = createContact;
exports.unAuthorize = unAuthorize;