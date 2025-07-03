/* eslint-disable no-control-regex */
/* eslint-disable no-param-reassign */
const axios = require('axios');
const moment = require('moment');
const url = require('url');
const { parsePhoneNumber } = require('awesome-phonenumber');
const { parse } = require('path');
const { getTimeZone } = require('../../lib/util');
const { get } = require('shortid/lib/alphabet');
const { secondsToHoursMinutesSeconds } = require('../../lib/util');

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

        const getCurrentLoggedInUserUrl = `https://${query.hostname.split(".")[0]}.restlets.api.netsuite.com/app/site/hosting/restlet.nl?script=customscript_getcurrentuser&deploy=customdeploy_getcurrentuser`;
        getCurrentLoggedInUserResponse = await axios.get(getCurrentLoggedInUserUrl, {
            headers: { 'Authorization': authHeader }
        });
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
            const missingPermissions = Object.keys(permissionsResponse?.data?.permissionResults).filter(permission => {
                if (permission === "LIST_SUBSIDIARY" && !oneWorldEnabled) {
                    return false; // Skip this permission if oneWorldEnabled is false
                }
                return !permissionsResponse?.data?.permissionResults[permission]; // Include other permissions that are not granted
            });
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
                message: 'Connected to NetSuite.',
                ttl: 1000
            }
        };
    } catch (error) {
        const errorDetails = netSuiteErrorDetails(error, "Could not load user information");
        console.log({ message: "Error in getting employee information", Path: error?.request?.path, Host: error?.request?.host, errorDetails, responseHeader: error?.response?.headers });
        return {
            successful: false,
            returnMessage: {
                messageType: 'danger',
                message: errorDetails,
                details: [
                    {
                        title: 'Details',
                        items: [
                            {
                                id: '1',
                                type: 'text',
                                text: `NetSuite was unable to fetch information for the currently logged in user. Please check your permissions in NetSuite and make sure you have permission to access and read user information.`
                            }
                        ]
                    }
                ],
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
    // remove user credentials
    user.accessToken = '';
    user.refreshToken = '';
    await user.save();
    return {
        returnMessage: {
            messageType: 'success',
            message: 'Logged out of NetSuite',
            ttl: 3000
        }
    }
}
async function upsertCallDisposition({ user, existingCallLog, authHeader, dispositions }) {
    const existingCallLogId = existingCallLog.thirdPartyLogId.split('.')[0];
    const baseUrl = `https://${user.hostname.split(".")[0]}`;

    try {
        const getLogRes = await axios.get(
            `${baseUrl}.suitetalk.api.netsuite.com/services/rest/record/v1/phonecall/${existingCallLogId}`,
            { headers: { 'Authorization': authHeader } }
        );

        const note = getLogRes.data.message;
        const title = getLogRes.data.title;
        let sanitizedNote = sanitizeNote({ note });
        const isSalesOrderCallLogEnable = user.userSettings?.enableSalesOrderLogging?.value ?? false;

        // Handle Sales Order logging
        if (dispositions?.salesorder && isSalesOrderCallLogEnable) {
            sanitizedNote = await handleDispositionNote({
                baseUrl,
                authHeader,
                note,
                title,
                sanitizedNote,
                dispositionId: dispositions.salesorder,
                dispositionType: 'salesorder',
                existingCallLogId
            });
        }

        // Handle Opportunity logging
        if (dispositions?.opportunity) {
            sanitizedNote = await handleDispositionNote({
                baseUrl,
                authHeader,
                note,
                title,
                sanitizedNote,
                dispositionId: dispositions.opportunity,
                dispositionType: 'opportunity',
                existingCallLogId
            });
        }

        return { logId: existingCallLogId };
    } catch (error) {
        console.error('Error in upsertCallDisposition:', error);
        throw error;
    }
}

async function handleDispositionNote({
    baseUrl,
    authHeader,
    note,
    title,
    sanitizedNote,
    dispositionId,
    dispositionType,
    existingCallLogId
}) {
    const createUserNotesUrl = `${baseUrl}.restlets.api.netsuite.com/app/site/hosting/restlet.nl?script=customscript_createusernotes&deploy=customdeploy_createusernotes`;

    try {
        let noteId = undefined;
        switch (dispositionType) {
            case 'salesorder':
                noteId = extractNoteIdFromNote({ note, targetSalesOrderId: dispositionId });
                break;
            case 'opportunity':
                noteId = extractNoteIdFromOpportunityNote({ note, targetOpportunityId: dispositionId });
                break;
        }

        if (!noteId) {
            // Create new note
            const postBody = {
                salesOrderId: dispositionId,
                noteTitle: title,
                noteText: sanitizedNote ?? 'empty'
            };

            const createNoteResponse = await axios.post(createUserNotesUrl, postBody, {
                headers: { 'Authorization': authHeader }
            });

            if (createNoteResponse?.data?.success) {
                const noteUrl = `${baseUrl}.app.netsuite.com/app/crm/common/note.nl?id=${createNoteResponse.data.noteId}`;
                let updatedNote = sanitizedNote;
                switch (dispositionType) {
                    case 'salesorder':
                        updatedNote = upsertNetSuiteUserNoteUrl({ body: sanitizedNote, userNoteUrl: noteUrl, salesOrderId: dispositionId });
                        break;
                    case 'opportunity':
                        updatedNote = upsertNetSuiteOpportunityNoteUrl({ body: sanitizedNote, opportunityNoteUrl: noteUrl, opportunityId: dispositionId });
                        break;
                }
                await axios.patch(
                    `${baseUrl}.suitetalk.api.netsuite.com/services/rest/record/v1/phoneCall/${existingCallLogId}`,
                    { message: updatedNote },
                    { headers: { 'Authorization': authHeader } }
                );
                return updatedNote;
            }
        } else {
            // Update existing note
            const updateBody = {
                noteTitle: title,
                noteText: sanitizedNote ?? 'empty',
                noteId
            };
            await axios.put(createUserNotesUrl, updateBody, {
                headers: { 'Authorization': authHeader }
            });
            return sanitizedNote;
        }
    } catch (error) {
        console.error(`Error in logging calls against ${dispositionType}:`, error);
        throw error;
    }
}

async function findContact({ user, authHeader, phoneNumber, overridingFormat }) {
    // const requestStartTime = new Date().getTime();
    try {
        const phoneNumberObj = parsePhoneNumber(phoneNumber.replace(' ', '+'));
        const phoneNumberWithoutCountryCode = phoneNumberObj.number.significant;
        const matchedContactInfo = [];
        const phoneFields = user.userSettings?.phoneFieldsId?.value ?? [];
        const contactSearch = user.userSettings?.contactsSearchId?.value ?? [];
        if (phoneFields.length === 0) {
            phoneFields.push('phone', 'homePhone', 'mobilePhone', 'officePhone', 'altPhone');
        }
        if (contactSearch.length === 0) {
            contactSearch.push('contact', 'customer');
        }
        const commonFields = phoneFields.filter(f => f !== 'altPhone' && f !== 'officePhone');
        const contactFields = [...commonFields];
        const customerFields = [...commonFields];
        if (phoneFields.includes('altPhone')) {
            customerFields.push('altPhone');
        }
        if (phoneFields.includes('officePhone')) {
            contactFields.push('officePhone');
        }
        const { enableSalesOrderLogging = false } = user.userSettings;
        const { enableOpportunityLogging = { value: false } } = user.userSettings;
        const dateBeforeThreeYear = getThreeYearsBeforeDate();
        const numberToQueryArray = [];
        if (overridingFormat !== '') {
            const formats = overridingFormat.split(',');
            numberToQueryArray.push(phoneNumber.replace(' ', '+')); //This is an E.164 format search, as the new contact was created by App Connect using the E.164 format.
            for (var format of formats) {
                const phoneNumberObj = parsePhoneNumber(phoneNumber.replace(' ', '+'));
                if (phoneNumberObj.valid) {
                    const phoneNumberWithoutCountryCode = phoneNumberObj.number.significant;
                    let formattedNumber = format;
                    for (const numberBit of phoneNumberWithoutCountryCode) {
                        formattedNumber = formattedNumber.replace(/[*#]/, numberBit);
                    }
                    numberToQueryArray.push(formattedNumber);
                }
            }
        } else {
            numberToQueryArray.push(phoneNumberWithoutCountryCode);
        }
        for (var numberToQuery of numberToQueryArray) {
            const contactQuery = `SELECT id,firstName,middleName,lastName,entitytitle,phone,company FROM contact WHERE lastmodifieddate >= to_date('${dateBeforeThreeYear}', 'yyyy-mm-dd hh24:mi:ss') AND (${buildContactSearchCondition(contactFields, numberToQuery, overridingFormat)})`;
            const customerQuery = `SELECT id,firstName,middleName,lastName,entitytitle,phone FROM customer WHERE lastmodifieddate >= to_date('${dateBeforeThreeYear}', 'yyyy-mm-dd hh24:mi:ss') AND (${buildContactSearchCondition(customerFields, numberToQuery, overridingFormat)})`;
            if (contactSearch.includes('contact')) {
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
                        let salesOrders = [];
                        let opportunities = [];
                        const contactName = (firstName + middleName + lastName).length > 0 ? `${firstName} ${middleName} ${lastName}` : result.entitytitle;
                        if (result?.company) {
                            try {
                                if (enableSalesOrderLogging.value) {

                                    const salesOrderResponse = await findSalesOrdersAgainstContact({ user, authHeader, contactId: result.company });
                                    for (const salesOrder of salesOrderResponse?.data?.items ?? []) {
                                        salesOrders.push({
                                            const: salesOrder?.id,
                                            title: salesOrder?.trandisplayname
                                        });
                                    }
                                }
                                if (enableOpportunityLogging.value) {
                                    const opportunityResponse = await findOpportunitiesAgainstContact({ user, authHeader, contactId: result.company });
                                    for (const opportunity of opportunityResponse?.data?.items ?? []) {
                                        opportunities.push({
                                            const: opportunity?.id,
                                            title: opportunity?.trandisplayname
                                        });
                                    }
                                }
                            } catch (e) {
                                console.log({ message: "Error in SalesOrder/Opportunity in contact" });
                            }
                        }
                        matchedContactInfo.push({
                            id: result.id,
                            name: contactName,
                            phone: result.phone ?? '',
                            homephone: result.homephone ?? '',
                            mobilephone: result.mobilephone ?? '',
                            officephone: result.officephone ?? '',
                            additionalInfo: {
                                ...(salesOrders.length > 0 ? { salesorder: salesOrders } : {}),
                                ...(opportunities.length > 0 ? { opportunity: opportunities } : {})
                            },
                            type: 'contact'
                        })
                    }
                }
            }
            if (contactSearch.includes('customer')) {
                const customerInfo = await axios.post(
                    `https://${user.hostname.split(".")[0]}.suitetalk.api.netsuite.com/services/rest/query/v1/suiteql`,
                    {
                        q: customerQuery
                    },
                    {
                        headers: { 'Authorization': authHeader, 'Content-Type': 'application/json', 'Prefer': 'transient' }
                    });
                if (customerInfo.data.items.length > 0) {
                    for (const result of customerInfo.data.items) {
                        let salesOrders = [];
                        let opportunities = [];
                        try {
                            if (enableSalesOrderLogging.value) {

                                const salesOrderResponse = await findSalesOrdersAgainstContact({ user, authHeader, contactId: result.id });
                                for (const salesOrder of salesOrderResponse?.data?.items ?? []) {
                                    salesOrders.push({
                                        const: salesOrder?.id,
                                        title: salesOrder?.trandisplayname
                                    });
                                }
                            }
                            if (enableOpportunityLogging.value) {
                                const opportunityResponse = await findOpportunitiesAgainstContact({ user, authHeader, contactId: result.id });
                                for (const opportunity of opportunityResponse?.data?.items ?? []) {
                                    opportunities.push({
                                        const: opportunity?.id,
                                        title: opportunity?.trandisplayname
                                    });
                                }
                            }
                        } catch (e) {
                            console.log({ message: "Error in SalesOrder/Opportunity search", e });
                        }
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
                            additionalInfo: {
                                ...(salesOrders.length > 0 ? { salesorder: salesOrders } : {}),
                                ...(opportunities.length > 0 ? { opportunity: opportunities } : {})
                            },
                            type: 'custjob'
                        })
                    }
                }
            }
        }
        matchedContactInfo.push({
            id: 'createNewContact',
            name: 'Create new contact...',
            additionalInfo: null,
            isNewContact: true
        });
        //Enable this after testing
        // matchedContactInfo.push({
        //     id: 'searchContact',
        //     name: 'Search NetSuite',
        //     additionalInfo: null,
        //     isFindContact: true
        // });
        // const requestEndTime = new Date().getTime();
        // console.log({ message: "Time taken to find contact", time: (requestEndTime - requestStartTime) / 1000 });
        return {
            successful: true,
            matchedContactInfo,
        };
    } catch (error) {
        console.log({ message: "Error in finding contact", error });
        let errorMessage = netSuiteErrorDetails(error, "Contact not found");
        errorMessage += ' OR Permission violation: You need the "Lists -> Contact -> FULL, Lists -> Customers -> FULL" permission to access this page.';
        return {
            successful: false,
            returnMessage: {
                messageType: 'danger',
                message: errorMessage,
                details: [
                    {
                        title: 'Details',
                        items: [
                            {
                                id: '1',
                                type: 'text',
                                text: `A contact with the phone number ${phoneNumber} could not be found in your NetSuite account.`
                            }
                        ]
                    }
                ],
                ttl: 60000
            }
        }
    }
}
async function findContactWithName({ user, authHeader, name }) {
    const matchedContactInfo = [];
    const contactSearch = user.userSettings?.contactsSearchId?.value ?? [];
    if (contactSearch.length === 0) {
        contactSearch.push('contact', 'customer');
    }
    const { enableSalesOrderLogging = false } = user.userSettings;
    const { enableOpportunityLogging = { value: false } } = user.userSettings;
    // const contactQuery = `SELECT id,firstName,middleName,lastName,entitytitle,phone FROM contact WHERE firstname ='${name}' OR lastname ='${name}' OR (firstname || ' ' || lastname) ='${name}'`;
    const contactQuery = `SELECT * FROM contact WHERE LOWER(firstname) =LOWER('${name}') OR LOWER(lastname) =LOWER('${name}') OR LOWER(entitytitle) =LOWER('${name}')`;
    const customerQuery = `SELECT * FROM customer WHERE LOWER(firstname) =LOWER('${name}') OR LOWER(lastname) =LOWER('${name}') OR LOWER(entitytitle) =LOWER('${name}')`;
    if (contactSearch.includes('contact')) {
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
                let salesOrders = [];
                let opportunities = [];
                const contactName = (firstName + middleName + lastName).length > 0 ? `${firstName} ${middleName} ${lastName}` : result.entitytitle;
                if (result?.company) {
                    try {
                        if (enableSalesOrderLogging.value) {

                            const salesOrderResponse = await findSalesOrdersAgainstContact({ user, authHeader, contactId: result.company });
                            for (const salesOrder of salesOrderResponse?.data?.items ?? []) {
                                salesOrders.push({
                                    const: salesOrder?.id,
                                    title: salesOrder?.trandisplayname
                                });
                            }
                        }
                        if (enableOpportunityLogging.value) {
                            const opportunityResponse = await findOpportunitiesAgainstContact({ user, authHeader, contactId: result.company });
                            for (const opportunity of opportunityResponse?.data?.items ?? []) {
                                opportunities.push({
                                    const: opportunity?.id,
                                    title: opportunity?.trandisplayname
                                });
                            }
                        }
                    } catch (e) {
                        console.log({ message: "Error in SalesOrder/Opportunity in contact" });
                    }
                }
                matchedContactInfo.push({
                    id: result.id,
                    name: contactName,
                    phone: result.phone ?? '',
                    homephone: result.homephone ?? '',
                    mobilephone: result.mobilephone ?? '',
                    officephone: result.officephone ?? '',
                    additionalInfo: {
                        ...(salesOrders.length > 0 ? { salesorder: salesOrders } : {}),
                        ...(opportunities.length > 0 ? { opportunity: opportunities } : {})
                    },
                    type: 'contact'
                })
            }
        }
    }
    if (contactSearch.includes('customer')) {
        const customerInfo = await axios.post(
            `https://${user.hostname.split(".")[0]}.suitetalk.api.netsuite.com/services/rest/query/v1/suiteql`,
            {
                q: customerQuery
            },
            {
                headers: { 'Authorization': authHeader, 'Content-Type': 'application/json', 'Prefer': 'transient' }
            });
        if (customerInfo.data.items.length > 0) {
            for (const result of customerInfo.data.items) {
                let salesOrders = [];
                let opportunities = [];
                try {
                    if (enableSalesOrderLogging.value) {
                        const salesOrderResponse = await findSalesOrdersAgainstContact({ user, authHeader, contactId: result.id });
                        for (const salesOrder of salesOrderResponse?.data?.items ?? []) {
                            salesOrders.push({
                                const: salesOrder?.id,
                                title: salesOrder?.trandisplayname
                            });
                        }
                    }
                    // Add opportunity search
                    if (enableOpportunityLogging.value) {
                        const opportunityResponse = await findOpportunitiesAgainstContact({ user, authHeader, contactId: result.id });
                        for (const opportunity of opportunityResponse?.data?.items ?? []) {
                            opportunities.push({
                                const: opportunity?.id,
                                title: opportunity?.title
                            });
                        }
                    }
                } catch (e) {
                    console.log({ message: "Error in SalesOrder/Opportunity search" });
                }
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
                    additionalInfo: {
                        ...(salesOrders.length > 0 ? { salesorder: salesOrders } : {}),
                        ...(opportunities.length > 0 ? { opportunity: opportunities } : {})
                    },
                    type: 'custjob'
                })
            }
        }
    }
    return {
        successful: true,
        matchedContactInfo
    }
}

