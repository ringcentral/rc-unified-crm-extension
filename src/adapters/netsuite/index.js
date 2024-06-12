const axios = require('axios');
const moment = require('moment');
const url = require('url');
const { parsePhoneNumber } = require('awesome-phonenumber');

function getAuthType() {
    return 'oauth';
}


function getOauthInfo() {
    return {
        clientId: process.env.NETSUITE_CRM_CLIENT_ID,
        clientSecret: process.env.NETSUITE_CRM_CLIENT_SECRET,
        accessTokenUri: process.env.NETSUITE_CRM_TOKEN_URI,
        redirectUri: process.env.NETSUITE_CRM_REDIRECT_URI
    }
}

async function getUserInfo({ authHeader, additionalInfo, query }) {
    const url = `https://${query.hostname.split(".")[0]}.suitetalk.api.netsuite.com/services/rest/record/v1/employee/${query.entity}`;
    const employeResponse = await axios.get(url,
        {
            headers: { 'Authorization': authHeader }
        });
    const id = query.entity;
    const name = employeResponse.data.firstName + ' ' + employeResponse.data.lastName;
    const timezoneName = employeResponse.data.time_zone ?? '';
    const timezoneOffset = employeResponse.data.time_zone_offset ?? null;
    return {
        id,
        name,
        timezoneName,
        timezoneOffset,
        platformAdditionalInfo: {
            email: employeResponse.data.email,
            name: name,
        }
    };
}

async function unAuthorize({ user }) {
    const revokeUrl = `https://${user.hostname.split(".")[0]}.suitetalk.api.netsuite.com/services/rest/auth/oauth2/v1/revoke`;
    const basicAuthHeader = Buffer.from(`${process.env.NETSUITE_CRM_CLIENT_ID}:${process.env.NETSUITE_CRM_CLIENT_SECRET}`).toString('base64');
    const refreshTokenParams = new url.URLSearchParams({
        token: user.refreshToken
    });
    const accessTokenRevokeRes = await axios.post(
        revokeUrl,
        refreshTokenParams,
        {
            headers: { 'Authorization': `Basic ${basicAuthHeader}` }
        });
    console.log(`Access and Refresh Token is revoked for user ${user.id}...`);
    await user.destroy();
}

