/* eslint-disable no-param-reassign */
const axios = require('axios');
const moment = require('moment');
const { parsePhoneNumber } = require('awesome-phonenumber');
const { secondsToHoursMinutesSeconds } = require('../../lib/util');
const jwt = require('../../lib/jwt');
const { encode, decoded } = require('../../lib/encode');
const { UserModel } = require('../../models/userModel');

function getAuthType() {
    return 'oauth';
}

async function authValidation({ user }) {
    let pingResponse;
    try {
        pingResponse = await axios.get(
            `${user.platformAdditionalInfo.restUrl}ping`,
            {
                headers: {
                    BhRestToken: user.platformAdditionalInfo.bhRestToken
                }
            });
        if (new Date(pingResponse.data.sessionExpires) < new Date()) {
            user = await refreshSessionToken(user);
        }
        return {
            successful: true,
            status: 200
        }
    }
    catch (e) {
        if (isAuthError(e.response.status)) {
            user = await refreshSessionToken(user);
            try {
                pingResponse = await axios.get(`${user.platformAdditionalInfo.restUrl}ping`,
                    {
                        headers: {
                            BhRestToken: user.platformAdditionalInfo.bhRestToken
                        }
                    });
                return {
                    successful: true,
                    status: 200
                }
            }
            catch (e) {
                return {
                    successful: false,
                    returnMessage: {
                        messageType: 'warning',
                        message: 'It seems like your Bullhorn session has expired. Please re-connect.',
                        ttl: 3000
                    },
                    status: e.response.status
                }
            }
        }
        return {
            successful: false,
            returnMessage: {
                messageType: 'warning',
                message: 'It seems like your Bullhorn session has expired. Please re-connect.',
                ttl: 3000
            },
            status: e.response.status
        }
    }
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
    try {
        const userLoginResponse = await axios.post(`${apiUrl}/login?version=2.0&access_token=${authHeader.split('Bearer ')[1]}`);
        const { BhRestToken: bhRestToken, restUrl } = userLoginResponse.data;
        const userInfoResponse = await axios.get(`${restUrl}query/CorporateUser?fields=id,name,timeZoneOffsetEST,masterUserID&BhRestToken=${bhRestToken}&where=username='${username}'`);
        const userData = userInfoResponse.data.data[0];
        const id = `${userData.masterUserID.toString()}-bullhorn`;
        const name = userData.name;
        // this 5 * 60 is from that Bullhorn uses EST timezone as its reference...
        const timezoneOffset = userData.timeZoneOffsetEST - 5 * 60;
        const timezoneName = '';
        const platformAdditionalInfo = {
            id: userData.id,
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
                message: 'Connected to Bullhorn.',
                ttl: 1000
            }
        };

    }
    catch (e) {
        return {
            successful: false,
            returnMessage: {
                messageType: 'warning',
                message: 'Could not load user information',
                details: [
                    {
                        title: 'Details',
                        items: [
                            {
                                id: '1',
                                type: 'text',
                                text: `Bullhorn was unable to fetch information for the currently logged in user. Please check your permissions in Bullhorn and make sure you have permission to access and read user information.`
                            }
                        ]
                    }
                ],
                ttl: 5000
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
    // remove user credentials
    user.accessToken = '';
    user.refreshToken = '';
    await user.save();
    return {
        returnMessage: {
            messageType: 'success',
            message: 'Logged out of Bullhorn',
            ttl: 1000
        }
    }
}

async function getServerLoggingSettings({ user }) {
    const username = user.platformAdditionalInfo.encodedApiUsername ? decoded(user.platformAdditionalInfo.encodedApiUsername) : '';
    const password = user.platformAdditionalInfo.encodedApiPassword ? decoded(user.platformAdditionalInfo.encodedApiPassword) : '';
    return {
        apiUsername: username,
        apiPassword: password,
    };
}

async function updateServerLoggingSettings({ user, additionalFieldValues }) {
    const username = additionalFieldValues.apiUsername;
    const password = additionalFieldValues.apiPassword;
    user.platformAdditionalInfo = {
        ...user.platformAdditionalInfo,
        encodedApiUsername: username ? encode(username) : '',
        encodedApiPassword: password ? encode(password) : ''
    }
    await user.save();
    return {
        successful: true,
        returnMessage: {
            messageType: 'success',
            message: 'Server logging settings updated',
            ttl: 5000
        },
    };
}

async function findContact({ user, phoneNumber }) {
    let commentActionListResponse;
    let extraDataTracking = {};
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
        extraDataTracking['statusCode'] = e.response.status;
    }
    const commentActionList = commentActionListResponse ? commentActionListResponse.data.commentActionList.map(a => { return { const: a, title: a } }) : [];
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
    // check for Lead
    const leadPersonInfo = await axios.post(
        `${user.platformAdditionalInfo.restUrl}search/Lead?fields=id,name,email,phone,status'`,
        {
            query: `(phone:${phoneNumberWithoutCountryCode} OR mobile:${phoneNumberWithoutCountryCode} OR phone2:${phoneNumberWithoutCountryCode} OR phone3:${phoneNumberWithoutCountryCode}) AND isDeleted:false NOT status:"Converted"`
        },
        {
            headers: {
                BhRestToken: user.platformAdditionalInfo.bhRestToken
            }
        });
    for (const result of leadPersonInfo.data.data) {
        matchedContactInfo.push({
            id: result.id,
            name: result.name,
            phone: result.phone,
            type: 'Lead',
            additionalInfo: commentActionList?.length > 0 ? { noteActions: commentActionList } : null
        });
    }
    extraDataTracking = {
        ratelimitRemaining: candidatePersonInfo.headers['ratelimit-remaining'],
        ratelimitAmount: candidatePersonInfo.headers['ratelimit-limit'],
        ratelimitReset: candidatePersonInfo.headers['ratelimit-reset']
    };

    if (matchedContactInfo.length === 0) {
        let leadStatuses = [];
        try {
            const leadMetaResponse = await axios.get(`${user.platformAdditionalInfo.restUrl}meta/Lead?fields=status`,
                {
                    headers: {
                        BhRestToken: user.platformAdditionalInfo.bhRestToken
                    }
                });
            leadStatuses = leadMetaResponse.data.fields.find(f => f.name === 'status').options.map(s => { return { const: s.value, title: s.label } });
        }
        catch (e) {
            extraDataTracking['statusCode'] = e.response.status;
        }
        let candidateStatuses = [];
        try {
            const candidateMetaResponse = await axios.get(`${user.platformAdditionalInfo.restUrl}meta/Candidate?fields=status`,
                {
                    headers: {
                        BhRestToken: user.platformAdditionalInfo.bhRestToken
                    }
                });
            candidateStatuses = candidateMetaResponse.data.fields.find(f => f.name === 'status').options.map(s => { return { const: s.value, title: s.label } });
        }
        catch (e) {
            extraDataTracking['statusCode'] = e.response.status;
        }
        let contactStatuses = [];
        try {
            const contactMetaResponse = await axios.get(`${user.platformAdditionalInfo.restUrl}meta/ClientContact?fields=status`,
                {
                    headers: {
                        BhRestToken: user.platformAdditionalInfo.bhRestToken
                    }
                });
            contactStatuses = contactMetaResponse.data.fields.find(f => f.name === 'status').options.map(s => { return { const: s.value, title: s.label } });
        }
        catch (e) {
            extraDataTracking['statusCode'] = e.response.status;
        }
        const newContactAdditionalInfo = {
            Lead: {
                status: leadStatuses
            },
            Candidate: {
                status: candidateStatuses
            },
            Contact: {
                status: contactStatuses
            }
        }
        if (commentActionList?.length > 0) {
            newContactAdditionalInfo.noteActions = commentActionList;
        }
        matchedContactInfo.push({
            id: 'createNewContact',
            name: 'Create new contact...',
            additionalInfo: newContactAdditionalInfo ?? null,
            isNewContact: true,
            defaultContactType: 'Lead'
        });
    }

    return {
        successful: true,
        matchedContactInfo,
        extraDataTracking
    };
}

async function createContact({ user, authHeader, phoneNumber, newContactName, newContactType, additionalSubmission }) {
    let commentActionListResponse;
    let extraDataTracking = {};
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
        extraDataTracking['statusCode'] = e.response.status;
    }
    const commentActionList = commentActionListResponse.data.commentActionList.map(a => { return { const: a, title: a } });
    switch (newContactType) {
        case 'Lead':
            const leadPostBody = {
                name: newContactName,
                firstName: newContactName.split(' ')[0],
                lastName: newContactName.split(' ').length > 1 ? newContactName.split(' ')[1] : '',
                phone: phoneNumber.replace(' ', '+'),
                status: additionalSubmission.status
            }
            const leadInfoResp = await axios.put(
                `${user.platformAdditionalInfo.restUrl}entity/Lead`,
                leadPostBody,
                {
                    headers: {
                        BhRestToken: user.platformAdditionalInfo.bhRestToken
                    }
                }
            );
            extraDataTracking = {
                ratelimitRemaining: leadInfoResp.headers['ratelimit-remaining'],
                ratelimitAmount: leadInfoResp.headers['ratelimit-limit'],
                ratelimitReset: leadInfoResp.headers['ratelimit-reset']
            }

            return {
                contactInfo: {
                    id: leadInfoResp.data.changedEntityId,
                    name: newContactName,
                    additionalInfo: commentActionList?.length > 0 ? { noteActions: commentActionList } : null
                },
                returnMessage: {
                    message: `${newContactType} created.`,
                    messageType: 'success',
                    ttl: 2000
                },
                extraDataTracking
            }
        case 'Candidate':
            const candidatePostBody = {
                name: newContactName,
                firstName: newContactName.split(' ')[0],
                lastName: newContactName.split(' ').length > 1 ? newContactName.split(' ')[1] : '',
                phone: phoneNumber.replace(' ', '+'),
                status: additionalSubmission.status
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
            extraDataTracking = {
                ratelimitRemaining: candidateInfoResp.headers['ratelimit-remaining'],
                ratelimitAmount: candidateInfoResp.headers['ratelimit-limit'],
                ratelimitReset: candidateInfoResp.headers['ratelimit-reset']
            }

            return {
                contactInfo: {
                    id: candidateInfoResp.data.changedEntityId,
                    name: newContactName,
                    additionalInfo: commentActionList?.length > 0 ? { noteActions: commentActionList } : null
                },
                returnMessage: {
                    message: `${newContactType} created.`,
                    messageType: 'success',
                    ttl: 2000
                },
                extraDataTracking
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
                        companyDescription: "<strong><span style=\"color: rgb(231,76,60);\">This company was created automatically by the RingCentral App Connect. Feel free to edit, or associate this company's contacts to more appropriate records. </span></strong>"
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
                },
                status: additionalSubmission.status
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

            extraDataTracking = {
                ratelimitRemaining: contactInfoResp.headers['ratelimit-remaining'],
                ratelimitAmount: contactInfoResp.headers['ratelimit-limit'],
                ratelimitReset: contactInfoResp.headers['ratelimit-reset']
            }

            return {
                contactInfo: {
                    id: contactInfoResp.data.changedEntityId,
                    name: newContactName,
                    additionalInfo: commentActionList?.length > 0 ? { noteActions: commentActionList } : null
                },
                returnMessage: {
                    message: `${newContactType} created.`,
                    messageType: 'success',
                    ttl: 2000
                },
                extraDataTracking
            }
    }
}

async function findContactWithName({ user, authHeader, name }) {
    let commentActionListResponse;
    let extraDataTracking = {};
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
        extraDataTracking['statusCode'] = e.response.status;
    }
    const commentActionList = commentActionListResponse.data.commentActionList.map(a => { return { const: a, title: a } });
    const matchedContactInfo = [];
    // Search by full name components
    const nameComponents = name.trim().split(' ');
    const searchQueries = [];

    // Full name exact match
    searchQueries.push(`name:"${name}" AND isDeleted:false`);

    // First + Last name combinations
    // if (nameComponents.length >= 2) {
    //     const firstName = nameComponents[0];
    //     const lastName = nameComponents[nameComponents.length - 1];
    //     searchQueries.push(`firstName:${firstName} AND lastName:${lastName} AND isDeleted:false`);
    // }

    // First name only
    searchQueries.push(`firstName:${nameComponents[0]} AND isDeleted:false`);

    // Last name only if provided
    if (nameComponents.length > 1) {
        searchQueries.push(`lastName:${nameComponents[nameComponents.length - 1]} AND isDeleted:false`);
    }
    const combinedQuery = searchQueries.map(query => `(${query})`).join(' OR ');
    // Make single API call with combined query
    const contactSearchResponse = await axios.post(
        `${user.platformAdditionalInfo.restUrl}search/ClientContact?fields=id,name,email,phone'`,
        { query: combinedQuery },
        {
            headers: {
                BhRestToken: user.platformAdditionalInfo.bhRestToken
            }
        }
    );
    const seenIds = new Set();
    const uniqueContactResults = [];
    if (contactSearchResponse?.data?.data?.length > 0) {
        contactSearchResponse.data.data.forEach(result => {
            if (!seenIds.has(result.id)) {
                seenIds.add(result.id);
                uniqueContactResults.push(result);
            }
        });
    }
    for (const result of uniqueContactResults) {
        matchedContactInfo.push({
            id: result.id,
            name: result.name,
            phone: result.phone,
            type: 'Contact',
            additionalInfo: commentActionList?.length > 0 ? { noteActions: commentActionList } : null
        });
    }

    const candidatePersonInfo = await axios.post(
        `${user.platformAdditionalInfo.restUrl}search/Candidate?fields=id,name,email,phone'`,
        {
            query: combinedQuery
        },
        {
            headers: {
                BhRestToken: user.platformAdditionalInfo.bhRestToken
            }
        }
    );
    const candidateIds = new Set();
    const uniqueCandidateResults = [];
    if (candidatePersonInfo?.data?.data?.length > 0) {
        candidatePersonInfo.data.data.forEach(result => {
            if (!candidateIds.has(result.id)) {
                candidateIds.add(result.id);
                uniqueCandidateResults.push(result);
            }
        });
    }
    for (const result of uniqueCandidateResults) {
        matchedContactInfo.push({
            id: result.id,
            name: result.name,
            phone: result.phone,
            type: 'Candidate',
            additionalInfo: commentActionList?.length > 0 ? { noteActions: commentActionList } : null
        });
    }

    //Search Candidates
    const leadPersonInfo = await axios.post(
        `${user.platformAdditionalInfo.restUrl}search/Lead?fields=id,name,email,phone,status'`,
        {
            query: combinedQuery
        },
        {
            headers: {
                BhRestToken: user.platformAdditionalInfo.bhRestToken
            }
        }
    );
    const leadIds = new Set();
    const uniqueLeadResults = [];
    if (leadPersonInfo?.data?.data?.length > 0) {
        leadPersonInfo.data.data.forEach(result => {
            if (!leadIds.has(result.id)) {
                leadIds.add(result.id);
                uniqueLeadResults.push(result);
            }
        });
    }
    for (const result of uniqueLeadResults) {
        matchedContactInfo.push({
            id: result.id,
            name: result.name,
            phone: result.phone,
            type: 'Lead',
            additionalInfo: commentActionList?.length > 0 ? { noteActions: commentActionList } : null
        });
    }
    extraDataTracking = {
        ratelimitRemaining: leadPersonInfo.headers['ratelimit-remaining'],
        ratelimitAmount: leadPersonInfo.headers['ratelimit-limit'],
        ratelimitReset: leadPersonInfo.headers['ratelimit-reset']
    };
    return {
        successful: true,
        matchedContactInfo,
        extraDataTracking
    };
}

