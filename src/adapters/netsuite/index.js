const axios = require('axios');
const moment = require('moment');
const url = require('url');
const { parsePhoneNumber } = require('awesome-phonenumber');
const { parse } = require('path');
const { getTimeZone } = require('../../lib/util');
const { get } = require('shortid/lib/alphabet');

function getAuthType() {
    return 'oauth';
}


async function getOauthInfo({ hostname }) {
    const tokenUrl = `https://${hostname.split(".")[0]}.suitetalk.api.netsuite.com/services/rest/auth/oauth2/v1/token`;
    return {
        clientId: process.env.NETSUITE_CRM_CLIENT_ID,
        clientSecret: process.env.NETSUITE_CRM_CLIENT_SECRET,
        accessTokenUri: tokenUrl,
        redirectUri: process.env.NETSUITE_CRM_REDIRECT_URI
    }
}

async function getUserInfo({ authHeader, additionalInfo, query }) {
    try {
        let getCurrentLoggedInUserResponse;
        try {
            const getCurrentLoggedInUserUrl = `https://${query.hostname.split(".")[0]}.restlets.api.netsuite.com/app/site/hosting/restlet.nl?script=customscript_getcurrentuser&deploy=customdeploy_getcurrentuser`;
            getCurrentLoggedInUserResponse = await axios.get(getCurrentLoggedInUserUrl, {
                headers: { 'Authorization': authHeader }
            });
        } catch (error) {
            console.log({ message: "Error in getting employee information using RestLet" });
            let errorMessage = netSuiteRestLetError(error, "Error in Finding Current User");
            return {
                successful: false,
                returnMessage: {
                    messageType: 'danger',
                    message: errorMessage,
                    ttl: 60000
                }
            }
        }
        let oneWorldEnabled;
        try {
            const checkOneWorldLicenseUrl = `https://${query.hostname.split(".")[0]}.restlets.api.netsuite.com/app/site/hosting/restlet.nl?script=customscript_getoneworldlicense_scriptid&deploy=customdeploy_getoneworldlicense_deployid`;
            const oneWorldLicenseResponse = await axios.get(checkOneWorldLicenseUrl, {
                headers: { 'Authorization': authHeader }
            });
            oneWorldEnabled = oneWorldLicenseResponse?.data?.oneWorldEnabled;
        } catch (e) {
            console.log({ message: "Error in getting OneWorldLicense" });
            if (subsidiaryId !== undefined && subsidiaryId !== '') {
                oneWorldEnabled = true;
            }
        }
        try {
            const checkPermissionSetUrl = `https://${query.hostname.split(".")[0]}.restlets.api.netsuite.com/app/site/hosting/restlet.nl?script=customscript_checkrolepermissionscriptid&deploy=customdeploy_checkrolepermissiondeployid`;
            const requestData = {
                requiredPermissions: [
                    "LIST_CONTACT",
                    "REPO_ANALYTICS",
                    "TRAN_SALESORD",
                    "LIST_CUSTJOB",
                    "ADMI_LOGIN_OAUTH2",
                    "ADMI_RESTWEBSERVICES",
                    "LIST_CALL",
                    "LIST_SUBSIDIARY"
                ]
            };
            const permissionMessages = {
                "LIST_CONTACT": "List -> Contact -> Full",
                "LIST_CUSTJOB": "List -> Customer -> Full",
                "LIST_CALL": "List -> Phone Calls -> Full",
                "LIST_SUBSIDIARY": "List -> Subsidiaries -> View",
                "REPO_ANALYTICS": "Report -> SuiteAnalytics Workbook -> Edit",
                "TRAN_SALESORD": "Transactions -> Sales Orders -> Full",
                "ADMI_LOGIN_OAUTH2": "Setup -> Log in using OAuth 2.0 Access Tokens -> Full",
                "ADMI_RESTWEBSERVICES": "Setup -> REST Web Services -> Full"
            };

            const permissionsResponse = await axios.post(checkPermissionSetUrl, requestData, {
                headers: { 'Authorization': authHeader }
            });
            console.log({ Data: permissionsResponse.data });
            const missingPermissions = Object.keys(permissionsResponse?.data?.permissionResults).filter(permission => {
                if (permission === "LIST_SUBSIDIARY" && !oneWorldEnabled) {
                    return false; // Skip this permission if oneWorldEnabled is false
                }
                return !permissionsResponse?.data?.permissionResults[permission]; // Include other permissions that are not granted
            });
            console.log({ missingPermissions });
            if (missingPermissions.length > 0) {
                const missingSpecificPermissions = missingPermissions.filter(permission => permissionMessages[permission]);
                let requiredPermissions = `To connect, you need the following specific permissions: ${missingSpecificPermissions.map(permission => permissionMessages[permission]).join(", ")}.`;
                // let requiredPermissions = `Following permissions are missing in your role: ${missingPermissions.join(", ")}.`;
                return {
                    successful: false,
                    returnMessage: {
                        messageType: 'danger',
                        message: requiredPermissions,
                        ttl: 60000
                    }
                }
            }

        } catch (error) {
            console.log({ message: "Error in getting permission set" });
        }
        return {
            successful: true,
            platformUserInfo: {
                id: query.entity,
                name: getCurrentLoggedInUserResponse?.data?.name,
                platformAdditionalInfo: {
                    email: getCurrentLoggedInUserResponse?.data?.email,
                    name: getCurrentLoggedInUserResponse?.data?.name,
                    subsidiaryId: getCurrentLoggedInUserResponse?.data?.subsidiary,
                    oneWorldEnabled: oneWorldEnabled,
                },

            },
            returnMessage: {
                messageType: 'success',
                message: 'Successfully connected to NetSuite.',
                ttl: 3000
            }
        };
    } catch (error) {
        const errorDetails = netSuiteErrorDetails(error, "Error in getting NetSuite User Info.");
        console.log({ message: "Error in getting employee information", Path: error?.request?.path, Host: error?.request?.host, errorDetails, responseHeader: error?.response?.headers });
        return {
            successful: false,
            returnMessage: {
                messageType: 'danger',
                message: errorDetails,
                ttl: 60000
            }
        }
    }
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
    try {
        const phoneNumberObj = parsePhoneNumber(phoneNumber.replace(' ', '+'));
        const phoneNumberWithoutCountryCode = phoneNumberObj.number.significant;
        const matchedContactInfo = [];
        if (phoneNumberWithoutCountryCode !== 'undefined' && phoneNumberWithoutCountryCode !== null && phoneNumberWithoutCountryCode !== '') {
            const contactQuery = `SELECT * FROM contact WHERE REGEXP_REPLACE(phone, '[^0-9]', '') LIKE '%${phoneNumberWithoutCountryCode}%' OR REGEXP_REPLACE(homePhone, '[^0-9]', '') LIKE '%${phoneNumberWithoutCountryCode}%' OR REGEXP_REPLACE(mobilePhone, '[^0-9]', '') LIKE '%${phoneNumberWithoutCountryCode}%' OR REGEXP_REPLACE(officePhone, '[^0-9]', '') LIKE '%${phoneNumberWithoutCountryCode}%'`;
            const customerQuery = `SELECT * FROM customer WHERE REGEXP_REPLACE(phone, '[^0-9]', '') LIKE '%${phoneNumberWithoutCountryCode}%' OR REGEXP_REPLACE(homePhone, '[^0-9]', '') LIKE '%${phoneNumberWithoutCountryCode}%' OR REGEXP_REPLACE(mobilePhone, '[^0-9]', '') LIKE '%${phoneNumberWithoutCountryCode}%' OR REGEXP_REPLACE(altPhone, '[^0-9]', '') LIKE '%${phoneNumberWithoutCountryCode}%'`;
            const personInfo = await axios.post(
                `https://${user.hostname.split(".")[0]}.suitetalk.api.netsuite.com/services/rest/query/v1/suiteql`,
                {
                    q: contactQuery
                },
                {
                    headers: { 'Authorization': authHeader, 'Content-Type': 'application/json', 'Prefer': 'transient' }
                });
            if (personInfo.data.items.length > 0) {
                for (var result of personInfo.data.items) {
                    let firstName = result.firstname ?? '';
                    let middleName = result.middlename ?? '';
                    let lastName = result.lastname ?? '';
                    const contactName = (firstName + middleName + lastName).length > 0 ? `${firstName} ${middleName} ${lastName}` : result.entitytitle;
                    matchedContactInfo.push({
                        id: result.id,
                        name: contactName,
                        phone: result.phone ?? '',
                        homephone: result.homephone ?? '',
                        mobilephone: result.mobilephone ?? '',
                        officephone: result.officephone ?? '',
                        additionalInfo: null,
                        type: 'contact'
                    })
                }
            }
            //For Customer search
            const customerInfo = await axios.post(
                `https://${user.hostname.split(".")[0]}.suitetalk.api.netsuite.com/services/rest/query/v1/suiteql`,
                {
                    q: customerQuery
                },
                {
                    headers: { 'Authorization': authHeader, 'Content-Type': 'application/json', 'Prefer': 'transient' }
                });
            if (customerInfo.data.items.length > 0) {
                for (var result of customerInfo.data.items) {
                    let firstName = result.firstname ?? '';
                    let middleName = result.middlename ?? '';
                    let lastName = result.lastname ?? '';
                    const customerName = (firstName + middleName + lastName).length > 0 ? `${firstName} ${middleName} ${lastName}` : result.entitytitle;
                    matchedContactInfo.push({
                        id: result.id,
                        name: customerName,
                        phone: result.phone ?? '',
                        homephone: result.homephone ?? '',
                        mobilephone: result.mobilephone ?? '',
                        altphone: result.altphone ?? '',
                        additionalInfo: null,
                        type: 'custjob'
                    })
                }
            }
        }
        matchedContactInfo.push({
            id: 'createNewContact',
            name: 'Create new contact...',
            additionalInfo: null,
            isNewContact: true
        });
        return {
            matchedContactInfo,
        };
    } catch (error) {
        let errorMessage = netSuiteErrorDetails(error, "Error in Finding Contact.");
        errorMessage += ' OR Permission violation: You need the "Lists -> Contact -> FULL, Lists -> Customers -> FULL" permission to access this page.';
        return {
            successful: false,
            returnMessage: {
                messageType: 'danger',
                message: errorMessage,
                ttl: 60000
            }
        }
    }
}

