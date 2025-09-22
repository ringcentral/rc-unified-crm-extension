
/* eslint-disable no-param-reassign */
const axios = require('axios');
const moment = require('moment-timezone');
const url = require('url');
const { parsePhoneNumber } = require('awesome-phonenumber');
const jwt = require('@app-connect/core/lib/jwt');
const { UserModel } = require('@app-connect/core/models/userModel');
const { AdminConfigModel } = require('@app-connect/core/models/adminConfigModel');

function getAuthType() {
    return 'oauth';
}

async function getOauthInfo({ hostname }) {
    if (hostname.startsWith('au.')) {
        return {
            clientId: process.env.CLIO_AU_CLIENT_ID,
            clientSecret: process.env.CLIO_AU_CLIENT_SECRET,
            accessTokenUri: process.env.CLIO_AU_ACCESS_TOKEN_URI,
            redirectUri: process.env.CLIO_REDIRECT_URI
        }
    }
    else if (hostname.startsWith('eu.')) {
        return {
            clientId: process.env.CLIO_EU_CLIENT_ID,
            clientSecret: process.env.CLIO_EU_CLIENT_SECRET,
            accessTokenUri: process.env.CLIO_EU_ACCESS_TOKEN_URI,
            redirectUri: process.env.CLIO_REDIRECT_URI
        }
    }
    else if (hostname.startsWith('ca.')) {
        return {
            clientId: process.env.CLIO_CA_CLIENT_ID,
            clientSecret: process.env.CLIO_CA_CLIENT_SECRET,
            accessTokenUri: process.env.CLIO_CA_ACCESS_TOKEN_URI,
            redirectUri: process.env.CLIO_REDIRECT_URI
        }
    } else {
        return {
            clientId: process.env.CLIO_CLIENT_ID,
            clientSecret: process.env.CLIO_CLIENT_SECRET,
            accessTokenUri: process.env.CLIO_ACCESS_TOKEN_URI,
            redirectUri: process.env.CLIO_REDIRECT_URI
        }
    }
}

async function getUserInfo({ authHeader, hostname }) {
    try {
        const userInfoResponse = await axios.get(`https://${hostname}/api/v4/users/who_am_i.json?fields=id,name,time_zone`, {
            headers: {
                'Authorization': authHeader
            }
        });
        const id = `${userInfoResponse.data.data.id.toString()}-clio`;
        const name = userInfoResponse.data.data.name;
        const timezoneName = userInfoResponse.data.data.time_zone;
        // Convert timezone name to offset in minutes (e.g., "America/New_York" -> -300 or -240 depending on DST)
        let timezoneOffset = 0;
        try {
            if (timezoneName) {
                timezoneOffset = moment.tz(timezoneName).utcOffset() / 60;
            }
        } catch (error) {
            timezoneOffset = 0; // Default to UTC if conversion fails
        }

        return {
            successful: true,
            platformUserInfo: {
                id,
                name,
                timezoneName,
                timezoneOffset,
                platformAdditionalInfo: {}
            },
            returnMessage: {
                messageType: 'success',
                message: 'Connected to Clio.',
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
                                text: `Clio was unable to fetch information for the currently logged in user. Please check your permissions in Clio and make sure you have permission to access and read user information.`
                            }
                        ]
                    }
                ],
                ttl: 3000
            }
        }
    }
}
async function unAuthorize({ user }) {
    const revokeUrl = `https://${user.hostname}/oauth/deauthorize`;
    const accessTokenParams = new url.URLSearchParams({
        token: user.accessToken
    });
    const accessTokenRevokeRes = await axios.post(
        revokeUrl,
        accessTokenParams,
        {
            headers: { 'Authorization': `Bearer ${user.accessToken}` }
        });
    // remove user credentials
    user.accessToken = '';
    user.refreshToken = '';
    await user.save();
    return {
        returnMessage: {
            messageType: 'success',
            message: 'Logged out of Clio',
            ttl: 1000
        }
    }
}

