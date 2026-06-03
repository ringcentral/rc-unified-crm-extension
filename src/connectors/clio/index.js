
/* eslint-disable no-param-reassign */
const axios = require('axios');
const moment = require('moment-timezone');
const url = require('url');
const { parsePhoneNumber } = require('awesome-phonenumber');
const jwt = require('@app-connect/core/lib/jwt');
const { UserModel } = require('@app-connect/core/models/userModel');
const { AdminConfigModel } = require('@app-connect/core/models/adminConfigModel');
const { LOG_DETAILS_FORMAT_TYPE } = require('@app-connect/core/lib/constants');
const logger = require('@app-connect/core/lib/logger');
const { handleDatabaseError } = require('@app-connect/core/lib/errorHandler');

function getAuthType() {
    return 'oauth';
}

function getLogFormatType() {
    return LOG_DETAILS_FORMAT_TYPE.PLAIN_TEXT;
}

function isClioTimeEntriesEnabled(user) {
    const settingValue = user?.userSettings?.clioTimeEntriesEnabled?.value;
    if (settingValue === undefined || settingValue === null) { return true; }
    if (typeof settingValue === 'string') { return settingValue.toLowerCase() === 'true'; }
    return Boolean(settingValue);
}

/**
 * Calculates SMS time tracking details including duration and billable status
 * @param {Object} message - The SMS message object
 * @param {number} message.typingDurationMs - Time spent typing in milliseconds
 * @param {Object} user - User object with settings
 * @returns {Object} Object containing billableTimeSeconds and nonBillable status
 */
function calculateSmsTimeEntry({ message, user }) {
    // Convert typing duration from milliseconds to seconds
    const actualTimeSeconds = (message?.typingDurationMs ?? 0) / 1000;

    // Get minimum duration setting with fallback to 30 seconds
    const minimumDuration = parseInt(user.userSettings?.smsTimeTrackingMinimumDuration?.value ?? "30", 10) || 30;

    // Calculate billable time (actual or minimum, whichever is greater)
    const billableTimeSeconds = Math.max(actualTimeSeconds, minimumDuration);

    // Determine if entry should be non-billable (simplified boolean logic)
    const nonBillable = user.userSettings?.smsTimeTrackingDefaultBillable?.value === 'non-billable';

    return {
        billableTimeSeconds,
        nonBillable,
        actualTimeSeconds,
        minimumDuration
    };
}

