const axios = require('axios');
const { UserModel } = require('../models/userModel');
const Op = require('sequelize').Op;
const moment = require('moment');
const { parsePhoneNumber } = require('awesome-phonenumber');

const crmName = 'bullhorn';

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

async function saveUserInfo({ authHeader, tokenUrl, apiUrl, username, hostname, accessToken, refreshToken, tokenExpiry, rcUserNumber, additionalInfo }) {
    const userLoginResponse = await axios.post(`${apiUrl}/login?version=2.0&access_token=${authHeader.split('Bearer ')[1]}`);
    const { BhRestToken: bhRestToken, restUrl } = userLoginResponse.data;
    const userInfoResponse = await axios.get(`${restUrl}query/CorporateUser?fields=id,name,timeZoneOffsetEST&BhRestToken=${bhRestToken}&where=username='${username}'`);
    const userData = userInfoResponse.data.data[0];
    const id = `${userData.id.toString()}-bullhorn`;
    const name = userData.name;
    const timezoneOffset = userData.timeZoneOffsetEST - 5 * 60;
    const timezoneName = '';
    const existingUser = await UserModel.findOne({
        where: {
            [Op.and]: [
                {
                    id,
                    platform: crmName
                }
            ]
        }
    });
    if (existingUser) {
        await existingUser.update(
            {
                hostname,
                timezoneName,
                timezoneOffset,
                accessToken,
                refreshToken,
                tokenExpiry,
                rcUserNumber,
                platformAdditionalInfo: {
                    tokenUrl,
                    restUrl,
                    loginUrl: apiUrl,
                    bhRestToken
                }
            }
        );
    }
    else {
        await UserModel.create({
            id,
            hostname,
            timezoneName,
            timezoneOffset,
            platform: crmName,
            accessToken,
            refreshToken,
            tokenExpiry,
            rcUserNumber,
            platformAdditionalInfo: {
                tokenUrl,
                restUrl,
                loginUrl: apiUrl,
                bhRestToken
            }
        });
    }
    return {
        id,
        name
    };
}

function getOverridingOAuthOption({ code }) {
    return {
        query: {
            grant_type: 'authorization_code',
            code,
            client_id: process.env.BULLHORN_CLIENT_ID,
            client_secret: process.env.BULLHORN_CLIENT_SECRET,
            redirect_uri: process.env.BULLHORN_REDIRECT_URI,
        },
        headers: {
            Authorization: ''
        }
    }
}

async function unAuthorize({ user }) {
    await user.destroy();
}