async function findContact({ user, authHeader, phoneNumber, overridingFormat, isExtension }) {
    if (isExtension === 'true') {
        return {
            successful: false,
            matchedContactInfo: []
        }
    }
    const numberToQueryArray = [];
    let extraDataTracking = {};
    const numberFromRc = phoneNumber.replace(' ', '+');
    numberToQueryArray.push(numberFromRc);
    if (overridingFormat !== '') {
        const formats = overridingFormat.split(',');
        for (var format of formats) {
            const phoneNumberObj = parsePhoneNumber(numberFromRc);
            if (phoneNumberObj.valid) {
                const phoneNumberWithoutCountryCode = phoneNumberObj.number.significant;
                let formattedNumber = format;
                for (const numberBit of phoneNumberWithoutCountryCode) {
                    formattedNumber = formattedNumber.replace(/[*#]/, numberBit);
                }
                numberToQueryArray.push(formattedNumber);
            }
        }
    }
    const matchedContactInfo = [];
    for (var numberToQuery of numberToQueryArray) {
        const personInfo = await axios.get(
            `https://${user.hostname}/api/v4/contacts.json?type=Person&query=${numberToQuery}&fields=id,name,title,company`,
            {
                headers: { 'Authorization': authHeader }
            });
        extraDataTracking = {
            ratelimitRemaining: personInfo.headers['x-ratelimit-remaining'],
            ratelimitAmount: personInfo.headers['x-ratelimit-limit'],
            ratelimitReset: personInfo.headers['x-ratelimit-reset']
        };
        if (personInfo.data.data.length > 0) {
            for (var result of personInfo.data.data) {
                if (matchedContactInfo.some(c => c.id === result.id)) {
                    continue;
                }
                const matterInfo = await axios.get(
                    `https://${user.hostname}/api/v4/matters.json?client_id=${result.id}&fields=id,display_number,description,status`,
                    {
                        headers: { 'Authorization': authHeader }
                    });
                let matters = matterInfo.data.data.length > 0 ? matterInfo.data.data.map(m => { return { const: m.id, title: m.display_number, description: m.description, status: m.status } }) : null;
                if (!user.userSettings?.clioSeeClosedMatters?.value) {
                    matters = matters?.filter(m => m.status !== 'Closed');
                }
                let associatedMatterInfo = await axios.get(
                    `https://${user.hostname}/api/v4/relationships.json?contact_id=${result.id}&fields=matter{id,display_number,description,status}`,
                    {
                        headers: { 'Authorization': authHeader }
                    });
                extraDataTracking = {
                    ratelimitRemaining: associatedMatterInfo.headers['x-ratelimit-remaining'],
                    ratelimitAmount: associatedMatterInfo.headers['x-ratelimit-limit'],
                    ratelimitReset: associatedMatterInfo.headers['x-ratelimit-reset']
                };
                let associatedMatters = associatedMatterInfo.data.data.length > 0 ? associatedMatterInfo.data.data.map(m => { return { const: m.matter.id, title: m.matter.display_number, description: m.matter.description, status: m.matter.status } }) : null;
                associatedMatters = associatedMatters?.filter(m => m.status !== 'Closed');
                let returnedMatters = [];
                returnedMatters = returnedMatters.concat(matters ?? []);
                returnedMatters = returnedMatters.concat(associatedMatters ?? []);
                matchedContactInfo.push({
                    id: result.id,
                    name: result.name,
                    title: result.title ?? "",
                    company: result.company?.name ?? "",
                    phone: numberFromRc,
                    additionalInfo: returnedMatters.length > 0 ?
                        {
                            matters: returnedMatters,
                            logTimeEntry: user.userSettings?.clioDefaultTimeEntryTick ?? true,
                            nonBillable: user.userSettings?.clioDefaultNonBillableTick ?? false
                        } :
                        {
                            logTimeEntry: user.userSettings?.clioDefaultTimeEntryTick ?? true
                        }
                })
            }
        }
    }
    matchedContactInfo.push({
        id: 'createNewContact',
        name: 'Create new contact...',
        additionalInfo: { logTimeEntry: true },
        isNewContact: true
    });
    return {
        successful: true,
        matchedContactInfo,
        extraDataTracking
    };
}

async function findContactWithName({ user, authHeader, name }) {
    const matchedContactInfo = [];
    let extraDataTracking = {};
    /*
    Clio's contact search functionality works correctly with name-based queries, including first name, last name, and full name. 
    It handles all variations without requiring the query to be split
    */
    const personInfo = await axios.get(`https://${user.hostname}/api/v4/contacts.json?type=Person&query=${name}&fields=id,name,title,company,primary_phone_number`, {
        headers: { 'Authorization': authHeader }
    });
    extraDataTracking = {
        ratelimitRemaining: personInfo.headers['x-ratelimit-remaining'],
        ratelimitAmount: personInfo.headers['x-ratelimit-limit'],
        ratelimitReset: personInfo.headers['x-ratelimit-reset']
    };
    if (personInfo.data.data.length > 0) {
        for (var result of personInfo.data.data) {
            const matterInfo = await axios.get(
                `https://${user.hostname}/api/v4/matters.json?client_id=${result.id}&fields=id,display_number,description,status`,
                {
                    headers: { 'Authorization': authHeader }
                });
            let matters = matterInfo.data.data.length > 0 ? matterInfo.data.data.map(m => { return { const: m.id, title: m.display_number, description: m.description, status: m.status } }) : null;
            matters = matters?.filter(m => m.status !== 'Closed');
            let associatedMatterInfo = await axios.get(
                `https://${user.hostname}/api/v4/relationships.json?contact_id=${result.id}&fields=matter{id,display_number,description,status}`,
                {
                    headers: { 'Authorization': authHeader }
                });
            extraDataTracking = {
                ratelimitRemaining: associatedMatterInfo.headers['x-ratelimit-remaining'],
                ratelimitAmount: associatedMatterInfo.headers['x-ratelimit-limit'],
                ratelimitReset: associatedMatterInfo.headers['x-ratelimit-reset']
            };
            let associatedMatters = associatedMatterInfo.data.data.length > 0 ? associatedMatterInfo.data.data.map(m => { return { const: m.matter.id, title: m.matter.display_number, description: m.matter.description, status: m.matter.status } }) : null;
            associatedMatters = associatedMatters?.filter(m => m.status !== 'Closed');
            let returnedMatters = [];
            returnedMatters = returnedMatters.concat(matters ?? []);
            returnedMatters = returnedMatters.concat(associatedMatters ?? []);
            matchedContactInfo.push({
                id: result.id,
                name: result.name,
                title: result.title ?? "",
                type: 'contact',
                company: result.company?.name ?? "",
                phone: result.primary_phone_number ?? "",
                additionalInfo: returnedMatters.length > 0 ?
                    {
                        matters: returnedMatters,
                        logTimeEntry: user.userSettings?.clioDefaultTimeEntryTick ?? true,
                        nonBillable: user.userSettings?.clioDefaultNonBillableTick ?? false
                    } :
                    {
                        logTimeEntry: user.userSettings?.clioDefaultTimeEntryTick ?? true
                    }
            })
        }
    }

    return {
        successful: true,
        matchedContactInfo,
        extraDataTracking
    }
}

async function createContact({ user, authHeader, phoneNumber, newContactName }) {
    let extraDataTracking = {};
    const personInfo = await axios.post(
        `https://${user.hostname}/api/v4/contacts.json`,
        {
            data: {
                name: newContactName,
                type: 'Person',
                phone_numbers: [
                    {
                        name: "Work",
                        number: phoneNumber,
                        default_number: true
                    }
                ],
            }
        },
        {
            headers: { 'Authorization': authHeader }
        }
    );
    extraDataTracking = {
        ratelimitRemaining: personInfo.headers['x-ratelimit-remaining'],
        ratelimitAmount: personInfo.headers['x-ratelimit-limit'],
        ratelimitReset: personInfo.headers['x-ratelimit-reset']
    };

    return {
        contactInfo: {
            id: personInfo.data.data.id,
            name: personInfo.data.data.name
        },
        returnMessage: {
            message: `Contact created.`,
            messageType: 'success',
            ttl: 2000
        },
        extraDataTracking
    }
}

async function getUserList({ user, authHeader }) {
    const userListResponse = await axios.get(`https://${user.hostname}/api/v4/users.json?enabled=true&order=name(asc)&fields=id,name,email`, {
        headers: { 'Authorization': authHeader }
    });

    const userList = [];
    if (userListResponse?.data?.data?.length > 0) {
        for (const user of userListResponse.data.data) {
            userList.push({
                id: user.id,
                name: user.name ?? `${user.first_name} ${user.last_name}`,
                email: user.email
            });
        }
    }
    return userList;
}

async function createCallLog({ user, contactInfo, authHeader, callLog, note, additionalSubmission, aiNote, transcript, composedLogDetails, hashedAccountId }) {
    const sender = callLog.direction === 'Outbound' ?
        {
            id: user.id.split('-')[0],
            type: 'User'
        } :
        {
            id: contactInfo.id,
            type: 'Contact'
        }
    const receiver = callLog.direction === 'Outbound' ?
        {
            id: contactInfo.id,
            type: 'Contact'
        } :
        {
            id: user.id.split('-')[0],
            type: 'User'
        }

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
            const adminConfig = await AdminConfigModel.findByPk(hashedAccountId);
            assigneeId = adminConfig.userMappings?.find(mapping => mapping.rcExtensionId === additionalSubmission.adminAssignedUserRcId)?.crmUserId;
        }
    }

    if (assigneeId) {
        switch (callLog.direction) {
            case 'Outbound':
                sender.id = assigneeId;
                break;
            case 'Inbound':
                receiver.id = assigneeId;
                break;
        }
    }

    let extraDataTracking = {
        withSmartNoteLog: !!aiNote && (user.userSettings?.addCallLogAiNote?.value ?? true),
        withTranscript: !!transcript && (user.userSettings?.addCallLogTranscript?.value ?? true)
    };
    if (composedLogDetails === '') {
        composedLogDetails = 'No details available';
    }
    const postBody = {
        data: {
            subject: callLog.customSubject ?? `[Call] ${callLog.direction} Call ${callLog.direction === 'Outbound' ? 'to' : 'from'} ${contactInfo.name} [${contactInfo.phone}]`,
            body: composedLogDetails,
            type: 'PhoneCommunication',
            received_at: moment(callLog.startTime).toISOString(),
            senders: [sender],
            receivers: [receiver],
            notification_event_subscribers: [
                {
                    user_id: user.id.split('-')[0]
                }
            ]
        }
    }
    if (additionalSubmission && additionalSubmission.matters) {
        postBody.data['matter'] = { id: additionalSubmission.matters };
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
            type: 'TimeEntry',
            non_billable: additionalSubmission.nonBillable,
            note: composedLogDetails
        }
    }
    const addTimerRes = await axios.post(
        `https://${user.hostname}/api/v4/activities.json`,
        addTimerBody,
        {
            headers: { 'Authorization': authHeader }
        });
    extraDataTracking = {
        ratelimitRemaining: addTimerRes.headers['x-ratelimit-remaining'],
        ratelimitAmount: addTimerRes.headers['x-ratelimit-limit'],
        ratelimitReset: addTimerRes.headers['x-ratelimit-reset']
    };
    return {
        logId: communicationId,
        returnMessage: {
            message: 'Call logged',
            messageType: 'success',
            ttl: 2000
        },
        extraDataTracking
    };
}