async function createCallLog({ user, contactInfo, authHeader, callLog, note, additionalSubmission }) {
    try {
        const title = callLog.customSubject ?? `${callLog.direction} Call ${callLog.direction === 'Outbound' ? 'to' : 'from'} ${contactInfo.name}`;
        const oneWorldEnabled = user?.platformAdditionalInfo?.oneWorldEnabled;
        let callStartTime = moment(moment(callLog.startTime).toISOString());
        let startTimeSLot = moment(callLog.startTime).format('HH:mm');
        /**
         * Users without a OneWorld license do not have access to subsidiaries.
         */
        // if (oneWorldEnabled !== undefined && oneWorldEnabled === true) {
        //     const subsidiary = await axios.post(
        //         `https://${user.hostname.split(".")[0]}.suitetalk.api.netsuite.com/services/rest/query/v1/suiteql`,
        //         {
        //             q: `SELECT * FROM Subsidiary WHERE id = ${user?.platformAdditionalInfo?.subsidiaryId}`
        //         },
        //         {
        //             headers: { 'Authorization': authHeader, 'Content-Type': 'application/json', 'Prefer': 'transient' }
        //         });
        //     const timeZone = getTimeZone(subsidiary.data.items[0]?.country, subsidiary.data.items[0]?.state);
        //     callStartTime = moment(moment(callLog.startTime).toISOString()).tz(timeZone);
        // }
        try {
            const getTimeZoneUrl = `https://${user.hostname.split(".")[0]}.restlets.api.netsuite.com/app/site/hosting/restlet.nl?script=customscript_gettimezone&deploy=customdeploy_gettimezone`;
            const timeZoneResponse = await axios.get(getTimeZoneUrl, {
                headers: { 'Authorization': authHeader }
            });
            const timeZone = timeZoneResponse?.data?.userTimezone;
            callStartTime = moment(moment(callLog.startTime).toISOString()).tz(timeZone);
            startTimeSLot = callStartTime.format('HH:mm');

        } catch (error) {
            console.log({ message: "Error in getting timezone" });
        }
        const callEndTime = moment(callStartTime).add(callLog.duration, 'seconds');
        const formatedStartTime = callStartTime.format('YYYY-MM-DD HH:mm:ss');
        const formatedEndTime = callEndTime.format('YYYY-MM-DD HH:mm:ss');
        let endTimeSlot = callEndTime.format('HH:mm');
        if (startTimeSLot === endTimeSlot) {
            //If Start Time and End Time are same, then add 1 minute to End Time because endTime can not be less or equal to startTime
            endTimeSlot = callEndTime.add(1, 'minutes').format('HH:mm');
        }
        let postBody = {
            title: title,
            phone: contactInfo?.phoneNumber || '',
            priority: "MEDIUM",
            status: "COMPLETE",
            startDate: moment(callLog.startTime).toISOString(),
            startTime: startTimeSLot,
            endTime: endTimeSlot,
            timedEvent: true,
            message: `Note: ${note}${callLog.recording ? `\nCall recording link ${callLog.recording.link}` : ''}\n\n--- Created via RingCentral CRM Extension`,
        };
        if (contactInfo.type?.toUpperCase() === 'CONTACT') {
            const contactInfoRes = await axios.get(`https://${user.hostname.split(".")[0]}.suitetalk.api.netsuite.com/services/rest/record/v1/contact/${contactInfo.id}`, {
                headers: { 'Authorization': authHeader }
            });
            postBody.contact = { id: contactInfo.id };
            postBody.company = { id: contactInfoRes.data?.company?.id };
        } else if (contactInfo.type === 'custjob') {
            postBody.company = { id: contactInfo.id };
        }

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
    } catch (error) {
        let errorMessage = netSuiteErrorDetails(error, "Error in Creating Call Log");
        if (errorMessage.includes("'Subsidiary' was not found.")) {
            errorMessage = errorMessage + " OR Permission violation: You need the 'Lists -> Subsidiaries -> View' permission to access this page. "
        }
        return {
            returnMessage: {
                messageType: 'danger',
                message: errorMessage,
                ttl: 60000
            }
        }

    }

}

