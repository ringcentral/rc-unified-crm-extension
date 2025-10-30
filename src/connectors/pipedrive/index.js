/* eslint-disable no-param-reassign */
const axios = require('axios');
const moment = require('moment');
const url = require('url');
const { parsePhoneNumber } = require('awesome-phonenumber');
const jwt = require('@app-connect/core/lib/jwt');
const { UserModel } = require('@app-connect/core/models/userModel');
const { AdminConfigModel } = require('@app-connect/core/models/adminConfigModel');
const { LOG_DETAILS_FORMAT_TYPE } = require('@app-connect/core/lib/constants');

function getAuthType() {
    return 'oauth';
}

function getLogFormatType() {
    return LOG_DETAILS_FORMAT_TYPE.HTML;
}

async function getOauthInfo() {
    return {
        clientId: process.env.PIPEDRIVE_CLIENT_ID,
        clientSecret: process.env.PIPEDRIVE_CLIENT_SECRET,
        accessTokenUri: process.env.PIPEDRIVE_ACCESS_TOKEN_URI,
        redirectUri: process.env.PIPEDRIVE_REDIRECT_URI
    }
}

async function getUserInfo({ authHeader, hostname }) {
    try {
        const userInfoResponse = await axios.get('https://api.pipedrive.com/v1/users/me', {
            headers: {
                'Authorization': authHeader
            }
        });
        const id = `${userInfoResponse.data.data.id.toString()}-pipedrive`;
        const name = userInfoResponse.data.data.name;
        const timezoneName = userInfoResponse.data.data.timezone_name;
        const timezoneOffset = userInfoResponse.data.data.timezone_offset;
        return {
            successful: true,
            platformUserInfo: {
                id,
                name,
                timezoneName,
                timezoneOffset,
                platformAdditionalInfo: {
                    companyId: userInfoResponse.data.data.company_id,
                    companyName: userInfoResponse.data.data.company_name,
                    companyDomain: userInfoResponse.data.data.company_domain,
                },
                overridingHostname: hostname == 'temp' ? `${userInfoResponse.data.data.company_domain}.pipedrive.com` : null
            },
            returnMessage: {
                messageType: 'success',
                message: 'Connected to Pipedrive.',
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
                                text: `Pipedrive was unable to fetch information for the currently logged in user. Please check your permissions in Pipedrive and make sure you have permission to access and read user information.`
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
    // remove user credentials
    user.accessToken = '';
    user.refreshToken = '';
    await user.save();
    return {
        returnMessage: {
            messageType: 'success',
            message: 'Logged out of Pipedrive',
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
    let extraDataTracking = {};
    phoneNumber = phoneNumber.replace(' ', '+')
    // without + is an extension, we don't want to search for that
    if (!phoneNumber.includes('+')) {
        return {
            matchedContactInfo: null,
            returnMessage: {
                message: 'Logging against internal extension number is not supported.',
                messageType: 'warning',
                ttl: 3000
            }
        };
    }
    const phoneNumberObj = parsePhoneNumber(phoneNumber);
    let phoneNumberWithoutCountryCode = phoneNumber;
    if (phoneNumberObj.valid) {
        phoneNumberWithoutCountryCode = phoneNumberObj.number.significant;
    }
    const personInfo = await axios.get(
        `https://${user.hostname}/api/v2/persons/search?term=${phoneNumberWithoutCountryCode}&fields=phone`,
        {
            headers: { 'Authorization': authHeader }
        });
    extraDataTracking = {
        ratelimitRemaining: personInfo.headers['x-ratelimit-remaining'],
        ratelimitAmount: personInfo.headers['x-ratelimit-limit'],
        ratelimitReset: personInfo.headers['x-ratelimit-reset']
    };
    const matchedContactInfo = [];
    for (const person of personInfo.data.data.items) {
        const dealsResponse = await axios.get(
            `https://${user.hostname}/api/v2/deals?person_id=${person.item.id}&&status=open`,
            {
                headers: { 'Authorization': authHeader }
            });
        extraDataTracking = {
            ratelimitRemaining: dealsResponse.headers['x-ratelimit-remaining'],
            ratelimitAmount: dealsResponse.headers['x-ratelimit-limit'],
            ratelimitReset: dealsResponse.headers['x-ratelimit-reset']
        };
        const relatedDeals = dealsResponse.data.data ?
            dealsResponse.data.data.map(d => { return { const: d.id, title: d.title } })
            : null;
        let leadsResponse = null;
        try {
            leadsResponse = await axios.get(
                `https://${user.hostname}/v1/leads?person_id=${person.item.id}`,
                {
                    headers: { 'Authorization': authHeader }
                });
            extraDataTracking = {
                ratelimitRemaining: leadsResponse.headers['x-ratelimit-remaining'],
                ratelimitAmount: leadsResponse.headers['x-ratelimit-limit'],
                ratelimitReset: leadsResponse.headers['x-ratelimit-reset']
            };
        }
        catch (e) { leadsResponse = null; }
        const relatedLeads = leadsResponse?.data?.data ?
            leadsResponse.data.data.map(l => { return { const: l.id, title: l.title } })
            : null;
        matchedContactInfo.push(formatContact(
            {
                person: person.item,
                phoneNumber,
                relatedDeals,
                relatedLeads
            }));
    }
    matchedContactInfo.push({
        id: 'createNewContact',
        name: 'Create new contact...',
        isNewContact: true
    });
    return {
        successful: true,
        matchedContactInfo,
        extraDataTracking
    };
}
async function findContactWithName({ user, authHeader, name }) {
    let extraDataTracking = {};
    const personInfo = await axios.get(
        `https://${user.hostname}/api/v2/persons/search?term=${name}&fields=name`,
        {
            headers: { 'Authorization': authHeader }
        });
    extraDataTracking = {
        ratelimitRemaining: personInfo.headers['x-ratelimit-remaining'],
        ratelimitAmount: personInfo.headers['x-ratelimit-limit'],
        ratelimitReset: personInfo.headers['x-ratelimit-reset']
    };

    const matchedContactInfo = [];
    for (const person of personInfo.data.data.items) {
        // console.log({ Item: person.item })
        const dealsResponse = await axios.get(
            `https://${user.hostname}/api/v2/deals?person_id=${person.item.id}&&status=open`,
            {
                headers: { 'Authorization': authHeader }
            });
        extraDataTracking = {
            ratelimitRemaining: dealsResponse.headers['x-ratelimit-remaining'],
            ratelimitAmount: dealsResponse.headers['x-ratelimit-limit'],
            ratelimitReset: dealsResponse.headers['x-ratelimit-reset']
        };
        const relatedDeals = dealsResponse.data.data ?
            dealsResponse.data.data.map(d => { return { const: d.id, title: d.title } })
            : null;
        let leadsResponse = null;
        try {
            leadsResponse = await axios.get(
                `https://${user.hostname}/v1/leads?person_id=${person.item.id}`,
                {
                    headers: { 'Authorization': authHeader }
                });
            extraDataTracking = {
                ratelimitRemaining: leadsResponse.headers['x-ratelimit-remaining'],
                ratelimitAmount: leadsResponse.headers['x-ratelimit-limit'],
                ratelimitReset: leadsResponse.headers['x-ratelimit-reset']
            };
        }
        catch (e) { leadsResponse = null; }
        const relatedLeads = leadsResponse?.data?.data ?
            leadsResponse.data.data.map(l => { return { const: l.id, title: l.title } })
            : null;
        matchedContactInfo.push(formatContact({
            person: person.item,
            relatedDeals,
            relatedLeads
        }));
    }
    return {
        successful: true,
        matchedContactInfo,
        extraDataTracking
    };
}

function formatContact({ person, phoneNumber, relatedDeals, relatedLeads }) {
    const additionalInfo = {};
    if (relatedDeals && relatedDeals.length > 0) {
        additionalInfo.deals = relatedDeals;
    }
    if (relatedLeads && relatedLeads.length > 0) {
        additionalInfo.leads = relatedLeads;
    }
    return {
        id: person.id,
        name: person.name,
        phone: phoneNumber,
        mostRecentActivityDate: person.update_time,
        organization: person.organization?.name ?? '',
        additionalInfo: additionalInfo ?? null,
        type: 'contact'
    }
}

async function createContact({ user, authHeader, phoneNumber, newContactName }) {
    let extraDataTracking = {};
    const postBody = {
        name: newContactName,
        phone: phoneNumber
    }
    const createContactRes = await axios.post(
        `https://${user.hostname}/v1/persons`,
        postBody,
        {
            headers: { 'Authorization': authHeader }
        });
    extraDataTracking = {
        ratelimitRemaining: createContactRes.headers['x-ratelimit-remaining'],
        ratelimitAmount: createContactRes.headers['x-ratelimit-limit'],
        ratelimitReset: createContactRes.headers['x-ratelimit-reset']
    };
    return {
        contactInfo: {
            id: createContactRes.data.data.id,
            name: createContactRes.data.data.name
        },
        returnMessage: {
            message: `Contact created.`,
            messageType: 'success',
            ttl: 2000
        },
        extraDataTracking
    }
}

function secondsToHoursMinutesSecondsInPipedriveFormat(seconds) {
    if (typeof seconds !== 'number') {
        return '00:00';
    }
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60) + 1;

    if (hours > 0) {
        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    }
    else {
        return `00:${String(minutes).padStart(2, '0')}`;
    }
}

async function getUserList({ user, authHeader }) {
    const userListResp = await axios.get(
        `https://${user.hostname}/api/v1/users`,
        {
            headers: { 'Authorization': authHeader }
        });
    const userList = userListResp.data.data.filter(user => !user.is_deleted).map(user => ({
        id: user.id,
        name: user.name,
        email: user.email
    }));
    return userList;
}

async function createCallLog({ user, contactInfo, authHeader, callLog, note, additionalSubmission, aiNote, transcript, composedLogDetails, hashedAccountId }) {
    const dealId = additionalSubmission ? additionalSubmission.deals : '';
    const leadId = additionalSubmission ? additionalSubmission.leads : '';
    const personResponse = await axios.get(`https://${user.hostname}/api/v2/persons/${contactInfo.id}`, { headers: { 'Authorization': authHeader } });
    const orgId = personResponse.data.data.org_id ?? '';
    const timeUtc = moment(callLog.startTime).utcOffset(0).format('HH:mm')
    const dateUtc = moment(callLog.startTime).utcOffset(0).format('YYYY-MM-DD');

    let extraDataTracking = {
        withSmartNoteLog: !!aiNote && (user.userSettings?.addCallLogAiNote?.value ?? true),
        withTranscript: !!transcript && (user.userSettings?.addCallLogTranscript?.value ?? true)
    };

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
            assigneeId = adminConfig.userMappings?.find(mapping => typeof (mapping.rcExtensionId) === 'string' ? mapping.rcExtensionId == additionalSubmission.adminAssignedUserRcId : mapping.rcExtensionId.includes(additionalSubmission.adminAssignedUserRcId))?.crmUserId;
        }
    }

    const postBody = {
        owner_id: Number(user.id.split('-')[0]),
        subject: callLog.customSubject ?? `${callLog.direction} Call ${callLog.direction === 'Outbound' ? 'to' : 'from'} ${contactInfo.name}`,
        duration: secondsToHoursMinutesSecondsInPipedriveFormat(callLog.duration),    // secs
        deal_id: dealId,
        note: composedLogDetails,
        done: true,
        due_date: dateUtc,
        due_time: timeUtc,
        participants: [
            {
                person_id: Number(contactInfo.id),
                primary: true
            }
        ]
    }
    if (!dealId && leadId) {
        postBody.lead_id = leadId;
    }
    if (orgId) {
        postBody.org_id = orgId;
    }
    if (assigneeId) {
        postBody.owner_id = Number(assigneeId);
    }
    const addLogRes = await axios.post(
        `https://${user.hostname}/api/v2/activities`,
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
            message: 'Call logged',
            messageType: 'success',
            ttl: 2000
        },
        extraDataTracking
    };
}

async function updateCallLog({ user, existingCallLog, authHeader, recordingLink, subject, note, startTime, duration, result, aiNote, transcript, additionalSubmission, composedLogDetails, existingCallLogDetails, hashedAccountId }) {
    let extraDataTracking = {};
    const existingPipedriveLogId = existingCallLog.thirdPartyLogId;

    // Use passed existingCallLogDetails to avoid duplicate API call
    let getLogRes = null;
    if (existingCallLogDetails) {
        getLogRes = { data: { data: existingCallLogDetails } };
    } else {
        // Fallback to API call if details not provided
        getLogRes = await axios.get(
            `https://${user.hostname}/api/v2/activities/${existingPipedriveLogId}`,
            {
                headers: { 'Authorization': authHeader }
            });
    }

    let assigneeId = null;
    if (additionalSubmission?.isAssignedToUser) {
        const adminConfig = await AdminConfigModel.findByPk(hashedAccountId);
        assigneeId = adminConfig.userMappings?.find(mapping => typeof (mapping.rcExtensionId) === 'string' ? mapping.rcExtensionId == additionalSubmission.adminAssignedUserRcId : mapping.rcExtensionId.includes(additionalSubmission.adminAssignedUserRcId))?.crmUserId;
    }

    let patchBody = {};
    patchBody.note = composedLogDetails;

    if (subject) {
        patchBody.subject = subject;
    }
    if (duration) {
        patchBody.duration = secondsToHoursMinutesSecondsInPipedriveFormat(duration);
    }

    if (assigneeId) {
        patchBody.owner_id = Number(assigneeId);
    }

    const patchLogRes = await axios.patch(
        `https://${user.hostname}/api/v2/activities/${existingPipedriveLogId}`,
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
        updatedNote: patchBody.note,
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
    if (!dispositions.deals && !dispositions.leads) {
        return {
            logId: null
        };
    }
    const existingPipedriveLogId = existingCallLog.thirdPartyLogId;
    const patchBody = {};
    if (dispositions.deals) {
        patchBody.deal_id = dispositions.deals;
        patchBody.lead_id = null;
    }
    else if (dispositions.leads) {
        patchBody.lead_id = dispositions.leads;
        patchBody.deal_id = null;
    }
    const patchLogRes = await axios.patch(
        `https://${user.hostname}/api/v2/activities/${existingPipedriveLogId}`,
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
        logId: existingPipedriveLogId,
        extraDataTracking
    }
}

async function createMessageLog({ user, contactInfo, authHeader, message, additionalSubmission, recordingLink, faxDocLink }) {
    let extraDataTracking = {};
    const userInfoResponse = await axios.get(`https://${user.hostname}/v1/users/me`, {
        headers: {
            'Authorization': authHeader
        }
    });
    const personResponse = await axios.get(`https://${user.hostname}/api/v2/persons/${contactInfo.id}`, { headers: { 'Authorization': authHeader } });

    const userName = userInfoResponse.data.data.name;
    const dealId = additionalSubmission ? additionalSubmission.deals : '';
    const leadId = additionalSubmission ? additionalSubmission.leads : '';
    const orgId = personResponse.data.data.org_id ?? '';
    const timeUtc = moment(message.creationTime).utcOffset(0).format('HH:mm')
    const dateUtc = moment(message.creationTime).utcOffset(0).format('YYYY-MM-DD');
    const activityTypesResponse = await axios.get(`https://${user.hostname}/v1/activityTypes`, { headers: { 'Authorization': authHeader } });
    const smsType = activityTypesResponse.data.data.find(t => t.name === 'SMS' && t.active_flag);

    const messageType = recordingLink ? 'Voicemail' : (faxDocLink ? 'Fax' : 'SMS');
    let subject = '';
    let note = '';
    switch (messageType) {
        case 'SMS':
            subject = `SMS conversation with ${contactInfo.name} - ${moment(message.creationTime).utcOffset(user.timezoneOffset).format('YY/MM/DD')}`;
            note =
                `<br><b>${subject}</b><br>` +
                '<b>Conversation summary</b><br>' +
                `${moment(message.creationTime).utcOffset(user.timezoneOffset).format('dddd, MMMM DD, YYYY')}<br>` +
                'Participants<br>' +
                `<ul><li><b>${userName}</b><br></li>` +
                `<li><b>${contactInfo.name}</b></li></ul><br>` +
                'Conversation(1 messages)<br>' +
                'BEGIN<br>' +
                '------------<br>' +
                '<ul>' +
                `<li>${message.direction === 'Inbound' ? `${contactInfo.name} (${contactInfo.phoneNumber})` : userName} ${moment(message.creationTime).utcOffset(user.timezoneOffset).format('hh:mm A')}<br>` +
                `<b>${message.subject}</b></li>` +
                '</ul>' +
                '------------<br>' +
                'END<br><br>' +
                '--- Created via RingCentral App Connect';
            break;
        case 'Voicemail':
            subject = `Voicemail left by ${contactInfo.name} - ${moment(message.creationTime).utcOffset(user.timezoneOffset).format('YY/MM/DD')}`;
            note = `<br><b>${subject}</b><br>Voicemail recording link: ${recordingLink} <br><br>--- Created via RingCentral App Connect`;
            break;
        case 'Fax':
            subject = `Fax document sent from ${contactInfo.name} - ${moment(message.creationTime).utcOffset(user.timezoneOffset).format('YY/MM/DD')}`;
            note = `<br><b>${subject}</b><br>Fax document link: ${faxDocLink} <br><br>--- Created via RingCentral App Connect`;
            break;
    }
    const postBody = {
        owner_id: Number(user.id.split('-')[0]),
        subject,
        deal_id: dealId,
        note,
        done: true,
        due_date: dateUtc,
        due_time: timeUtc,
        type: smsType ? smsType.key_string : 'call',
        participants: [
            {
                person_id: Number(contactInfo.id),
                primary: true
            }
        ]
    }
    if (!dealId && leadId) {
        postBody.lead_id = leadId;
    }
    if (orgId) {
        postBody.org_id = orgId;
    }
    const addLogRes = await axios.post(
        `https://${user.hostname}/api/v2/activities`,
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

async function updateMessageLog({ user, contactInfo, existingMessageLog, message, authHeader, additionalSubmission }) {
    const dealId = additionalSubmission ? additionalSubmission.deals : '';
    const leadId = additionalSubmission ? additionalSubmission.leads : '';
    let extraDataTracking = {};
    const existingLogId = existingMessageLog.thirdPartyLogId;
    const userInfoResponse = await axios.get('https://api.pipedrive.com/v1/users/me', {
        headers: {
            'Authorization': authHeader
        }
    });
    const userName = userInfoResponse.data.data.name;
    const getLogRes = await axios.get(
        `https://${user.hostname}/api/v2/activities/${existingLogId}`,
        {
            headers: { 'Authorization': authHeader }
        });
    let logBody = getLogRes.data.data.note;
    let patchBody = {};
    const newMessageLog =
        `<li>${message.direction === 'Inbound' ? `${contactInfo.name} (${contactInfo.phoneNumber})` : userName} ${moment(message.creationTime).utcOffset(user.timezoneOffset).format('hh:mm A')}<br>` +
        `<b>${message.subject}</b></li>`;
    // Add new message at the end (before the closing </ul> tag inside BEGIN/END block)
    logBody = logBody.replace('</ul>------------<br>', `${newMessageLog}</ul>------------<br>`);

    const regex = RegExp('<br>Conversation.(.*) messages.');
    const matchResult = regex.exec(logBody);
    logBody = logBody.replace(matchResult[0], `<br>Conversation(${parseInt(matchResult[1]) + 1} messages)`);

    patchBody = {
        note: logBody,
        deal_id: dealId
    }
    if (!dealId && leadId) {
        patchBody.lead_id = leadId;
    }
    const patchLogRes = await axios.patch(
        `https://${user.hostname}/api/v2/activities/${existingLogId}`,
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
    const getLogRes = await axios.get(
        `https://${user.hostname}/api/v2/activities/${callLogId}`,
        {
            headers: { 'Authorization': authHeader }
        });
    extraDataTracking = {
        ratelimitRemaining: getLogRes.headers['x-ratelimit-remaining'],
        ratelimitAmount: getLogRes.headers['x-ratelimit-limit'],
        ratelimitReset: getLogRes.headers['x-ratelimit-reset']
    };
    const logBody = getLogRes.data.data.note;
    const note = logBody.split('<b>Agent notes</b>')[1]?.split('<b>Call details</b>')[0]?.replaceAll('<br>', '') ?? '';
    const relatedContact = getLogRes.data.related_objects?.person;
    let contactName = 'Unknown';
    if (relatedContact) {
        const contactKeys = Object.keys(relatedContact);
        contactName = relatedContact[contactKeys[0]].name;
    }
    return {
        callLogInfo: {
            subject: getLogRes.data.data.subject,
            note,
            contactName,
            fullBody: logBody,
            fullLogResponse: getLogRes?.data?.data,
            dispositions: {
                deals: getLogRes.data.data.deal_id,
                leads: getLogRes.data.data.lead_id
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
exports.createMessageLog = createMessageLog;
exports.updateMessageLog = updateMessageLog;
exports.getCallLog = getCallLog;
exports.findContact = findContact;
exports.createContact = createContact;
exports.unAuthorize = unAuthorize;
exports.findContactWithName = findContactWithName;
exports.getLogFormatType = getLogFormatType;