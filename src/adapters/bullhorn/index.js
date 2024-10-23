const axios = require('axios');
const moment = require('moment');
const { parsePhoneNumber } = require('awesome-phonenumber');
const { UserModel } = require('../../models/userModel');

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

async function tempMigrateUserId({ existingUser }) {
    const bhRestToken = existingUser.platformAdditionalInfo.bhRestToken;
    const existingUserId = existingUser.id.replace('-bullhorn', '');
    let userInfoResponse
    try {
        userInfoResponse = await axios.get(`${existingUser.platformAdditionalInfo.restUrl}query/CorporateUser?fields=id,masterUserID&BhRestToken=${bhRestToken}&where=id=${existingUserId}`);
    }
    catch (e) {
        if (isAuthError(e.response.status)) {
            existingUser = await refreshSessionToken(existingUser);
            userInfoResponse = await axios.get(`${existingUser.platformAdditionalInfo.restUrl}query/CorporateUser?fields=id,masterUserID&BhRestToken=${bhRestToken}&where=id=${existingUserId}`);
        }
    }
    const newUserId = userInfoResponse.data.data[0]?.masterUserID;
    if(!!!newUserId){
        return null;
    }
    const newUser = await UserModel.create({
        id: `${newUserId}-bullhorn`,
        hostname: existingUser.hostname,
        timezoneName: existingUser.timezoneName,
        timezoneOffset: existingUser.timezoneOffset,
        platform: existingUser.platform,
        accessToken: existingUser.accessToken,
        refreshToken: existingUser.refreshToken,
        tokenExpiry: existingUser.tokenExpiry,
        platformAdditionalInfo: existingUser.platformAdditionalInfo
    });
    await existingUser.destroy();
    return {
        id: newUser.id,
        name: userInfoResponse.data.name
    }
}

async function getUserInfo({ authHeader, tokenUrl, apiUrl, username }) {
    try {
        const userLoginResponse = await axios.post(`${apiUrl}/login?version=2.0&access_token=${authHeader.split('Bearer ')[1]}`);
        const { BhRestToken: bhRestToken, restUrl } = userLoginResponse.data;
        const userInfoResponse = await axios.get(`${restUrl}query/CorporateUser?fields=id,name,timeZoneOffsetEST,masterUserID&BhRestToken=${bhRestToken}&where=username='${username}'`);
        const userData = userInfoResponse.data.data[0];
        const id = `${userData.masterUserID.toString()}-bullhorn`;
        const name = userData.name;
        const timezoneOffset = userData.timeZoneOffsetEST - 5 * 60;
        const timezoneName = '';
        const platformAdditionalInfo = {
            tokenUrl,
            restUrl,
            loginUrl: apiUrl,
            bhRestToken
        }
        return {
            successful: true,
            platformUserInfo: {
                id,
                name,
                timezoneName,
                timezoneOffset,
                platformAdditionalInfo
            },
            returnMessage: {
                messageType: 'success',
                message: 'Successfully connected to Bullhorn.',
                ttl: 3000
            }
        };

    }
    catch (e) {
        return {
            successful: false,
            returnMessage: {
                messageType: 'warning',
                message: 'Failed to get user info.',
                ttl: 3000
            }
        }
    }
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
    return {
        returnMessage: {
            messageType: 'success',
            message: 'Successfully logged out from Bullhorn account.',
            ttl: 3000
        }
    }
}

