/* eslint-disable no-param-reassign */
const axios = require('axios');
const moment = require('moment');
const { parsePhoneNumber } = require('awesome-phonenumber');
const jwt = require('@app-connect/core/lib/jwt');
const { UserModel } = require('@app-connect/core/models/userModel');
const { AdminConfigModel } = require('@app-connect/core/models/adminConfigModel');

function getAuthType() {
    return 'apiKey';
}

function getBasicAuth({ apiKey }) {
    return Buffer.from(`${apiKey}`).toString('base64');
}

function getAuthHeader({ userKey }) {
    return Buffer.from(`${process.env.REDTAIL_API_KEY}:${userKey}`).toString('base64');
}

async function getUserInfo({ authHeader, additionalInfo }) {
    try {
        const overrideAPIKey = `${process.env.REDTAIL_API_KEY}:${additionalInfo.username}:${additionalInfo.password}`;
        const overrideAuthHeader = `Basic ${getBasicAuth({ apiKey: overrideAPIKey })}`;
        const authResponse = await axios.get(`${process.env.REDTAIL_API_SERVER}/authentication`, {
            headers: {
                'Authorization': overrideAuthHeader
            }
        });
        additionalInfo['userResponse'] = authResponse.data.authenticated_user;
        delete additionalInfo.password;
        const id = `${additionalInfo.username}-redtail`;
        const name = additionalInfo.username;
        const timezoneName = '';
        return {
            successful: true,
            platformUserInfo: {
                id,
                name,
                timezoneName,
                overridingApiKey: additionalInfo.userResponse.user_key,
                platformAdditionalInfo: additionalInfo
            },
            returnMessage: {
                messageType: 'success',
                message: 'Connected to Redtail.',
                ttl: 1000
            }
        }
    }
    catch (e) {
        return {
            successful: false,
            returnMessage: {
                messageType: 'warning',
                message: 'Could not load user information Please check your credentials.',
                details: [
                    {
                        title: 'Details',
                        items: [
                            {
                                id: '1',
                                type: 'text',
                                text: `Redtail was unable to fetch information for the currently logged in user. Please check your permissions in Redtail and make sure you have permission to access and read user information.`
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
    // remove user credentials
    user.accessToken = '';
    user.refreshToken = '';
    await user.save();
    return {
        returnMessage: {
            messageType: 'success',
            message: 'Logged out of Redtail',
            ttl: 1000
        }
    }
}

async function findContact({ user, phoneNumber, isExtension }) {
    if (isExtension === 'true') {
        return {
            successful: false,
            matchedContactInfo: []
        }
    }
    const matchedContactInfo = [];
    const overrideAuthHeader = getAuthHeader({ userKey: user.platformAdditionalInfo.userResponse.user_key });
    phoneNumber = phoneNumber.replace(' ', '+')
    const phoneNumberObj = parsePhoneNumber(phoneNumber);
    let phoneNumberWithoutCountryCode = phoneNumber;
    if (phoneNumberObj.valid) {
        phoneNumberWithoutCountryCode = phoneNumberObj.number.significant;
    }

    const personInfo = await axios.get(
        `${process.env.REDTAIL_API_SERVER}/contacts/search_basic?phone_number=${phoneNumberWithoutCountryCode}`,
        {
            headers: { 'Authorization': overrideAuthHeader }
        });
    const categoriesResp = await axios.get(
        `${process.env.REDTAIL_API_SERVER}/lists/categories`,
        {
            headers: { 'Authorization': overrideAuthHeader }
        });
    const activeCategories = categoriesResp.data.categories.filter(c => !c.deleted);
    for (let rawPersonInfo of personInfo.data.contacts) {
        rawPersonInfo['phoneNumber'] = phoneNumber;
        matchedContactInfo.push(formatContact(rawPersonInfo, activeCategories));
    }
    matchedContactInfo.push({
        id: 'createNewContact',
        name: 'Create new contact...',
        isNewContact: true,
        additionalInfo: {
            category: activeCategories.map(c => {
                return {
                    const: c.id,
                    title: c.name
                }
            })
        }
    });
    return {
        successful: true,
        matchedContactInfo
    };
}

async function findContactWithName({ user, name }) {
    const matchedContactInfo = [];
    const overrideAuthHeader = getAuthHeader({ userKey: user.platformAdditionalInfo.userResponse.user_key });
    /*
    Redtail contact search functionality works correctly with name-based queries, including first name, last name, and full name.
     It handles all variations without requiring the query to be split
    */
    const personInfo = await axios.get(
        `${process.env.REDTAIL_API_SERVER}/contacts/search_basic?name=${name}`,
        {
            headers: { 'Authorization': overrideAuthHeader }
        });

    console.log({ COntacts: personInfo.data.contacts, Data: personInfo.data });
    const categoriesResp = await axios.get(
        `${process.env.REDTAIL_API_SERVER}/lists/categories`,
        {
            headers: { 'Authorization': overrideAuthHeader }
        });
    const activeCategories = categoriesResp.data.categories.filter(c => !c.deleted);
    for (let rawPersonInfo of personInfo.data.contacts) {
        matchedContactInfo.push(formatContact(rawPersonInfo, activeCategories));
    }
    return {
        successful: true,
        matchedContactInfo
    };
}

async function createContact({ user, phoneNumber, newContactName }) {
    const overrideAuthHeader = getAuthHeader({ userKey: user.platformAdditionalInfo.userResponse.user_key });
    const phoneNumberObj = parsePhoneNumber(phoneNumber.replace(' ', '+'));
    const personInfo = await axios.post(
        `${process.env.REDTAIL_API_SERVER}/contacts`,
        {
            type: 'Crm::Contact::Individual',
            first_name: newContactName.split(' ').length > 1 ? newContactName.split(' ')[0] : '',
            last_name: newContactName.split(' ').length > 1 ? newContactName.split(' ')[1] : newContactName.split(' ')[0],
            phones: [
                {
                    phone_type: 6,
                    number: phoneNumberObj.number.significant,
                    country_code: phoneNumberObj.countryCode
                }
            ]
        },
        {
            headers: { 'Authorization': overrideAuthHeader }
        }
    );
    return {
        contactInfo: {
            id: personInfo.data.contact.id,
            name: `${personInfo.data.contact.first_name} ${personInfo.data.contact.last_name}`
        },
        returnMessage: {
            message: `Contact created.`,
            messageType: 'success',
            ttl: 2000
        }
    }
}

async function getUserList({ user, authHeader }) {
    const overrideAuthHeader = getAuthHeader({ userKey: user.platformAdditionalInfo.userResponse.user_key });
    const userListResp = await axios.get(
        `${process.env.REDTAIL_API_SERVER}/lists/database_users`,
        {
            headers: { 'Authorization': overrideAuthHeader }
        });
    const userList = userListResp.data.database_users.map(user => ({
        id: user.id,
        name: `${user.first_name} ${user.last_name}`
    }));
    return userList;
}

async function createCallLog({ user, contactInfo, callLog, note, additionalSubmission, aiNote, transcript, composedLogDetails, hashedAccountId }) {
    const overrideAuthHeader = getAuthHeader({ userKey: user.platformAdditionalInfo.userResponse.user_key });

    const subject = callLog.customSubject ?? `${callLog.direction} Call ${callLog.direction === 'Outbound' ? 'to' : 'from'} ${contactInfo.name}`;
    let extraDataTracking = {
        withSmartNoteLog: !!aiNote && (user.userSettings?.addCallLogAiNote?.value ?? true),
        withTranscript: !!transcript && (user.userSettings?.addCallLogTranscript?.value ?? true)
    };
    if (user.userSettings?.redtailCustomTimezone?.value ?? false) {
        composedLogDetails = await overrideDateTimeInComposedLogDetails({ composedLogDetails, startTime: callLog.startTime, user });
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

            if (!assigneeId) {
                const adminConfig = await AdminConfigModel.findByPk(hashedAccountId);
                assigneeId = adminConfig.userMappings?.find(mapping => mapping.rcExtensionId === additionalSubmission.adminAssignedUserRcId)?.crmUserId;
            }
        }

        if (!assigneeId) {
            const adminConfig = await AdminConfigModel.findByPk(hashedAccountId);
            assigneeId = adminConfig.userMappings?.find(mapping => mapping.rcExtensionId === additionalSubmission.adminAssignedUserRcId)?.crmUserId;
        }
    }

    const postBody = {
        subject,
        description: composedLogDetails,
        start_date: moment(callLog.startTime).utc().toISOString(),
        end_date: moment(callLog.startTime).utc().add(callLog.duration, 'seconds').toISOString(),
        activity_code_id: 3,
        category_id: additionalSubmission?.category ?? 2,
        repeats: 'never',
        linked_contacts: [
            {
                contact_id: contactInfo.id
            }
        ]
    }

    if (assigneeId) {
        postBody.attendees = [
            {
                type: "Crm::Activity::Attendee::User",
                user_id: Number(assigneeId)
            }
        ];
    }

    const addLogRes = await axios.post(
        `${process.env.REDTAIL_API_SERVER}/activities`,
        postBody,
        {
            headers: { 'Authorization': overrideAuthHeader }
        });
    if (note) {
        const addNoteRes = await axios.post(
            `${process.env.REDTAIL_API_SERVER}/activities/${addLogRes.data.activity.id}/notes`,
            {
                category_id: additionalSubmission?.category ?? 2,
                note_type: 1,
                body: note
            },
            {
                headers: { 'Authorization': overrideAuthHeader }
            });
    }
    const completeLogRes = await axios.put(
        `${process.env.REDTAIL_API_SERVER}/activities/${addLogRes.data.activity.id}`,
        {
            completed: true
        },
        {
            headers: { 'Authorization': overrideAuthHeader }
        });

    await updateCategoryToUserSetting({ user, authHeader: overrideAuthHeader });

    return {
        logId: completeLogRes.data.activity.id,
        returnMessage: {
            message: 'Call logged',
            messageType: 'success',
            ttl: 2000
        },
        extraDataTracking
    };
}

async function updateCallLog({ user, existingCallLog, authHeader, recordingLink, subject, note, startTime, duration, result, aiNote, transcript, additionalSubmission, composedLogDetails, existingCallLogDetails, hashedAccountId }) {
    const overrideAuthHeader = getAuthHeader({ userKey: user.platformAdditionalInfo.userResponse.user_key });
    const existingRedtailLogId = existingCallLog.thirdPartyLogId;

    // Use passed existingCallLogDetails to avoid duplicate API call
    let getLogRes = null;
    if (existingCallLogDetails) {
        getLogRes = { data: existingCallLogDetails };
    } else {
        // Fallback to API call if details not provided
        getLogRes = await axios.get(
            `${process.env.REDTAIL_API_SERVER}/activities/${existingRedtailLogId}`,
            {
                headers: { 'Authorization': overrideAuthHeader }
            });
    }

    let putBody = {};
    if (subject) {
        putBody.subject = subject;
    }
    if (user.userSettings?.redtailCustomTimezone?.value ?? false) {
        composedLogDetails = await overrideDateTimeInComposedLogDetails({ composedLogDetails, startTime: startTime, user });
    }
    putBody.description = composedLogDetails;
    putBody.start_date = moment(startTime).utc().toISOString();
    putBody.end_date = moment(startTime).utc().add(duration, 'seconds').toISOString();
    const putLogRes = await axios.put(
        `${process.env.REDTAIL_API_SERVER}/activities/${existingRedtailLogId}`,
        putBody,
        {
            headers: { 'Authorization': overrideAuthHeader }
        });
    return {
        updatedNote: putBody.description,
        returnMessage: {
            message: 'Call log updated.',
            messageType: 'success',
            ttl: 2000
        }
    };
}

async function upsertCallDisposition({ user, existingCallLog, authHeader, dispositions }) {
    const overrideAuthHeader = getAuthHeader({ userKey: user.platformAdditionalInfo.userResponse.user_key });
    const existingRedtailLogId = existingCallLog.thirdPartyLogId;
    const categoryId = dispositions.category;
    const upsertDispositionRes = await axios.put(
        `${process.env.REDTAIL_API_SERVER}/activities/${existingRedtailLogId}`,
        {
            category_id: categoryId
        },
        {
            headers: { 'Authorization': overrideAuthHeader }
        });
    return {
        logId: existingRedtailLogId
    };
}

async function createMessageLog({ user, contactInfo, authHeader, message, additionalSubmission, recordingLink, faxDocLink }) {
    const overrideAuthHeader = getAuthHeader({ userKey: user.platformAdditionalInfo.userResponse.user_key });
    const userName = user.id.split('-')[0];
    const messageType = recordingLink ? 'Voicemail' : (faxDocLink ? 'Fax' : 'SMS');
    let subject = '';
    let description = '';
    switch (messageType) {
        case 'SMS':
            subject = `SMS conversation with ${contactInfo.name} - ${moment(message.creationTime).utcOffset(Number(user.userSettings?.redtailCustomTimezone?.value ?? 0)).format('YY/MM/DD')}`;
            description =
                `<br><b>${subject}</b><br>` +
                '<b>Conversation summary</b><br>' +
                `${moment(message.creationTime).utcOffset(Number(user.userSettings?.redtailCustomTimezone?.value ?? 0)).format('dddd, MMMM DD, YYYY')}<br>` +
                'Participants<br>' +
                `<ul><li><b>${userName}</b><br></li>` +
                `<li><b>${contactInfo.name}</b></li></ul><br>` +
                'Conversation(1 messages)<br>' +
                'BEGIN<br>' +
                '------------<br>' +
                '<ul>' +
                `<li>${message.direction === 'Inbound' ? `${contactInfo.name} (${contactInfo.phoneNumber})` : userName} ${moment(message.creationTime).utcOffset(Number(user.userSettings?.redtailCustomTimezone?.value ?? 0)).format('hh:mm A')}<br>` +
                `<b>${message.subject}</b></li>` +
                '</ul>' +
                '------------<br>' +
                'END<br><br>' +
                '--- Created via RingCentral App Connect';
            break;
        case 'Voicemail':
            subject = `Voicemail left by ${contactInfo.name} - ${moment(message.creationTime).utcOffset(Number(user.userSettings?.redtailCustomTimezone?.value ?? 0)).format('YY/MM/DD')}`;
            description = `<br><b>${subject}</b><br>Voicemail recording link: ${recordingLink} <br><br>--- Created via RingCentral App Connect`;
            break;
        case 'Fax':
            subject = `Fax document sent from ${contactInfo.name} - ${moment(message.creationTime).utcOffset(Number(user.userSettings?.redtailCustomTimezone?.value ?? 0)).format('YY/MM/DD')}`;
            description = `<br><b>${subject}</b><br>Fax document link: ${faxDocLink} <br><br>--- Created via RingCentral App Connect`;
            break;
    }

    const postBody = {
        subject,
        description,
        start_date: moment(message.creationTime).utc().toISOString(),
        end_date: moment(message.creationTime).utc().toISOString(),
        activity_code_id: 3,
        repeats: 'never',
        linked_contacts: [
            {
                contact_id: contactInfo.id
            }
        ]
    }
    const addLogRes = await axios.post(
        `${process.env.REDTAIL_API_SERVER}/activities`,
        postBody,
        {
            headers: { 'Authorization': overrideAuthHeader }
        });
    const completeLogRes = await axios.put(
        `${process.env.REDTAIL_API_SERVER}/activities/${addLogRes.data.activity.id}`,
        {
            'completed': true
        },
        {
            headers: { 'Authorization': overrideAuthHeader }
        });
    return {
        logId: completeLogRes.data.activity.id,
        returnMessage: {
            message: 'Message logged',
            messageType: 'success',
            ttl: 1000
        }
    };
}

async function updateMessageLog({ user, contactInfo, existingMessageLog, message, authHeader }) {
    const overrideAuthHeader = getAuthHeader({ userKey: user.platformAdditionalInfo.userResponse.user_key });
    const existingLogId = existingMessageLog.thirdPartyLogId;
    const userName = user.id.split('-')[0];
    const getLogRes = await axios.get(
        `${process.env.REDTAIL_API_SERVER}/activities/${existingLogId}`,
        {
            headers: { 'Authorization': overrideAuthHeader, 'include': 'linked_contacts' }
        });
    let logBody = getLogRes.data.activity.description;
    let putBody = {};
    const newMessageLog =
        `<li>${message.direction === 'Inbound' ? `${contactInfo.name} (${contactInfo.phoneNumber})` : userName} ${moment(message.creationTime).format('hh:mm A')}<br>` +
        `<b>${message.subject}</b></li>`;
    // Add new message at the end (before the closing </ul> tag inside BEGIN/END block)
    logBody = logBody.replace('</ul>------------<br>', `${newMessageLog}</ul>------------<br>`);

    const regex = RegExp('<br>Conversation.(.*) messages.');
    const matchResult = regex.exec(logBody);
    logBody = logBody.replace(matchResult[0], `<br>Conversation(${parseInt(matchResult[1]) + 1} messages)`);

    putBody = {
        description: logBody,
        end_date: moment(message.creationTime).utc().toISOString()
    }
    const putLogRes = await axios.patch(
        `${process.env.REDTAIL_API_SERVER}/activities/${existingLogId}`,
        putBody,
        {
            headers: { 'Authorization': overrideAuthHeader }
        });
}

async function getCallLog({ user, callLogId, authHeader }) {
    const overrideAuthHeader = getAuthHeader({ userKey: user.platformAdditionalInfo.userResponse.user_key });
    const getLogRes = await axios.get(
        `${process.env.REDTAIL_API_SERVER}/activities/${callLogId}`,
        {
            headers: { 'Authorization': overrideAuthHeader, 'include': 'linked_contacts' }
        });
    const logBody = getLogRes.data.activity.description;
    // const note = logBody.match(/<br>(.+?)<br><br>/)?.length > 1 ? logBody.match(/<br>(.+?)<br><br>/)[1] : '';
    const note = logBody.match(/<b>Agent notes<\/b><br>(.+?)<br><br>/s)?.[1] || '';
    return {
        callLogInfo: {
            subject: getLogRes.data.activity.subject,
            fullLogResponse: getLogRes.data,
            note,
            fullBody: logBody,
            contactName: `${getLogRes.data.activity.linked_contacts[0].first_name} ${getLogRes.data.activity.linked_contacts[0].last_name}`,
            dispositions: {
                category: getLogRes.data.activity.category_id
            }
        }
    }
}

function formatContact(rawContactInfo, categories) {
    const first = (rawContactInfo.first_name || '').trim();
    const middle = (rawContactInfo.middle_name || '').trim();
    const last = (rawContactInfo.last_name || '').trim();
    const parts = [first, middle, last].filter(Boolean);
    const fullName = (parts.join(' ') || rawContactInfo.full_name || '').trim();

    return {
        id: rawContactInfo.id,
        name: fullName,
        phone: rawContactInfo.phoneNumber,
        title: rawContactInfo.job_title ?? "",
        type: 'contact',
        additionalInfo: {
            category: categories.map(c => {
                return {
                    const: c.id,
                    title: c.name
                }
            })
        }
    }
}

async function updateCategoryToUserSetting({ user, authHeader }) {
    const categoriesResp = await axios.get(
        `${process.env.REDTAIL_API_SERVER}/lists/categories`,
        {
            headers: { 'Authorization': authHeader }
        });
    const activeCategories = categoriesResp.data.categories.filter(c => !c.deleted);
    let updatedSettings = {
        ...(user.userSettings || {})
    };
    updatedSettings.defaultCategory = {
        value: updatedSettings.defaultCategory?.value ?? 2,
        customizable: updatedSettings.defaultCategory?.customizable ?? true,
        options: activeCategories.map(c => {
            return {
                id: c.id,
                name: c.name
            }
        })
    }
    await user.update({
        userSettings: updatedSettings
    });
}

function overrideDateTimeInComposedLogDetails({ composedLogDetails, startTime, user }) {
    if (!user.userSettings?.redtailCustomTimezone?.value) {
        return composedLogDetails;
    }
    const adjustedTime = moment(startTime).utcOffset(Number(user.userSettings?.redtailCustomTimezone?.value));
    const formattedTime = adjustedTime.format('YYYY-MM-DD hh:mm:ss A');
    const dateTimeRegex = /<li><b>Date\/[Tt]ime<\/b>:\s*[^<]+<\/li>/i;
    if (dateTimeRegex.test(composedLogDetails)) {
        const replaceRegex = /(<li><b>Date\/[Tt]ime<\/b>:\s*)[^<]+(<\/li>)/i;
        composedLogDetails = composedLogDetails.replace(
            replaceRegex,
            `$1${formattedTime}$2`
        );
    }
    return composedLogDetails;
}

exports.getAuthType = getAuthType;
exports.getBasicAuth = getBasicAuth;
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