async function createCallLog({ user, contactInfo, authHeader, callLog, note, additionalSubmission, aiNote, transcript }) {
    const noteActions = (additionalSubmission?.noteActions ?? '') || 'pending note';
    let assigneeId = null;
    if (additionalSubmission?.isAssignedToUser) {
        if (additionalSubmission.adminAssignedUserToken) {
            try {
                const unAuthData = jwt.decodeJwt(additionalSubmission.adminAssignedUserToken);
                const assigneeUser = await UserModel.findByPk(unAuthData.id);
                if (assigneeUser) {
                    assigneeId = assigneeUser.platformAdditionalInfo.id;
                }
            }
            catch (e) {
                console.log('Error decoding admin assigned user token', e);
            }
        }

        if (!assigneeId) {
            try {
                const userInfoResponse = await axios.get(
                    `${user.platformAdditionalInfo.restUrl}query/CorporateUser?fields=id,firstName,lastName&where=isDeleted=false`,
                    {
                        headers: {
                            BhRestToken: user.platformAdditionalInfo.bhRestToken
                        }
                    }
                );
                if (userInfoResponse?.data?.data?.length > 0) {
                    const targetUserRcName = additionalSubmission.adminAssignedUserName;
                    const targetUser = userInfoResponse.data.data.find(u => `${u.firstName} ${u.lastName}` === targetUserRcName);
                    if (targetUser) {
                        assigneeId = targetUser.id;
                    }
                }
            }
            catch (e) {
                console.log('Error getting user data from phone number', e);
            }
        }
    }
    const subject = callLog.customSubject ?? `${callLog.direction} Call ${callLog.direction === 'Outbound' ? `to ${contactInfo.name}` : `from ${contactInfo.name}`}`;
    let comments = '';;
    if (user.userSettings?.addCallLogNote?.value ?? true) { comments = upsertCallAgentNote({ body: comments, note }); }
    comments += '<b>Call details</b><ul>';
    if (user.userSettings?.addCallSessionId?.value ?? false) { comments = upsertCallSessionId({ body: comments, id: callLog.sessionId }); }
    if (user.userSettings?.addCallLogSubject?.value ?? true) { comments = upsertCallSubject({ body: comments, subject }); }
    if (user.userSettings?.addCallLogContactNumber?.value ?? false) { comments = upsertContactPhoneNumber({ body: comments, phoneNumber: contactInfo.phoneNumber, direction: callLog.direction }); }
    if (user.userSettings?.addCallLogDateTime?.value ?? true) { comments = upsertCallDateTime({ body: comments, startTime: callLog.startTime, timezoneOffset: user.timezoneOffset }); }
    if (user.userSettings?.addCallLogDuration?.value ?? true) { comments = upsertCallDuration({ body: comments, duration: callLog.duration }); }
    if (user.userSettings?.addCallLogResult?.value ?? true) { comments = upsertCallResult({ body: comments, result: callLog.result }); }
    if (!!callLog.recording?.link && (user.userSettings?.addCallLogRecording?.value ?? true)) { comments = upsertCallRecording({ body: comments, recordingLink: callLog.recording.link }); }
    comments += '</ul>';
    if (!!aiNote && (user.userSettings?.addCallLogAiNote?.value ?? true)) { comments = upsertAiNote({ body: comments, aiNote }); }
    if (!!transcript && (user.userSettings?.addCallLogTranscript?.value ?? true)) { comments = upsertTranscript({ body: comments, transcript }); }
    const putBody = {
        comments,
        personReference: {
            id: contactInfo.id
        },
        action: noteActions,
        dateAdded: callLog.startTime,
        externalID: callLog.sessionId,
        minutesSpent: callLog.duration / 60
    }
    if (assigneeId) {
        putBody.commentingPerson = {
            id: assigneeId
        }
    }
    let addLogRes;
    let extraDataTracking = {
        withSmartNoteLog: !!aiNote && (user.userSettings?.addCallLogAiNote?.value ?? true),
        withTranscript: !!transcript && (user.userSettings?.addCallLogTranscript?.value ?? true)
    };
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
        extraDataTracking.ratelimitRemaining = addLogRes.headers['ratelimit-remaining'];
        extraDataTracking.ratelimitAmount = addLogRes.headers['ratelimit-limit'];
        extraDataTracking.ratelimitReset = addLogRes.headers['ratelimit-reset'];
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
            message: 'Call logged',
            messageType: 'success',
            ttl: 2000
        },
        extraDataTracking
    };
}