async function getCallLog({ user, callLogId, authHeader }) {
    try {
        const getLogRes = await axios.get(`https://${user.hostname.split(".")[0]}.suitetalk.api.netsuite.com/services/rest/record/v1/phonecall/${callLogId}`,
            {
                headers: { 'Authorization': authHeader }
            });
        const note = getLogRes.data?.message.includes('Call recording link') ?
            getLogRes.data?.message.split('Note: ')[1].split('\nCall recording link')[0] :
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
        const errorMessage = netSuiteErrorDetails(error, "Error in getting NetSuite Call Log.");
        return {
            returnMessage: {
                messageType: 'danger',
                message: errorMessage,
                ttl: 60000
            }
        }
    }

}

async function updateCallLog({ user, existingCallLog, authHeader, recordingLink, subject, note }) {
    try {
        const existingLogId = existingCallLog.thirdPartyLogId;
        const callLogResponse = await axios.get(`https://${user.hostname.split(".")[0]}.suitetalk.api.netsuite.com/services/rest/record/v1/phonecall/${existingLogId}`, { headers: { 'Authorization': authHeader } });
        let messageBody = callLogResponse.data.message;
        let patchBody = { title: subject };
        if (!!recordingLink) {
            const urlDecodedRecordingLink = decodeURIComponent(recordingLink);
            if (messageBody.includes('\n\n--- Created via RingCentral CRM Extension')) {
                messageBody = messageBody.replace('\n\n--- Created via RingCentral CRM Extension', `\nCall recording link${urlDecodedRecordingLink}\n\n--- Created via RingCentral CRM Extension`);
            }
            else {
                messageBody += `\nCall recording link${urlDecodedRecordingLink}`;
            }
        }
        else {
            let originalNote = '';
            if (messageBody.includes('\nCall recording link')) {
                originalNote = messageBody.split('\nCall recording link')[0].split('Note: ')[1];
            }
            else {
                originalNote = messageBody.split('\n\n--- Created via RingCentral CRM Extension')[0].split('Note: ')[1];
            }

            messageBody = messageBody.replace(`Note: ${originalNote}`, `Note: ${note}`);
        }
        patchBody.message = messageBody;
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
    } catch (error) {
        const errorMessage = netSuiteErrorDetails(error, "Error in getting NetSuite Call Log.");
        return {
            returnMessage: {
                messageType: 'danger',
                message: errorMessage,
                ttl: 60000
            }
        }
    }
}