async function findContact({ user, authHeader, phoneNumber, overridingFormat }) {
    const numberToQueryArray = [];
    if (overridingFormat === '') {
        numberToQueryArray.push(phoneNumber.replace(' ', '+'));
    }
    else {
        const formats = overridingFormat.split(',');
        for (var format of formats) {
            const phoneNumberObj = parsePhoneNumber(phoneNumber.replace(' ', '+'));
            if (phoneNumberObj.valid) {
                const phoneNumberWithoutCountryCode = phoneNumberObj.number.significant;
                let formattedNumber = format;
                for (const numberBit of phoneNumberWithoutCountryCode) {
                    formattedNumber = formattedNumber.replace('*', numberBit);
                }
                numberToQueryArray.push(formattedNumber);
            }
        }
    }
    const foundContacts = [];
    for (var numberToQuery of numberToQueryArray) {
        console.log({ numberToQuery });
        if (numberToQuery !== 'undefined' && numberToQuery !== null && numberToQuery !== '') {
            //For Contact search
            const personInfo = await axios.post(
                `https://${user.hostname.split(".")[0]}.suitetalk.api.netsuite.com/services/rest/query/v1/suiteql`,
                {
                    q: `SELECT id,firstname,middlename,lastname FROM contact WHERE phone = ${numberToQuery}
                        OR homePhone = ${numberToQuery} OR mobilePhone = ${numberToQuery} OR officePhone = ${numberToQuery}`
                },
                {
                    headers: { 'Authorization': authHeader, 'Content-Type': 'application/json', 'Prefer': 'transient' }
                });
            console.log(personInfo);
            if (personInfo.data.items.length > 0) {
                for (var result of personInfo.data.items) {
                    let firstName = result.firstname ?? '';
                    let middleName = result.middlename ?? '';
                    let lastName = result.lastname ?? '';
                    foundContacts.push({
                        id: result.id,
                        name: `${firstName} ${middleName} ${lastName}`,
                        phone: numberToQuery,
                        additionalInfo: null,
                        type: 'contact'
                    })
                }
            }
            //For Customer search
            const customerInfo = await axios.post(
                `https://${user.hostname.split(".")[0]}.suitetalk.api.netsuite.com/services/rest/query/v1/suiteql`,
                {
                    q: `SELECT id,firstname,middlename,lastname FROM customer WHERE phone = ${numberToQuery}
                     OR homePhone = ${numberToQuery} OR mobilePhone = ${numberToQuery}  OR altPhone = ${numberToQuery}`
                },
                {
                    headers: { 'Authorization': authHeader, 'Content-Type': 'application/json', 'Prefer': 'transient' }
                });
            console.log({ message: "Custome Search", customerInfo });
            if (customerInfo.data.items.length > 0) {
                for (var result of customerInfo.data.items) {
                    let firstName = result.firstname ?? '';
                    let middleName = result.middlename ?? '';
                    let lastName = result.lastname ?? '';
                    foundContacts.push({
                        id: result.id,
                        name: `${firstName} ${middleName} ${lastName}`,
                        phone: numberToQuery,
                        additionalInfo: null,
                        type: 'custjob'
                    })
                }
            }
        }
    }
    console.log(`found netsuite contacts... \n\n${JSON.stringify(foundContacts, null, 2)}`);
    foundContacts.push({
        id: 'createNewContact',
        name: 'Create new contact...',
        additionalInfo: null,
        isNewContact: true
    });
    return foundContacts;
}

async function createCallLog({ user, contactInfo, authHeader, callLog, note, additionalSubmission }) {
    const originalMessage = note;
    const temporedMessage = originalMessage + generateRandomString(20);
    const title = callLog.customSubject ?? `${callLog.direction} Call ${callLog.direction === 'Outbound' ? 'to' : 'from'} ${contactInfo.name}`;
    console.log({ originalMessage, temporedMessage });
    const postBody = {
        title: title,
        phone: contactInfo?.phoneNumber || '',
        priority: "MEDIUM",
        status: "COMPLETE",
        startDate: moment(callLog.startTime).toISOString(),
        message: temporedMessage,
    }
    console.log(`adding call log... \n${JSON.stringify(callLog, null, 2)}`);
    console.log(`with note... \n${note}`);
    console.log(`with additional info... \n${JSON.stringify(additionalSubmission, null, 2)}`);

    const addLogRes = await axios.post(
        `https://${user.hostname.split(".")[0]}.suitetalk.api.netsuite.com/services/rest/record/v1/phonecall`,
        postBody,
        {
            headers: { 'Authorization': authHeader }
        });
    const phoneCallResponse = await axios.post(
        `https://${user.hostname.split(".")[0]}.suitetalk.api.netsuite.com/services/rest/query/v1/suiteql`,
        {
            q: `SELECT * FROM PhoneCall WHERE title = '${title}' AND message = '${temporedMessage}'`
        },
        {
            headers: { 'Authorization': authHeader, 'Content-Type': 'application/json', 'Prefer': 'transient' }
        });
    let callLogId = null;
    if (phoneCallResponse.data.items.length > 0) {
        callLogId = phoneCallResponse.data.items[0].id;
    }
    console.log(`call log id... \n${callLogId}`);
    await axios.patch(`https://${user.hostname.split(".")[0]}.suitetalk.api.netsuite.com/services/rest/record/v1/phoneCall/${callLogId}`,
        {
            message: originalMessage
        },
        {
            headers: { 'Authorization': authHeader }
        });
    return callLogId;
}