async function updateCallLog({ user, existingCallLog, authHeader, recordingLink, subject, note, startTime, duration, result, aiNote, transcript, additionalSubmission }) {
    const existingBullhornLogId = existingCallLog.thirdPartyLogId;
    let getLogRes
    let extraDataTracking = {};;
    try {
        getLogRes = await axios.get(
            `${user.platformAdditionalInfo.restUrl}entity/Note/${existingBullhornLogId}?fields=comments`,
            {
                headers: {
                    BhRestToken: user.platformAdditionalInfo.bhRestToken
                }
            });
        extraDataTracking = {
            ratelimitRemaining: getLogRes.headers['ratelimit-remaining'],
            ratelimitAmount: getLogRes.headers['ratelimit-limit'],
            ratelimitReset: getLogRes.headers['ratelimit-reset']
        }
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
        extraDataTracking['statusCode'] = e.response.status;
    }
    let comments = getLogRes.data.data.comments;

    if (!!note && (user.userSettings?.addCallLogNote?.value ?? true)) { comments = upsertCallAgentNote({ body: comments, note }); }
    if (!!existingCallLog.sessionId && (user.userSettings?.addCallSessionId?.value ?? false)) { comments = upsertCallSessionId({ body: comments, id: existingCallLog.sessionId }); }
    if (!!subject && (user.userSettings?.addCallLogSubject?.value ?? true)) { comments = upsertCallSubject({ body: comments, subject }); }
    if (!!startTime && (user.userSettings?.addCallLogDateTime?.value ?? true)) { comments = upsertCallDateTime({ body: comments, startTime, timezoneOffset: user.timezoneOffset }); }
    if (!!duration && (user.userSettings?.addCallLogDuration?.value ?? true)) { comments = upsertCallDuration({ body: comments, duration }); }
    if (!!result && (user.userSettings?.addCallLogResult?.value ?? true)) { comments = upsertCallResult({ body: comments, result }); }
    if (!!recordingLink && (user.userSettings?.addCallLogRecording?.value ?? true)) { comments = upsertCallRecording({ body: comments, recordingLink }); }
    if (!!aiNote && (user.userSettings?.addCallLogAiNote?.value ?? true)) { comments = upsertAiNote({ body: comments, aiNote }); }
    if (!!transcript && (user.userSettings?.addCallLogTranscript?.value ?? true)) { comments = upsertTranscript({ body: comments, transcript }); }

    // case: reassign to user
    let assigneeId = null;
    if (additionalSubmission?.isAssignedToUser) {
        try {
            const userInfoResponse = await axios.get(
                `${user.platformAdditionalInfo.restUrl}query/CorporateUser?fields=id,firstName,lastName&where=isDeleted=false`,
                {
                    headers: {
                        BhRestToken: user.platformAdditionalInfo.bhRestToken
                    }
                }
            );
            if (userInfoResponse?.data?.data?.length > 0) {
                const targetUserRcName = additionalSubmission.adminAssignedUserName;
                const targetUser = userInfoResponse.data.data.find(u => `${u.firstName} ${u.lastName}` === targetUserRcName);
                if (targetUser) {
                    assigneeId = targetUser.id;
                }
            }
        }
        catch (e) {
            console.log('Error getting user data from phone number', e);
        }
    }
    // I dunno, Bullhorn just uses POST as PATCH
    const postBody = {
        comments,
        dateAdded: startTime,
        minutesSpent: duration / 60
    }
    if (assigneeId) {
        postBody.commentingPerson = {
            id: assigneeId
        }
    }
    try {
        const postLogRes = await axios.post(
            `${user.platformAdditionalInfo.restUrl}entity/Note/${existingBullhornLogId}`,
            postBody,
            {
                headers: {
                    BhRestToken: user.platformAdditionalInfo.bhRestToken
                }
            });
        extraDataTracking = {
            ratelimitRemaining: postLogRes.headers['ratelimit-remaining'],
            ratelimitAmount: postLogRes.headers['ratelimit-limit'],
            ratelimitReset: postLogRes.headers['ratelimit-reset']
        }
    }
    catch (e) {
        if (e.response.status === 403) {
            return {
                extraDataTracking,
                returnMessage: {
                    messageType: 'warning',
                    message: 'It seems like your Bullhorn account does not have permission to update Note. Refer to details for more information.',
                    details: [
                        {
                            title: 'Details',
                            items: [
                                {
                                    id: '1',
                                    type: 'text',
                                    text: `Please go to user settings -> Call and SMS logging and turn ON one-time call logging and try again.`
                                }
                            ]
                        }
                    ],
                    ttl: 3000
                }
            }
        }
    }
    return {
        updatedNote: postBody.comments,
        returnMessage: {
            message: 'Call log updated.',
            messageType: 'success',
            ttl: 2000
        },
        extraDataTracking
    };
}