async function createMessageLog({ user, contactInfo, authHeader, message, additionalSubmission, recordingLink, faxDocLink }) {
    try {
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
            const contactInfoRes = await axios.get(`https://${user.hostname.split(".")[0]}.suitetalk.api.netsuite.com/services/rest/record/v1/contact/${contactInfo.id}`, {
                headers: { 'Authorization': authHeader }
            });
            postBody.data.contact = { id: contactInfo.id };
            postBody.data.company = { id: contactInfoRes.data?.company?.id };
        } else if (contactInfo.type === 'custjob') {
            postBody.data.company = { id: contactInfo.id };
        }
        const addLogRes = await axios.post(
            `https://${user.hostname.split(".")[0]}.suitetalk.api.netsuite.com/services/rest/record/v1/phonecall`,
            postBody.data,
            {
                headers: { 'Authorization': authHeader }
            });
        const callLogId = extractIdFromUrl(addLogRes.headers.location);
        return {
            logId: callLogId,
            returnMessage: {
                message: 'Message log added.',
                messageType: 'success',
                ttl: 3000
            }
        };
    } catch (error) {
        const errorMessage = netSuiteErrorDetails(error, "Error in Creating Message Log");
        return {
            returnMessage: {
                messageType: 'danger',
                message: errorMessage,
                ttl: 60000
            }
        }
    }
}