async function findContact({ user, phoneNumber }) {
    let commentActionListResponse;
    try {
        commentActionListResponse = await axios.get(
            `${user.platformAdditionalInfo.restUrl}settings/commentActionList`,
            {
                headers: {
                    BhRestToken: user.platformAdditionalInfo.bhRestToken
                }
            });
    }
    catch (e) {
        if (isAuthError(e.response.status)) {
            user = await refreshSessionToken(user);
            commentActionListResponse = await axios.get(`${user.platformAdditionalInfo.restUrl}settings/commentActionList`,
                {
                    headers: {
                        BhRestToken: user.platformAdditionalInfo.bhRestToken
                    }
                });
        }
    }
    const commentActionList = commentActionListResponse.data.commentActionList.map(a => { return { const: a, title: a } });
    const phoneNumberObj = parsePhoneNumber(phoneNumber.replace(' ', '+'));
    const phoneNumberWithoutCountryCode = phoneNumberObj.number.significant;
    const matchedContactInfo = [];
    // check for Contact
    const contactPersonInfo = await axios.post(
        `${user.platformAdditionalInfo.restUrl}search/ClientContact?fields=id,name,email,phone'`,
        {
            query: `(phone:${phoneNumberWithoutCountryCode} OR mobile:${phoneNumberWithoutCountryCode} OR phone2:${phoneNumberWithoutCountryCode} OR phone3:${phoneNumberWithoutCountryCode}) AND isDeleted:false`
        },
        {
            headers: {
                BhRestToken: user.platformAdditionalInfo.bhRestToken
            }
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
        `${user.platformAdditionalInfo.restUrl}search/Candidate?fields=id,name,email,phone'`,
        {
            query: `(phone:${phoneNumberWithoutCountryCode} OR mobile:${phoneNumberWithoutCountryCode} OR phone2:${phoneNumberWithoutCountryCode} OR phone3:${phoneNumberWithoutCountryCode} OR workPhone:${phoneNumberWithoutCountryCode}) AND isDeleted:false`
        },
        {
            headers: {
                BhRestToken: user.platformAdditionalInfo.bhRestToken
            }
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
    matchedContactInfo.push({
        id: 'createNewContact',
        name: 'Create new contact...',
        additionalInfo: commentActionList?.length > 0 ? { noteActions: commentActionList } : null,
        isNewContact: true
    });
    return {
        matchedContactInfo
    };
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
            const candidateInfoResp = await axios.put(
                `${user.platformAdditionalInfo.restUrl}entity/Candidate`,
                candidatePostBody,
                {
                    headers: {
                        BhRestToken: user.platformAdditionalInfo.bhRestToken
                    }
                }
            );
            return {
                contactInfo: {
                    id: candidateInfoResp.data.changedEntityId,
                    name: newContactName
                },
                returnMessage: {
                    message: `New ${newContactType} created.`,
                    messageType: 'success',
                    ttl: 3000
                }
            }
        case 'Contact':
            let companyId = 0;
            const companyInfo = await axios.post(
                `${user.platformAdditionalInfo.restUrl}search/ClientCorporation?fields=id,name`,
                {
                    query: "name:RingCentral_CRM_Extension_Placeholder_Company"
                },
                {
                    headers: {
                        BhRestToken: user.platformAdditionalInfo.bhRestToken
                    }
                }
            )
            if (companyInfo.data.total > 0 && companyInfo.data.data[0].name === 'RingCentral_CRM_Extension_Placeholder_Company') {
                companyId = companyInfo.data.data[0].id;
            }
            else {
                const createCompany = await axios.put(
                    `${user.platformAdditionalInfo.restUrl}entity/ClientCorporation`,
                    {
                        name: "RingCentral_CRM_Extension_Placeholder_Company",
                        companyDescription: "<strong><span style=\"color: rgb(231,76,60);\">This company was created automatically by the RingCentral Unified CRM Extension. Feel free to edit, or associate this company's contacts to more appropriate records. </span></strong>"
                    },
                    {
                        headers: {
                            BhRestToken: user.platformAdditionalInfo.bhRestToken
                        }
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
            const contactInfoResp = await axios.put(
                `${user.platformAdditionalInfo.restUrl}entity/ClientContact`,
                contactPostBody,
                {
                    headers: {
                        BhRestToken: user.platformAdditionalInfo.bhRestToken
                    }
                }
            );
            return {
                contactInfo: {
                    id: contactInfoResp.data.changedEntityId,
                    name: newContactName
                },
                returnMessage: {
                    message: `New ${newContactType} created.`,
                    messageType: 'success',
                    ttl: 3000
                }
            }
    }
}

async function createCallLog({ user, contactInfo, authHeader, callLog, note, additionalSubmission }) {
    const noteActions = additionalSubmission.noteActions ?? '';
    const subject = callLog.customSubject ?? `${callLog.direction} Call ${callLog.direction === 'Outbound' ? `to ${contactInfo.name}` : `from ${contactInfo.name}`}`;
    const putBody = {
        comments: `${!!note ? `<br>${note}<br><br>` : ''}<b>Call details</b><br><ul><li><b>Summary</b>: ${subject}</li><li><b>${callLog.direction === 'Outbound' ? 'Recipient' : 'Caller'} phone number</b>: ${contactInfo.phoneNumber}</li><li><b>${callLog.direction === 'Outbound' ? `Caller phone number</b>: ${callLog.from.phoneNumber ?? ''}` : `Recipient phone number</b>: ${callLog.to.phoneNumber ?? ''}`} </li><li><b>Date/time</b>: ${moment(callLog.startTime).utcOffset(Number(user.timezoneOffset)).format('YYYY-MM-DD hh:mm:ss A')}</li><li><b>Duration</b>: ${callLog.duration} seconds</li><li><b>Result</b>: ${callLog.result}</li>${callLog.recording ? `<li><b>Call recording link</b>: <a target="_blank" href=${callLog.recording.link}>open</a></li>` : ''}</ul>`,
        action: noteActions,
        personReference: {
            id: contactInfo.id
        },
        dateAdded: callLog.startTime,
        externalID: callLog.sessionId,
        minutesSpent: callLog.duration / 60
    }
    let addLogRes;
    try {
        addLogRes = await axios.put(
            `${user.platformAdditionalInfo.restUrl}entity/Note`,
            putBody,
            {
                headers: {
                    BhRestToken: user.platformAdditionalInfo.bhRestToken
                }
            }
        );
    }
    catch (e) {
        if (isAuthError(e.response.status)) {
            user = await refreshSessionToken(user);
            addLogRes = await axios.put(
                `${user.platformAdditionalInfo.restUrl}entity/Note`,
                putBody,
                {
                    headers: {
                        BhRestToken: user.platformAdditionalInfo.bhRestToken
                    }
                }
            );
        }
    }
    return {
        logId: addLogRes.data.changedEntityId,
        returnMessage: {
            message: 'Call log added.',
            messageType: 'success',
            ttl: 3000
        }
    };
}

async function updateCallLog({ user, existingCallLog, authHeader, recordingLink, subject, note }) {
    const existingBullhornLogId = existingCallLog.thirdPartyLogId;
    let getLogRes
    try {
        getLogRes = await axios.get(
            `${user.platformAdditionalInfo.restUrl}entity/Note/${existingBullhornLogId}?fields=comments`,
            {
                headers: {
                    BhRestToken: user.platformAdditionalInfo.bhRestToken
                }
            });
    }
    catch (e) {
        if (isAuthError(e.response.status)) {
            user = await refreshSessionToken(user);
            getLogRes = await axios.get(
                `${user.platformAdditionalInfo.restUrl}entity/Note/${existingBullhornLogId}?fields=comments`,
                {
                    headers: {
                        BhRestToken: user.platformAdditionalInfo.bhRestToken
                    }
                });
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
        logBody = logBody.replace(logBody.split('<b>Call details</b>')[0], `<br>${note}<br><br>`)
        // replace subject
        logBody = logBody.replace(logBody.split('<li><b>Summary</b>: ')[1].split('<li><b>Recipient phone')[0], subject ?? '');
    }
    // I dunno, Bullhorn just uses POST as PATCH
    const postBody = {
        comments: logBody
    }
    const postLogRes = await axios.post(
        `${user.platformAdditionalInfo.restUrl}entity/Note/${existingBullhornLogId}`,
        postBody,
        {
            headers: {
                BhRestToken: user.platformAdditionalInfo.bhRestToken
            }
        });
    return {
        updatedNote: postBody.comments,
        returnMessage: {
            message: 'Call log updated.',
            messageType: 'success',
            ttl: 3000
        }
    };
}

async function createMessageLog({ user, contactInfo, authHeader, message, additionalSubmission, recordingLink, faxDocLink }) {
    const noteActions = additionalSubmission.noteActions ?? '';
    let userInfoResponse;
    try {
        userInfoResponse = await axios.get(`${user.platformAdditionalInfo.restUrl}query/CorporateUser?fields=id,name&where=masterUserID=${user.id.replace('-bullhorn', '')}`,
            {
                headers: {
                    BhRestToken: user.platformAdditionalInfo.bhRestToken
                }
            });
    }
    catch (e) {
        if (isAuthError(e.response.status)) {
            user = await refreshSessionToken(user);
            userInfoResponse = await axios.get(`${user.platformAdditionalInfo.restUrl}query/CorporateUser?fields=id,name&where=masterUserID=${user.id.replace('-bullhorn', '')}`,
                {
                    headers: {
                        BhRestToken: user.platformAdditionalInfo.bhRestToken
                    }
                });
        }
    }
    const userData = userInfoResponse.data.data[0];
    const userName = userData.name;
    const messageType = !!recordingLink ? 'Voicemail' : (!!faxDocLink ? 'Fax' : 'SMS');
    let subject = '';
    let comments = '';
    switch (messageType) {
        case 'SMS':
            subject = `SMS conversation with ${contactInfo.name} - ${moment(message.creationTime).format('YY/MM/DD')}`;
            comments =
                `<br><b>${subject}</b><br>` +
                '<b>Conversation summary</b><br>' +
                `${moment(message.creationTime).format('dddd, MMMM DD, YYYY')}<br>` +
                'Participants<br>' +
                `<ul><li><b>${userName}</b><br></li>` +
                `<li><b>${contactInfo.name}</b></li></ul><br>` +
                'Conversation(1 messages)<br>' +
                'BEGIN<br>' +
                '------------<br>' +
                '<ul>' +
                `<li>${message.direction === 'Inbound' ? `${contactInfo.name} (${contactInfo.phoneNumber})` : userName} ${moment(message.creationTime).format('hh:mm A')}<br>` +
                `<b>${message.subject}</b></li>` +
                '</ul>' +
                '------------<br>' +
                'END<br><br>' +
                '--- Created via RingCentral CRM Extension';
            break;
        case 'Voicemail':
            subject = `Voicemail left by ${contactInfo.name} - ${moment(message.creationTime).format('YY/MM/DD')}`;
            comments = `<br><b>${subject}</b><br>Voicemail recording link: ${recordingLink} <br><br>--- Created via RingCentral CRM Extension`;
            break;
        case 'Fax':
            subject = `Fax document sent from ${contactInfo.name} - ${moment(message.creationTime).format('YY/MM/DD')}`;
            comments = `<br><b>${subject}</b><br>Fax document link: ${faxDocLink} <br><br>--- Created via RingCentral CRM Extension`;
            break;
    }

    const putBody = {
        comments: comments,
        action: noteActions,
        personReference: {
            id: contactInfo.id
        },
        dateAdded: message.creationTime
    }
    const addLogRes = await axios.put(
        `${user.platformAdditionalInfo.restUrl}entity/Note`,
        putBody,
        {
            headers: {
                BhRestToken: user.platformAdditionalInfo.bhRestToken
            }
        }
    );
    return {
        logId: addLogRes.data.changedEntityId,
        returnMessage: {
            message: 'Message log added.',
            messageType: 'success',
            ttl: 3000
        }
    }
}

async function updateMessageLog({ user, contactInfo, existingMessageLog, message, authHeader }) {
    const existingLogId = existingMessageLog.thirdPartyLogId;
    let userInfoResponse;
    try {
        userInfoResponse = await axios.get(`${user.platformAdditionalInfo.restUrl}query/CorporateUser?fields=id,name&where=masterUserID=${user.id.replace('-bullhorn', '')}`,
            {
                headers: {
                    BhRestToken: user.platformAdditionalInfo.bhRestToken
                }
            });
    }
    catch (e) {
        if (isAuthError(e.response.status)) {
            user = await refreshSessionToken(user);
            userInfoResponse = await axios.get(`${user.platformAdditionalInfo.restUrl}query/CorporateUser?fields=id,name&where=masterUserID=${user.id.replace('-bullhorn', '')}`,
                {
                    headers: {
                        BhRestToken: user.platformAdditionalInfo.bhRestToken
                    }
                });
        }
    }
    const userData = userInfoResponse.data.data[0];
    const userName = userData.name;
    const getLogRes = await axios.get(
        `${user.platformAdditionalInfo.restUrl}entity/Note/${existingLogId}?fields=id,comments`,
        {
            headers: {
                BhRestToken: user.platformAdditionalInfo.bhRestToken
            }
        }
    );
    let logBody = getLogRes.data.data.comments;
    let patchBody = {};
    const newMessageLog =
        `<li>${message.direction === 'Inbound' ? `${contactInfo.name} (${contactInfo.phoneNumber})` : userName} ${moment(message.creationTime).format('hh:mm A')}<br>` +
        `<b>${message.subject}</b></li>`;
    logBody = logBody.replace('------------<br><ul>', `------------<br><ul>${newMessageLog}`);

    const regex = RegExp('<br>Conversation.(.*) messages.');
    const matchResult = regex.exec(logBody);
    logBody = logBody.replace(matchResult[0], `<br>Conversation(${parseInt(matchResult[1]) + 1} messages)`);

    patchBody = {
        comments: logBody,
        dateAdded: message.creationTime
    }
    // I dunno, Bullhorn uses POST as PATCH
    const patchLogRes = await axios.post(
        `${user.platformAdditionalInfo.restUrl}entity/Note/${existingLogId}`,
        patchBody,
        {
            headers: {
                BhRestToken: user.platformAdditionalInfo.bhRestToken
            }
        });
}

async function getCallLog({ user, callLogId, authHeader }) {
    let getLogRes;
    try {
        getLogRes = await axios.get(
            `${user.platformAdditionalInfo.restUrl}entity/Note/${callLogId}?fields=comments,candidates,clientContacts`,
            {
                headers: {
                    BhRestToken: user.platformAdditionalInfo.bhRestToken
                }
            });
    }
    catch (e) {
        if (isAuthError(e.response.status)) {
            user = await refreshSessionToken(user);
            getLogRes = await axios.get(
                `${user.platformAdditionalInfo.restUrl}entity/Note/${callLogId}?fields=comments,candidates,clientContacts`,
                {
                    headers: {
                        BhRestToken: user.platformAdditionalInfo.bhRestToken
                    }
                });
        }
    }
    const logBody = getLogRes.data.data.comments;
    const note = logBody.split('<b>Call details</b>')[0].replaceAll('<br>', '');
    const totalContactCount = getLogRes.data.data.clientContacts.total + getLogRes.data.data.candidates.total;
    let contact = {
        firstName: '',
        lastName: ''
    }
    if (totalContactCount > 0) {
        contact = getLogRes.data.data.clientContacts.total > 0 ? getLogRes.data.data.clientContacts.data[0] : getLogRes.data.data.candidates.data[0];
    }
    return {
        callLogInfo: {
            subject: getLogRes.data.data.comments.split('<li><b>Summary</b>: ')[1].split('<li><b>')[0],
            note,
            contactName: `${contact.firstName} ${contact.lastName}`
        }
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

function isAuthError(statusCode) {
    return statusCode >= 400 && statusCode < 500;
}

exports.getAuthType = getAuthType;
exports.getOauthInfo = getOauthInfo;
exports.getOverridingOAuthOption = getOverridingOAuthOption;
exports.getUserInfo = getUserInfo;
exports.createCallLog = createCallLog;
exports.updateCallLog = updateCallLog;
exports.createMessageLog = createMessageLog;
exports.updateMessageLog = updateMessageLog;
exports.getCallLog = getCallLog;
exports.findContact = findContact;
exports.createContact = createContact;
exports.unAuthorize = unAuthorize;
exports.tempMigrateUserId = tempMigrateUserId;