async function upsertCallDisposition({ user, existingCallLog, authHeader, dispositions }) {
    let extraDataTracking = {};
    const noteActions = (dispositions.noteActions ?? '') || 'pending note';

    const existingBullhornLogId = existingCallLog.thirdPartyLogId;
    const postBody = {
        action: noteActions
    }
    try {
        const upsertDispositionRes = await axios.post(
            `${user.platformAdditionalInfo.restUrl}entity/Note/${existingBullhornLogId}`,
            postBody,
            {
                headers: {
                    BhRestToken: user.platformAdditionalInfo.bhRestToken
                }
            });
        extraDataTracking = {
            ratelimitRemaining: upsertDispositionRes.headers['ratelimit-remaining'],
            ratelimitAmount: upsertDispositionRes.headers['ratelimit-limit'],
            ratelimitReset: upsertDispositionRes.headers['ratelimit-reset']
        }
    }
    catch (e) {
        if (e.response.status === 403) {
            return {
                extraDataTracking,
                returnMessage: {
                    messageType: 'warning',
                    message: 'It seems like your Bullhorn account does not have permission to update Note. Refer to details for more information.',
                    details: [
                        {
                            title: 'Details',
                            items: [
                                {
                                    id: '1',
                                    type: 'text',
                                    text: `Please go to user settings -> Call and SMS logging and turn ON one-time call logging and try again.`
                                }
                            ]
                        }
                    ],
                    ttl: 3000
                }
            }
        }
    }
    return {
        logId: existingBullhornLogId,
        extraDataTracking
    }
}