async function createCallLog({ user, contactInfo, authHeader, callLog, note, additionalSubmission, aiNote, transcript }) {
    try {
        const title = callLog.customSubject ?? `${callLog.direction} Call ${callLog.direction === 'Outbound' ? 'to' : 'from'} ${contactInfo.name}`;
        const oneWorldEnabled = user?.platformAdditionalInfo?.oneWorldEnabled;
        const subsidiaryId = user.platformAdditionalInfo?.subsidiaryId;
        let callStartTime = moment(callLog.startTime).toISOString();
        let startTimeSLot = moment(callLog.startTime).format('HH:mm');
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
        const callEndTime = (callLog.duration === 'pending') ? moment(callStartTime) : moment(callStartTime).add(callLog.duration, 'seconds');
        let endTimeSlot = callEndTime.format('HH:mm');
        if (startTimeSLot === endTimeSlot) {
            //If Start Time and End Time are same, then add 1 minute to End Time because endTime can not be less or equal to startTime
            endTimeSlot = callEndTime.add(1, 'minutes').format('HH:mm');
        }
        let comments = '';
        if (user.userSettings?.addCallLogNote?.value ?? true) { comments = upsertCallAgentNote({ body: comments, note }); }
        if (user.userSettings?.addCallSessionId?.value ?? false) { comments = upsertCallSessionId({ body: comments, id: callLog.sessionId }); }
        if (user.userSettings?.addCallLogSubject?.value ?? true) { comments = upsertCallSubject({ body: comments, title }); }
        if (user.userSettings?.addCallLogContactNumber?.value ?? false) { comments = upsertContactPhoneNumber({ body: comments, phoneNumber: contactInfo.phoneNumber, direction: callLog.direction }); }
        if (user.userSettings?.addCallLogResult?.value ?? true) { comments = upsertCallResult({ body: comments, result: callLog.result }); }
        if (user.userSettings?.addCallLogDateTime?.value ?? true) { comments = upsertCallDateTime({ body: comments, startTime: callStartTime, timezoneOffset: user.timezoneOffset }); }
        if (user.userSettings?.addCallLogDuration?.value ?? true) { comments = upsertCallDuration({ body: comments, duration: callLog.duration }); }
        if (!!callLog.recording?.link && (user.userSettings?.addCallLogRecording?.value ?? true)) { comments = upsertCallRecording({ body: comments, recordingLink: callLog.recording.link }); }
        if (!!aiNote && (user.userSettings?.addCallLogAINote?.value ?? true)) { comments = upsertAiNote({ body: comments, aiNote }); }
        let isMessageBodyTooLong = false;
        if (!!transcript && (comments.length + transcript.length) > 3900) {
            isMessageBodyTooLong = true;
        }
        if (!!transcript && (user.userSettings?.addCallLogTranscript?.value ?? true)) { comments = upsertTranscript({ body: comments, transcript }); }

        let extraDataTracking = {
            withSmartNoteLog: !!aiNote && (user.userSettings?.addCallLogAiNote?.value ?? true),
            withTranscript: !!transcript && (user.userSettings?.addCallLogTranscript?.value ?? true)
        };
        let postBody = {
            title: title,
            phone: contactInfo?.phoneNumber || '',
            priority: "MEDIUM",
            status: "COMPLETE",
            startDate: callStartTime.format('YYYY-MM-DD'),
            startTime: startTimeSLot,
            endTime: endTimeSlot,
            timedEvent: true,
            message: comments,
            completedDate: callEndTime.format('YYYY-MM-DD')
        };
        if (contactInfo.type?.toUpperCase() === 'CONTACT') {
            const contactInfoRes = await axios.get(`https://${user.hostname.split(".")[0]}.suitetalk.api.netsuite.com/services/rest/record/v1/contact/${contactInfo.id}`, {
                headers: { 'Authorization': authHeader }
            });
            postBody.contact = { id: contactInfo.id };
            postBody.company = { id: contactInfoRes.data?.company?.id };
            if (!contactInfoRes.data?.company?.id) {
                let companyId = undefined;
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
                        comments: "This company was created automatically by the RingCentral App Connect. Feel free to edit, or associate this company's contacts to more appropriate records.",
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
                    companyId = extractIdFromUrl(createCompany.headers.location)
                }
                const patchBody = {
                    company: { id: companyId }
                }
                await axios.patch(`https://${user.hostname.split(".")[0]}.suitetalk.api.netsuite.com/services/rest/record/v1/contact/${contactInfo.id}`, patchBody, {
                    headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' }

                });
                postBody.company = {
                    id: companyId
                };
            }
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
        if (isMessageBodyTooLong) {
            try {
                await attachFileWithPhoneCall({ callLogId, transcript, authHeader, user, fileName: title });
            } catch (error) {
                console.log({ message: "Error in attaching file with phone call" });
            }
        }
        return {
            logId: callLogId,
            returnMessage: {
                message: 'Call logged',
                messageType: 'success',
                ttl: 2000
            },
            extraDataTracking
        };
    } catch (error) {
        let errorMessage = netSuiteErrorDetails(error, "Error logging call");
        if (errorMessage.includes("'Subsidiary' was not found.")) {
            errorMessage = errorMessage + " OR Permission violation: You need the 'Lists -> Subsidiaries -> View' permission to access this page. "
        }
        /* We receive this error which is not understabdle for customer Invalid value for the resource or sub-resource field 'company'.
         Provide a valid value.
         */
        if (errorMessage.includes("Invalid value for the resource or sub-resource field 'company'")) {
            errorMessage = "No company is associated with this contact. Log in to NetSuite and link the contact to a company.";
        }
        return {
            returnMessage: {
                messageType: 'danger',
                message: errorMessage,
                details: [
                    {
                        title: 'Details',
                        items: [
                            {
                                id: '1',
                                type: 'text',
                                text: `There was an error in creating an activity entry for this phone call in NetSuite. If issues persist, please contact your NetSuite administrator.`
                            }
                        ]
                    }
                ],
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
        let note = getLogRes.data.message.split('- Note: ')[1];
        // const note = getLogRes.data?.message.includes('Call recording link') ?
        //     getLogRes.data?.message.split('Note: ')[1].split('\nCall recording link')[0] :
        //     getLogRes.data?.message.split('Note: ')[1].split('\n\n--- Created via RingCentral App Connect')[0];
        note = note?.replace(/\n- Summary: .*/, '');
        note = note?.replace(/\n- Contact Number: .*/, '');
        note = note?.replace(/\n- Result: .*/, '');
        note = note?.replace(/\n- Date\/Time: .*/, '');
        note = note?.replace(/\n- Duration: .*/, '');
        note = note?.replace(/\n- Call recording link: .*/, '');
        note = note?.replace(/- SalesOrderNoteUrl:.*SalesOrderId:.*\n?/g, '').trim();
        note = note?.replace(/- OpportunityNoteUrl:.*OpportunityId:.*\n?/g, '').trim();
        note = note?.replace("Sales Order Call Logs (Do Not Edit)", '').trim();
        note = note?.replace("Opportunity Call Logs (Do Not Edit)", '').trim();
        note = note?.replace(/\n- Transcript:[\s\S]*?--- END\n?/g, '').trim();
        note = note?.replace(/\n- AI Note:[\s\S]*?--- END\n?/g, '').trim();
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
        const errorMessage = netSuiteErrorDetails(error, "Error loading call log");
        return {
            returnMessage: {
                messageType: 'danger',
                message: errorMessage,
                details: [
                    {
                        title: 'Details',
                        items: [
                            {
                                id: '1',
                                type: 'text',
                                text: `There was an error loading an activity entry for this phone call in NetSuite. If issues persist, please contact your NetSuite administrator.`
                            }
                        ]
                    }
                ],
                ttl: 60000
            }
        }
    }

}

async function updateCallLog({ user, existingCallLog, authHeader, recordingLink, subject, note, startTime, duration, result, aiNote, transcript }) {
    try {
        const existingLogId = existingCallLog.thirdPartyLogId;
        const callLogResponse = await axios.get(`https://${user.hostname.split(".")[0]}.suitetalk.api.netsuite.com/services/rest/record/v1/phonecall/${existingLogId}`, { headers: { 'Authorization': authHeader } });
        let comments = callLogResponse.data.message;
        let patchBody = { title: subject };
        let callStartTime = moment(moment(startTime).toISOString());
        let startTimeSLot = moment(startTime).format('HH:mm');
        if (startTime !== undefined && duration !== undefined) {
            try {
                const getTimeZoneUrl = `https://${user.hostname.split(".")[0]}.restlets.api.netsuite.com/app/site/hosting/restlet.nl?script=customscript_gettimezone&deploy=customdeploy_gettimezone`;
                const timeZoneResponse = await axios.get(getTimeZoneUrl, {
                    headers: { 'Authorization': authHeader }
                });
                const timeZone = timeZoneResponse?.data?.userTimezone;
                callStartTime = moment(moment(startTime).toISOString()).tz(timeZone);
                startTimeSLot = callStartTime.format('HH:mm');

            } catch (error) {
                console.log({ message: "Error in getting timezone in updateCallLog" });
            }
            const callEndTime = moment(callStartTime).add(duration, 'seconds');
            let endTimeSlot = callEndTime.format('HH:mm');
            if (startTimeSLot === endTimeSlot) {
                //If Start Time and End Time are same, then add 1 minute to End Time because endTime can not be less or equal to startTime
                endTimeSlot = callEndTime.add(1, 'minutes').format('HH:mm');
            }
            patchBody.startDate = callStartTime;
            patchBody.startTime = startTimeSLot;
            patchBody.endTime = endTimeSlot;
        }
        if (!!note && (user.userSettings?.addCallLogNote?.value ?? true)) { comments = upsertCallAgentNote({ body: comments, note }); }
        if (!!existingCallLog.sessionId && (user.userSettings?.addCallSessionId?.value ?? false)) { comments = upsertCallSessionId({ body: comments, id: existingCallLog.sessionId }); }
        if (!!subject && (user.userSettings?.addCallLogSubject?.value ?? true)) { comments = upsertCallSubject({ body: comments, title: subject }); }
        if (!!startTime && (user.userSettings?.addCallLogDateTime?.value ?? true)) { comments = upsertCallDateTime({ body: comments, startTime: callStartTime, timezoneOffset: user.timezoneOffset }); }
        if (!!duration && (user.userSettings?.addCallLogDuration?.value ?? true)) { comments = upsertCallDuration({ body: comments, duration }); }
        if (!!result && (user.userSettings?.addCallLogResult?.value ?? true)) { comments = upsertCallResult({ body: comments, result }); }
        if (!!aiNote && (user.userSettings?.addCallLogAINote?.value ?? true)) { comments = upsertAiNote({ body: comments, aiNote }); }
        if (!!recordingLink && (user.userSettings?.addCallLogRecording?.value ?? true)) { comments = upsertCallRecording({ body: comments, recordingLink }); }
        let isMessageBodyTooLong = false;
        if (!!transcript && (comments.length + transcript.length) > 3900) {
            isMessageBodyTooLong = true;
        }
        if (!!transcript && (user.userSettings?.addCallLogTranscript?.value ?? true)) { comments = upsertTranscript({ body: comments, transcript }); }
        patchBody.message = comments;
        const patchLogRes = await axios.patch(
            `https://${user.hostname.split(".")[0]}.suitetalk.api.netsuite.com/services/rest/record/v1/phoneCall/${existingLogId}`,
            patchBody,
            {
                headers: { 'Authorization': authHeader }
            });
        if (isMessageBodyTooLong && !!subject) {
            try {
                await attachFileWithPhoneCall({ callLogId: existingLogId, transcript, authHeader, user, fileName: subject });
            } catch (error) {

            }
        }
        return {
            updatedNote: note,
            returnMessage: {
                message: 'Call log updated',
                messageType: 'success',
                ttl: 2000
            }
        };
    } catch (error) {
        const errorMessage = netSuiteErrorDetails(error, "Error updating activity");
        return {
            returnMessage: {
                messageType: 'danger',
                message: errorMessage,
                details: [
                    {
                        title: 'Details',
                        items: [
                            {
                                id: '1',
                                type: 'text',
                                text: `There was an error in updating the activity entry for this phone call in NetSuite. If issues persist, please contact your NetSuite administrator.`
                            }
                        ]
                    }
                ],
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
        const messageType = recordingLink ? 'Voicemail' : (faxDocLink ? 'Fax' : 'SMS');
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
                    `${message.subject}\n\n` +
                    '------------\n' +
                    'END\n\n' +
                    '--- Created via RingCentral App Connect';
                break;
            case 'Voicemail':
                const decodedRecordingLink = decodeURIComponent(recordingLink);
                title = `Voicemail left by ${contactInfo.name} - ${moment(message.creationTime).format('YY/MM/DD')}`;
                logBody = `Voicemail recording link: ${decodedRecordingLink} \n\n--- Created via RingCentral App Connect`;
                break;
            case 'Fax':
                title = `Fax document sent from ${contactInfo.name} - ${moment(message.creationTime).format('YY/MM/DD')}`;
                logBody = `Fax document link: ${faxDocLink} \n\n--- Created via RingCentral App Connect`;
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
        if (additionalSubmission && additionalSubmission.salesorder) {
            try {
                const createUserNotesUrl = `https://${user.hostname.split(".")[0]}.restlets.api.netsuite.com/app/site/hosting/restlet.nl?script=customscript_createusernotes&deploy=customdeploy_createusernotes`;
                const postBody = {
                    salesOrderId: additionalSubmission.salesorder,
                    noteTitle: title,
                    noteText: logBody
                };
                const createUserNotesResponse = await axios.post(createUserNotesUrl, postBody, {
                    headers: { 'Authorization': authHeader }
                });
            } catch (error) {
                console.log({ message: "Error in logging calls against salesOrder" });
            }
        }
        return {
            logId: callLogId,
            returnMessage: {
                message: 'Message logged',
                messageType: 'success',
                ttl: 1000
            }
        };
    } catch (error) {
        const errorMessage = netSuiteErrorDetails(error, "Error logging text message");
        return {
            returnMessage: {
                messageType: 'danger',
                message: errorMessage,
                details: [
                    {
                        title: 'Details',
                        items: [
                            {
                                id: '1',
                                type: 'text',
                                text: `There was an error in creating an activity entry for this SMS conversation in NetSuite. If issues persist, please contact your NetSuite administrator.`
                            }
                        ]
                    }
                ],
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
        const endMarker = '------------\nEND';
        const newMessageLog =
            `${message.direction === 'Inbound' ? `${contactInfo.name} (${contactInfo?.phoneNumber})` : userName} ${moment(message.creationTime).format('hh:mm A')}\n` +
            `${message.subject}\n\n`;
        logBody = logBody.replace(endMarker, `${newMessageLog}${endMarker}`);

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
                message: 'Message log updated',
                messageType: 'success',
                ttl: 3000
            }
        };
    } catch (error) {
        const errorMessage = netSuiteErrorDetails(error, "Error updating activity");
        return {
            returnMessage: {
                messageType: 'danger',
                message: errorMessage,
                details: [
                    {
                        title: 'Details',
                        items: [
                            {
                                id: '1',
                                type: 'text',
                                text: `There was an error in updating the activity entry for this SMS conversation in NetSuite. If issues persist, please contact your NetSuite administrator.`
                            }
                        ]
                    }
                ],
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
                            entityId: 'RingCentral_CRM_Extension_Placeholder_Company',
                            comments: "This company was created automatically by the RingCentral App Connect. Feel free to edit, or associate this company's contacts to more appropriate records.",
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
                            message: netSuiteErrorDetails(error, "Error creating contact"),
                            messageType: 'danger',
                            details: [
                                {
                                    title: 'Details',
                                    items: [
                                        {
                                            id: '1',
                                            type: 'text',
                                            text: `A contact with the phone number ${phoneNumber} could not be created. Make sure you have permission to create contacts in NetSuite, and that the contact you are creating is not a duplicate.`
                                        }
                                    ]
                                }
                            ],
                            ttl: 3000
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
                            message: netSuiteErrorDetails(error, "Error creating customer"),
                            messageType: 'danger',
                            details: [
                                {
                                    title: 'Details',
                                    items: [
                                        {
                                            id: '1',
                                            type: 'text',
                                            text: `NetSuite was unable to create an activity entry for the Customer named ${newContactName}. If this issues persists, please contact your NetSuite administrator. `
                                        }
                                    ]
                                }
                            ],
                            ttl: 3000
                        }
                    }
                }

        }
        const displayMessage = newContactType === 'contact'
            ? 'The new contact is created under a placeholder company, please click "View contact details" to check out'
            : 'Customer created';
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
        const errorMessage = netSuiteErrorDetails(error, "Error creating contact");
        return {
            returnMessage: {
                messageType: 'danger',
                message: errorMessage,
                details: [
                    {
                        title: 'Details',
                        items: [
                            {
                                id: '1',
                                type: 'text',
                                text: `NetSuite was unable to create an activity entry for the ${newContactType} named ${newContactName}. If this issues persists, please contact your NetSuite administrator. `
                            }
                        ]
                    }
                ],
                ttl: 3000
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

function upsertCallAgentNote({ body, note }) {
    if (!note) {
        return body;
    }
    const noteRegex = RegExp('- Note: ([\\s\\S]+?)\n');
    if (noteRegex.test(body)) {
        body = body.replace(noteRegex, `- Note: ${note}\n`);
    }
    else {
        body += `- Note: ${note}\n`;
    }
    return body;
}

function upsertNetSuiteUserNoteUrl({ body, userNoteUrl, salesOrderId }) {
    const salesOrderText = "Sales Order Call Logs (Do Not Edit)";
    if (!(body.includes(salesOrderText))) {
        body += `\n\n ${salesOrderText}`;
    }
    const salesOrderNoteUrlRegex = RegExp('- SalesOrderNoteUrl: (.+?)\n');
    if (salesOrderNoteUrlRegex.test(body)) {
        body = body.replace(salesOrderNoteUrlRegex, `- SalesOrderNoteUrl: ${userNoteUrl} SalesOrderId: ${salesOrderId}\n`);
    } else {
        body += `\n- SalesOrderNoteUrl: ${userNoteUrl} SalesOrderId: ${salesOrderId}`;
    }
    return body;
}

function upsertNetSuiteOpportunityNoteUrl({ body, opportunityNoteUrl, opportunityId }) {
    const opportunityText = "Opportunity Call Logs (Do Not Edit)";
    if (!(body.includes(opportunityText))) {
        body += `\n\n ${opportunityText}`;
    }
    const opportunityNoteUrlRegex = RegExp('- OpportunityNoteUrl: (.+?)\n');
    if (opportunityNoteUrlRegex.test(body)) {
        body = body.replace(opportunityNoteUrlRegex, `- OpportunityNoteUrl: ${opportunityNoteUrl} OpportunityId: ${opportunityId}\n`);
    } else {
        body += `\n- OpportunityNoteUrl: ${opportunityNoteUrl} OpportunityId: ${opportunityId}`;
    }
    return body;
}

function upsertCallResult({ body, result }) {
    const resultRegex = RegExp('- Result: (.+?)\n');
    if (resultRegex.test(body)) {
        body = body.replace(resultRegex, `- Result: ${result}\n`);
    } else {
        body += `- Result: ${result}\n`;
    }
    return body;
}

function upsertCallSessionId({ body, id }) {
    const sessionIdRegex = RegExp('- Session Id: (.+?)\n');
    if (sessionIdRegex.test(body)) {
        body = body.replace(sessionIdRegex, `- Session Id: ${id}\n`);
    } else {
        body += `- Session Id: ${id}\n`;
    }
    return body;
}

function upsertCallDuration({ body, duration }) {
    const durationRegex = RegExp('- Duration: (.+?)?\n');
    if (durationRegex.test(body)) {
        body = body.replace(durationRegex, `- Duration: ${secondsToHoursMinutesSeconds(duration)}\n`);
    } else {
        body += `- Duration: ${secondsToHoursMinutesSeconds(duration)}\n`;
    }
    return body;
}

function upsertContactPhoneNumber({ body, phoneNumber, direction }) {
    const phoneNumberRegex = RegExp('- Contact Number: (.+?)\n');
    if (phoneNumberRegex.test(body)) {
        body = body.replace(phoneNumberRegex, `- Contact Number: ${phoneNumber}\n`);
    } else {
        body += `- Contact Number: ${phoneNumber}\n`;
    }
    return body;
}

function upsertCallRecording({ body, recordingLink }) {
    const recordingLinkRegex = RegExp('- Call recording link: (.+?)\n');
    if (!!recordingLink && recordingLinkRegex.test(body)) {
        body = body.replace(recordingLinkRegex, `- Call recording link: ${recordingLink}`);
    } else if (recordingLink) {
        // if not end with new line, add new line
        if (body && !body.endsWith('\n')) {
            body += '\n';
        }
        body += `- Call recording link: ${recordingLink}\n`;
    }
    return body;
}

function upsertCallSubject({ body, title }) {
    const subjectRegex = RegExp('- Summary: (.+?)\n');
    if (subjectRegex.test(body)) {
        body = body.replace(subjectRegex, `- Summary: ${title}\n`);
    } else {
        body += `- Summary: ${title}\n`;
    }
    return body;
}

function upsertCallDateTime({ body, startTime, timezoneOffset }) {
    const dateTimeRegex = RegExp('- Date/Time: (.+?)\n');
    if (dateTimeRegex.test(body)) {
        const updatedDateTime = moment(startTime).format('YYYY-MM-DD hh:mm:ss A');
        body = body.replace(dateTimeRegex, `- Date/Time: ${updatedDateTime}\n`);
    } else {
        body += `- Date/Time: ${moment(startTime).format('YYYY-MM-DD hh:mm:ss A')}\n`;
    }
    return body;
}

function upsertAiNote({ body, aiNote }) {
    const aiNoteRegex = RegExp('- AI Note:([\\s\\S]*?)--- END');
    const clearedAiNote = aiNote.replace(/\n+$/, '');
    if (aiNoteRegex.test(body)) {
        body = body.replace(aiNoteRegex, `- AI Note:\n${clearedAiNote}\n--- END`);
    } else {
        body += `- AI Note:\n${clearedAiNote}\n--- END\n`;
    }
    return body;
}

function upsertTranscript({ body, transcript }) {
    const transcriptRegex = RegExp('- Transcript:([\\s\\S]*?)--- END');
    if (transcriptRegex.test(body)) {
        body = body.replace(transcriptRegex, `- Transcript:\n${transcript}\n--- END`);
    } else {
        body += `- Transcript:\n${transcript}\n--- END\n`;
    }
    try {
        if (body.length > 3900) {
            // Calculate available space for transcript
            const bodyWithoutTranscript = body.replace(/- Transcript:[\s\S]*?--- END\n?/, '');
            const availableSpace = 3900 - bodyWithoutTranscript.length - '- Transcript:\n\n--- END\n'.length - 'Transcript too large. To view the whole transcript, Goto Communictaion and open attach file.\n'.length;
            // Truncate transcript and add message
            const truncatedTranscript = transcript.substring(0, availableSpace) + '\n\nTranscript too large. To view the whole transcript, Goto Communictaion and open attach file.';
            body = bodyWithoutTranscript + `- Transcript:\n${truncatedTranscript}\n--- END\n`;
        }

    } catch (error) {
        console.log({ m: "Error in upsertTranscript" });
    }
    return body;
}

async function findSalesOrdersAgainstContact({ user, authHeader, contactId }) {
    const salesOrderQuery = `SELECT * FROM transaction WHERE entity = ${contactId} AND type='SalesOrd' ORDER BY createddate desc`;
    const salesOrderInfo = await axios.post(
        `https://${user.hostname.split(".")[0]}.suitetalk.api.netsuite.com/services/rest/query/v1/suiteql`,
        {
            q: salesOrderQuery
        },
        {
            headers: { 'Authorization': authHeader, 'Content-Type': 'application/json', 'Prefer': 'transient' }
        });
    return salesOrderInfo;
}

async function findOpportunitiesAgainstContact({ user, authHeader, contactId }) {
    const opportunityQuery = `SELECT * FROM transaction WHERE entity = ${contactId} AND type='Opprtnty' ORDER BY createddate desc`;
    const opportunityInfo = await axios.post(
        `https://${user.hostname.split(".")[0]}.suitetalk.api.netsuite.com/services/rest/query/v1/suiteql`,
        {
            q: opportunityQuery
        },
        {
            headers: { 'Authorization': authHeader, 'Content-Type': 'application/json', 'Prefer': 'transient' }
        });
    return opportunityInfo;
}

function getThreeYearsBeforeDate() {
    const date = new Date();
    date.setFullYear(date.getFullYear() - 3);
    date.setHours(0, 0, 0, 0);
    return date.toISOString().slice(0, 10) + " 00:00:00"; //Date formate 2022-04-03 00:00:00
};

function extractNoteIdFromNote({ note, targetSalesOrderId }) {
    // Extract the userNoteUrl from the string
    try {
        const regex = /SalesOrderNoteUrl:\s*(https?:\/\/[^\s]+)\s+SalesOrderId:\s*(\d+)/g;
        let match;
        while ((match = regex.exec(note)) !== null) {
            const url = match[1];
            const salesOrderId = match[2];

            if (salesOrderId === targetSalesOrderId.toString()) {
                const idMatch = url.match(/id=(\d+)/);
                if (idMatch) {
                    return idMatch[1]; // return the id from URL
                }
            }
        }
        return undefined; // if not found
    } catch (e) {
        return undefined;
    }

}

function extractNoteIdFromOpportunityNote({ note, targetOpportunityId }) {
    // Extract the userNoteUrl from the string
    try {
        const regex = /OpportunityNoteUrl:\s*(https?:\/\/[^\s]+)\s+OpportunityId:\s*(\d+)/g;
        let match;
        while ((match = regex.exec(note)) !== null) {
            const url = match[1];
            const opportunityId = match[2];

            if (opportunityId === targetOpportunityId.toString()) {
                const idMatch = url.match(/id=(\d+)/);
                if (idMatch) {
                    return idMatch[1]; // return the id from URL
                }
            }
        }
        return undefined; // if not found
    } catch (e) {
        return undefined;
    }

}

function sanitizeNote({ note }) {
    // Remove both sales order and opportunity sections
    note = note?.replace(/- SalesOrderNoteUrl:.*SalesOrderId:.*\n?/g, '').trim();
    note = note?.replace(/- OpportunityNoteUrl:.*OpportunityId:.*\n?/g, '').trim();
    note = note?.replace("Sales Order Call Logs (Do Not Edit)", '').trim();
    note = note?.replace("Opportunity Call Logs (Do Not Edit)", '').trim();
    return note;
}
const buildContactSearchCondition = (fields, numberToQuery, overridingFormat) => {
    if (overridingFormat !== '') {
        return fields.map(field => `${field}='${numberToQuery}'`).join(' OR ');
    } else {
        return fields.map(field =>
            `REGEXP_REPLACE(${field}, '[^0-9]', '') LIKE '%${numberToQuery}'`
        ).join(' OR ');
    }
};

async function attachFileWithPhoneCall({ callLogId, transcript, authHeader, user, fileName }) {
    const folderName = "App Connect Phone Calls";
    // Check if folder exists, if not create it
    const folderResponde = await axios.get(
        `https://${user.hostname.split(".")[0]}.restlets.api.netsuite.com/app/site/hosting/restlet.nl?script=customscript_getappconnectfolderbyname&deploy=customdeploy_getappconnectfolderbyname&name=${folderName}`,
        {
            headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' }
        }
    );
    let folderId = undefined;
    // If folder does not exist, create it
    if (folderResponde.data.success === false && folderResponde.data.message.includes("No folder found with name")) {
        const createFolderRes = await axios.post(
            `https://${user.hostname.split(".")[0]}.restlets.api.netsuite.com/app/site/hosting/restlet.nl?script=customscript_createappconnectfolder&deploy=customdeploy_createappconnectfolder`,
            {
                folderName: folderName
            },
            {
                headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' }
            }
        );
        folderId = createFolderRes.data.folderId;
    } else if (folderResponde.data.success === true) {
        folderId = folderResponde?.data?.results?.length > 0 ? folderResponde.data.results[0].id : undefined;
    }
    /**
     * If folderId is still undefined, it means folder creation failed or folder was not found.
     * If folder exist or created successfully, proceed to create file and attach it to the phone call log.
     */
    if (folderId) {
        const fileResponse = await axios.post(
            `https://${user.hostname.split(".")[0]}.restlets.api.netsuite.com/app/site/hosting/restlet.nl?script=customscript_createappconnectfile&deploy=customdeploy_createappconnectfile`,
            {
                folderId: folderId,
                fileName: fileName + " " + callLogId,
                content: transcript,
                note: "This file was generated via RingCentral App Connect"
            },
            {
                headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' }
            }
        );
        const attachFileRes = await axios.post(
            `https://${user.hostname.split(".")[0]}.restlets.api.netsuite.com/app/site/hosting/restlet.nl?script=customscript_attachfilewithphonecalls&deploy=customdeploy_attachfilewithphonecalls`,
            {
                phoneCallId: callLogId,
                fileId: fileResponse.data.fileId
            },
            {
                headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' }
            }
        );
    }
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
exports.upsertCallDisposition = upsertCallDisposition;
exports.findContactWithName = findContactWithName;