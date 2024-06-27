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
    try {
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
            platformUserInfo: {
                id,
                name,
                timezoneName,
                timezoneOffset,
                platformAdditionalInfo: {
                    email: employeResponse.data.email,
                    name: name,
                },

            },
            returnMessage: {
                messageType: 'success',
                message: 'Successfully connected to NetSuite.',
                ttl: 3000
            }
        };
    } catch (error) {
        console.log({ message: "Error in getting User Info", error });
        return {
            returnMessage: {
                messageType: 'danger',
                message: 'Error in getting NetSuite User Info.',
                ttl: 3000
            }
        }
    }

}

async function unAuthorize({ user }) {
    console.log({ message: "Intiating to unauthorize user", userId: user.id });
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
    return {
        returnMessage: {
            messageType: 'success',
            message: 'Successfully logged out from NetSuite account.',
            ttl: 3000
        }
    }
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
    const matchedContactInfo = [];
    for (var numberToQuery of numberToQueryArray) {
        console.log({ message: "Finding Contact with the number", numberToQuery });
        if (numberToQuery !== 'undefined' && numberToQuery !== null && numberToQuery !== '') {
            //For Contact search
            const personInfo = await axios.post(
                `https://${user.hostname.split(".")[0]}.suitetalk.api.netsuite.com/services/rest/query/v1/suiteql`,
                {
                    q: `SELECT id,firstname,middlename,lastname FROM contact WHERE phone = ${numberToQuery} OR homePhone = ${numberToQuery} OR mobilePhone = ${numberToQuery} OR officePhone = ${numberToQuery}`
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
                    matchedContactInfo.push({
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
                    q: `SELECT id,firstname,middlename,lastname FROM customer WHERE phone = ${numberToQuery} OR homePhone = ${numberToQuery} OR mobilePhone = ${numberToQuery}  OR altPhone = ${numberToQuery}`
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
                    matchedContactInfo.push({
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
    console.log(`found netsuite contacts... \n\n${JSON.stringify(matchedContactInfo, null, 2)}`);
    matchedContactInfo.push({
        id: 'createNewContact',
        name: 'Create new contact...',
        additionalInfo: null,
        isNewContact: true
    });
    return {
        matchedContactInfo,
    };
}

async function createCallLog({ user, contactInfo, authHeader, callLog, note, additionalSubmission }) {
    //const originalMessage = note;
    //const temporedMessage = originalMessage + generateRandomString(20);
    const title = callLog.customSubject ?? `${callLog.direction} Call ${callLog.direction === 'Outbound' ? 'to' : 'from'} ${contactInfo.name}`;
    let postBody = {
        title: title,
        phone: contactInfo?.phoneNumber || '',
        priority: "MEDIUM",
        status: "COMPLETE",
        startDate: moment(callLog.startTime).toISOString(),
        message: `\nContact Number: ${contactInfo.phoneNumber}\nNote: ${note}${callLog.recording ? `\n[Call recording link] ${callLog.recording.link}` : ''}\n\n--- Created via RingCentral CRM Extension`,
    };
    if (contactInfo.type?.toUpperCase() === 'CONTACT') {
        console.log({ message: "Contact CallLog", contactInfo })
        const contactInfoRes = await axios.get(`https://${user.hostname.split(".")[0]}.suitetalk.api.netsuite.com/services/rest/record/v1/contact/${contactInfo.id}`, {
            headers: { 'Authorization': authHeader }
        });
        postBody.contact = { id: contactInfo.id };
        postBody.company = { id: contactInfoRes.data?.company?.id };
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
    const callLogId = extractIdFromUrl(addLogRes.headers.location);
    /*
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
        });*/
    return {
        logId: callLogId,
        returnMessage: {
            message: 'Call log added.',
            messageType: 'success',
            ttl: 3000
        }
    };
    // return callLogId;
}

async function getCallLog({ user, callLogId, authHeader }) {
    console.log({ message: "Finding Call With Id", callLogId });
    try {
        const getLogRes = await axios.get(`https://${user.hostname.split(".")[0]}.suitetalk.api.netsuite.com/services/rest/record/v1/phonecall/${callLogId}`,
            {
                headers: { 'Authorization': authHeader }
            });
        const note = getLogRes.data?.message.includes('[Call recording link]') ?
            getLogRes.data?.message.split('Note: ')[1].split('\n[Call recording link]')[0] :
            getLogRes.data?.message.split('Note: ')[1].split('\n\n--- Created via RingCentral CRM Extension')[0];
        return {
            callLogInfo: {
                subject: getLogRes.data.title,
                note,
                additionalSubmission: {}
            },
            returnMessage: {
            }
        }
    } catch (error) {
        console.log({ message: "Error in getting Call Log", error });
        return {
            returnMessage: {
                messageType: 'danger',
                message: 'Error in getting NetSuite Call Log.',
                ttl: 3000
            }
        }
    }

}

async function updateCallLog({ user, existingCallLog, authHeader, recordingLink, subject, note }) {
    console.log({ user, existingCallLog, authHeader, recordingLink, subject, note });
    const existingLogId = existingCallLog.thirdPartyLogId;
    const callLogResponse = await axios.get(`https://${user.hostname.split(".")[0]}.suitetalk.api.netsuite.com/services/rest/record/v1/phonecall/${existingLogId}`, { headers: { 'Authorization': authHeader } });
    let messageBody = callLogResponse.data.message;
    console.log({ messageBody });
    let patchBody = { title: subject };
    if (!!recordingLink) {
        const urlDecodedRecordingLink = decodeURIComponent(recordingLink);
        if (messageBody.includes('\n\n--- Created via RingCentral CRM Extension')) {
            messageBody = messageBody.replace('\n\n--- Created via RingCentral CRM Extension', `\n[Call recording link]${urlDecodedRecordingLink}\n\n--- Created via RingCentral CRM Extension`);
        }
        else {
            messageBody += `\n[Call recording link]${urlDecodedRecordingLink}`;
        }
    }
    else {
        let originalNote = '';
        if (messageBody.includes('\n[Call recording link]')) {
            originalNote = messageBody.split('\n[Call recording link]')[0].split('Note: ')[1];
        }
        else {
            originalNote = messageBody.split('\n\n--- Created via RingCentral CRM Extension')[0].split('Note: ')[1];
            console.log({ originalNote });
        }

        messageBody = messageBody.replace(`Note: ${originalNote}`, `Note: ${note}`);
    }
    patchBody.message = messageBody;
    console.log({ patchBody });
    const patchLogRes = await axios.patch(
        `https://${user.hostname.split(".")[0]}.suitetalk.api.netsuite.com/services/rest/record/v1/phoneCall/${existingLogId}`,
        patchBody,
        {
            headers: { 'Authorization': authHeader }
        });
    return {
        updatedNote: note,
        returnMessage: {
            message: 'Call log updated.',
            messageType: 'success',
            ttl: 3000
        }
    };
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
            const decodedRecordingLink = decodeURIComponent(recordingLink);
            title = `Voicemail left by ${contactInfo.name} - ${moment(message.creationTime).format('YY/MM/DD')}`;
            logBody = `Voicemail recording link: ${decodedRecordingLink} \n\n--- Created via RingCentral CRM Extension`;
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
    if (contactInfo.type?.toUpperCase() === 'CONTACT') {
        console.log({ message: "Contact CallLog", contactInfo })
        const contactInfoRes = await axios.get(`https://${user.hostname.split(".")[0]}.suitetalk.api.netsuite.com/services/rest/record/v1/contact/${contactInfo.id}`, {
            headers: { 'Authorization': authHeader }
        });
        postBody.data.contact = { id: contactInfo.id };
        postBody.data.company = { id: contactInfoRes.data?.company?.id };
    }
    const addLogRes = await axios.post(
        `https://${user.hostname.split(".")[0]}.suitetalk.api.netsuite.com/services/rest/record/v1/phonecall`,
        postBody.data,
        {
            headers: { 'Authorization': authHeader }
        });
    const callLogId = extractIdFromUrl(addLogRes.headers.location);
    console.log({ message: "CallLogId is", callLogId });
    return {
        logId: callLogId,
        returnMessage: {
            message: 'Message log added.',
            messageType: 'success',
            ttl: 3000
        }
    };
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
    return {
        logId: existingLogId,
        returnMessage: {
            message: 'Message log Updated.',
            messageType: 'success',
            ttl: 3000
        }
    };
}

async function createContact({ user, authHeader, phoneNumber, newContactName, newContactType }) {
    const nameParts = splitName(newContactName);
    console.log({ message: 'NetSuite Create contact', user, phoneNumber, newContactName, newContactType });
    let contactId = 0;
    switch (newContactType) {
        case 'contact':
            let companyId = 0;
            try {
                const companyInfo = await axios.post(
                    `https://${user.hostname.split(".")[0]}.suitetalk.api.netsuite.com/services/rest/query/v1/suiteql`,
                    {
                        q: `SELECT * FROM customer WHERE companyName = 'RingCentral_CRM_Extension_Placeholder_Company'`
                    },
                    {
                        headers: { 'Authorization': authHeader, 'Content-Type': 'application/json', 'Prefer': 'transient' }
                    }
                )
                if (companyInfo.data.count > 0 && companyInfo.data.items[0].companyname === 'RingCentral_CRM_Extension_Placeholder_Company') {
                    companyId = companyInfo.data.items[0].id;
                }
                else {
                    const createCompany = await axios.post(`https://${user.hostname.split(".")[0]}.suitetalk.api.netsuite.com/services/rest/record/v1/customer`,
                        {
                            companyName: 'RingCentral_CRM_Extension_Placeholder_Company',
                            comments: "This company was created automatically by the RingCentral Unified CRM Extension. Feel free to edit, or associate this company's contacts to more appropriate records."
                        }
                        ,
                        {
                            headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' }
                        });
                    companyId = extractIdFromUrl(createCompany.headers.location);
                }
                const contactPayLoad = {
                    firstName: nameParts.firstName,
                    middleName: nameParts.middleName,
                    lastName: nameParts.lastName,
                    phone: phoneNumber || '',
                    company: { id: companyId }
                };
                const createContactRes = await axios.post(
                    `https://${user.hostname.split(".")[0]}.suitetalk.api.netsuite.com/services/rest/record/v1/contact`,
                    contactPayLoad
                    ,
                    {
                        headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' }
                    });
                contactId = extractIdFromUrl(createContactRes.headers.location);
                break;
            } catch (error) {
                console.log({ message: "Error in creating Contact", error });
                return {
                    contactInfo: {
                        id: contactId,
                        name: newContactName
                    },
                    returnMessage: {
                        message: `Error in creating Contact.`,
                        messageType: 'danger',
                        ttl: 3000
                    }
                }
            }
        case 'custjob':
            const customerPayLoad = {
                firstName: nameParts.firstName,
                middleName: nameParts.middleName,
                lastName: nameParts.lastName.length > 0 ? nameParts.lastName : nameParts.firstName,
                phone: phoneNumber || '',
                isPerson: true

            };
            try {
                const createCustomerRes = await axios.post(
                    `https://${user.hostname.split(".")[0]}.suitetalk.api.netsuite.com/services/rest/record/v1/customer`,
                    customerPayLoad
                    ,
                    {
                        headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' }
                    });
                contactId = extractIdFromUrl(createCustomerRes.headers.location);
                break;
            } catch (error) {
                console.log({ message: "Error in creating Customer", error });
                return {
                    contactInfo: {
                        id: contactId,
                        name: newContactName
                    },
                    returnMessage: {
                        message: `Error in creating Customer.`,
                        messageType: 'danger',
                        ttl: 3000
                    }
                }
            }

    }
    return {
        contactInfo: {
            id: contactId,
            name: newContactName
        },
        returnMessage: {
            message: `New contact created.`,
            messageType: 'success',
            ttl: 3000
        }
    }
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

function extractIdFromUrl(url) {
    const segments = url.split('/').filter(segment => segment !== ''); // Remove empty segments
    return segments.length > 0 ? segments[segments.length - 1] : 0; // Extract the ID from the URL
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