async function getCallLog({ user, callLogId, authHeader }) {
    console.log({ callLogId });
    const getLogRes = await axios.get(`https://${user.hostname.split(".")[0]}.suitetalk.api.netsuite.com/services/rest/record/v1/phonecall/${callLogId}`,
        {
            headers: { 'Authorization': authHeader }
        });
    return {
        subject: getLogRes.data.title,
        note: getLogRes.data?.message ?? '',
        additionalSubmission: {}
    }
}

async function updateCallLog({ user, existingCallLog, authHeader, recordingLink, subject, note }) {
    console.log({ user, existingCallLog, authHeader, recordingLink, subject, note });
    const existingLogId = existingCallLog.thirdPartyLogId;
    const patchLogRes = await axios.patch(
        `https://${user.hostname.split(".")[0]}.suitetalk.api.netsuite.com/services/rest/record/v1/phoneCall/${existingLogId}`,
        {
            title: subject,
            message: note
        },
        {
            headers: { 'Authorization': authHeader }
        });
}

async function createMessageLog({ user, contactInfo, authHeader, message, additionalSubmission, recordingLink, faxDocLink }) {
    console.log({ message: "Create Message Log", user, contactInfo, message, additionalSubmission, recordingLink, faxDocLink });
    const sender =
    {
        id: contactInfo?.id,
        type: 'Contact'
    }
    const receiver =
    {
        id: user?.id,
        type: 'User'
    }

    const userName = user?.dataValues?.platformAdditionalInfo?.name ?? 'NetSuiteCRM';
    const messageType = !!recordingLink ? 'Voicemail' : (!!faxDocLink ? 'Fax' : 'SMS');
    let logBody = '';
    let title = '';
    switch (messageType) {
        case 'SMS':
            title = `SMS conversation with ${contactInfo.name} - ${moment(message.creationTime).format('YY/MM/DD')}`;
            logBody =
                '\nConversation summary\n' +
                `${moment(message.creationTime).format('dddd, MMMM DD, YYYY')}\n` +
                'Participants\n' +
                `    ${userName}\n` +
                `    ${contactInfo.name}\n` +
                '\nConversation(1 messages)\n' +
                'BEGIN\n' +
                '------------\n' +
                `${message.direction === 'Inbound' ? `${contactInfo.name} (${contactInfo?.phoneNumber})` : userName} ${moment(message.creationTime).format('hh:mm A')}\n` +
                `${message.subject}\n` +
                '------------\n' +
                'END\n\n' +
                '--- Created via RingCentral CRM Extension';
            break;
        case 'Voicemail':
            title = `Voicemail left by ${contactInfo.name} - ${moment(message.creationTime).format('YY/MM/DD')}`;
            logBody = `Voicemail recording link: ${recordingLink} \n\n--- Created via RingCentral CRM Extension`;
            break;
        case 'Fax':
            title = `Fax document sent from ${contactInfo.name} - ${moment(message.creationTime).format('YY/MM/DD')}`;
            logBody = `Fax document link: ${faxDocLink} \n\n--- Created via RingCentral CRM Extension`;
            break;
    }
    const postBody = {
        data: {
            title: title,
            message: logBody,
            phone: contactInfo?.phoneNumber || '',
            status: "COMPLETE",
        }

    }
    const addLogRes = await axios.post(
        `https://${user.hostname.split(".")[0]}.suitetalk.api.netsuite.com/services/rest/record/v1/phonecall`,
        postBody.data,
        {
            headers: { 'Authorization': authHeader }
        });
    const phoneCallResponse = await axios.post(
        `https://${user.hostname.split(".")[0]}.suitetalk.api.netsuite.com/services/rest/query/v1/suiteql`,
        {
            q: `SELECT * FROM PhoneCall WHERE title = '${title}'`
        },
        {
            headers: { 'Authorization': authHeader, 'Content-Type': 'application/json', 'Prefer': 'transient' }
        });
    let callLogId = null;
    if (phoneCallResponse.data.items.length > 0) {
        callLogId = phoneCallResponse.data.items[0].id;
    }
    console.log(`call log id from addMessage... \n${callLogId}`);
    return callLogId;
}

