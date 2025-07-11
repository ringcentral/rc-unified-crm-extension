/* eslint-disable no-param-reassign */
const axios = require('axios');
const moment = require('moment');
const { parsePhoneNumber } = require('awesome-phonenumber');
const { secondsToHoursMinutesSeconds } = require('../../lib/util');
const jwt = require('../../lib/jwt');
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

async function createCallLog({ user, contactInfo, authHeader, callLog, note, additionalSubmission, aiNote, transcript, composedLogDetails }) {
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
    const putBody = {
        comments: composedLogDetails,
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

async function updateCallLog({ user, existingCallLog, authHeader, recordingLink, subject, note, startTime, duration, result, aiNote, transcript, additionalSubmission, composedLogDetails }) {
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
        comments: composedLogDetails,
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
            fullBody: logBody,
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