async function getContact({ user, phoneNumber }) {
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
    const commentActionList = commentActionListResponse.data.commentActionList.map(a => { return { const: a, title: a } });
    const phoneNumberObj = parsePhoneNumber(phoneNumber.replace(' ', '+'));
    const phoneNumberWithoutCountryCode = phoneNumberObj.number.significant;
    const matchedContactInfo = [];
    // check for Contact
    const contactPersonInfo = await axios.post(
        `${user.platformAdditionalInfo.restUrl}search/ClientContact?BhRestToken=${user.platformAdditionalInfo.bhRestToken}&fields=id,name,email,phone'`,
        {
            query: `(phone:${phoneNumberWithoutCountryCode} OR mobile:${phoneNumberWithoutCountryCode} OR phone2:${phoneNumberWithoutCountryCode} OR phone3:${phoneNumberWithoutCountryCode}) AND isDeleted:false`
        });
    for (const result of contactPersonInfo.data.data) {
        matchedContactInfo.push({
            id: result.id,
            name: result.name,
            phone: result.phone,
            type: 'Contact',
            additionalInfo: commentActionList?.length > 0 ? { noteActions: commentActionList } : null
        });
    }
    // check for Candidate
    const candidatePersonInfo = await axios.post(
        `${user.platformAdditionalInfo.restUrl}search/Candidate?BhRestToken=${user.platformAdditionalInfo.bhRestToken}&fields=id,name,email,phone'`,
        {
            query: `(phone:${phoneNumberWithoutCountryCode} OR mobile:${phoneNumberWithoutCountryCode} OR phone2:${phoneNumberWithoutCountryCode} OR phone3:${phoneNumberWithoutCountryCode}) AND isDeleted:false`
        });
    for (const result of candidatePersonInfo.data.data) {
        matchedContactInfo.push({
            id: result.id,
            name: result.name,
            phone: result.phone,
            type: 'Candidate',
            additionalInfo: commentActionList?.length > 0 ? { noteActions: commentActionList } : null
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
                        companyDescription: "<strong><span style=\"color: rgb(231,76,60);\">This company was created automatically by the RingCentral Unified CRM Extension. Feel free to edit, or associate this company's contacts to more appropriate records. </span></strong>"
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
            return {
                id: contactInfo.data.changedEntityId,
                name: newContactName
            }
    }
}

async function addCallLog({ user, contactInfo, authHeader, callLog, note, additionalSubmission, timezoneOffset, contactNumber }) {
    const noteActions = additionalSubmission.noteActions ?? '';
    const subject = callLog.customSubject ?? `${callLog.direction} Call ${callLog.direction === 'Outbound' ? `to ${contactInfo.name}` : `from ${contactInfo.name}`}`;
    const putBody = {
        comments: `${!!note ? `<br/>${note}<br/><br/>` : ''}<b>Call details</b><br/><ul><li><b>Summary</b>: ${subject}</li><li><b>${callLog.direction === 'Outbound' ? 'Recipient' : 'Caller'} phone number</b>: ${contactNumber}</li><li><b>${callLog.direction === 'Outbound' ? `Caller phone number</b>: ${callLog.from.phoneNumber ?? ''}` : `Recipient phone number</b>: ${callLog.to.phoneNumber ?? ''}`} </li><li><b>Date/time</b>: ${moment(callLog.startTime).utcOffset(Number(timezoneOffset)).format('YYYY-MM-DD hh:mm:ss A')}</li><li><b>Duration</b>: ${callLog.duration} seconds</li><li><b>Result</b>: ${callLog.result}</li>${callLog.recording ? `<li><b>Call recording link</b>: <a target="_blank" href=${callLog.recording.link}>open</a></li>` : ''}</ul>`,
        action: noteActions,
        personReference: {
            id: contactInfo.overridingContactId ?? contactInfo.id
        },
        dateAdded: callLog.startTime
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

async function updateCallLog({ user, existingCallLog, authHeader, recordingLink, subject, note }) {
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
    // case: recording link update
    if (!!recordingLink) {
        if (logBody.includes('</ul>')) {
            logBody = logBody.replace('</ul>', `<li><b>Call recording link</b>: <a target="_blank" href=${recordingLink}>open</a></ul>`);
        }
        else {
            logBody += `<b>Call recording link</b>: <a target="_blank" src=${recordingLink}>open</a>`;
        }
    }
    // case: normal update
    else {
        // replace note
        logBody = logBody.replace(logBody.split('<b>Call details</b>')[0], `<br/>${note}<br/><br/>`)
        // replace subject
        logBody = logBody.replace(logBody.split('<li><b>Summary</b>: ')[1].split('<li><b>Recipient phone')[0], subject ?? '');
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
    const noteActions = additionalSubmission.noteActions ?? '';
    const subject = `${message.direction} SMS ${message.direction === 'Outbound' ? `to ${contactInfo.name}` : `from ${contactInfo.name}`}`;
    const putBody = {
        comments: `<b>SMS details</b><br/><ul><li><b>Subject</b>: ${subject}</li><li><b>${message.direction === 'Outbound' ? 'Recipient' : 'Sender'} phone number</b>: ${contactNumber}</li><li><b>${message.direction === 'Outbound' ? `Sender phone number</b>: ${message.from.phoneNumber ?? ''}` : `Recipient phone number</b>: ${message.to[0].phoneNumber ?? ''}`} </li><li><b>Date/time</b>: ${moment(message.creationTime).utcOffset(Number(timezoneOffset)).format('YYYY-MM-DD hh:mm:ss A')}</li><li><b>Message</b>: ${message.subject}</li>${recordingLink ? `<li><b>Recording link</b>: ${recordingLink}</li>` : ''}</ul>`,
        action: noteActions,
        personReference: {
            id: contactInfo.overridingContactId ?? contactInfo.id
        },
        dateAdded: message.creationTime
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

async function getCallLog({ user, callLogId, authHeader }) {
    let getLogRes
    try {
        getLogRes = await axios.get(
            `${user.platformAdditionalInfo.restUrl}entity/Note/${callLogId}?fields=comments,candidates,clientContacts&BhRestToken=${user.platformAdditionalInfo.bhRestToken}`);
    }
    catch (e) {
        if (e.response.status === 401) {
            user = await refreshSessionToken(user);
            getLogRes = await axios.get(
                `${user.platformAdditionalInfo.restUrl}entity/Note/${callLogId}?fields=comments,candidates,clientContacts&BhRestToken=${user.platformAdditionalInfo.bhRestToken}`);
        }
    }
    const logBody = getLogRes.data.data.comments;
    const note = logBody.split('<b>Call details</b>')[0].replaceAll('<br>', '');
    const contact = getLogRes.data.data.clientContacts.total > 0 ? getLogRes.data.data.clientContacts.data[0] : getLogRes.data.data.candidates.data[0];
    return {
        subject: getLogRes.data.data.comments.split('<li><b>Summary</b>: ')[1].split('<li><b>')[0],
        note,
        contactName: `${contact.firstName} ${contact.lastName}`
    }
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
exports.getOverridingOAuthOption = getOverridingOAuthOption;
exports.saveUserInfo = saveUserInfo;
exports.addCallLog = addCallLog;
exports.updateCallLog = updateCallLog;
exports.addMessageLog = addMessageLog;
exports.getCallLog = getCallLog;
exports.getContact = getContact;
exports.createContact = createContact;
exports.unAuthorize = unAuthorize;