async function updateMessageLog({ user, contactInfo, existingMessageLog, message, authHeader, contactNumber }) {
    const existingLogId = existingMessageLog.thirdPartyLogId.split('.')[0];
    const getLogRes = await axios.get(`https://${user.hostname.split(".")[0]}.suitetalk.api.netsuite.com/services/rest/record/v1/phonecall/${existingLogId}`,
        {
            headers: { 'Authorization': authHeader }
        });
    const userName = user?.dataValues?.platformAdditionalInfo?.name ?? 'NetSuiteCRM';
    let logBody = getLogRes.data.message;
    let patchBody = {};
    const originalNote = logBody.split('BEGIN\n------------\n')[1];
    const newMessageLog =
        `${message.direction === 'Inbound' ? `${contactInfo.name} (${contactInfo?.phoneNumber})` : userName} ${moment(message.creationTime).format('hh:mm A')}\n` +
        `${message.subject}\n`;
    logBody = logBody.replace(originalNote, `${newMessageLog}\n${originalNote}`);

    const regex = RegExp('Conversation.(.*) messages.');
    const matchResult = regex.exec(logBody);
    logBody = logBody.replace(matchResult[0], `Conversation(${parseInt(matchResult[1]) + 1} messages)`);
    const patchLogRes = await axios.patch(
        `https://${user.hostname.split(".")[0]}.suitetalk.api.netsuite.com/services/rest/record/v1/phoneCall/${existingLogId}`,
        {
            message: logBody
        },
        {
            headers: { 'Authorization': authHeader }
        });
}

async function createContact({ user, authHeader, phoneNumber, newContactName, newContactType }) {
    const nameParts = splitName(newContactName);
    console.log({ message: 'NetSuite Create contact', user, phoneNumber, newContactName, newContactType });
    switch (newContactType) {
        case 'Contact':
            const contactPayLoad = {
                firstName: nameParts.firstName,
                middleName: nameParts.middleName,
                lastName: nameParts.lastName,
                phone: phoneNumber || ''
            };
            const createContactRes = await axios.post(
                `https://${user.hostname.split(".")[0]}.suitetalk.api.netsuite.com/services/rest/record/v1/contact`,
                contactPayLoad
                ,
                {
                    headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' }
                });
            break;
        case 'Customer':
            const customerPayLoad = {
                firstName: nameParts.firstName,
                middleName: nameParts.middleName,
                lastName: nameParts.lastName,
                phone: phoneNumber || '',
                isPerson: true

            };
            const createCustomerRes = await axios.post(
                `https://${user.hostname.split(".")[0]}.suitetalk.api.netsuite.com/services/rest/record/v1/customer`,
                customerPayLoad
                ,
                {
                    headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' }
                });
            break;
    }
    return {};
}

function splitName(fullName) {
    const parts = fullName.trim().split(/\s+/); // Split by one or more spaces
    const firstName = parts.shift() || "";
    const lastName = parts.pop() || "";
    const middleName = parts.join(" ");
    return { firstName, middleName, lastName };
}

function generateRandomString(length) {
    let result = '';
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const charactersLength = characters.length;
    let counter = 0;
    while (counter < length) {
        result += characters.charAt(Math.floor(Math.random() * charactersLength));
        counter += 1;
    }
    return result;
}


exports.getAuthType = getAuthType;
exports.getOauthInfo = getOauthInfo;
exports.getUserInfo = getUserInfo;
exports.createCallLog = createCallLog;
exports.updateCallLog = updateCallLog;
exports.getCallLog = getCallLog;
exports.createMessageLog = createMessageLog;
exports.updateMessageLog = updateMessageLog;
exports.findContact = findContact;
exports.createContact = createContact;
exports.unAuthorize = unAuthorize;