async function updateCallLog({ user, existingCallLog, authHeader, recordingLink, subject, note, startTime, duration, result, aiNote, transcript, additionalSubmission, composedLogDetails, existingCallLogDetails, hashedAccountId }) {
    const existingClioLogId = existingCallLog.thirdPartyLogId.split('.')[0];
    let extraDataTracking = {};
    // Use passed existingCallLogDetails to avoid duplicate API call
    let getLogRes = null;
    if (existingCallLogDetails) {
        getLogRes = { data: { data: existingCallLogDetails } };
    } else {
        // Fallback to API call if details not provided
        getLogRes = await axios.get(
            `https://${user.hostname}/api/v4/communications/${existingClioLogId}.json?fields=body,id`,
            {
                headers: { 'Authorization': authHeader }
            });
    }

    let patchBody = {};

    patchBody = {
        data: {
            body: composedLogDetails
        }
    }
    if (subject) { patchBody.data.subject = subject; }
    if (startTime) { patchBody.data.received_at = moment(startTime).toISOString(); }
    // duration - update Timer
    if (duration) {
        const logId = existingCallLogDetails?.id || getLogRes.data.data.id;
        const getTimerRes = await axios.get(
            `https://${user.hostname}/api/v4/activities?communication_id=${logId}&fields=quantity,id`,
            {
                headers: { 'Authorization': authHeader }
            }
        )
        if (getTimerRes.data.data[0]) {
            const patchTimerBody = {
                data: {
                    quantity: duration,
                    note: composedLogDetails,
                }
            }
            if (startTime) {
                patchTimerBody.data.date = moment(startTime).toISOString();
            }
            const patchTimerRes = await axios.patch(
                `https://${user.hostname}/api/v4/activities/${getTimerRes.data.data[0].id}.json`,
                patchTimerBody,
                {
                    headers: { 'Authorization': authHeader }
                });
        }
    }

    let assigneeId = null;
    if (additionalSubmission?.isAssignedToUser) {
        const adminConfig = await AdminConfigModel.findByPk(hashedAccountId);
        assigneeId = adminConfig.userMappings?.find(mapping => mapping.rcExtensionId === additionalSubmission.adminAssignedUserRcId)?.crmUserId;
    }

    if (assigneeId) {
        if (getLogRes.data.data.senders[0].type === 'User') {
            patchBody.data.senders = [{
                id: assigneeId,
                type: 'User'
            }];
        }
        else if (getLogRes.data.data.receivers[0].type === 'User') {
            patchBody.data.receivers = [{
                id: assigneeId,
                type: 'User'
            }];
        }
    }
    const patchLogRes = await axios.patch(
        `https://${user.hostname}/api/v4/communications/${existingClioLogId}.json`,
        patchBody,
        {
            headers: { 'Authorization': authHeader }
        });
    extraDataTracking = {
        ratelimitRemaining: patchLogRes.headers['x-ratelimit-remaining'],
        ratelimitAmount: patchLogRes.headers['x-ratelimit-limit'],
        ratelimitReset: patchLogRes.headers['x-ratelimit-reset']
    };
    return {
        updatedNote: patchBody.data?.body,
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
    if (!dispositions.matters) {
        return {
            logId: null
        };
    }
    const existingClioLogId = existingCallLog.thirdPartyLogId.split('.')[0];
    const patchBody = {
        data: {
            matter: {
                id: dispositions.matters
            }
        }
    }
    const upsertDispositionRes = await axios.patch(
        `https://${user.hostname}/api/v4/communications/${existingClioLogId}.json`,
        patchBody,
        {
            headers: { 'Authorization': authHeader }
        });
    extraDataTracking = {
        ratelimitRemaining: upsertDispositionRes.headers['x-ratelimit-remaining'],
        ratelimitAmount: upsertDispositionRes.headers['x-ratelimit-limit'],
        ratelimitReset: upsertDispositionRes.headers['x-ratelimit-reset']
    };
    return {
        logId: existingClioLogId,
        extraDataTracking
    }
}

async function createMessageLog({ user, contactInfo, authHeader, message, additionalSubmission, recordingLink, faxDocLink, faxDownloadLink }) {
    let extraDataTracking = {};
    const sender =
    {
        id: contactInfo.id,
        type: 'Contact'
    }
    const receiver =
    {
        id: user.id.split('-')[0],
        type: 'User'
    }
    const userInfoResponse = await axios.get(`https://${user.hostname}/api/v4/users/who_am_i.json?fields=name`, {
        headers: {
            'Authorization': authHeader
        }
    });
    const userName = userInfoResponse.data.data.name;
    const messageType = recordingLink ? 'Voicemail' : (faxDocLink ? 'Fax' : 'SMS');
    let logBody = '';
    let logSubject = '';
    switch (messageType) {
        case 'SMS':
            logSubject = `SMS conversation with ${contactInfo.name} - ${moment(message.creationTime).format('MM/DD/YYYY')}`;
            logBody =
                '\nConversation summary\n' +
                `${moment(message.creationTime).format('dddd, MMMM DD, YYYY')}\n` +
                'Participants\n' +
                `    ${userName}\n` +
                `    ${contactInfo.name}\n` +
                '\nConversation(1 messages)\n' +
                'BEGIN\n' +
                '------------\n' +
                `${message.direction === 'Inbound' ? `${contactInfo.name} (${contactInfo.phoneNumber})` : userName} ${moment(message.creationTime).format('hh:mm A')}\n` +
                `${message.subject}\n` +
                '------------\n' +
                'END\n\n' +
                '--- Created via RingCentral App Connect';
            break;
        case 'Voicemail':
            logSubject = `Voicemail left by ${contactInfo.name} - ${moment(message.creationTime).format('MM/DD/YYYY')}`;
            logBody = `Voicemail recording link: ${recordingLink} \n\n--- Created via RingCentral App Connect`;
            break;
        case 'Fax':
            try {
                // download media from server mediaLink (application/pdf) - do this first because RC Access Token might expire during the process
                const mediaRes = await axios.get(faxDownloadLink, { responseType: 'arraybuffer' });
                const documentUploadIdResponse = await axios.post(`
                    https://${user.hostname}/api/v4/documents?fields=id,latest_document_version{uuid,put_url,put_headers}`,
                    {
                        data: {
                            name: `${message.direction} Fax - ${contactInfo.name} - ${moment(message.creationTime).format('MM/DD/YYYY')}.pdf`,
                            parent: {
                                id: additionalSubmission.matters ?? contactInfo.id,
                                type: additionalSubmission.matters ? 'Matter' : 'Contact'
                            },
                            received_at: moment(message.creationTime).toISOString()
                        }
                    },
                    {
                        headers: { 'Authorization': authHeader }
                    }
                )
                const documentId = documentUploadIdResponse.data.data.id;
                const uuid = documentUploadIdResponse.data.data.latest_document_version.uuid;
                const putUrl = documentUploadIdResponse.data.data.latest_document_version.put_url;
                const putHeaders = documentUploadIdResponse.data.data.latest_document_version.put_headers.reduce((acc, header) => {
                    acc[header.name] = header.value;
                    return acc;
                }, {});
                const putDocumentResponse = await axios.put(
                    putUrl,
                    mediaRes.data,
                    {
                        headers: {
                            'Connection': 'keep-alive',
                            ...putHeaders
                        }
                    }
                );
                const patchDocResponse = await axios.patch(
                    `https://${user.hostname}/api/v4/documents/${documentId}?fields=id,latest_document_version{fully_uploaded}`,
                    {
                        data: {
                            uuid,
                            fully_uploaded: true
                        }
                    },
                    {
                        headers: { 'Authorization': authHeader }
                    }
                )
                logSubject = `Fax document sent from ${contactInfo.name} - ${moment(message.creationTime).format('YY/MM/DD')}`;
                if (patchDocResponse.data.data.latest_document_version.fully_uploaded) {
                    logBody = `Fax uploaded to Clio successfully.\nFax Status: ${message.messageStatus}\nPage count: ${message.faxPageCount}\nFax document link: https://${user.hostname}/nc/#/documents/${documentId}/details\nLocation: ${message.direction === 'Inbound' ? message.from.location : message.to[0].location} \n\n--- Created via RingCentral App Connect`;
                }
                else {
                    logBody = `Fax failed to be uploaded to Clio.\nFax document link: ${faxDocLink} \n\n--- Created via RingCentral App Connect`;
                }
            }
            catch (e) {
                logSubject = `Fax document sent from ${contactInfo.name} - ${moment(message.creationTime).format('YY/MM/DD')}`;
                logBody = `Fax failed to be uploaded to Clio.\nFax document link: ${faxDocLink} \n\n--- Created via RingCentral App Connect`;
            }
            break;
    }
    const postBody = {
        data: {
            subject: logSubject,
            body: logBody,
            type: 'PhoneCommunication',
            received_at: moment(message.creationTime).toISOString(),
            senders: [sender],
            receivers: [receiver],
            notification_event_subscribers: [
                {
                    user_id: user.id.split('-')[0]
                }
            ]
        }
    }
    if (additionalSubmission && additionalSubmission.matters) {
        postBody.data['matter'] = { id: additionalSubmission.matters };
    }
    const addLogRes = await axios.post(
        `https://${user.hostname}/api/v4/communications.json`,
        postBody,
        {
            headers: { 'Authorization': authHeader }
        });
    extraDataTracking = {
        ratelimitRemaining: addLogRes.headers['x-ratelimit-remaining'],
        ratelimitAmount: addLogRes.headers['x-ratelimit-limit'],
        ratelimitReset: addLogRes.headers['x-ratelimit-reset']
    };
    return {
        logId: addLogRes.data.data.id,
        returnMessage: {
            message: 'Message logged',
            messageType: 'success',
            ttl: 1000
        },
        extraDataTracking
    };
}

async function updateMessageLog({ user, contactInfo, existingMessageLog, message, authHeader }) {
    let extraDataTracking = {};
    const existingClioLogId = existingMessageLog.thirdPartyLogId.split('.')[0];
    const getLogRes = await axios.get(
        `https://${user.hostname}/api/v4/communications/${existingClioLogId}.json?fields=body`,
        {
            headers: { 'Authorization': authHeader }
        });
    const userInfoResponse = await axios.get(`https://${user.hostname}/api/v4/users/who_am_i.json?fields=name`, {
        headers: {
            'Authorization': authHeader
        }
    });
    const userName = userInfoResponse.data.data.name;
    let logBody = getLogRes.data.data.body;
    let patchBody = {};
    const originalNote = logBody.split('BEGIN\n------------\n')[1];
    const endMarker = '------------\nEND';
    const newMessageLog =
        `${message.direction === 'Inbound' ? `${contactInfo.name} (${contactInfo.phoneNumber})` : userName} ${moment(message.creationTime).format('hh:mm A')}\n` +
        `${message.subject}\n\n`;
    logBody = logBody.replace(endMarker, `${newMessageLog}${endMarker}`);

    const regex = RegExp('Conversation.(.*) messages.');
    const matchResult = regex.exec(logBody);
    logBody = logBody.replace(matchResult[0], `Conversation(${parseInt(matchResult[1]) + 1} messages)`);

    patchBody = {
        data: {
            body: logBody
        }
    }
    const patchLogRes = await axios.patch(
        `https://${user.hostname}/api/v4/communications/${existingClioLogId}.json`,
        patchBody,
        {
            headers: { 'Authorization': authHeader }
        });

    extraDataTracking = {
        ratelimitRemaining: patchLogRes.headers['x-ratelimit-remaining'],
        ratelimitAmount: patchLogRes.headers['x-ratelimit-limit'],
        ratelimitReset: patchLogRes.headers['x-ratelimit-reset']
    };
    return {
        extraDataTracking
    }
}

async function getCallLog({ user, callLogId, authHeader }) {
    let extraDataTracking = {};
    const formattedLogId = callLogId.split('.')[0];
    const getLogRes = await axios.get(
        `https://${user.hostname}/api/v4/communications/${formattedLogId}.json?fields=subject,body,matter,senders,receivers,id`,
        {
            headers: { 'Authorization': authHeader }
        });
    //const note = getLogRes.data.data.body.split('- Note: ')[1]?.split('\n')[0];
    const noteRegex = /- (?:Note|Agent notes): ([\s\S]*?)(?=\n- [A-Z][a-zA-Z\s/]*:|\n$|$)/;
    const note = getLogRes.data.data.body.match(noteRegex)?.[1]?.trim();
    const contactId = getLogRes.data.data.senders[0].type == 'Person' ?
        getLogRes.data.data.senders[0].id :
        getLogRes.data.data.receivers[0].id;
    const contactRes = await axios.get(
        `https://${user.hostname}/api/v4/contacts/${contactId}.json?fields=name`,
        {
            headers: { 'Authorization': authHeader }
        });
    extraDataTracking = {
        ratelimitRemaining: contactRes.headers['x-ratelimit-remaining'],
        ratelimitAmount: contactRes.headers['x-ratelimit-limit'],
        ratelimitReset: contactRes.headers['x-ratelimit-reset']
    };
    return {
        callLogInfo: {
            subject: getLogRes.data.data.subject,
            note,
            fullBody: getLogRes?.data?.data?.body,
            fullLogResponse: getLogRes.data.data,
            contactName: contactRes.data.data.name,
            dispositions: {
                matters: getLogRes.data.data.matter?.id
            }
        },
        extraDataTracking
    }
}
exports.getAuthType = getAuthType;
exports.getOauthInfo = getOauthInfo;
exports.getUserInfo = getUserInfo;
exports.getUserList = getUserList;
exports.createCallLog = createCallLog;
exports.updateCallLog = updateCallLog;
exports.upsertCallDisposition = upsertCallDisposition;
exports.getCallLog = getCallLog;
exports.createMessageLog = createMessageLog;
exports.updateMessageLog = updateMessageLog;
exports.findContact = findContact;
exports.createContact = createContact;
exports.unAuthorize = unAuthorize;
exports.findContactWithName = findContactWithName;