async function createMessageLog({ user, contactInfo, authHeader, message, additionalSubmission, recordingLink, faxDocLink }) {
    const noteActions = additionalSubmission?.noteActions ?? '';
    let userInfoResponse;
    let extraDataTracking = {};;
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
    const messageType = recordingLink ? 'Voicemail' : (faxDocLink ? 'Fax' : 'SMS');
    let subject = '';
    let comments = '';
    switch (messageType) {
        case 'SMS':
            subject = `SMS conversation with ${contactInfo.name} - ${moment(message.creationTime).utcOffset(Number(user.timezoneOffset)).format('YY/MM/DD')}`;
            comments =
                `<br><b>${subject}</b><br>` +
                '<b>Conversation summary</b><br>' +
                `${moment(message.creationTime).utcOffset(Number(user.timezoneOffset)).format('dddd, MMMM DD, YYYY')}<br>` +
                'Participants<br>' +
                `<ul><li><b>${userName}</b><br></li>` +
                `<li><b>${contactInfo.name}</b></li></ul><br>` +
                'Conversation(1 messages)<br>' +
                'BEGIN<br>' +
                '------------<br>' +
                '<ul>' +
                `<li>${message.direction === 'Inbound' ? `${contactInfo.name} (${contactInfo.phoneNumber})` : userName} ${moment(message.creationTime).utcOffset(Number(user.timezoneOffset)).format('hh:mm A')}<br>` +
                `<b>${message.subject}</b></li>` +
                '</ul>' +
                '------------<br>' +
                'END<br><br>' +
                '--- Created via RingCentral App Connect';
            break;
        case 'Voicemail':
            subject = `Voicemail left by ${contactInfo.name} - ${moment(message.creationTime).utcOffset(Number(user.timezoneOffset)).format('YY/MM/DD')}`;
            comments = `<br><b>${subject}</b><br>Voicemail recording link: ${recordingLink} <br><br>--- Created via RingCentral App Connect`;
            break;
        case 'Fax':
            subject = `Fax document sent from ${contactInfo.name} - ${moment(message.creationTime).utcOffset(Number(user.timezoneOffset)).format('YY/MM/DD')}`;
            comments = `<br><b>${subject}</b><br>Fax document link: ${faxDocLink} <br><br>--- Created via RingCentral App Connect`;
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
    extraDataTracking = {
        ratelimitRemaining: addLogRes.headers['ratelimit-remaining'],
        ratelimitAmount: addLogRes.headers['ratelimit-limit'],
        ratelimitReset: addLogRes.headers['ratelimit-reset']
    }
    return {
        logId: addLogRes.data.changedEntityId,
        returnMessage: {
            message: 'Message logged',
            messageType: 'success',
            ttl: 1000
        },
        extraDataTracking
    }
}

async function updateMessageLog({ user, contactInfo, existingMessageLog, message, authHeader }) {
    const existingLogId = existingMessageLog.thirdPartyLogId;
    let userInfoResponse;
    let extraDataTracking = {};;
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
        `<li>${message.direction === 'Inbound' ? `${contactInfo.name} (${contactInfo.phoneNumber})` : userName} ${moment(message.creationTime).utcOffset(Number(user.timezoneOffset)).format('hh:mm A')}<br>` +
        `<b>${message.subject}</b></li>`;
    // Add new message at the end (before the closing </ul> tag inside BEGIN/END block)
    logBody = logBody.replace('</ul>------------<br>', `${newMessageLog}</ul>------------<br>`);

    const regex = RegExp('<br>Conversation.(.*) messages.');
    const matchResult = regex.exec(logBody);
    logBody = logBody.replace(matchResult[0], `<br>Conversation(${parseInt(matchResult[1]) + 1} messages)`);

    patchBody = {
        comments: logBody,
        dateAdded: message.creationTime
    }
    try {
        // I dunno, Bullhorn uses POST as PATCH
        const patchLogRes = await axios.post(
            `${user.platformAdditionalInfo.restUrl}entity/Note/${existingLogId}`,
            patchBody,
            {
                headers: {
                    BhRestToken: user.platformAdditionalInfo.bhRestToken
                }
            });
        extraDataTracking = {
            ratelimitRemaining: patchLogRes.headers['ratelimit-remaining'],
            ratelimitAmount: patchLogRes.headers['ratelimit-limit'],
            ratelimitReset: patchLogRes.headers['ratelimit-reset']
        }
    }
    catch (e) {
        if (e.response.status === 403) {
            return {
                extraDataTracking,
                returnMessage: {
                    messageType: 'warning',
                    message: 'It seems like your Bullhorn account does not have permission to update Note. Refer to details for more information.',
                    details: [
                        {
                            title: 'Details',
                            items: [
                                {
                                    id: '1',
                                    type: 'text',
                                    text: `Please go to user settings -> Call and SMS logging and turn ON one-time call logging and try again.`
                                }
                            ]
                        }
                    ],
                    ttl: 3000
                }
            }
        }
    }
    return {
        extraDataTracking
    }
}

async function getCallLog({ user, callLogId, authHeader }) {
    let getLogRes;
    let extraDataTracking = {};;
    try {
        getLogRes = await axios.get(
            `${user.platformAdditionalInfo.restUrl}entity/Note/${callLogId}?fields=comments,candidates,clientContacts,action`,
            {
                headers: {
                    BhRestToken: user.platformAdditionalInfo.bhRestToken
                }
            });
        extraDataTracking = {
            ratelimitRemaining: getLogRes.headers['ratelimit-remaining'],
            ratelimitAmount: getLogRes.headers['ratelimit-limit'],
            ratelimitReset: getLogRes.headers['ratelimit-reset']
        }
    }
    catch (e) {
        if (isAuthError(e.response.status)) {
            user = await refreshSessionToken(user);
            getLogRes = await axios.get(
                `${user.platformAdditionalInfo.restUrl}entity/Note/${callLogId}?fields=comments,candidates,clientContacts,action`,
                {
                    headers: {
                        BhRestToken: user.platformAdditionalInfo.bhRestToken
                    }
                });
            extraDataTracking['statusCode'] = e.response.status;
        }
    }
    const logBody = getLogRes.data.data.comments;
    const note = logBody.split('<b>Agent notes</b>')[1]?.split('<b>Call details</b>')[0]?.replaceAll('<br>', '') ?? '';
    const subject = logBody.split('</ul>')[0]?.split('<li><b>Summary</b>: ')[1]?.split('<li><b>')[0] ?? '';
    const action = getLogRes.data.data.action;
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
            subject,
            note,
            contactName: `${contact.firstName} ${contact.lastName}`,
            dispositions: {
                noteActions: action
            }
        },
        extraDataTracking
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

function upsertCallAgentNote({ body, note }) {
    if (!note) {
        return body;
    }
    const noteRegex = RegExp('<b>Agent notes</b>([\\s\\S]+?)Call details</b>');
    if (noteRegex.test(body)) {
        body = body.replace(noteRegex, `<b>Agent notes</b><br>${note}<br><br><b>Call details</b>`);
    }
    else {
        body = `<b>Agent notes</b><br>${note}<br><br>` + body;
    }
    return body;
}

function upsertCallSessionId({ body, id }) {
    const idRegex = RegExp('<li><b>Session Id</b>: (.+?)(?:<li>|</ul>)');
    if (idRegex.test(body)) {
        body = body.replace(idRegex, (match, p1) => `<li><b>Session Id</b>: ${id}${p1.endsWith('</ul>') ? '</ul>' : '<li>'}`);
    } else {
        body += `<li><b>Session Id</b>: ${id}<li>`;
    }
    return body;
}

function upsertCallSubject({ body, subject }) {
    const subjectRegex = RegExp('<li><b>Summary</b>: (.+?)(?:<li>|</ul>)');
    if (subjectRegex.test(body)) {
        body = body.replace(subjectRegex, (match, p1) => `<li><b>Summary</b>: ${subject}${p1.endsWith('</ul>') ? '</ul>' : '<li>'}`);
    } else {
        body += `<li><b>Summary</b>: ${subject}<li>`;
    }
    return body;
}

function upsertContactPhoneNumber({ body, phoneNumber, direction }) {
    const phoneNumberRegex = RegExp(`<li><b>${direction === 'Outbound' ? 'Recipient' : 'Caller'} phone number</b>: (.+?)(?:<li>|</ul>)`);
    if (phoneNumberRegex.test(body)) {
        body = body.replace(phoneNumberRegex, (match, p1) => `<li><b>${direction === 'Outbound' ? 'Recipient' : 'Caller'} phone number</b>: ${phoneNumber}${p1.endsWith('</ul>') ? '</ul>' : '<li>'}`);
    } else {
        body += `<li><b>${direction === 'Outbound' ? 'Recipient' : 'Caller'} phone number</b>: ${phoneNumber}<li>`;
    }
    return body;
}

function upsertCallDateTime({ body, startTime, timezoneOffset }) {
    const dateTimeRegex = RegExp('<li><b>Date/time</b>: (.+?)(?:<li>|</ul>)');
    if (dateTimeRegex.test(body)) {
        const updatedDateTime = moment(startTime).utcOffset(Number(timezoneOffset)).format('YYYY-MM-DD hh:mm:ss A');
        body = body.replace(dateTimeRegex, (match, p1) => `<li><b>Date/time</b>: ${updatedDateTime}${p1.endsWith('</ul>') ? '</ul>' : '<li>'}`);
    } else {
        body += `<li><b>Date/time</b>: ${moment(startTime).utcOffset(Number(timezoneOffset)).format('YYYY-MM-DD hh:mm:ss A')}<li>`;
    }
    return body;
}

function upsertCallDuration({ body, duration }) {
    const durationRegex = RegExp('<li><b>Duration</b>: (.+?)(?:<li>|</ul>)');
    if (durationRegex.test(body)) {
        body = body.replace(durationRegex, (match, p1) => `<li><b>Duration</b>: ${secondsToHoursMinutesSeconds(duration)}${p1.endsWith('</ul>') ? '</ul>' : '<li>'}`);
    } else {
        body += `<li><b>Duration</b>: ${secondsToHoursMinutesSeconds(duration)}<li>`;
    }
    return body;
}

function upsertCallResult({ body, result }) {
    const resultRegex = RegExp('<li><b>Result</b>: (.+?)(?:<li>|</ul>)');
    if (resultRegex.test(body)) {
        body = body.replace(resultRegex, (match, p1) => `<li><b>Result</b>: ${result}${p1.endsWith('</ul>') ? '</ul>' : '<li>'}`);
    } else {
        body += `<li><b>Result</b>: ${result}<li>`;
    }
    return body;
}

function upsertCallRecording({ body, recordingLink }) {
    const recordingLinkRegex = RegExp('<li><b>Call recording link</b>: (.+?)(?:<li>|</ul>)');
    if (recordingLink) {
        if (recordingLinkRegex.test(body)) {
            body = body.replace(recordingLinkRegex, (match, p1) => `<li><b>Call recording link</b>: <a target="_blank" href=${recordingLink}>open</a>${p1.endsWith('</ul>') ? '</ul>' : '<li>'}`);
        }
        else {
            let text = '';
            // a real link
            if (recordingLink.startsWith('http')) {
                text = `<li><b>Call recording link</b>: <a target="_blank" href=${recordingLink}>open</a><li>`;
            } else {
                // placeholder
                text = '<li><b>Call recording link</b>: (pending...)<li>';
            }
            if (body.indexOf('</ul>') === -1) {
                body += text;
            } else {
                body = body.replace('</ul>', `${text}</ul>`);
            }
        }
    }
    return body;
}

function upsertAiNote({ body, aiNote }) {
    if (!aiNote) {
        return body;
    }
    const formattedAiNote = aiNote.replace(/\n+$/, '').replace(/(?:\r\n|\r|\n)/g, '<br>');
    const aiNoteRegex = RegExp('<div><b>AI Note</b><br>(.+?)</div>');
    if (aiNoteRegex.test(body)) {
        body = body.replace(aiNoteRegex, `<div><b>AI Note</b><br>${formattedAiNote}</div>`);
    } else {
        body += `<div><b>AI Note</b><br>${formattedAiNote}</div><br>`;
    }
    return body;
}

function upsertTranscript({ body, transcript }) {
    if (!transcript) {
        return body;
    }
    const formattedTranscript = transcript.replace(/(?:\r\n|\r|\n)/g, '<br>');
    const transcriptRegex = RegExp('<div><b>Transcript</b><br>(.+?)</div>');
    if (transcriptRegex.test(body)) {
        body = body.replace(transcriptRegex, `<div><b>Transcript</b><br>${formattedTranscript}</div>`);
    } else {
        body += `<div><b>Transcript</b><br>${formattedTranscript}</div><br>`;
    }
    return body;
}

exports.getAuthType = getAuthType;
exports.authValidation = authValidation;
exports.getOauthInfo = getOauthInfo;
exports.getOverridingOAuthOption = getOverridingOAuthOption;
exports.getUserInfo = getUserInfo;
exports.createCallLog = createCallLog;
exports.updateCallLog = updateCallLog;
exports.upsertCallDisposition = upsertCallDisposition;
exports.createMessageLog = createMessageLog;
exports.updateMessageLog = updateMessageLog;
exports.getCallLog = getCallLog;
exports.findContact = findContact;
exports.createContact = createContact;
exports.unAuthorize = unAuthorize;
exports.findContactWithName = findContactWithName;
exports.getServerLoggingSettings = getServerLoggingSettings;
exports.updateServerLoggingSettings = updateServerLoggingSettings;