async function getOauthInfo({ hostname, isFromMCP }) {
    if (hostname.startsWith('au.')) {
        return {
            clientId: process.env.CLIO_AU_CLIENT_ID,
            clientSecret: process.env.CLIO_AU_CLIENT_SECRET,
            accessTokenUri: process.env.CLIO_AU_ACCESS_TOKEN_URI,
            redirectUri: isFromMCP ? process.env.CLIO_REDIRECT_URI_MCP : process.env.CLIO_REDIRECT_URI
        }
    }
    else if (hostname.startsWith('eu.')) {
        return {
            clientId: process.env.CLIO_EU_CLIENT_ID,
            clientSecret: process.env.CLIO_EU_CLIENT_SECRET,
            accessTokenUri: process.env.CLIO_EU_ACCESS_TOKEN_URI,
            redirectUri: isFromMCP ? process.env.CLIO_REDIRECT_URI_MCP : process.env.CLIO_REDIRECT_URI
        }
    }
    else if (hostname.startsWith('ca.')) {
        return {
            clientId: process.env.CLIO_CA_CLIENT_ID,
            clientSecret: process.env.CLIO_CA_CLIENT_SECRET,
            accessTokenUri: process.env.CLIO_CA_ACCESS_TOKEN_URI,
            redirectUri: isFromMCP ? process.env.CLIO_REDIRECT_URI_MCP : process.env.CLIO_REDIRECT_URI
        }
    } else {
        return {
            clientId: process.env.CLIO_CLIENT_ID,
            clientSecret: process.env.CLIO_CLIENT_SECRET,
            accessTokenUri: process.env.CLIO_ACCESS_TOKEN_URI,
            redirectUri: isFromMCP ? process.env.CLIO_REDIRECT_URI_MCP : process.env.CLIO_REDIRECT_URI
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
            logger.warn('Error getting user info', { stack: error.stack });
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
        logger.error('Error getting user info', { stack: e.stack });
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
    await axios.post(
        revokeUrl,
        accessTokenParams,
        {
            headers: { 'Authorization': `Bearer ${user.accessToken}` }
        });
    // remove user credentials
    user.accessToken = '';
    user.refreshToken = '';
    try {
        await user.save();
    }
    catch (error) {
        return handleDatabaseError(error, 'Error saving user');
    }
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
        for (const format of formats) {
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
    for (const numberToQuery of numberToQueryArray) {
        const personInfo = await axios.get(
            `https://${user.hostname}/api/v4/contacts.json?query=${numberToQuery}&fields=type,id,name,updated_at`,
            {
                headers: { 'Authorization': authHeader }
            });
        extraDataTracking = {
            ratelimitRemaining: personInfo.headers['x-ratelimit-remaining'],
            ratelimitAmount: personInfo.headers['x-ratelimit-limit'],
            ratelimitReset: personInfo.headers['x-ratelimit-reset']
        };
        if (personInfo.data.data.length > 0) {
            for (const result of personInfo.data.data) {
                if (matchedContactInfo.some(c => c.id === result.id)) {
                    continue;
                }
                const matterInfo = await axios.get(
                    `https://${user.hostname}/api/v4/matters.json?client_id=${result.id}&fields=id,display_number,description,status`,
                    {
                        headers: { 'Authorization': authHeader }
                    });
                let matters = matterInfo.data.data.length > 0 ? matterInfo.data.data.map(m => { return { const: m.id, title: m.display_number, description: `${m.status} - ${m.description}`, status: m.status } }) : null;
                if (!user.userSettings?.clioSeeClosedMatters?.value) {
                    matters = matters?.filter(m => m.status !== 'Closed');
                }
                let associatedMatterUrl = `https://${user.hostname}/api/v4/relationships.json?contact_id=${result.id}&fields=matter{id,display_number,description,status}`;
                let associatedMatterInfoResponse;
                let associatedMatterInfo = [];
                do {
                    if (!!associatedMatterInfoResponse?.data?.meta?.paging?.next) {
                        associatedMatterUrl = associatedMatterInfoResponse.data.meta.paging.next;
                    }
                    associatedMatterInfoResponse = await axios.get(
                        associatedMatterUrl,
                        {
                            headers: { 'Authorization': authHeader }
                        });
                    extraDataTracking = {
                        ratelimitRemaining: associatedMatterInfoResponse.headers['x-ratelimit-remaining'],
                        ratelimitAmount: associatedMatterInfoResponse.headers['x-ratelimit-limit'],
                        ratelimitReset: associatedMatterInfoResponse.headers['x-ratelimit-reset']
                    };
                    associatedMatterInfo = associatedMatterInfo.concat(associatedMatterInfoResponse?.data?.data ?? []);
                } while (!!associatedMatterInfoResponse?.data?.meta?.paging?.next);
                let associatedMatters = associatedMatterInfo.length > 0 ? associatedMatterInfo.map(m => { return { const: m.matter.id, title: m.matter.display_number, description: `${m.matter.status} - ${m.matter.description}`, status: m.matter.status } }) : null;
                if (!user.userSettings?.clioSeeClosedMatters?.value) {
                    associatedMatters = associatedMatters?.filter(m => m.status !== 'Closed');
                }
                let returnedMatters = [];
                returnedMatters = returnedMatters.concat(matters ?? []);
                returnedMatters = returnedMatters.concat(associatedMatters ?? []);
                matchedContactInfo.push({
                    id: result.id,
                    name: result.name,
                    phone: numberFromRc,
                    type: result.type,
                    mostRecentActivityDate: result.updated_at,
                    additionalInfo: returnedMatters.length > 0 ?
                        {
                            matters: returnedMatters,
                            logTimeEntry: user.userSettings?.clioDefaultTimeEntryTick ?? true,
                            billableStatus: [
                                { "const": "billable", "title": "Billable" },
                                { "const": "non-billable", "title": "Non-billable" }
                            ]
                        } :
                        {
                            logTimeEntry: user.userSettings?.clioDefaultTimeEntryTick ?? true,
                            billableStatus: [
                                { "const": "billable", "title": "Billable" },
                                { "const": "non-billable", "title": "Non-billable" }
                            ]
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

async function findContactWithName({ user, authHeader, name, appointment }) {
    const matchedContactInfo = [];
    let extraDataTracking = {};
    /*
    Clio's contact search functionality works correctly with name-based queries, including first name, last name, and full name. 
    It handles all variations without requiring the query to be split
    */
    const personInfo = await axios.get(`https://${user.hostname}/api/v4/contacts.json?query=${name}&fields=id,name,primary_email_address,primary_phone_number`, {
        headers: { 'Authorization': authHeader }
    });
    extraDataTracking = {
        ratelimitRemaining: personInfo.headers['x-ratelimit-remaining'],
        ratelimitAmount: personInfo.headers['x-ratelimit-limit'],
        ratelimitReset: personInfo.headers['x-ratelimit-reset']
    };
    if (personInfo.data.data.length > 0) {
        // If appointment is true, only include contacts that have an email.
        for (const result of personInfo.data.data) {
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
                type: 'contact',
                phone: result.primary_phone_number ?? "",
                email: result.primary_email_address ?? "",
                additionalInfo: returnedMatters.length > 0 ?
                    {
                        matters: returnedMatters,
                        logTimeEntry: user.userSettings?.clioDefaultTimeEntryTick ?? true,
                        billableStatus: [
                            { "const": "billable", "title": "Billable" },
                            { "const": "non-billable", "title": "Non-billable" }
                        ]
                    } :
                    {
                        logTimeEntry: user.userSettings?.clioDefaultTimeEntryTick ?? true
                    }
            })
        }
        // for (const result of personInfo.data.data) {
        //     const matterInfo = await axios.get(
        //         `https://${user.hostname}/api/v4/matters.json?client_id=${result.id}&fields=id,display_number,description,status`,
        //         {
        //             headers: { 'Authorization': authHeader }
        //         });
        //     let matters = matterInfo.data.data.length > 0 ? matterInfo.data.data.map(m => { return { const: m.id, title: m.display_number, description: m.description, status: m.status } }) : null;
        //     matters = matters?.filter(m => m.status !== 'Closed');
        //     let associatedMatterInfo = await axios.get(
        //         `https://${user.hostname}/api/v4/relationships.json?contact_id=${result.id}&fields=matter{id,display_number,description,status}`,
        //         {
        //             headers: { 'Authorization': authHeader }
        //         });
        //     extraDataTracking = {
        //         ratelimitRemaining: associatedMatterInfo.headers['x-ratelimit-remaining'],
        //         ratelimitAmount: associatedMatterInfo.headers['x-ratelimit-limit'],
        //         ratelimitReset: associatedMatterInfo.headers['x-ratelimit-reset']
        //     };
        //     let associatedMatters = associatedMatterInfo.data.data.length > 0 ? associatedMatterInfo.data.data.map(m => { return { const: m.matter.id, title: m.matter.display_number, description: m.matter.description, status: m.matter.status } }) : null;
        //     associatedMatters = associatedMatters?.filter(m => m.status !== 'Closed');
        //     let returnedMatters = [];
        //     returnedMatters = returnedMatters.concat(matters ?? []);
        //     returnedMatters = returnedMatters.concat(associatedMatters ?? []);
        //     matchedContactInfo.push({
        //         id: result.id,
        //         name: result.name,
        //         type: 'contact',
        //         phone: result.primary_phone_number ?? "",
        //         additionalInfo: returnedMatters.length > 0 ?
        //             {
        //                 matters: returnedMatters,
        //                 logTimeEntry: user.userSettings?.clioDefaultTimeEntryTick ?? true,
        //                 billableStatus: [
        //                     { "const": "billable", "title": "Billable" },
        //                     { "const": "non-billable", "title": "Non-billable" }
        //                 ]
        //             } :
        //             {
        //                 logTimeEntry: user.userSettings?.clioDefaultTimeEntryTick ?? true
        //             }
        //     })
        // }
    }
    // Reorder matchedContactInfo: contacts with email first, rest last
    if (matchedContactInfo && Array.isArray(matchedContactInfo)) {
        matchedContactInfo.sort((a, b) => {
            // If a has email and b does not, a comes first (-1)
            // If b has email and a does not, b comes first (1)
            // If both have email or neither, order doesn't change (0)
            const aHasEmail = (a.email && a.email.trim() !== '');
            const bHasEmail = (b.email && b.email.trim() !== '');
            if (aHasEmail && !bHasEmail) return -1;
            if (!aHasEmail && bHasEmail) return 1;
            return 0;
        });
    }

    return {
        successful: true,
        matchedContactInfo,
        extraDataTracking
    }
}

async function createContact({ user, authHeader, phoneNumber, newContactName, newContactType = 'Person' }) {
    let extraDataTracking = {};
    const personInfo = await axios.post(
        `https://${user.hostname}/api/v4/contacts.json`,
        {
            data: {
                name: newContactName,
                type: newContactType,
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

async function createCallLog({ user, contactInfo, authHeader, callLog, additionalSubmission, aiNote, transcript, composedLogDetails, hashedAccountId }) {
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
        if (additionalSubmission?.adminAssignedUserToken) {
            try {
                const unAuthData = jwt.decodeJwt(additionalSubmission.adminAssignedUserToken);
                const assigneeUser = await UserModel.findByPk(unAuthData.id);
                if (assigneeUser) {
                    assigneeId = assigneeUser.platformAdditionalInfo.id;
                }
            }
            catch (e) {
                logger.error('Error decoding admin assigned user token', { stack: e.stack });
            }
        }

        if (!assigneeId) {
            const adminConfig = await AdminConfigModel.findByPk(hashedAccountId);
            assigneeId = adminConfig.userMappings?.find(mapping => typeof (mapping.rcExtensionId) === 'string' ? mapping.rcExtensionId == additionalSubmission.adminAssignedUserRcId : mapping.rcExtensionId.includes(additionalSubmission.adminAssignedUserRcId))?.crmUserId;
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
    if (!isClioTimeEntriesEnabled(user)) {
        const extraDataTracking = {
            ratelimitRemaining: addLogRes.headers['x-ratelimit-remaining'],
            ratelimitAmount: addLogRes.headers['x-ratelimit-limit'],
            ratelimitReset: addLogRes.headers['x-ratelimit-reset']
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
    // const nonBillable = additionalSubmission?.nonBillable !== undefined ? additionalSubmission.nonBillable : (user.userSettings?.clioDefaultNonBillableTick?.value ?? true);
    // Determine billable status with clear precedence order
    let nonBillable;

    if (additionalSubmission?.nonBillable !== undefined) {
        // Use explicit nonBillable value if provided
        nonBillable = additionalSubmission.nonBillable;
    } else if (additionalSubmission?.billableStatus !== undefined) {
        // Convert billableStatus to nonBillable (inverse relationship)
        nonBillable = additionalSubmission.billableStatus !== 'billable';
    } else {
        // Fall back to user settings
        const defaultSetting = user.userSettings?.clioDefaultNonBillableTick?.value;
        nonBillable = !(defaultSetting === 'billable' || defaultSetting === false);
    }

    const addTimerBody = {
        data: {
            communication: {
                id: communicationId
            },
            quantity: callLog.duration,
            date: moment(callLog.startTime).toISOString(),
            type: 'TimeEntry',
            non_billable: nonBillable,
            note: composedLogDetails
        }
    }
    if (additionalSubmission && additionalSubmission.matters) {
        addTimerBody.data['matter'] = { id: additionalSubmission.matters };
    }
    const addTimerRes = await axios.post(
        `https://${user.hostname}/api/v4/activities.json`,
        addTimerBody,
        {
            headers: { 'Authorization': authHeader }
        });
    let extraDataTracking = {
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

async function updateCallLog({ user, existingCallLog, authHeader, subject, startTime, duration, additionalSubmission, composedLogDetails, existingCallLogDetails, hashedAccountId }) {
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
    if (duration && isClioTimeEntriesEnabled(user)) {
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
            await axios.patch(
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
        assigneeId = adminConfig.userMappings?.find(mapping => typeof (mapping.rcExtensionId) === 'string' ? mapping.rcExtensionId == additionalSubmission.adminAssignedUserRcId : mapping.rcExtensionId.includes(additionalSubmission.adminAssignedUserRcId))?.crmUserId;
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

async function createMessageLog({ user, contactInfo, correspondents = [], sharedSMSLogContent, authHeader, message, additionalSubmission, recordingLink, faxDocLink, faxDownloadLink, imageLink, imageDownloadLink, imageContentType, videoLink }) {
    let extraDataTracking = {};
    let logBody = '';
    let logSubject = '';
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
    // Case: shared SMS
    if (sharedSMSLogContent?.subject && sharedSMSLogContent?.body) {
        logSubject = sharedSMSLogContent.subject;
        logBody = sharedSMSLogContent.body;
    }
    // Case: normal SMS
    else {
        let messageType = 'SMS';
        let messageSubject = message.subject;
        if (recordingLink) {
            messageType = 'Voicemail';
        }
        else if (faxDocLink) {
            messageType = 'Fax';
        }
        else if (imageLink) {
            messageType = 'Image';
        }
        else if (videoLink) {
            messageType = 'Video';
        }
        switch (messageType) {
            case 'SMS':
            case 'Video':
            case 'Image':
                if (messageType === 'Image') {
                    try {
                        messageSubject = await uploadImageToClio({ user, authHeader, imageDownloadLink, imageContentType, message, contactInfo, additionalSubmission, messageSubject, logBody });
                    }
                    catch (e) {
                        messageSubject = `[Message]: ${messageSubject ?? 'N/A'}\n[Link - failed to upload]: ${imageDownloadLink}`;
                    }
                }
                logSubject = `SMS conversation with ${contactInfo.name} - ${moment(message.creationTime).utcOffset(Number(user.timezoneOffset)).format('MM/DD/YYYY')}`;
                logBody =
                    '\nConversation summary\n' +
                    `${moment(message.creationTime).utcOffset(Number(user.timezoneOffset)).format('dddd, MMMM DD, YYYY')}\n` +
                    'Participants\n' +
                    `    ${userName}\n` +
                    `    ${contactInfo.name}\n` +
                    `${correspondents.map(c => `    ${c[0]?.name ?? 'Unknown'}`).join('\n')}` +
                    '\nConversation(1 messages)\n' +
                    'BEGIN\n' +
                    '------------\n' +
                    `${message.direction === 'Inbound' ? `${contactInfo.name} (${contactInfo.phoneNumber})` : userName} ${moment(message.creationTime).utcOffset(Number(user.timezoneOffset)).format('hh:mm A')}\n` +
                    `${messageSubject}\n` +
                    '------------\n' +
                    'END\n\n' +
                    '--- Created via RingCentral App Connect';
                break;
            case 'Voicemail':
                logSubject = `Voicemail left by ${contactInfo.name} - ${moment(message.creationTime).utcOffset(Number(user.timezoneOffset)).format('MM/DD/YYYY')}`;
                logBody = `Voicemail recording link: ${recordingLink} \n\n--- Created via RingCentral App Connect`;
                break;
            case 'Fax':
                try {
                    const uploadFaxResult = await uploadFaxToClio({ user, authHeader, faxDownloadLink, faxDocLink, message, contactInfo, additionalSubmission, logSubject, logBody });
                    logSubject = uploadFaxResult.logSubject;
                    logBody = uploadFaxResult.logBody;
                }
                catch (e) {
                    logger.error('Error uploading fax document', { stack: e.stack });
                    logSubject = `Fax document sent from ${contactInfo.name} - ${moment(message.creationTime).utcOffset(Number(user.timezoneOffset)).format('YY/MM/DD')}`;
                    logBody = `Fax failed to be uploaded to Clio.\nFax document link: ${faxDocLink} \n\n--- Created via RingCentral App Connect`;
                }
                break;
        }
    }
    const postBody = {
        data: {
            subject: logSubject,
            body: logBody,
            type: 'PhoneCommunication',
            received_at: sharedSMSLogContent ? moment(sharedSMSLogContent.conversationCreatedDate).toISOString() : moment(message.creationTime).toISOString(),
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
    // Create SMS time entry if SMS time tracking is enabled
    if (user.userSettings?.smsTimeTrackingEnabled?.value && message.direction === 'Outbound') {
        try {
            const { billableTimeSeconds, nonBillable } = calculateSmsTimeEntry({ message, user });
            const timeEntryBody = {
                data: {
                    type: "TimeEntry",
                    date: moment(message.creationTime).format('YYYY-MM-DD'),
                    quantity: billableTimeSeconds,
                    note: `SMS message with ${contactInfo.name} sent on ${moment(message.creationTime).utcOffset(Number(user.timezoneOffset)).format('MM/DD/YYYY')} at ${moment(message.creationTime).utcOffset(Number(user.timezoneOffset)).format('HH:mm:ss')}`,
                    communication: {
                        id: addLogRes.data.data.id
                    },
                    non_billable: nonBillable
                }
            };

            // Add matter to time entry if available
            if (additionalSubmission?.matters) {
                timeEntryBody.data.matter = { id: additionalSubmission.matters };
            }

            const timeEntryRes = await axios.post(
                `https://${user.hostname}/api/v4/activities.json`,
                timeEntryBody,
                {
                    headers: { 'Authorization': authHeader }
                });

        } catch (timeEntryError) {
            console.error('Failed to create SMS time entry:', timeEntryError.message);
            // Don't fail the main function if time entry creation fails
        }
    }
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

async function updateMessageLog({ user, contactInfo, sharedSMSLogContent, existingMessageLog, message, authHeader, imageLink, imageDownloadLink, imageContentType, videoLink, additionalSubmission }) {
    let extraDataTracking = {};
    let logBody = '';
    let patchBody = {};
    const existingClioLogId = existingMessageLog.thirdPartyLogId.split('.')[0];
    // Case: shared SMS
    if (sharedSMSLogContent?.body) {
        logBody = sharedSMSLogContent.body;
    }
    else {
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
        logBody = getLogRes.data.data.body;
        let messageSubject = message.subject;
        if (imageDownloadLink) {
            try {
                const uploadImageResult = await uploadImageToClio({ user, authHeader, imageDownloadLink, imageContentType, message, contactInfo, additionalSubmission, messageSubject });
                messageSubject = uploadImageResult;
            }
            catch (e) {
                logger.error('Error uploading image', { stack: e.stack });
                messageSubject = `[Message]: ${messageSubject ?? 'N/A'}\n[Link - failed to upload]: ${imageDownloadLink}`;
            }
        }
        else if (imageLink) {
            messageSubject = `[Message]: ${messageSubject ?? 'N/A'}\n[Link]: ${imageLink}`;
        }
        else if (videoLink) {
            messageSubject = `[Message]: ${messageSubject ?? 'N/A'}\n[Link]: ${videoLink}`;
        }
        const originalNote = logBody.split('BEGIN\n------------\n')[1];
        const endMarker = '------------\nEND';
        const newMessageLog =
            `${message.direction === 'Inbound' ? `${contactInfo.name} (${contactInfo.phoneNumber})` : userName} ${moment(message.creationTime).utcOffset(Number(user.timezoneOffset)).format('hh:mm A')}\n` +
            `${messageSubject}\n\n`;
        logBody = logBody.replace(endMarker, `${newMessageLog}${endMarker}`);

        const regex = RegExp('Conversation.(.*) messages.');
        const matchResult = regex.exec(logBody);
        logBody = logBody.replace(matchResult[0], `Conversation(${parseInt(matchResult[1]) + 1} messages)`);
    }
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
    // Create SMS time entry if SMS time tracking is enabled
    if (user.userSettings?.smsTimeTrackingEnabled?.value && message.direction === 'Outbound') {
        try {
            const { billableTimeSeconds, nonBillable } = calculateSmsTimeEntry({ message, user });
            const timeEntryBody = {
                data: {
                    type: "TimeEntry",
                    date: moment(message.creationTime).format('YYYY-MM-DD'),
                    quantity: billableTimeSeconds,
                    note: `SMS message with ${contactInfo.name} sent on ${moment(message.creationTime).utcOffset(Number(user.timezoneOffset)).format('MM/DD/YYYY')} at ${moment(message.creationTime).utcOffset(Number(user.timezoneOffset)).format('HH:mm:ss')}`,
                    communication: {
                        id: existingClioLogId
                    },
                    non_billable: nonBillable
                }
            };

            // Add matter to time entry if available
            if (additionalSubmission.matters) {
                timeEntryBody.data.matter = { id: additionalSubmission.matters };
            }

            const timeEntryRes = await axios.post(
                `https://${user.hostname}/api/v4/activities.json`,
                timeEntryBody,
                {
                    headers: { 'Authorization': authHeader }
                });
        } catch (timeEntryError) {
            console.error('Failed to create SMS time entry:', timeEntryError.message);
            // Don't fail the main function if time entry creation fails
        }
    }
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

const APPOINTMENT_EXTERNAL_PROPERTIES = {
    source: 'rcAppointmentSource',
    participantName: 'rcAppointmentParticipantName',
    contactId: 'rcAppointmentContactId',
    contactType: 'rcAppointmentContactType',
    status: 'rcAppointmentStatus',
    title: 'rcAppointmentTitle'
};

function buildExternalPropertiesMap(externalProperties) {
    const map = {};
    for (const p of (externalProperties ?? [])) {
        if (!p?.name) continue;
        map[p.name] = p;
    }
    return map;
}

function normalizeCalendarEntryToAppointment(calendarEntry) {
    const props = buildExternalPropertiesMap(calendarEntry?.external_properties);
    const startAt = calendarEntry?.start_at;
    const endAt = calendarEntry?.end_at;
    const durationMinutes = (startAt && endAt) ? Math.max(0, Math.round(moment(endAt).diff(moment(startAt), 'minutes', true))) : null;

    const attendee = (calendarEntry?.attendees ?? [])[0] ?? null;
    const attendeeIds = (calendarEntry?.attendees ?? [])
        .map(a => (a?.id != null ? `${a.id}` : null))
        .filter(Boolean);
    const contactId = props[APPOINTMENT_EXTERNAL_PROPERTIES.contactId]?.value ?? (attendee?.id != null ? `${attendee.id}` : null);
    const contactType = props[APPOINTMENT_EXTERNAL_PROPERTIES.contactType]?.value ?? (attendee?.type ?? null);

    return {
        id: calendarEntry?.id != null ? `${calendarEntry.id}` : null,
        participantName: props[APPOINTMENT_EXTERNAL_PROPERTIES.participantName]?.value ?? attendee?.name ?? null,
        contactId,
        contactType,
        attendeeIds,
        title: props[APPOINTMENT_EXTERNAL_PROPERTIES.title]?.value ?? calendarEntry?.summary ?? null,
        summary: calendarEntry?.description ?? null,
        startTimeUtc: startAt ?? null,
        durationMinutes,
        status: props[APPOINTMENT_EXTERNAL_PROPERTIES.status]?.value ?? 'tentative'
    };
}

async function getWriteableUserCalendarId({ user, authHeader }) {
    const res = await axios.get(
        `https://${user.hostname}/api/v4/calendars.json`,
        {
            headers: { 'Authorization': authHeader },
            params: {
                owner: true,
                writeable: true,
                visible: true,
                type: 'UserCalendar',
                order: 'id(desc)',
                limit: 1,
                fields: 'id,type,permission,visible'
            }
        }
    );
    const calendarId = res?.data?.data?.[0]?.id;
    if (calendarId == null) {
        const fallbackRes = await axios.get(
            `https://${user.hostname}/api/v4/calendars.json`,
            {
                headers: { 'Authorization': authHeader },
                params: {
                    writeable: true,
                    visible: true,
                    order: 'id(desc)',
                    limit: 1,
                    fields: 'id,type,permission,visible'
                }
            }
        );
        return fallbackRes?.data?.data?.[0]?.id ?? null;
    }
    return calendarId;
}

async function getCalendarEntryById({ user, authHeader, appointmentId }) {
    const res = await axios.get(
        `https://${user.hostname}/api/v4/calendar_entries/${appointmentId}.json`,
        {
            headers: { 'Authorization': authHeader },
            params: {
                fields: 'id,summary,description,start_at,end_at,attendees{id,name,type},external_properties,calendar_owner_id'
            }
        }
    );
    return res?.data?.data ?? null;
}

async function upsertCalendarEntryExternalProperty({ user, authHeader, appointmentId, name, value }) {
    const existing = await getCalendarEntryById({ user, authHeader, appointmentId });
    const props = buildExternalPropertiesMap(existing?.external_properties);
    const existingProp = props[name];

    const externalPropertyPayload = existingProp?.id != null
        ? [{ id: existingProp.id, name, value: `${value}` }]
        : [{ name, value: `${value}` }];

    await axios.patch(
        `https://${user.hostname}/api/v4/calendar_entries/${appointmentId}.json`,
        { data: { external_properties: externalPropertyPayload } },
        { headers: { 'Authorization': authHeader } }
    );
}

async function listAppointments({ user, authHeader, range, mineOnly }) {
    const listRes = await axios.get(
        `https://${user.hostname}/api/v4/calendar_entries.json`,
        {
            headers: { 'Authorization': authHeader },
            params: {
                fields: 'id,summary,start_at,end_at,description,attendees{id,name,type}'
            }
        }
    );

    const entries = listRes?.data?.data ?? [];

    const appointments = entries.map(e => {
        const startUtc = e?.start_at ? moment.parseZone(e.start_at).utc() : null;
        const endUtc = e?.end_at ? moment.parseZone(e.end_at).utc() : null;
        const durationMinutes = (startUtc && endUtc)
            ? Math.max(0, Math.round(endUtc.diff(startUtc, 'minutes', true)))
            : 0;

        const id = e?.id != null ? `${e.id}` : null;
        const attendees = (e?.attendees ?? [])
            .map(a => (a?.id != null ? { id: a?.id, name: a?.name, type: a?.type } : null))
            .filter(Boolean);
        return {
            thirdPartyAppointmentId: id,
            id,
            title: e?.summary ?? '',
            description: e?.description ?? '',
            participantName: '',
            startTimeUtc: startUtc ? startUtc.toISOString() : null,
            durationMinutes,
            status: 'scheduled',
            contactId: '',
            attendees
        };
    });
    return { appointments };
}

async function createAppointment({ user, authHeader, payload }) {
    const calendarId = await getWriteableUserCalendarId({ user, authHeader });
    if (calendarId == null) {
        return {
            successful: false,
            returnMessage: {
                message: 'No writeable calendar found in Clio.',
                messageType: 'warning',
                ttl: 5000
            }
        };
    }

    const startAt = payload?.startTimeUtc ?? payload?.startTime ?? null;
    const durationMinutes = Number(payload?.durationMinutes ?? 0);
    const endAt = startAt ? moment.utc(startAt).add(durationMinutes, 'minutes').toISOString() : null;

    const toAttendee = (id) => {
        const n = typeof id === 'number' ? id : Number(id);
        if (!Number.isFinite(n)) return null;
        return { id: n, type: 'Contact' };
    };

    const attendees = (() => {
        if (Array.isArray(payload?.contacts) && payload.contacts.length) {
            return payload.contacts
                .map(c => (c && typeof c === 'object' ? toAttendee(c.id) : toAttendee(c)))
                .filter(Boolean);
        }
        return [];
    })();

    const data = {
        calendar_owner: { id: calendarId },
        summary: payload?.title ?? payload?.summary ?? 'Appointment',
        description: payload?.summary ?? '',
        start_at: startAt,
        end_at: endAt,
        send_email_notification: false,
        ...(attendees.length ? { attendees } : {})
    };

    const body = { data };

    const createRes = await axios.post(
        `https://${user.hostname}/api/v4/calendar_entries.json`,
        body,
        { headers: { 'Authorization': authHeader }, params: { fields: 'id,summary,description,start_at,end_at,attendees,external_properties,calendar_owner_id' } }
    );

    const calendarEntry = createRes?.data?.data ?? null;
    const appointment = normalizeCalendarEntryToAppointment(calendarEntry);
    return { appointmentId: appointment.id, appointment };
}

async function updateAppointment({ user, authHeader, appointmentId, patchBody }) {
    const existing = await getCalendarEntryById({ user, authHeader, appointmentId });
    if (!existing) {
        return {
            successful: false,
            returnMessage: {
                message: 'Appointment not found in Clio.',
                messageType: 'warning',
                ttl: 5000
            }
        };
    }

    const existingAttendees = existing?.attendees ?? [];

    const startAt = patchBody?.startTimeUtc ?? patchBody?.startTime ?? null;
    const durationMinutes = Number(patchBody?.durationMinutes ?? 0);
    const endAt = startAt ? moment.utc(startAt).add(durationMinutes, 'minutes').toISOString() : null;

    const toAttendee = (id) => {
        const n = typeof id === 'number' ? id : Number(id);
        if (!Number.isFinite(n)) return null;
        return { id: n, type: 'Contact' };
    };

    const hasAttendeeUpdate = Array.isArray(patchBody?.contacts);

    const attendees = (() => {
        if (!hasAttendeeUpdate) return [];

        const desiredAttendeeSource = patchBody.contacts;

        const desiredAttendeeRefs = Array.isArray(desiredAttendeeSource) && desiredAttendeeSource.length
            ? desiredAttendeeSource
                .map(c => {
                    if (c && typeof c === 'object') {
                        return toAttendee(c.id);
                    }
                    return toAttendee(c);
                })
                .filter(Boolean)
            : [];

        const desiredAttendeeIdSet = new Set(desiredAttendeeRefs.map(a => `${a.id}`));

        const existingAttendeeRefs = (existingAttendees ?? [])
            .map(a => {
                if (a?.id == null) return null;
                const n = typeof a.id === 'number' ? a.id : Number(a.id);

                return { id: n, type: 'Contact' };
            })
            .filter(Boolean);

        // Only remove (destroy) those existing attendees that are NOT in the desired list.
        const removedAttendeeRefs = existingAttendeeRefs
            .filter(a => !desiredAttendeeIdSet.has(`${a.id}`))
            .map(a => ({ id: a.id, type: 'Contact', _destroy: true }));

        const mergedAttendeeRefs = [...removedAttendeeRefs, ...desiredAttendeeRefs];
        const seenKeys = new Set();
        return mergedAttendeeRefs.filter(a => {
            const key = `${a.id}:${a.type ?? 'Contact'}:${a._destroy ? '1' : '0'}`;
            if (seenKeys.has(key)) return false;
            seenKeys.add(key);
            return true;
        });
    })();
    const updateBody = {
        data: {
            summary: patchBody?.title ?? '',
            description: patchBody?.summary ?? '',
            start_at: startAt,
            end_at: endAt,
            ...(hasAttendeeUpdate ? { attendees } : {})
        }
    };

    const updateResponseBody = await axios.patch(
        `https://${user.hostname}/api/v4/calendar_entries/${appointmentId}.json`,
        updateBody,
        { headers: { 'Authorization': authHeader }, params: { fields: 'id,summary,description,start_at,end_at,attendees,external_properties,calendar_owner_id' } }
    );
    return { appointment: normalizeCalendarEntryToAppointment(updateResponseBody?.data?.data) };
}

async function refreshAppointment({ user, authHeader, appointmentId }) {
    const calendarEntry = await getCalendarEntryById({ user, authHeader, appointmentId });
    if (!calendarEntry) {
        return {
            successful: false,
            returnMessage: {
                message: 'Appointment not found in Clio.',
                messageType: 'warning',
                ttl: 5000
            }
        };
    }
    return { appointment: normalizeCalendarEntryToAppointment(calendarEntry) };
}


async function cancelAppointment({ user, authHeader, appointmentId }) {
    const cancelResponseBody = await axios.delete(
        `https://${user.hostname}/api/v4/calendar_entries/${appointmentId}.json`,
        { headers: { 'Authorization': authHeader } }
    );
    return { appointment: normalizeCalendarEntryToAppointment(cancelResponseBody?.data?.data) };
}

async function uploadImageToClio({ user, authHeader, imageDownloadLink, imageContentType, message, contactInfo, additionalSubmission, messageSubject }) {
    // download media from server mediaLink (image/jpeg or image/png) - do this first because RC Access Token might expire during the process
    const mediaRes = await axios.get(imageDownloadLink, { responseType: 'arraybuffer' });
    const documentUploadIdResponse = await axios.post(`
        https://${user.hostname}/api/v4/documents?fields=id,latest_document_version{uuid,put_url,put_headers}`,
        {
            data: {
                name: `${message.direction} Image Message - ${contactInfo.name} - ${moment(message.creationTime).format('MM/DD/YYYY')}.${imageContentType.split('/')[1]}`,
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
    if (patchDocResponse.data.data.latest_document_version.fully_uploaded) {
        messageSubject = `[Message]: ${messageSubject ?? 'N/A'}\n[Link]: https://${user.hostname}/nc/#/documents/${documentId}/details`;
    }
    else {
        messageSubject = `[Message]: ${messageSubject ?? 'N/A'}\n[Link - failed to upload]: ${imageDownloadLink}`;
    }
    return messageSubject;
}

async function uploadFaxToClio({ user, authHeader, faxDownloadLink, faxDocLink, message, contactInfo, additionalSubmission, logSubject, logBody }) {
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
    return {
        logSubject,
        logBody
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
exports.getLogFormatType = getLogFormatType;
exports.listAppointments = listAppointments;
exports.createAppointment = createAppointment;
exports.updateAppointment = updateAppointment;
exports.refreshAppointment = refreshAppointment;
exports.cancelAppointment = cancelAppointment;