async function updateMessageLog({ user, contactInfo, existingMessageLog, message, authHeader, contactNumber }) {
    try {
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
    } catch (error) {
        const errorMessage = netSuiteErrorDetails(error, "Error in Updating Message Log");
        return {
            returnMessage: {
                messageType: 'danger',
                message: errorMessage,
                ttl: 60000
            }
        }
    }
}

async function createContact({ user, authHeader, phoneNumber, newContactName, newContactType }) {
    try {
        const nameParts = splitName(newContactName);
        let contactId = 0;
        const subsidiaryId = user.platformAdditionalInfo?.subsidiaryId;
        const oneWorldEnabled = user?.platformAdditionalInfo?.oneWorldEnabled;
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
                        let companyPostBody = {
                            companyName: 'RingCentral_CRM_Extension_Placeholder_Company',
                            comments: "This company was created automatically by the RingCentral Unified CRM Extension. Feel free to edit, or associate this company's contacts to more appropriate records.",
                        };
                        if (oneWorldEnabled !== undefined && oneWorldEnabled === true) {
                            companyPostBody.subsidiary = { id: subsidiaryId };
                        }
                        const createCompany = await axios.post(`https://${user.hostname.split(".")[0]}.suitetalk.api.netsuite.com/services/rest/record/v1/customer`,
                            companyPostBody
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
                    if (oneWorldEnabled !== undefined && oneWorldEnabled === true) {
                        contactPayLoad.subsidiary = { id: subsidiaryId };
                    }
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
                    return {
                        contactInfo: {
                            id: contactId,
                            name: newContactName
                        },
                        returnMessage: {
                            message: netSuiteErrorDetails(error, "Error in Creating Contact"),
                            messageType: 'danger',
                            ttl: 5000
                        }
                    }
                }
            case 'custjob':
                const lastName = nameParts.lastName.length > 0 ? nameParts.lastName : nameParts.firstName;
                const customerPayLoad = {
                    firstName: nameParts.firstName,
                    middleName: nameParts.middleName,
                    lastName: lastName,
                    entityId: nameParts.firstName + " " + lastName,
                    phone: phoneNumber || '',
                    isPerson: true

                };
                if (oneWorldEnabled !== undefined && oneWorldEnabled === true) {
                    customerPayLoad.subsidiary = { id: subsidiaryId };
                }
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
                    return {
                        contactInfo: {
                            id: contactId,
                            name: newContactName
                        },
                        returnMessage: {
                            message: netSuiteErrorDetails(error, "Error in Creating Customer"),
                            messageType: 'danger',
                            ttl: 5000
                        }
                    }
                }

        }
        const displayMessage = newContactType === 'contact'
            ? 'The new contact is created under a placeholder company, please click "View contact details" to check out'
            : 'New Customer Created';
        return {
            contactInfo: {
                id: contactId,
                name: newContactName
            },
            returnMessage: {
                message: displayMessage,
                messageType: 'success',
                ttl: 5000
            }
        }
    } catch (error) {
        const errorMessage = netSuiteErrorDetails(error, "Error in Creating Contact/Customer");
        return {
            returnMessage: {
                messageType: 'danger',
                message: errorMessage,
                ttl: 60000
            }
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
function netSuiteErrorDetails(error, message) {
    try {
        const data = error?.response?.data;
        let concatenatedErrorDetails = "";
        // Check if 'o:errorDetails' exists and is an array
        if (Array.isArray(data?.['o:errorDetails'])) {
            // Iterate through each element in 'o:errorDetails' and concatenate the 'detail' field
            data['o:errorDetails'].forEach(errorDetail => {
                concatenatedErrorDetails += errorDetail?.detail + " "; // Concatenating with a space
            });
            // Trim any trailing space from the concatenated string
            concatenatedErrorDetails = concatenatedErrorDetails.trim();
        }
        return concatenatedErrorDetails.length > 0 ? concatenatedErrorDetails : message;
    } catch (error) {
        return message;
    }
}

function netSuiteRestLetError(error, message) {
    const errorMessage = error?.response?.data?.split('\n')
        .find(line => line.startsWith('error message:'))
        ?.replace('error message: ', '')
        .trim();
    return errorMessage || message;
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